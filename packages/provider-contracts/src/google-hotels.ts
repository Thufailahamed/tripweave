import { nightsBetween, type HotelCategory, type NormalisedOffer } from "@tripweave/shared";
import { fetchJson, mapWithConcurrency, type FetchLike } from "./resilience";
import {
  chooseGoogleHotelsEntityRate,
  fetchGoogleHotelsEntity,
  GoogleHotelsDirectError,
  type GoogleHotelsEntity,
} from "./google-hotels-direct";
import { ProviderError, type HotelAvailabilityInput, type HotelProvider, type HotelSearchCache, type HotelSearchInput, type PriceCheckInput, type PriceCheckResult, type PropertySearchResult, type RoomOffer } from "./types";
import { normalizeHotelName } from "./discovery";
import { chooseGoogleLiveRate, googleAmount, parseGooglePropertyRates } from "./google-hotels-recheck";

export const GOOGLE_HOTELS_PROVIDER_KEY = "google_hotels";

export interface GoogleHotelsEntityCacheEntry {
  entity: GoogleHotelsEntity;
  cachedAt: number;
}

/**
 * Disabled-by-default entity enrichment. SerpApi remains the price-discovery source; entity pages
 * only add rate-level room, occupancy, cancellation and board-basis evidence for the cheapest
 * properties in each search. A failed entity fetch never removes a SerpApi offer.
 */
export interface GoogleHotelsDirectConfig {
  enabled: boolean;
  /** Cheapest distinct properties to verify per search. Clamped to 1..10; defaults to 5. */
  maxProperties?: number;
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
  /** Short-lived cache; 0 disables it. Defaults to 15 minutes. */
  cacheTtlMs?: number;
  cache?: Map<string, GoogleHotelsEntityCacheEntry>;
  failureThreshold?: number;
  sleep?: (ms: number) => Promise<void>;
}

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
  direct?: GoogleHotelsDirectConfig;
  /** Short-lived discovery cache. Live rechecks always bypass it. */
  cache?: HotelSearchCache;
  /** Discovery cache TTL; defaults to 15 minutes. */
  cacheTtlSeconds?: number;
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

