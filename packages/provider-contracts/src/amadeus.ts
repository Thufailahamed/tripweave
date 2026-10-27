import { addDays, nightsBetween, toMinorUnits, type MealPlan, type NormalisedOffer } from "@tripweave/shared";
import { fetchJson, IntervalLimiter, withRetry, type FetchLike } from "./resilience";
import { ProviderError, type HotelAvailabilityInput, type HotelProvider, type HotelSearchInput, type PriceCheckInput, type PriceCheckResult, type PropertySearchResult, type RoomOffer } from "./types";

export const AMADEUS_PROVIDER_KEY = "amadeus";

export interface AmadeusConfig {
  clientId: string;
  clientSecret: string;
  /** https://test.api.amadeus.com (free test data subset) or https://api.amadeus.com (production). */
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  retries?: number;
  minIntervalMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

interface AmTokenResponse { access_token?: string; expires_in?: number }
interface AmListHotel { hotelId: string; name?: string; chainCode?: string; iataCode?: string; geoCode?: { latitude?: number; longitude?: number } }
interface AmListResponse { data?: AmListHotel[] }
interface AmTax { amount?: string; currency?: string; code?: string; included?: boolean }
interface AmPriceChange { startDate?: string; endDate?: string; total?: string; sellingTotal?: string }
interface AmPrice { currency?: string; total?: string; sellingTotal?: string; base?: string; taxes?: AmTax[]; variations?: { average?: { total?: string; sellingTotal?: string }; changes?: AmPriceChange[] } }
interface AmCancellation { type?: string; amount?: string; numberOfNights?: number; percentage?: string; deadline?: string }
interface AmOffer {
  id: string; checkInDate?: string; checkOutDate?: string; rateCode?: string; boardType?: string;
  room?: { type?: string; typeEstimated?: { category?: string; beds?: number; bedType?: string }; description?: { text?: string } };
  guests?: { adults?: number; childAges?: number[] };
  price?: AmPrice;
  policies?: { paymentType?: string; cancellations?: AmCancellation[] };
}
interface AmHotelOffers { available?: boolean; hotel?: { hotelId?: string; name?: string; cityCode?: string }; offers?: AmOffer[] }
interface AmOffersResponse { data?: AmHotelOffers[] }
interface AmPricingResponse { data?: AmHotelOffers }

const BOARD: Record<string, MealPlan> = {
  ROOM_ONLY: "RO", SELF_CATERING: "RO",
  BREAKFAST: "BB", BUFFET_BREAKFAST: "BB", CARIBBEAN_BREAKFAST: "BB", CONTINENTAL_BREAKFAST: "BB", ENGLISH_BREAKFAST: "BB", FULL_BREAKFAST: "BB",
  HALF_BOARD: "HB", DINNER_BED_AND_BREAKFAST: "HB",
  FULL_BOARD: "FB", AMERICAN: "FB", FAMILY_AMERICAN: "FB",
  ALL_INCLUSIVE: "AI",
};

const PAYMENT: Record<string, NormalisedOffer["payment"]["type"]> = { GUARANTEE: "pay_at_hotel", DEPOSIT: "deposit", PREPAY: "pay_now" };

/** Amadeus accepts at most 20 hotel ids per offers request. */
const OFFERS_BATCH = 20;
const DEFAULT_HOTEL_CAP = 40;
const TOKEN_SKEW_MS = 30_000;

/**
 * Amadeus Self-Service Hotel Search adapter (Hotel List by geocode → Hotel Search v3).
 *
 * Deliberate limits, so nothing is guessed:
 * - Amadeus v3 prices adults only; searches with children are refused as unsupported.
 * - Offers are requested for ONE room and multiplied by the room count, because the API does not
 *   say whether `price.total` covers all requested rooms. Availability for multi-room searches
 *   is therefore reported as "unknown", not confirmed.
 * - Star rating, guest reviews and amenities are not in these responses and stay null / empty.
 * - The free test environment only returns a subset of real hotels with test prices.
 */
export class AmadeusProvider implements HotelProvider {
  readonly key = AMADEUS_PROVIDER_KEY;
  readonly displayName = "Amadeus";
  readonly isMock = false;
  private readonly fetchImpl: FetchLike;
  private readonly limiter: IntervalLimiter;
  private token: { value: string; expiresAt: number } | null = null;
  constructor(private readonly cfg: AmadeusConfig) {
    this.fetchImpl = cfg.fetch ?? ((u, i) => fetch(u, i));
    this.limiter = new IntervalLimiter(cfg.minIntervalMs ?? 150, Date.now, cfg.sleep);
  }

