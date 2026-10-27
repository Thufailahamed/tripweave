import { nightsBetween, type HotelCategory, type NormalisedOffer } from "@tripweave/shared";
import { fetchJson, IntervalLimiter, type FetchLike } from "./resilience";
import { ProviderError, type HotelAvailabilityInput, type HotelProvider, type HotelSearchInput, type PriceCheckInput, type PriceCheckResult, type PropertySearchResult, type RoomOffer } from "./types";

export const OSM_DISCOVERY_PROVIDER_KEY = "osm_discovery";

/** A benchmark the app supplies from real catalogue rates, so estimates track the destination. */
export interface NightlyBenchmark {
  /** Median supplier cost for one room, one night, in minor units. */
  nightlyMinor: number;
  currency: string;
  basis: string;
}

export type BenchmarkSource = (input: HotelAvailabilityInput) => Promise<NightlyBenchmark | null>;

export interface OsmDiscoveryConfig {
  fetch?: FetchLike;
  /** Overpass interpreter. Defaults to the public instance. */
  overpassUrl?: string;
  /** Nominatim geocoder and fallback listing search. */
  nominatimUrl?: string;
  /** Contact address sent to Nominatim, as their usage policy requires. */
  contactEmail?: string;
  /** Timeout for the Overpass call. Kept short so the Nominatim fallback still gets a chance. */
  overpassTimeoutMs?: number;
  timeoutMs?: number;
  minIntervalMs?: number;
  maxResults?: number;
  /** Disable the Nominatim listing fallback (used by tests that only exercise Overpass). */
  nominatimDiscovery?: boolean;
  benchmark?: BenchmarkSource;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface NominatimRow {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  category?: string;
  type?: string;
  name?: string;
  extratags?: Record<string, string> | null;
}

/** Category defaults in USD minor units, used only when the catalogue has no comparable rates. */
const DEFAULT_NIGHTLY_MINOR: Record<HotelCategory, number> = {
  budget: 4_500,
  standard: 7_000,
  comfort: 11_000,
  boutique: 15_000,
  premium: 20_000,
  luxury: 32_000,
};

/** Applied to a catalogue median so a luxury listing is not priced like a guesthouse. */
const CATEGORY_FACTOR: Record<HotelCategory, number> = {
  budget: 0.55,
  standard: 0.75,
  comfort: 1,
  boutique: 1.3,
  premium: 1.55,
  luxury: 2.1,
};

const TOURISM_TYPES = "^(hotel|guest_house|hostel|apartment|motel|resort)$";
const TOURISM_TYPE_SET = new Set(["hotel", "guest_house", "hostel", "apartment", "motel", "resort"]);
/** Nominatim is queried with these terms when Overpass is unavailable. */
const NOMINATIM_TERMS = ["hotel", "guest house", "resort", "villa", "hostel"];

const CATEGORY_BY_STARS: Record<number, HotelCategory> = { 1: "budget", 2: "budget", 3: "comfort", 4: "premium", 5: "luxury" };

const AMENITY_TAGS: Record<string, string> = {
  "internet_access=wlan": "wifi",
  "internet_access=yes": "wifi",
  "swimming_pool=yes": "pool",
  "spa=yes": "spa",
  "fitness_centre=yes": "gym",
  "parking=yes": "parking",
  "air_conditioning=yes": "air_conditioning",
  restaurant: "restaurant",
  bar: "bar",
  beach: "beach",
};

export function normalizeHotelName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(hotel|hotels|resort|resorts|spa|the|by|at|and|guest|house|hostel|apartments?|villa|villas|inn|lodge)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function categoryFromTags(tags: Record<string, string>): { category: HotelCategory; stars: number | null } {
  const stars = Number.parseInt(tags.stars ?? "", 10);
  const validStars = Number.isFinite(stars) && stars >= 1 && stars <= 5 ? stars : null;
  if (validStars) return { category: CATEGORY_BY_STARS[validStars] ?? "standard", stars: validStars };
  const tourism = (tags.tourism ?? "").toLowerCase();
  if (tourism === "hostel" || tourism === "motel") return { category: "budget", stars: null };
  if (tourism === "guest_house") return { category: "comfort", stars: null };
  if (tourism === "apartment") return { category: "standard", stars: null };
  if (tourism === "resort") return { category: "premium", stars: null };
  return { category: "standard", stars: null };
}

export function amenitiesFromTags(tags: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const [tag, amenity] of Object.entries(AMENITY_TAGS)) {
    const [key, value] = tag.split("=");
    if (value ? tags[key!] === value : tags[key!] === "yes") out.add(amenity);
  }
  if (/wlan|wifi/i.test(tags["internet_access"] ?? "")) out.add("wifi");
  return [...out];
}