interface GooglePropertyDetailsResponse {
  error?: string;
  property_token?: string;
  featured_prices?: unknown[];
  prices?: unknown[];
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

/**
 * Google lists "Free breakfast" for properties where breakfast is included and "Breakfast ($)"
 * where it is chargeable. These are property-level amenities, not rate-level proof: the exact
 * board basis still has to be confirmed on the booked rate. Rate-level entity checks can later
 * upgrade an offer with `strictBreakfastTotalMinor`; the app treats that as confirmed.
 */
export function mealPlanFromGoogle(amenities: string[] | undefined): {
  mealPlan: "BB" | "RO";
  basis: "free" | "paid" | "unknown";
  boardBasisSource: "property_amenity" | "unknown";
} {
  const list = amenities ?? [];
  if (list.some((a) => /free breakfast|breakfast included/i.test(a))) return { mealPlan: "BB", basis: "free", boardBasisSource: "property_amenity" };
  if (list.some((a) => /breakfast/i.test(a))) return { mealPlan: "RO", basis: "paid", boardBasisSource: "property_amenity" };
  return { mealPlan: "RO", basis: "unknown", boardBasisSource: "unknown" };
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
  /** Whether the total includes taxes and fees; null when Google does not say. */
  taxesIncluded: boolean | null;
  allSources: { source: string; totalMinor: number }[];
}

/** Google Hotels has no room-count parameter: query the largest room and scale by room count. */
function perRoomOccupancy(input: Pick<HotelSearchInput, "party">) {
  const roomCount = Math.max(1, input.party.rooms.length);
  return input.party.rooms.reduce(
    (best, r) => (r.adults + r.children > best.adults + best.children ? r : best),
    input.party.rooms[0] ?? { adults: Math.max(1, Math.ceil(input.party.adults / roomCount)), children: 0, childAges: [] as number[] },
  );
}

const DEFAULT_ENTITY_CACHE = new Map<string, GoogleHotelsEntityCacheEntry>();
const DEFAULT_ENTITY_CACHE_TTL_MS = 15 * 60_000;
const ENTITY_CACHE_LIMIT = 200;

function entityCacheKey(token: string, input: HotelAvailabilityInput, perRoom: { adults: number; children: number; childAges?: number[] }): string {
  return [token, input.checkIn, input.checkOut, perRoom.adults, perRoom.children, (perRoom.childAges ?? []).join(","), 1, input.currency ?? "USD"].join("|");
}

function emptyEnrichment(over: Record<string, unknown>): Record<string, unknown> {
  return {
    status: "skipped",
    cached: false,
    latencyMs: null,
    rateCount: null,
    entityTotalMinor: null,
    strictBreakfastTotalMinor: null,
    strictBreakfastSource: null,
    strictBreakfastRoom: null,
    strictBreakfastGuests: null,
    strictBreakfastCancellation: null,
    ...over,
  };
}

/** Picks the cheapest priced source for one property and reports every source it saw. */
export function chooseGooglePrice(p: GoogleProperty, nights: number, rooms: number): GooglePriceChoice | null {
  const candidates: { source: string; totalMinor: number; nightlyMinor: number | null; freeCancellation: boolean | null; taxesIncluded: boolean | null }[] = [];
  const priceFrom = (total: GoogleMoney | undefined, nightlyMoney: GoogleMoney | undefined) => {
    const stay = googleAmount(total);
    const nightly = googleAmount(nightlyMoney);
    if (stay) return { totalMinor: Math.round(stay.amount * 100) * rooms, taxesIncluded: stay.taxesIncluded, nightlyMinor: nightly ? Math.round(nightly.amount * 100) : null };
    if (nightly) return { totalMinor: Math.round(nightly.amount * 100) * nights * rooms, taxesIncluded: nightly.taxesIncluded, nightlyMinor: Math.round(nightly.amount * 100) };
    return null;
  };
  for (const price of p.prices ?? []) {
    const picked = priceFrom(price.total_rate, price.rate_per_night);
    if (!picked || picked.totalMinor <= 0) continue;
    candidates.push({ source: price.source?.trim() || "Google Hotels", totalMinor: picked.totalMinor, nightlyMinor: picked.nightlyMinor, freeCancellation: price.free_cancellation ?? null, taxesIncluded: picked.taxesIncluded });
  }
  if (candidates.length === 0) {
    const picked = priceFrom(p.total_rate, p.rate_per_night);
    if (!picked || picked.totalMinor <= 0) return null;
    candidates.push({ source: "Google Hotels", totalMinor: picked.totalMinor, nightlyMinor: picked.nightlyMinor, freeCancellation: null, taxesIncluded: picked.taxesIncluded });
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
    taxesIncluded: best.taxesIncluded,
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
    // Google Hotels has no room-count parameter: it prices one room for the guests it is given.
    // Query the largest room and scale by the number of rooms the party needs.
    const perRoom = perRoomOccupancy(input);
    const q = new URLSearchParams({
      engine: "google_hotels",
      q: `Hotels in ${input.destination}`,
      check_in_date: input.checkIn,
      check_out_date: input.checkOut,
      adults: String(perRoom.adults),
      children: String(perRoom.children),
      currency: input.currency ?? "USD",
      hl: this.cfg.hl ?? "en",
      gl: this.cfg.gl ?? "us",
      api_key: this.cfg.apiKey,
    });
    if (perRoom.children > 0) {
      const ages = perRoom.childAges ?? [];
      const filled = Array.from({ length: perRoom.children }, (_, i) => ages[i] ?? 8);
      q.set("children_ages", filled.join(","));
    }
    const res = await fetchJson<GoogleHotelsResponse>(this.key, this.fetchImpl, `${this.cfg.baseUrl ?? "https://serpapi.com/search.json"}?${q.toString()}`, { headers: { Accept: "application/json" } }, this.cfg.timeoutMs ?? 15_000);
    if (res?.error) throw new ProviderError(this.key, "upstream", `Google Hotels search failed: ${res.error}`);
    if (!res || !Array.isArray(res.properties)) throw new ProviderError(this.key, "bad_response", "Google Hotels returned an unexpected response");
    return res.properties;
  }

  /** Fetches the live property-details page for one hotel and normalises its seller/room rates. */
  private async fetchPropertyDetails(offer: NormalisedOffer, input: PriceCheckInput) {
    const token = typeof offer.providerMetadata?.propertyToken === "string" ? offer.providerMetadata.propertyToken : null;
    if (!token) return null;
    const perRoom = perRoomOccupancy({ party: input.party });
    const q = new URLSearchParams({
      engine: "google_hotels",
      property_token: token,
      check_in_date: offer.stayStart,
      check_out_date: offer.stayEnd,
      adults: String(perRoom.adults),
      children: String(perRoom.children),
      currency: offer.currency,
      hl: this.cfg.hl ?? "en",
      gl: this.cfg.gl ?? "us",
      api_key: this.cfg.apiKey,
    });
    if (perRoom.children > 0) {
      const ages = perRoom.childAges ?? [];
      const filled = Array.from({ length: perRoom.children }, (_, i) => ages[i] ?? 8);
      q.set("children_ages", filled.join(","));
    }
    const res = await fetchJson<GooglePropertyDetailsResponse>(
      this.key,
      this.fetchImpl,
      `${this.cfg.baseUrl ?? "https://serpapi.com/search.json"}?${q.toString()}`,
      { headers: { Accept: "application/json" } },
      this.cfg.timeoutMs ?? 15_000,
    );
    if (res?.error) throw new ProviderError(this.key, "upstream", `Google Hotels property check failed: ${res.error}`);
    return parseGooglePropertyRates(res, { rooms: Math.max(1, offer.roomsRequired) });
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
    const cacheTtlSeconds = Math.max(0, this.cfg.cacheTtlSeconds ?? 15 * 60);
    const cacheKey = this.cfg.cache && !input.propertyIds?.length ? this.searchCacheKey(input) : null;
    const now = this.cfg.now?.() ?? new Date();
    if (this.cfg.cache && cacheKey && cacheTtlSeconds > 0) {
      const hit = await this.cfg.cache.get(cacheKey).catch(() => null);
      if (hit && Date.parse(hit.cachedAt) + cacheTtlSeconds * 1_000 > now.getTime()) {
        const expiresAt = new Date(Date.parse(hit.cachedAt) + cacheTtlSeconds * 1_000).toISOString();
        return hit.offers.map((offer) => ({
          ...offer,
          expiresAt,
          providerMetadata: { ...(offer.providerMetadata ?? {}), priceCache: { cached: true, cachedAt: hit.cachedAt } },
        }));
      }
    }

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
      const meal = mealPlanFromGoogle(p.amenities);
      const id = `gh:${p.property_token ?? normalizeHotelName(p.name)}:${input.checkIn}:${input.checkOut}:${rooms}:${choice.source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      offers.push({
        offerId: id,
        providerKey: this.key,
        externalOfferReference: id,
        source: "external",
        supplierId: null,
        supplierName: choice.source === "Google Hotels" ? "Google Hotels" : `${choice.source} via Google Hotels`,
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
        mealPlan: meal.mealPlan,
        mealPlanStatus: "unconfirmed",
        roomsRequired: rooms,
        occupancy: input.party,
        totalAmountMinor: choice.totalMinor,
        currency: input.currency ?? "USD",
        taxAmountMinor: null,
        feeAmountMinor: null,
        taxesIncluded: choice.taxesIncluded,
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
          breakfastBasis: meal.basis,
          boardBasisSource: meal.boardBasisSource,
          googleRating: p.overall_rating ?? null,
          reviews: p.reviews ?? null,
          propertyToken: p.property_token ?? null,
          link: p.link ?? null,
        },
        isMock: false,
      });
    }
    const finalOffers = this.cfg.direct?.enabled ? await this.enrichOffers(offers, input) : offers;
    if (this.cfg.cache && cacheKey && cacheTtlSeconds > 0) {
      await this.cfg.cache.set(cacheKey, { offers: finalOffers, cachedAt: retrievedAt }, cacheTtlSeconds).catch(() => undefined);
    }
    return finalOffers;
  }

  private searchCacheKey(input: HotelAvailabilityInput): string {
    const perRoom = perRoomOccupancy(input);
    return [
      GOOGLE_HOTELS_PROVIDER_KEY,
      input.destination.trim().toLowerCase(),
      input.checkIn,
      input.checkOut,
      Math.max(1, input.party.rooms.length),
      perRoom.adults,
      perRoom.children,
      (perRoom.childAges ?? []).join(","),
      input.currency ?? "USD",
      this.cfg.gl ?? "us",
      this.cfg.hl ?? "en",
    ].join("|");
  }

  /**
   * Verifies the cheapest properties against their Google Hotels entity page. Entity pages are
   * slower and less complete than SerpApi, so this is bounded, cached and failure-isolated: a
   * failed or missing entity page leaves the SerpApi offer untouched.
   */
  private async enrichOffers(offers: NormalisedOffer[], input: HotelAvailabilityInput): Promise<NormalisedOffer[]> {
    const direct = this.cfg.direct;
    if (!direct?.enabled || offers.length === 0) return offers;
    const rooms = Math.max(1, input.party.rooms.length);
    const perRoom = perRoomOccupancy(input);
    const partySize = Math.max(1, perRoom.adults + perRoom.children);
    const maxProperties = Math.min(10, Math.max(1, direct.maxProperties ?? 5));
    const concurrency = Math.min(5, Math.max(1, direct.concurrency ?? 2));
    const cacheTtlMs = Math.max(0, direct.cacheTtlMs ?? DEFAULT_ENTITY_CACHE_TTL_MS);
    const cache = direct.cache ?? DEFAULT_ENTITY_CACHE;
    const threshold = Math.max(1, direct.failureThreshold ?? 3);
    const clock = this.cfg.now ?? (() => new Date());

    const byToken = new Map<string, NormalisedOffer[]>();
    for (const offer of offers) {
      const token = typeof offer.providerMetadata?.propertyToken === "string" ? offer.providerMetadata.propertyToken : null;
      if (!token) continue;
      const list = byToken.get(token) ?? [];
      list.push(offer);
      byToken.set(token, list);
    }
    const ranked = [...byToken.entries()]
      .sort((a, b) => Math.min(...a[1].map((o) => o.totalAmountMinor)) - Math.min(...b[1].map((o) => o.totalAmountMinor)))
      .map(([token]) => token)
      .slice(0, maxProperties);
    const selected = new Set(ranked);

    const results = new Map<string, { entity?: GoogleHotelsEntity; cached: boolean; latencyMs: number; errorCode?: string }>();
    let failures = 0;
    let circuitOpen = false;

    await mapWithConcurrency(ranked, concurrency, async (token) => {
      if (circuitOpen) {
        results.set(token, { cached: false, latencyMs: 0, errorCode: "circuit_open" });
        return;
      }
      const key = entityCacheKey(token, input, perRoom);
      const cached = cache.get(key);
      const now = clock().getTime();
      if (cached && cacheTtlMs > 0 && now - cached.cachedAt < cacheTtlMs) {
        results.set(token, { entity: cached.entity, cached: true, latencyMs: 0 });
        return;
      }
      try {
        const fetched = await fetchGoogleHotelsEntity({
          token,
          destination: input.destination,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          adults: perRoom.adults,
          childAges: perRoom.childAges ?? [],
          rooms: 1,
          currency: input.currency ?? "USD",
          fetchImpl: this.fetchImpl,
          retries: direct.retries ?? 2,
          timeoutMs: direct.timeoutMs ?? 15_000,
          sleep: direct.sleep,
          now: clock,
        });
        if (cacheTtlMs > 0) {
          cache.set(key, { entity: fetched, cachedAt: now });
          if (cache.size > ENTITY_CACHE_LIMIT) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
        }
        failures = 0;
        results.set(token, { entity: fetched, cached: false, latencyMs: fetched.latencyMs });
      } catch (err) {
        failures++;
        if (failures >= threshold) circuitOpen = true;
        const errorCode = err instanceof GoogleHotelsDirectError ? err.code : "unknown";
        results.set(token, { cached: false, latencyMs: 0, errorCode });
      }
    });

    return offers.map((offer) => {
      const token = typeof offer.providerMetadata?.propertyToken === "string" ? offer.providerMetadata.propertyToken : null;
      if (!token) {
        return { ...offer, providerMetadata: { ...offer.providerMetadata, directEnrichment: emptyEnrichment({ reason: "missing_token" }) } };
      }
      if (!selected.has(token)) {
        return { ...offer, providerMetadata: { ...offer.providerMetadata, directEnrichment: emptyEnrichment({ reason: "outside_top_n" }) } };
      }
      const result = results.get(token);
      if (!result?.entity) {
        return { ...offer, providerMetadata: { ...offer.providerMetadata, directEnrichment: emptyEnrichment({ status: "error", errorCode: result?.errorCode ?? "unknown" }) } };
      }
      const entity = result.entity;
      const cheapest = chooseGoogleHotelsEntityRate(entity.rates, { requireBreakfast: false, partySize });
      const strict = chooseGoogleHotelsEntityRate(entity.rates, { requireBreakfast: true, partySize });
      return {
        ...offer,
        providerMetadata: {
          ...offer.providerMetadata,
          directEnrichment: {
            status: "ok",
            boardBasisSource: "rate",
            cached: result.cached,
            latencyMs: result.latencyMs,
            rateCount: entity.rates.length,
            entityTotalMinor: cheapest ? Math.round(cheapest.total * 100) * rooms : null,
            strictBreakfastTotalMinor: strict ? Math.round(strict.total * 100) * rooms : null,
            strictBreakfastSource: strict?.source ?? null,
            strictBreakfastRoom: strict?.room ?? null,
            strictBreakfastGuests: strict?.guests ?? null,
            strictBreakfastCancellation: strict?.cancellation ?? null,
          },
        },
      };
    });
  }

  async recheckPrice(input: PriceCheckInput): Promise<PriceCheckResult> {
    const offer = input.offer;
    const checkedAt = this.nowIso();
    const token = typeof offer.providerMetadata?.propertyToken === "string" ? offer.providerMetadata.propertyToken : null;
    if (!token) {
      return {
        status: "not_supported",
        offer,
        previousTotalMinor: offer.totalAmountMinor,
        currentTotalMinor: offer.totalAmountMinor,
        message: "This Google Hotels offer has no property token to re-check.",
        checkedAt,
      };
    }

    const perRoom = perRoomOccupancy({ party: input.party });
    const partySize = Math.max(1, perRoom.adults + perRoom.children);
    const requiresBreakfast = offer.mealPlan === "BB" && offer.mealPlanStatus === "confirmed";
    const rooms = Math.max(1, offer.roomsRequired);
    let rate: { source: string; room: string | null; guests: number | null; totalMinor: number; breakfast: string; freeCancellation: boolean | null } | null = null;
    let priceSources: { source: string; totalMinor: number }[] = [];

    if (requiresBreakfast) {
      if (!this.cfg.direct?.enabled) {
        return {
          status: "not_supported",
          offer,
          previousTotalMinor: offer.totalAmountMinor,
          currentTotalMinor: offer.totalAmountMinor,
          message: "A strict breakfast rate can only be live-checked through the entity verifier. Enable the direct verification pilot and check again.",
          checkedAt,
        };
      }
      const entity = await fetchGoogleHotelsEntity({
        token,
        destination: offer.property.destination,
        checkIn: offer.stayStart,
        checkOut: offer.stayEnd,
        adults: perRoom.adults,
        childAges: perRoom.childAges ?? [],
        rooms: 1,
        currency: offer.currency,
        fetchImpl: this.fetchImpl,
        retries: 1,
        timeoutMs: this.cfg.timeoutMs ?? 15_000,
        now: this.cfg.now,
      });
      const entityRate = chooseGoogleHotelsEntityRate(entity.rates, { requireBreakfast: true, partySize });
      if (entityRate) {
        rate = {
          source: entityRate.source,
          room: entityRate.room,
          guests: entityRate.guests,
          totalMinor: Math.round(entityRate.total * 100) * rooms,
          breakfast: entityRate.breakfast,
          freeCancellation: entityRate.cancellation ? /free cancellation/i.test(entityRate.cancellation) : null,
        };
      }
      priceSources = entity.rates.map((r) => ({ source: r.source, totalMinor: Math.round(r.total * 100) * rooms }));
    } else {
      const rates = await this.fetchPropertyDetails(offer, input);
      const liveRate = rates ? chooseGoogleLiveRate(rates, { requireBreakfast: false, partySize }) : null;
      if (liveRate) {
        rate = {
          source: liveRate.source,
          room: liveRate.room,
          guests: liveRate.guests,
          totalMinor: liveRate.totalMinor,
          breakfast: liveRate.breakfast,
          freeCancellation: liveRate.freeCancellation,
        };
      }
      priceSources = (rates ?? []).map((r) => ({ source: r.source, totalMinor: r.totalMinor }));
    }

    if (!rate) {
      return {
        status: "unavailable",
        offer: null,
        previousTotalMinor: offer.totalAmountMinor,
        currentTotalMinor: null,
        message: requiresBreakfast
          ? "No live breakfast-included rate is available for this property and party. The package cannot be quoted."
          : "No live rate is available for this property and party. The package cannot be quoted.",
        checkedAt,
      };
    }

    const currentTotalMinor = rate.totalMinor;
    const changed = currentTotalMinor !== offer.totalAmountMinor;
    const expiresAt = new Date(Date.parse(checkedAt) + 15 * 60_000).toISOString();
    const updated: NormalisedOffer = {
      ...offer,
      totalAmountMinor: currentTotalMinor,
      supplierName: rate.source === "Google Hotels" ? "Google Hotels" : `${rate.source} via Google Hotels`,
      roomType: rate.room ? { ...offer.roomType, name: rate.room } : offer.roomType,
      cancellation:
        rate.freeCancellation === null
          ? offer.cancellation
          : { ...offer.cancellation, refundable: rate.freeCancellation },
      retrievedAt: checkedAt,
      expiresAt,
      availabilityStatus: "unknown",
      verificationStatus: "live_checked",
      providerMetadata: {
        ...offer.providerMetadata,
        priceSources,
        cheapestSource: rate.source,
        recheck: {
          checkedAt,
          source: rate.source,
          room: rate.room,
          guests: rate.guests,
          breakfast: rate.breakfast,
          freeCancellation: rate.freeCancellation,
          previousTotalMinor: offer.totalAmountMinor,
          currentTotalMinor,
          method: requiresBreakfast ? "entity_rate" : "property_details",
        },
      },
    };

    return {
      status: changed ? "price_changed" : "confirmed",
      offer: updated,
      previousTotalMinor: offer.totalAmountMinor,
      currentTotalMinor,
      checkedAt,
    };
  }
}