  private nowMs(): number {
    return (this.cfg.now?.() ?? new Date()).getTime();
  }

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt > this.nowMs()) return this.token.value;
    const body = new URLSearchParams({ grant_type: "client_credentials", client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret });
    const res = await fetchJson<AmTokenResponse>(this.key, this.fetchImpl, `${this.cfg.baseUrl}/v1/security/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: body.toString() }, this.cfg.timeoutMs ?? 8_000)
      .catch((e: unknown) => {
        // The token endpoint answers bad credentials with 400/401; both mean "not authorised".
        if (e instanceof ProviderError && e.code === "bad_request" && (e.status === 400 || e.status === 401)) throw new ProviderError(this.key, "auth", "Amadeus rejected the client id/secret", false, e.status);
        throw e;
      });
    if (!res?.access_token) throw new ProviderError(this.key, "bad_response", "Amadeus token response had no access_token");
    this.token = { value: res.access_token, expiresAt: this.nowMs() + Math.max(0, (res.expires_in ?? 1_799) * 1_000 - TOKEN_SKEW_MS) };
    return res.access_token;
  }

  private async get<T>(path: string, query: URLSearchParams): Promise<T> {
    const call = async (forceToken: boolean) => {
      const token = await this.accessToken(forceToken);
      await this.limiter.acquire();
      const qs = query.toString();
      return fetchJson<T>(this.key, this.fetchImpl, `${this.cfg.baseUrl}${path}${qs ? `?${qs}` : ""}`, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, this.cfg.timeoutMs ?? 8_000);
    };
    return withRetry(
      async () => {
        try {
          return await call(false);
        } catch (e) {
          // A cached token can be revoked or expire early: refresh once, then surface the auth error.
          if (e instanceof ProviderError && e.code === "auth" && this.token) return call(true);
          throw e;
        }
      },
      { retries: this.cfg.retries ?? 2, baseDelayMs: 300, maxDelayMs: 3_000, sleep: this.cfg.sleep },
    );
  }

  private assertSearchable(input: HotelSearchInput): { adults: number; rooms: number } {
    const first = input.party.rooms[0];
    if (!first) throw new ProviderError(this.key, "bad_request", "No rooms requested");
    if (input.party.rooms.some((r) => r.children > 0)) throw new ProviderError(this.key, "unsupported", "Amadeus Hotel Search v3 prices adults only; searches with children are not sent to it.");
    if (input.party.rooms.some((r) => r.adults !== first.adults)) throw new ProviderError(this.key, "unsupported", "Amadeus adapter supports one occupancy type per search (all rooms identical).");
    if (first.adults < 1 || first.adults > 9) throw new ProviderError(this.key, "unsupported", "Amadeus supports 1-9 adults per room.");
    return { adults: first.adults, rooms: input.party.rooms.length };
  }

  private async listHotels(input: HotelSearchInput & { propertyIds?: string[] }): Promise<AmListHotel[]> {
    const cap = input.limit ?? DEFAULT_HOTEL_CAP;
    if (input.propertyIds?.length) return input.propertyIds.slice(0, cap).map((hotelId) => ({ hotelId }));
    if (input.latitude == null || input.longitude == null) throw new ProviderError(this.key, "unsupported", "Amadeus search needs coordinates or hotel ids; add coordinates to the itinerary stop.");
    const q = new URLSearchParams({ latitude: String(input.latitude), longitude: String(input.longitude), radius: String(Math.max(1, Math.round(input.radiusKm ?? 20))), radiusUnit: "KM", hotelSource: "ALL" });
    const res = await this.get<AmListResponse>("/v1/reference-data/locations/hotels/by-geocode", q);
    if (!res || typeof res !== "object" || (res.data !== undefined && !Array.isArray(res.data))) throw new ProviderError(this.key, "bad_response", "Unexpected hotel list response shape");
    return (res.data ?? []).filter((h) => typeof h?.hotelId === "string" && h.hotelId.length > 0).slice(0, cap);
  }

  async searchProperties(input: HotelSearchInput): Promise<PropertySearchResult[]> {
    const hotels = await this.listHotels(input);
    return hotels.map((h) => ({ providerKey: this.key, externalPropertyId: h.hotelId, name: h.name ?? h.hotelId, destination: input.destination, latitude: h.geoCode?.latitude ?? null, longitude: h.geoCode?.longitude ?? null, category: null, starRating: null, reviewScore: null, amenities: [], isMock: false }));
  }

  async getAvailability(input: HotelAvailabilityInput): Promise<RoomOffer[]> {
    const { adults, rooms } = this.assertSearchable(input);
    const hotels = await this.listHotels(input);
    const byId = new Map(hotels.map((h) => [h.hotelId, h]));
    const offers: NormalisedOffer[] = [];
    for (let i = 0; i < hotels.length; i += OFFERS_BATCH) {
      const ids = hotels.slice(i, i + OFFERS_BATCH).map((h) => h.hotelId);
      const q = new URLSearchParams({ hotelIds: ids.join(","), adults: String(adults), roomQuantity: "1", checkInDate: input.checkIn, checkOutDate: input.checkOut, bestRateOnly: "false" });
      if (input.currency) q.set("currency", input.currency);
      const res = await this.get<AmOffersResponse>("/v3/shopping/hotel-offers", q);
      if (!res || typeof res !== "object" || (res.data !== undefined && !Array.isArray(res.data))) throw new ProviderError(this.key, "bad_response", "Unexpected hotel offers response shape");
      for (const entry of res.data ?? []) {
        if (entry.available === false) continue;
        const meta = entry.hotel?.hotelId ? byId.get(entry.hotel.hotelId) : undefined;
        for (const o of entry.offers ?? []) {
          const offer = this.toOffer(entry, meta, o, input, rooms, false);
          if (offer) offers.push(offer);
        }
      }
    }
    return offers;
  }

  private toOffer(entry: AmHotelOffers, meta: AmListHotel | undefined, o: AmOffer, input: HotelSearchInput, rooms: number, checkedLive: boolean): NormalisedOffer | null {
    const hotelId = entry.hotel?.hotelId ?? meta?.hotelId;
    const price = o.price;
    const currency = price?.currency;
    const totalStr = price?.sellingTotal ?? price?.total;
    if (!hotelId || !currency || !totalStr || !o.id) return null;
    let perRoomMinor: number;
    try {
      perRoomMinor = toMinorUnits(totalStr, currency);
    } catch {
      return null; // currency the pricing engine cannot represent, or an unparseable amount
    }
    if (!Number.isFinite(perRoomMinor) || perRoomMinor < 0) return null;
    const checkIn = o.checkInDate ?? input.checkIn;
    const checkOut = o.checkOutDate ?? input.checkOut;
    const nights = nightsBetween(checkIn, checkOut);
    const adults = o.guests?.adults ?? input.party.rooms[0]?.adults ?? 2;

    const taxes = price?.taxes ?? [];
    const taxMinor = taxes.length ? safeSum(taxes.map((t) => t.amount), currency) : null;
    const taxesIncluded = taxes.length === 0 ? null : taxes.every((t) => t.included === true) ? true : taxes.some((t) => t.included === false) ? false : null;
    const notIncludedMinor = taxes.filter((t) => t.included === false && (!t.currency || t.currency === currency)).length ? safeSum(taxes.filter((t) => t.included === false && (!t.currency || t.currency === currency)).map((t) => t.amount), currency) : null;

    const nightly = this.nightlyRates(price, checkIn, checkOut, perRoomMinor, rooms, currency);
    const cancellation = this.cancellation(o.policies?.cancellations ?? [], currency);
    const retrievedAt = (this.cfg.now?.() ?? new Date()).toISOString();
    const roomName = o.room?.description?.text?.split("\n")[0]?.trim() || o.room?.typeEstimated?.category?.replace(/_/g, " ") || o.room?.type || "Room";
    const destination = input.destination;

    return {
      offerId: `${this.key}:${o.id}`, providerKey: this.key, externalOfferReference: o.id, source: "external", supplierId: null, supplierName: "Amadeus",
      property: { id: hotelId, name: entry.hotel?.name ?? meta?.name ?? hotelId, destination, latitude: meta?.geoCode?.latitude ?? null, longitude: meta?.geoCode?.longitude ?? null, category: null, starRating: null, reviewScore: null, amenities: [], ownerOrganizationId: null },
      roomType: { id: null, name: roomName, maxOccupancy: adults + (o.guests?.childAges?.length ?? 0), maxAdults: adults },
      stayStart: checkIn, stayEnd: checkOut, nights, mealPlan: BOARD[o.boardType ?? "ROOM_ONLY"] ?? "RO",
      roomsRequired: rooms, occupancy: input.party, totalAmountMinor: perRoomMinor * rooms, currency,
      taxAmountMinor: taxMinor === null ? null : taxMinor * rooms, feeAmountMinor: null, taxesIncluded,
      ...(nightly ? { nightlyRates: nightly } : {}),
      cancellation,
      payment: { type: PAYMENT[o.policies?.paymentType ?? ""] ?? "unknown" },
      retrievedAt, expiresAt: null,
      // One room's offer was returned, so a multi-room stay has not actually been checked for stock.
      availabilityStatus: rooms === 1 ? "confirmed" : "unknown",
      verificationStatus: checkedLive ? "live_checked" : "supplier_reported",
      providerMetadata: { rateCode: o.rateCode, boardType: o.boardType, roomCode: o.room?.type, pricedPerRoomMinor: perRoomMinor, ...(notIncludedMinor ? { taxesNotIncludedPerRoomMinor: notIncludedMinor } : {}), usedSellingTotal: price?.sellingTotal != null },
      isMock: false,
    };
  }

  /** Per-night rates are only exposed when they reconcile exactly with the stay total. */
  private nightlyRates(price: AmPrice | undefined, checkIn: string, checkOut: string, perRoomMinor: number, rooms: number, currency: string): NormalisedOffer["nightlyRates"] | null {
    const changes = price?.variations?.changes;
    if (!changes?.length) return null;
    const out: { date: string; amountMinor: number }[] = [];
    try {
      for (const c of changes) {
        const amt = c.sellingTotal ?? c.total;
        if (!c.startDate || !c.endDate || !amt) return null;
        const minor = toMinorUnits(amt, currency);
        for (let d = c.startDate; d < c.endDate; d = addDays(d, 1)) out.push({ date: d, amountMinor: minor * rooms });
      }
    } catch {
      return null;
    }
    const sum = out.reduce((s, n) => s + n.amountMinor, 0);
    const expectedNights = nightsBetween(checkIn, checkOut);
    return out.length === expectedNights && sum === perRoomMinor * rooms ? out : null;
  }

  private cancellation(list: AmCancellation[], currency: string): NormalisedOffer["cancellation"] {
    if (!list.length) return { refundable: null, freeCancellationUntil: null, penaltyDescription: null };
    const describe = (c: AmCancellation) => {
      const what = c.type === "FULL_STAY" ? "full stay" : c.percentage ? `${c.percentage}% of the stay` : c.numberOfNights ? `${c.numberOfNights} night(s)` : c.amount ? `${c.amount} ${currency}` : "a penalty";
      return c.deadline ? `Penalty of ${what} applies after ${c.deadline.slice(0, 10)}` : `Penalty of ${what} applies from booking`;
    };
    // A penalty with no deadline applies immediately, so the rate is not freely cancellable.
    const immediate = list.find((c) => !c.deadline);
    if (immediate) return { refundable: false, freeCancellationUntil: null, penaltyDescription: describe(immediate) };
    const first = [...list].sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))[0]!;
    // Deadline is hotel-local; the date part is the hotel's calendar date.
    return { refundable: true, freeCancellationUntil: first.deadline!.slice(0, 10), penaltyDescription: describe(first) };
  }

  async recheckPrice(input: PriceCheckInput): Promise<PriceCheckResult> {
    const o = input.offer;
    const checkedAt = (this.cfg.now?.() ?? new Date()).toISOString();
    const unavailable = (message: string): PriceCheckResult => ({ status: "unavailable", offer: { ...o, availabilityStatus: "unavailable", verificationStatus: "unavailable" }, previousTotalMinor: o.totalAmountMinor, currentTotalMinor: null, message, checkedAt });
    let res: AmPricingResponse;
    try {
      res = await this.get<AmPricingResponse>(`/v3/shopping/hotel-offers/${encodeURIComponent(o.externalOfferReference)}`, new URLSearchParams());
    } catch (e) {
      // Amadeus answers a withdrawn or expired offer id with a 4xx rather than an empty result.
      if (e instanceof ProviderError && e.code === "bad_request" && (e.status === 400 || e.status === 404)) return unavailable("Supplier no longer returns this rate.");
      throw e;
    }
    const entry = res?.data;
    const fresh = entry?.offers?.[0];
    if (!entry || entry.available === false || !fresh) return unavailable("Supplier no longer returns this rate.");
    const rooms = o.roomsRequired;
    const refreshed = this.toOffer(entry, undefined, fresh, { organizationId: input.organizationId, destination: o.property.destination, checkIn: o.stayStart, checkOut: o.stayEnd, party: input.party }, rooms, true);
    if (!refreshed) throw new ProviderError(this.key, "bad_response", "Supplier returned an unusable rate");
    // The pricing endpoint omits hotel coordinates; keep what the search already knew.
    const merged: NormalisedOffer = { ...refreshed, offerId: o.offerId, property: { ...refreshed.property, latitude: o.property.latitude, longitude: o.property.longitude, name: refreshed.property.name === refreshed.property.id ? o.property.name : refreshed.property.name } };
    const changed = merged.totalAmountMinor !== o.totalAmountMinor || merged.currency !== o.currency;
    return { status: changed ? "price_changed" : "confirmed", offer: merged, previousTotalMinor: o.totalAmountMinor, currentTotalMinor: merged.totalAmountMinor, checkedAt };
  }
}

function safeSum(amounts: (string | undefined)[], currency: string): number | null {
  try {
    return amounts.reduce<number>((s, a) => s + (a ? toMinorUnits(a, currency) : 0), 0);
  } catch {
    return null;
  }
}