/** Parses Overpass JSON into named hotel-like listings, ignoring unnamed and malformed entries. */
export function parseOverpassElements(res: OverpassResponse, destination: string): PropertySearchResult[] {
  const out: PropertySearchResult[] = [];
  const seen = new Set<string>();
  for (const el of res.elements ?? []) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined) continue;
    const key = normalizeHotelName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const { category, stars } = categoryFromTags(tags);
    out.push({
      providerKey: OSM_DISCOVERY_PROVIDER_KEY,
      externalPropertyId: `osm:${el.type}/${el.id}`,
      name,
      destination: tags["addr:city"] || destination,
      latitude: lat,
      longitude: lon,
      category,
      starRating: stars,
      reviewScore: null,
      amenities: amenitiesFromTags(tags),
      isMock: false,
    });
  }
  return out;
}

/** Parses Nominatim search results into named hotel-like listings, keeping only tourism lodgings. */
export function parseNominatimRows(rows: NominatimRow[], destination: string): PropertySearchResult[] {
  const out: PropertySearchResult[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.name?.trim();
    const type = (row.type ?? "").toLowerCase();
    if (!name || row.category !== "tourism" || !TOURISM_TYPE_SET.has(type)) continue;
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const externalPropertyId = `osm:${row.osm_type ?? "node"}/${row.osm_id ?? `${lat},${lon}`}`;
    const key = normalizeHotelName(name);
    if (!key || seen.has(externalPropertyId) || seen.has(key)) continue;
    seen.add(externalPropertyId);
    seen.add(key);
    const tags: Record<string, string> = { ...(row.extratags ?? {}), tourism: type };
    const { category, stars } = categoryFromTags(tags);
    out.push({
      providerKey: OSM_DISCOVERY_PROVIDER_KEY,
      externalPropertyId,
      name,
      destination: tags["addr:city"] || destination,
      latitude: lat,
      longitude: lon,
      category,
      starRating: stars,
      reviewScore: null,
      amenities: amenitiesFromTags(tags),
      isMock: false,
    });
  }
  return out;
}

/**
 * Discovers real hotels from OpenStreetMap. It is deliberately honest about what it cannot know:
 * prices are estimates benchmarked against the company catalogue, availability is unknown, and
 * the board basis is unconfirmed. Nothing is scraped from Booking.com.
 */
export class OsmDiscoveryProvider implements HotelProvider {
  readonly key = OSM_DISCOVERY_PROVIDER_KEY;
  readonly displayName = "OpenStreetMap hotel discovery (estimated prices)";
  readonly isMock = false;
  private readonly fetchImpl: FetchLike;
  private readonly limiter: IntervalLimiter;
  private readonly geocodeCache = new Map<string, { latitude: number; longitude: number } | null>();

  constructor(private readonly cfg: OsmDiscoveryConfig = {}) {
    this.fetchImpl = cfg.fetch ?? ((u, i) => fetch(u, i));
    this.limiter = new IntervalLimiter(cfg.minIntervalMs ?? 1_100, Date.now, cfg.sleep);
  }

  private nowIso(): string {
    return (this.cfg.now?.() ?? new Date()).toISOString();
  }

  /** Overpass and Nominatim both reject requests without a descriptive User-Agent. */
  private userAgent(): string {
    return this.cfg.contactEmail ? `TripWeave/1.0 (${this.cfg.contactEmail})` : "TripWeave/1.0 (hotel discovery)";
  }

