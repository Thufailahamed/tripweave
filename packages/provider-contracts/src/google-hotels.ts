import { nightsBetween, type HotelCategory, type NormalisedOffer } from "@tripweave/shared";
import { fetchJson, type FetchLike } from "./resilience";
import { ProviderError, type HotelAvailabilityInput, type HotelProvider, type HotelSearchInput, type PriceCheckInput, type PriceCheckResult, type PropertySearchResult, type RoomOffer } from "./types";
import { normalizeHotelName } from "./discovery";

export const GOOGLE_HOTELS_PROVIDER_KEY = "google_hotels";

export interface GoogleHotelsConfig {
  apiKey: string;
  /** Defaults to https://serpapi.com/search.json. */
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
  /** Two-letter Google country for pricing; defaults to the destination's market. */
  gl?: string;
  hl?: string;
}

interface GoogleMoney {
  extracted_lowest?: number;
  extracted_before_taxes_fees?: number;
  extracted_after_taxes_fees?: number;
}

interface GooglePrice {
  source?: string;
  rate_per_night?: GoogleMoney;
  total_rate?: GoogleMoney;
  free_cancellation?: boolean;
}

interface GoogleProperty {
  type?: string;
  name?: string;
  property_token?: string;
  link?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  rate_per_night?: GoogleMoney;
  total_rate?: GoogleMoney;
  prices?: GooglePrice[];
  extracted_hotel_class?: number;
  hotel_class?: string;
  overall_rating?: number;
  reviews?: number;
  amenities?: string[];
  description?: string;
}

interface GoogleHotelsResponse {
  properties?: GoogleProperty[];
  error?: string;
}

const STAR_CATEGORY: Record<number, HotelCategory> = { 1: "budget", 2: "budget", 3: "comfort", 4: "premium", 5: "luxury" };

const AMENITY_MAP: { re: RegExp; value: string }[] = [
  { re: /wi-?fi|internet/i, value: "wifi" },
  { re: /pool/i, value: "pool" },
  { re: /spa/i, value: "spa" },
  { re: /fitness|gym/i, value: "gym" },
  { re: /parking/i, value: "parking" },
  { re: /air condition/i, value: "air_conditioning" },
  { re: /breakfast/i, value: "breakfast" },
  { re: /restaurant/i, value: "restaurant" },
  { re: /bar\b/i, value: "bar" },
  { re: /beach/i, value: "beach" },
  { re: /airport shuttle/i, value: "airport_shuttle" },
];

export function amenitiesFromGoogle(list: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const raw of list ?? []) {
    for (const m of AMENITY_MAP) if (m.re.test(raw)) out.add(m.value);
  }
  return [...out];
}

export function categoryFromStars(stars: number | undefined): HotelCategory {
  if (!stars || stars < 1) return "standard";
  return STAR_CATEGORY[Math.min(5, Math.round(stars))] ?? "standard";
}

/** Google rates properties out of 5; TripWeave compares reviews out of 10. */
export function reviewScoreFromGoogle(rating: number | undefined): number | null {
  if (rating === undefined || !Number.isFinite(rating) || rating <= 0) return null;
  return Math.round(Math.min(5, rating) * 20) / 10;
}

export interface GooglePriceChoice {
  source: string;
  totalMinor: number;
  nightlyMinor: number | null;
  freeCancellation: boolean | null;
  allSources: { source: string; totalMinor: number }[];
}

