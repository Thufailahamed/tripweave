import { nightsBetween, type HotelCategory, type MealPlan, type NormalisedOffer } from "@tripweave/shared";
import { fetchJson, IntervalLimiter, withRetry, type FetchLike } from "./resilience";
import { ProviderError, type HotelAvailabilityInput, type HotelProvider, type HotelSearchInput, type PriceCheckInput, type PriceCheckResult, type PropertySearchResult, type RoomOffer } from "./types";

export const HOTELBEDS_PROVIDER_KEY = "hotelbeds";

export interface HotelbedsConfig {
  apiKey: string;
  secret: string;
  /** e.g. https://api.test.hotelbeds.com (sandbox) or https://api.hotelbeds.com (live). */
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  retries?: number;
  minIntervalMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

interface HbTax { included?: boolean; amount?: string; currency?: string }
interface HbCancellation { amount?: string; from?: string }
interface HbRate {
  rateKey: string; rateClass?: string; rateType?: string; net?: string; allotment?: number; paymentType?: string; boardCode?: string;
  cancellationPolicies?: HbCancellation[]; taxes?: { taxes?: HbTax[]; allIncluded?: boolean }; rooms?: number; adults?: number; children?: number;
}
interface HbRoom { code?: string; name?: string; rates?: HbRate[] }
interface HbHotel { code: number | string; name: string; categoryName?: string; destinationName?: string; latitude?: string; longitude?: string; currency?: string; rooms?: HbRoom[] }
interface HbAvailabilityResponse { hotels?: { hotels?: HbHotel[] } }
interface HbCheckRateResponse { hotel?: HbHotel }

const BOARD: Record<string, MealPlan> = { RO: "RO", SC: "RO", BB: "BB", HB: "HB", FB: "FB", AI: "AI", TI: "AI" };

export function parseCategory(name: string | undefined): { category: HotelCategory | null; stars: number | null } {
  if (!name) return { category: null, stars: null };
  if (/boutique/i.test(name)) return { category: "boutique", stars: null };
  const m = /(\d)/.exec(name);
  const stars = m ? Number(m[1]) : null;
  const map: Record<number, HotelCategory> = { 1: "budget", 2: "standard", 3: "comfort", 4: "premium", 5: "luxury" };
  return { category: stars ? (map[stars] ?? null) : null, stars };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hotelbeds APItude adapter (the first approved external provider). Requires credentials issued
 * by Hotelbeds; without them the registry never constructs this adapter. Amenities and guest
 * reviews are content-API data and are NOT returned by availability, so they stay empty / null
 * rather than being invented.
 */
export class HotelbedsProvider implements HotelProvider {
  readonly key = HOTELBEDS_PROVIDER_KEY;
  readonly displayName = "Hotelbeds";
  readonly isMock = false;
  private readonly fetchImpl: FetchLike;
  private readonly limiter: IntervalLimiter;
  constructor(private readonly cfg: HotelbedsConfig) {
    this.fetchImpl = cfg.fetch ?? ((u, i) => fetch(u, i));
    this.limiter = new IntervalLimiter(cfg.minIntervalMs ?? 250, Date.now, cfg.sleep);
  }

  private async headers(): Promise<Record<string, string>> {
    const ts = Math.floor((this.cfg.now?.() ?? new Date()).getTime() / 1000);
    return {
      "Api-key": this.cfg.apiKey,
      "X-Signature": await sha256Hex(`${this.cfg.apiKey}${this.cfg.secret}${ts}`),
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(
      async () => {
        await this.limiter.acquire();
        return fetchJson<T>(this.key, this.fetchImpl, `${this.cfg.baseUrl}${path}`, { method: "POST", headers: await this.headers(), body: JSON.stringify(body) }, this.cfg.timeoutMs ?? 8_000);
      },
      { retries: this.cfg.retries ?? 2, baseDelayMs: 300, maxDelayMs: 3_000, sleep: this.cfg.sleep },
    );
  }

  private buildRequest(input: HotelSearchInput & { propertyIds?: string[] }) {
    const rooms = input.party.rooms;
    const first = rooms[0];
    if (!first) throw new ProviderError(this.key, "bad_request", "No rooms requested");
    const sig = (r: typeof first) => `${r.adults}|${r.children}|${(r.childAges ?? []).join(",")}`;
    if (rooms.some((r) => sig(r) !== sig(first))) {
      throw new ProviderError(this.key, "unsupported", "Hotelbeds adapter supports one occupancy type per search (all rooms identical).");
    }
    const occupancy: Record<string, unknown> = { rooms: rooms.length, adults: first.adults, children: first.children };
    if (first.children > 0) occupancy.paxes = Array.from({ length: first.children }, (_, i) => ({ type: "CH", age: first.childAges?.[i] ?? 8 }));
    const body: Record<string, unknown> = { stay: { checkIn: input.checkIn, checkOut: input.checkOut }, occupancies: [occupancy] };
    if (input.propertyIds?.length) body.hotels = { hotel: input.propertyIds.map(Number).filter((n) => Number.isFinite(n)) };
    else if (input.latitude != null && input.longitude != null) body.geolocation = { latitude: input.latitude, longitude: input.longitude, radius: input.radiusKm ?? 20, unit: "km" };
    else throw new ProviderError(this.key, "unsupported", "Hotelbeds search needs coordinates or hotel codes; add coordinates to the itinerary stop.");
    return body;
  }

  async searchProperties(input: HotelSearchInput): Promise<PropertySearchResult[]> {
    const hotels = await this.fetchHotels(input);
    return hotels.map((h) => this.toProperty(h, input.destination));
  }

  private async fetchHotels(input: HotelSearchInput & { propertyIds?: string[] }): Promise<HbHotel[]> {
    const res = await this.post<HbAvailabilityResponse>("/hotel-api/1.0/hotels", this.buildRequest(input));
    if (!res || typeof res !== "object" || (res.hotels && !Array.isArray(res.hotels.hotels) && res.hotels.hotels !== undefined)) throw new ProviderError(this.key, "bad_response", "Unexpected availability response shape");
    return (res.hotels?.hotels ?? []).slice(0, input.limit ?? 50);
  }

  private toProperty(h: HbHotel, destination: string): PropertySearchResult {
    const c = parseCategory(h.categoryName);
    return { providerKey: this.key, externalPropertyId: String(h.code), name: h.name, destination: h.destinationName ?? destination, latitude: h.latitude ? Number(h.latitude) : null, longitude: h.longitude ? Number(h.longitude) : null, category: c.category, starRating: c.stars, reviewScore: null, amenities: [], isMock: false };
  }

  private toOffer(h: HbHotel, room: HbRoom, rate: HbRate, input: HotelSearchInput, checkedLive: boolean): NormalisedOffer | null {
    const net = Number(rate.net);
    if (!Number.isFinite(net) || net < 0) return null;
    const currency = h.currency ?? "EUR";
    const c = parseCategory(h.categoryName);
    const taxes = rate.taxes?.taxes ?? [];
    const taxMinor = taxes.length ? Math.round(taxes.reduce((s, t) => s + Number(t.amount ?? 0), 0) * 100) : null;
    // Taxes Hotelbeds lists as not included are payable on top of the net rate, so they are part of the cost.
    const notIncluded = taxes.filter((t) => t.included === false && (!t.currency || t.currency === (h.currency ?? "EUR")));
    const notIncludedMinor = notIncluded.length ? Math.round(notIncluded.reduce((s, t) => s + Number(t.amount ?? 0), 0) * 100) : 0;
    const taxesIncluded = rate.taxes?.allIncluded === false && notIncluded.length === 0 ? null : rate.taxes?.allIncluded === false ? true : rate.taxes?.allIncluded ?? null;
    const rooms = rate.rooms ?? input.party.rooms.length;
    const policies = rate.cancellationPolicies ?? [];
    const refundable = rate.rateClass === "NRF" ? false : rate.rateClass === "NOR" ? true : null;
    const retrievedAt = (this.cfg.now?.() ?? new Date()).toISOString();
    const rateType = rate.rateType ?? "BOOKABLE";
    const id = `${this.key}:${rate.rateKey}`;
    return {
      offerId: id, providerKey: this.key, externalOfferReference: rate.rateKey, source: "external", supplierId: null, supplierName: "Hotelbeds",
      property: { id: String(h.code), name: h.name, destination: h.destinationName ?? input.destination, latitude: h.latitude ? Number(h.latitude) : null, longitude: h.longitude ? Number(h.longitude) : null, category: c.category, starRating: c.stars, reviewScore: null, amenities: [], ownerOrganizationId: null },
      roomType: { id: null, name: room.name ?? room.code ?? "Room", maxOccupancy: (rate.adults ?? 2) + (rate.children ?? 0), maxAdults: rate.adults ?? 2 },
      stayStart: input.checkIn, stayEnd: input.checkOut, nights: nightsBetween(input.checkIn, input.checkOut), mealPlan: BOARD[rate.boardCode ?? "RO"] ?? "RO",
      roomsRequired: rooms, occupancy: input.party, totalAmountMinor: Math.round(net * 100) + notIncludedMinor, currency, taxAmountMinor: taxMinor, feeAmountMinor: null,
      taxesIncluded,
      cancellation: { refundable, freeCancellationUntil: refundable && policies[0]?.from ? policies[0].from.slice(0, 10) : null, penaltyDescription: policies[0]?.amount ? `Penalty from ${policies[0].from?.slice(0, 10)}: ${policies[0].amount} ${currency}` : null },
      payment: { type: rate.paymentType === "AT_HOTEL" ? "pay_at_hotel" : rate.paymentType === "AT_WEB" ? "pay_now" : "unknown" },
      retrievedAt, expiresAt: null,
      availabilityStatus: typeof rate.allotment === "number" ? (rate.allotment >= rooms ? "confirmed" : "unavailable") : "unknown",
      verificationStatus: checkedLive ? "live_checked" : rateType === "RECHECK" ? "requires_confirmation" : "supplier_reported",
      providerMetadata: { rateClass: rate.rateClass, rateType, boardCode: rate.boardCode, roomCode: room.code },
      isMock: false,
    };
  }

  async getAvailability(input: HotelAvailabilityInput): Promise<RoomOffer[]> {
    const hotels = await this.fetchHotels(input);
    const offers: NormalisedOffer[] = [];
    for (const h of hotels) for (const room of h.rooms ?? []) for (const rate of room.rates ?? []) {
      const o = this.toOffer(h, room, rate, input, false);
      if (o) offers.push(o);
    }
    return offers;
  }

  async recheckPrice(input: PriceCheckInput): Promise<PriceCheckResult> {
    const o = input.offer;
    const checkedAt = (this.cfg.now?.() ?? new Date()).toISOString();
    const res = await this.post<HbCheckRateResponse>("/hotel-api/1.0/checkrates", { rooms: [{ rateKey: o.externalOfferReference }] });
    const hotel = res.hotel;
    const room = hotel?.rooms?.[0];
    const rate = room?.rates?.[0];
    if (!hotel || !room || !rate) return { status: "unavailable", offer: { ...o, availabilityStatus: "unavailable", verificationStatus: "unavailable" }, previousTotalMinor: o.totalAmountMinor, currentTotalMinor: null, message: "Supplier no longer returns this rate.", checkedAt };
    const refreshed = this.toOffer(hotel, room, rate, { organizationId: input.organizationId, destination: o.property.destination, checkIn: o.stayStart, checkOut: o.stayEnd, party: input.party }, true);
    if (!refreshed) throw new ProviderError(this.key, "bad_response", "Supplier returned an unusable rate");
    const changed = refreshed.totalAmountMinor !== o.totalAmountMinor || refreshed.currency !== o.currency;
    return { status: changed ? "price_changed" : "confirmed", offer: { ...refreshed, offerId: o.offerId }, previousTotalMinor: o.totalAmountMinor, currentTotalMinor: refreshed.totalAmountMinor, checkedAt };
  }
}