  private async geocode(destination: string): Promise<{ latitude: number; longitude: number } | null> {
    const key = destination.trim().toLowerCase();
    if (this.geocodeCache.has(key)) return this.geocodeCache.get(key) ?? null;
    const base = this.cfg.nominatimUrl ?? "https://nominatim.openstreetmap.org";
    const q = new URLSearchParams({ format: "jsonv2", limit: "1", q: destination });
    if (this.cfg.contactEmail) q.set("email", this.cfg.contactEmail);
    let result: { latitude: number; longitude: number } | null = null;
    try {
      await this.limiter.acquire();
      const rows = await fetchJson<{ lat?: string; lon?: string }[]>(
        this.key,
        this.fetchImpl,
        `${base}/search?${q.toString()}`,
        { headers: { Accept: "application/json", "User-Agent": this.userAgent() } },
        this.cfg.timeoutMs ?? 12_000,
      );
      const first = Array.isArray(rows) ? rows[0] : undefined;
      const latitude = Number(first?.lat);
      const longitude = Number(first?.lon);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) result = { latitude, longitude };
    } catch {
      result = null;
    }
    this.geocodeCache.set(key, result);
    return result;
  }

  private async fromOverpass(centre: { latitude: number; longitude: number }, radiusM: number, limit: number, destination: string): Promise<PropertySearchResult[]> {
    const query = `[out:json][timeout:25];nwr["tourism"~"${TOURISM_TYPES}"](around:${radiusM},${centre.latitude},${centre.longitude});out center ${limit};`;
    const base = this.cfg.overpassUrl ?? "https://overpass-api.de/api/interpreter";
    await this.limiter.acquire();
    const res = await fetchJson<OverpassResponse>(
      this.key,
      this.fetchImpl,
      base,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": this.userAgent() },
        body: new URLSearchParams({ data: query }).toString(),
      },
      this.cfg.overpassTimeoutMs ?? 8_000,
    );
    if (!res || !Array.isArray(res.elements)) throw new ProviderError(this.key, "bad_response", "OpenStreetMap returned an unexpected response");
    return parseOverpassElements(res, destination);
  }

  /**
   * Fallback listing search through Nominatim. The public Overpass instance is frequently queued
   * for a minute or more; Nominatim answers in about a second and exposes the same OSM lodgings.
   */
  private async fromNominatim(centre: { latitude: number; longitude: number }, radiusKm: number, destination: string, limit: number): Promise<PropertySearchResult[]> {
    const base = this.cfg.nominatimUrl ?? "https://nominatim.openstreetmap.org";
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / (111 * Math.max(0.2, Math.cos((centre.latitude * Math.PI) / 180)));
    const viewbox = [centre.longitude - lonDelta, centre.latitude + latDelta, centre.longitude + lonDelta, centre.latitude - latDelta].map((n) => n.toFixed(6)).join(",");
    const out: PropertySearchResult[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    for (const term of NOMINATIM_TERMS) {
      if (out.length >= limit) break;
      const q = new URLSearchParams({ format: "jsonv2", limit: "50", q: term, viewbox, bounded: "1", extratags: "1" });
      if (this.cfg.contactEmail) q.set("email", this.cfg.contactEmail);
      await this.limiter.acquire();
      const rows = await fetchJson<NominatimRow[]>(
        this.key,
        this.fetchImpl,
        `${base}/search?${q.toString()}`,
        { headers: { Accept: "application/json", "User-Agent": this.userAgent() } },
        this.cfg.timeoutMs ?? 12_000,
      );
      for (const p of parseNominatimRows(Array.isArray(rows) ? rows : [], destination)) {
        const name = normalizeHotelName(p.name);
        if (seenIds.has(p.externalPropertyId) || seenNames.has(name)) continue;
        seenIds.add(p.externalPropertyId);
        seenNames.add(name);
        out.push(p);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  async searchProperties(input: HotelSearchInput): Promise<PropertySearchResult[]> {
    const centre =
      input.latitude != null && input.longitude != null
        ? { latitude: input.latitude, longitude: input.longitude }
        : await this.geocode(input.destination);
    if (!centre) throw new ProviderError(this.key, "unsupported", "Hotel discovery needs coordinates for this destination; geocoding found none.");
    const radiusKm = input.radiusKm ?? 15;
    const limit = Math.max(1, Math.min(input.limit ?? this.cfg.maxResults ?? 40, 100));
    let properties: PropertySearchResult[] = [];
    let overpassError: unknown = null;
    try {
      properties = await this.fromOverpass(centre, Math.round(radiusKm * 1_000), limit, input.destination);
    } catch (e) {
      overpassError = e;
    }
    const fallbackWanted = this.cfg.nominatimDiscovery !== false && properties.length < Math.min(3, limit);
    if (fallbackWanted) {
      try {
        const fallback = await this.fromNominatim(centre, radiusKm, input.destination, limit);
        const seenIds = new Set(properties.map((p) => p.externalPropertyId));
        const seenNames = new Set(properties.map((p) => normalizeHotelName(p.name)));
        for (const p of fallback) {
          const name = normalizeHotelName(p.name);
          if (seenIds.has(p.externalPropertyId) || seenNames.has(name)) continue;
          seenIds.add(p.externalPropertyId);
          seenNames.add(name);
          properties.push(p);
          if (properties.length >= limit) break;
        }
      } catch (e) {
        if (properties.length === 0) throw overpassError ?? e;
      }
    }
    if (properties.length === 0 && overpassError) throw overpassError;
    return properties.slice(0, limit);
  }

  private async benchmarkFor(input: HotelAvailabilityInput): Promise<NightlyBenchmark | null> {
    if (!this.cfg.benchmark) return null;
    return this.cfg.benchmark(input).catch(() => null);
  }

  private nightlyFor(benchmark: NightlyBenchmark | null, category: HotelCategory): { nightlyMinor: number; currency: string; basis: string } {
    if (benchmark && benchmark.nightlyMinor > 0) {
      return {
        nightlyMinor: Math.round(benchmark.nightlyMinor * CATEGORY_FACTOR[category]),
        currency: benchmark.currency,
        basis: `catalogue median (${benchmark.basis})`,
      };
    }
    return { nightlyMinor: DEFAULT_NIGHTLY_MINOR[category], currency: "USD", basis: "category default (no catalogue benchmark)" };
  }

  async getAvailability(input: HotelAvailabilityInput): Promise<RoomOffer[]> {
    const properties = await this.searchProperties(input);
    const benchmark = await this.benchmarkFor(input);
    const nights = nightsBetween(input.checkIn, input.checkOut);
    const rooms = Math.max(1, input.party.rooms.length);
    const maxOccupancy = Math.max(1, ...input.party.rooms.map((r) => r.adults + r.children));
    const maxAdults = Math.max(1, ...input.party.rooms.map((r) => r.adults));
    const retrievedAt = this.nowIso();
    const offers: RoomOffer[] = [];
    for (const p of properties) {
      if (input.propertyIds && !input.propertyIds.includes(p.externalPropertyId)) continue;
      const category = p.category ?? "standard";
      const estimate = this.nightlyFor(benchmark, category);
      const total = Math.round(estimate.nightlyMinor * nights * rooms);
      const id = `osm:${p.externalPropertyId}:${input.checkIn}:${input.checkOut}:${rooms}`;
      const bookingSearchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${p.name}, ${p.destination}`)}&checkin=${input.checkIn}&checkout=${input.checkOut}&group_adults=${input.party.adults}&group_children=${input.party.children}`;
      offers.push({
        offerId: id,
        providerKey: this.key,
        externalOfferReference: id,
        source: "external",
        supplierId: null,
        supplierName: "OpenStreetMap listing (estimated)",
        property: {
          id: p.externalPropertyId,
          name: p.name,
          destination: p.destination,
          latitude: p.latitude,
          longitude: p.longitude,
          category: p.category,
          starRating: p.starRating,
          reviewScore: p.reviewScore,
          amenities: p.amenities,
          ownerOrganizationId: null,
        },
        roomType: { id: null, name: "Room type to confirm", maxOccupancy, maxAdults },
        stayStart: input.checkIn,
        stayEnd: input.checkOut,
        nights,
        mealPlan: "RO",
        mealPlanStatus: "unconfirmed",
        roomsRequired: rooms,
        occupancy: input.party,
        totalAmountMinor: total,
        currency: estimate.currency,
        taxAmountMinor: null,
        feeAmountMinor: null,
        taxesIncluded: null,
        cancellation: { refundable: null, freeCancellationUntil: null, penaltyDescription: null },
        payment: { type: "unknown", description: "Payment terms are confirmed by the hotel." },
        retrievedAt,
        expiresAt: null,
        availabilityStatus: "unknown",
        verificationStatus: "estimated",
        providerMetadata: {
          listingSource: "openstreetmap",
          attribution: "© OpenStreetMap contributors",
          estimateBasis: estimate.basis,
          estimatedNightlyMinor: estimate.nightlyMinor,
          bookingSearchUrl,
        },
        isMock: false,
      });
    }
    return offers;
  }

  /** An estimate cannot be verified; the UI offers the hotel's own booking link instead. */
  async recheckPrice(input: PriceCheckInput): Promise<PriceCheckResult> {
    return {
      status: "not_supported",
      offer: input.offer,
      previousTotalMinor: input.offer.totalAmountMinor,
      currentTotalMinor: input.offer.totalAmountMinor,
      message: "This is a discovery estimate, not a bookable rate. Confirm the price with the hotel before quoting.",
      checkedAt: this.nowIso(),
    };
  }
}