/** Picks the cheapest priced source for one property and reports every source it saw. */
export function chooseGooglePrice(p: GoogleProperty, nights: number, rooms: number): GooglePriceChoice | null {
  const candidates: { source: string; totalMinor: number; nightlyMinor: number | null; freeCancellation: boolean | null }[] = [];
  for (const price of p.prices ?? []) {
    const total = price.total_rate?.extracted_lowest;
    const nightly = price.rate_per_night?.extracted_lowest ?? price.rate_per_night?.extracted_before_taxes_fees;
    const totalMinor = total !== undefined ? Math.round(total * 100) * rooms : nightly !== undefined ? Math.round(nightly * 100) * nights * rooms : null;
    if (totalMinor === null || totalMinor <= 0) continue;
    candidates.push({ source: price.source?.trim() || "Google Hotels", totalMinor, nightlyMinor: nightly !== undefined ? Math.round(nightly * 100) : null, freeCancellation: price.free_cancellation ?? null });
  }
  if (candidates.length === 0) {
    const total = p.total_rate?.extracted_lowest;
    const nightly = p.rate_per_night?.extracted_lowest ?? p.rate_per_night?.extracted_before_taxes_fees;
    const totalMinor = total !== undefined ? Math.round(total * 100) * rooms : nightly !== undefined ? Math.round(nightly * 100) * nights * rooms : null;
    if (totalMinor === null || totalMinor <= 0) return null;
    candidates.push({ source: "Google Hotels", totalMinor, nightlyMinor: nightly !== undefined ? Math.round(nightly * 100) : null, freeCancellation: null });
  }
  // Cheapest wins; a familiar OTA wins ties so the source label stays useful.
  const rank = (s: string) => (/booking\.com/i.test(s) ? 0 : /expedia/i.test(s) ? 1 : /agoda/i.test(s) ? 2 : 3);
  candidates.sort((a, b) => a.totalMinor - b.totalMinor || rank(a.source) - rank(b.source) || a.source.localeCompare(b.source));
  const best = candidates[0]!;
  return {
    source: best.source,
    totalMinor: best.totalMinor,
    nightlyMinor: best.nightlyMinor,
    freeCancellation: best.freeCancellation,
    allSources: candidates.map((c) => ({ source: c.source, totalMinor: c.totalMinor })),
  };
}

/**
 * Google Hotels via SerpApi. This is the cross-OTA source: the same property is priced by
 * Booking.com, Expedia, Agoda, Hotels.com and others, and the cheapest source is kept while every
 * source is recorded in the offer metadata. Live availability is not confirmed by the API, so it
 * is reported as unknown rather than invented.
 */
export class GoogleHotelsProvider implements HotelProvider {
  readonly key = GOOGLE_HOTELS_PROVIDER_KEY;
  readonly displayName = "Google Hotels (Booking.com and other sites)";
  readonly isMock = false;
  private readonly fetchImpl: FetchLike;
  constructor(private readonly cfg: GoogleHotelsConfig) {
    this.fetchImpl = cfg.fetch ?? ((u, i) => fetch(u, i));
  }

  private nowIso(): string {
    return (this.cfg.now?.() ?? new Date()).toISOString();
  }

  private async fetchProperties(input: HotelSearchInput): Promise<GoogleProperty[]> {
    const q = new URLSearchParams({
      engine: "google_hotels",
      q: `Hotels in ${input.destination}`,
      check_in_date: input.checkIn,
      check_out_date: input.checkOut,
      adults: String(input.party.adults),
      children: String(input.party.children),
      currency: input.currency ?? "USD",
      hl: this.cfg.hl ?? "en",
      gl: this.cfg.gl ?? "us",
      api_key: this.cfg.apiKey,
    });
    if (input.party.children > 0) {
      const ages = input.party.childAges ?? [];
      const filled = Array.from({ length: input.party.children }, (_, i) => ages[i] ?? 8);
      q.set("children_ages", filled.join(","));
    }
    const res = await fetchJson<GoogleHotelsResponse>(this.key, this.fetchImpl, `${this.cfg.baseUrl ?? "https://serpapi.com/search.json"}?${q.toString()}`, { headers: { Accept: "application/json" } }, this.cfg.timeoutMs ?? 15_000);
    if (res?.error) throw new ProviderError(this.key, "upstream", `Google Hotels search failed: ${res.error}`);
    if (!res || !Array.isArray(res.properties)) throw new ProviderError(this.key, "bad_response", "Google Hotels returned an unexpected response");
    return res.properties;
  }

  private toProperty(p: GoogleProperty, destination: string): PropertySearchResult {
    const stars = p.extracted_hotel_class;
    return {
      providerKey: this.key,
      externalPropertyId: `g:${p.property_token ?? normalizeHotelName(p.name ?? "")}`,
      name: p.name?.trim() || "Unnamed property",
      destination,
      latitude: p.gps_coordinates?.latitude ?? null,
      longitude: p.gps_coordinates?.longitude ?? null,
      category: categoryFromStars(stars),
      starRating: stars ?? null,
      reviewScore: reviewScoreFromGoogle(p.overall_rating),
      amenities: amenitiesFromGoogle(p.amenities),
      isMock: false,
    };
  }

  async searchProperties(input: HotelSearchInput): Promise<PropertySearchResult[]> {
    const props = await this.fetchProperties(input);
    return props.filter((p) => !!p.name).slice(0, input.limit ?? 40).map((p) => this.toProperty(p, input.destination));
  }

  async getAvailability(input: HotelAvailabilityInput): Promise<RoomOffer[]> {
    const props = await this.fetchProperties(input);
    const nights = nightsBetween(input.checkIn, input.checkOut);
    const rooms = Math.max(1, input.party.rooms.length);
    const retrievedAt = this.nowIso();
    const offers: RoomOffer[] = [];
    for (const p of props) {
      if (!p.name || (input.propertyIds && !input.propertyIds.includes(`g:${p.property_token ?? normalizeHotelName(p.name)}`))) continue;
      const choice = chooseGooglePrice(p, nights, rooms);
      if (!choice) continue;
      const stars = p.extracted_hotel_class ?? null;
      const id = `gh:${p.property_token ?? normalizeHotelName(p.name)}:${input.checkIn}:${input.checkOut}:${rooms}:${choice.source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      offers.push({
        offerId: id,
        providerKey: this.key,
        externalOfferReference: id,
        source: "external",
        supplierId: null,
        supplierName: `${choice.source} via Google Hotels`,
        property: {
          id: `g:${p.property_token ?? normalizeHotelName(p.name)}`,
          name: p.name,
          destination: input.destination,
          latitude: p.gps_coordinates?.latitude ?? null,
          longitude: p.gps_coordinates?.longitude ?? null,
          category: categoryFromStars(stars ?? undefined),
          starRating: stars,
          reviewScore: reviewScoreFromGoogle(p.overall_rating),
          amenities: amenitiesFromGoogle(p.amenities),
          ownerOrganizationId: null,
        },
        roomType: { id: null, name: "Room type to confirm", maxOccupancy: Math.max(1, ...input.party.rooms.map((r) => r.adults + r.children)), maxAdults: Math.max(1, ...input.party.rooms.map((r) => r.adults)) },
        stayStart: input.checkIn,
        stayEnd: input.checkOut,
        nights,
        mealPlan: "RO",
        mealPlanStatus: "unconfirmed",
        roomsRequired: rooms,
        occupancy: input.party,
        totalAmountMinor: choice.totalMinor,
        currency: input.currency ?? "USD",
        taxAmountMinor: null,
        feeAmountMinor: null,
        taxesIncluded: null,
        cancellation: { refundable: choice.freeCancellation, freeCancellationUntil: null },
        payment: { type: "unknown", description: "Payment terms are set by the booking site." },
        retrievedAt,
        expiresAt: null,
        availabilityStatus: "unknown",
        verificationStatus: "supplier_reported",
        providerMetadata: {
          listingSource: "google_hotels",
          priceSources: choice.allSources,
          cheapestSource: choice.source,
          googleRating: p.overall_rating ?? null,
          reviews: p.reviews ?? null,
          propertyToken: p.property_token ?? null,
          link: p.link ?? null,
        },
        isMock: false,
      });
    }
    return offers;
  }

  async recheckPrice(input: PriceCheckInput): Promise<PriceCheckResult> {
    return {
      status: "not_supported",
      offer: input.offer,
      previousTotalMinor: input.offer.totalAmountMinor,
      currentTotalMinor: input.offer.totalAmountMinor,
      message: "Aggregated prices change frequently. Run the search again to refresh every source.",
      checkedAt: this.nowIso(),
    };
  }
}
