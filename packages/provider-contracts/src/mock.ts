import { addDays, nightsBetween, type HotelCategory, type MealPlan, type NormalisedOffer } from "@tripweave/shared";
import { ProviderError, type HotelAvailabilityInput, type HotelProvider, type HotelSearchInput, type PriceCheckInput, type PriceCheckResult, type PropertySearchResult, type RoomOffer, type ProviderErrorCode } from "./types";

export const MOCK_PROVIDER_KEY = "mock";

interface MockHotel { id: string; name: string; destination: string; lat: number; lng: number; category: HotelCategory; stars: number; review: number | null; amenities: string[]; baseUsd: number; meal: MealPlan; refundable: boolean }

/** Clearly illustrative catalogue. Nothing here is a real hotel, price, review or availability. */
const CATALOG: MockHotel[] = [
  { id: "m-kandy-1", name: "[Mock] Lakeside Heritage Kandy", destination: "Kandy", lat: 7.2936, lng: 80.6413, category: "boutique", stars: 4, review: 8.9, amenities: ["wifi", "pool", "spa", "view", "breakfast"], baseUsd: 120, meal: "BB", refundable: true },
  { id: "m-kandy-2", name: "[Mock] Hilltop Budget Inn Kandy", destination: "Kandy", lat: 7.2851, lng: 80.6229, category: "budget", stars: 2, review: 7.1, amenities: ["wifi"], baseUsd: 45, meal: "RO", refundable: false },
  { id: "m-nuwara-1", name: "[Mock] Tea Estate Bungalow Nuwara Eliya", destination: "Nuwara Eliya", lat: 6.9702, lng: 80.7642, category: "boutique", stars: 4, review: 9.2, amenities: ["wifi", "view", "fireplace", "breakfast"], baseUsd: 140, meal: "BB", refundable: true },
  { id: "m-nuwara-2", name: "[Mock] Colonial Grand Nuwara Eliya", destination: "Nuwara Eliya", lat: 6.9497, lng: 80.7891, category: "luxury", stars: 5, review: 9.0, amenities: ["wifi", "pool", "spa", "gym", "view", "breakfast"], baseUsd: 260, meal: "HB", refundable: true },
  { id: "m-ella-1", name: "[Mock] Nine Arches View Ella", destination: "Ella", lat: 6.8764, lng: 81.0599, category: "comfort", stars: 3, review: 8.4, amenities: ["wifi", "view", "breakfast"], baseUsd: 85, meal: "BB", refundable: true },
  { id: "m-ella-2", name: "[Mock] Cloud Ridge Retreat Ella", destination: "Ella", lat: 6.8601, lng: 81.0399, category: "premium", stars: 5, review: null, amenities: ["wifi", "pool", "view", "spa"], baseUsd: 190, meal: "BB", refundable: false },
  { id: "m-sigiriya-1", name: "[Mock] Rockside Villas Sigiriya", destination: "Sigiriya", lat: 7.9523, lng: 80.7569, category: "comfort", stars: 4, review: 8.2, amenities: ["wifi", "pool", "breakfast"], baseUsd: 95, meal: "BB", refundable: true },
];

export interface MockProviderOptions {
  /** Throw this error from every call (simulates supplier downtime). */
  failWith?: ProviderErrorCode;
  /** Fail the first N calls then recover (exercises retries). */
  failFirst?: number;
  latencyMs?: number;
  now?: () => Date;
  /** Offers become unavailable for these external ids on recheck. */
  unavailableIds?: string[];
  /** Price multiplier applied on recheck (simulates a price change). */
  recheckMultiplier?: number;
}

/** Deterministic mock supplier used in development and automated tests. Never reports "live" data. */
export class MockProvider implements HotelProvider {
  readonly key = MOCK_PROVIDER_KEY;
  readonly displayName = "Mock supplier (illustrative data)";
  readonly isMock = true;
  private calls = 0;
  constructor(private readonly opts: MockProviderOptions = {}) {}

  private async gate(): Promise<void> {
    this.calls++;
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    if (this.opts.failWith) throw new ProviderError(this.key, this.opts.failWith, `Simulated ${this.opts.failWith}`, this.opts.failWith === "timeout" || this.opts.failWith === "upstream" || this.opts.failWith === "rate_limited");
    if (this.opts.failFirst && this.calls <= this.opts.failFirst) throw new ProviderError(this.key, "upstream", "Simulated transient failure", true);
  }
  get callCount(): number {
    return this.calls;
  }

  private hotelsFor(dest: string): MockHotel[] {
    return CATALOG.filter((h) => h.destination.toLowerCase() === dest.toLowerCase());
  }

  async searchProperties(input: HotelSearchInput): Promise<PropertySearchResult[]> {
    await this.gate();
    return this.hotelsFor(input.destination).map((h) => ({ providerKey: this.key, externalPropertyId: h.id, name: h.name, destination: h.destination, latitude: h.lat, longitude: h.lng, category: h.category, starRating: h.stars, reviewScore: h.review, amenities: h.amenities, isMock: true }));
  }

  async getAvailability(input: HotelAvailabilityInput): Promise<RoomOffer[]> {
    await this.gate();
    const nights = nightsBetween(input.checkIn, input.checkOut);
    const retrievedAt = (this.opts.now?.() ?? new Date()).toISOString();
    return this.hotelsFor(input.destination)
      .filter((h) => !input.propertyIds || input.propertyIds.includes(h.id))
      .map((h): NormalisedOffer => {
        const rooms = input.party.rooms.length;
        const total = Math.round(h.baseUsd * 100) * nights * rooms;
        const id = `mock:${h.id}:${input.checkIn}:${input.checkOut}:${rooms}`;
        return {
          offerId: id, providerKey: this.key, externalOfferReference: id, source: "mock", supplierId: null, supplierName: "Mock supplier",
          property: { id: h.id, name: h.name, destination: h.destination, latitude: h.lat, longitude: h.lng, category: h.category, starRating: h.stars, reviewScore: h.review, amenities: h.amenities, ownerOrganizationId: null },
          roomType: { id: null, name: "Standard double", maxOccupancy: 3, maxAdults: 2 },
          stayStart: input.checkIn, stayEnd: input.checkOut, nights, mealPlan: h.meal, roomsRequired: rooms, occupancy: input.party,
          totalAmountMinor: total, currency: "USD", taxAmountMinor: null, feeAmountMinor: null, taxesIncluded: null,
          cancellation: { refundable: h.refundable, freeCancellationUntil: h.refundable ? addDays(input.checkIn, -7) : null },
          payment: { type: "pay_at_hotel" }, retrievedAt, expiresAt: null,
          // Mock data can never be confirmed or live-checked.
          availabilityStatus: "unknown", verificationStatus: "estimated", isMock: true, providerMetadata: { illustrative: true },
        };
      });
  }

  async recheckPrice(input: PriceCheckInput): Promise<PriceCheckResult> {
    await this.gate();
    const o = input.offer;
    const checkedAt = (this.opts.now?.() ?? new Date()).toISOString();
    if (this.opts.unavailableIds?.includes(o.property.id)) return { status: "unavailable", offer: { ...o, availabilityStatus: "unavailable", verificationStatus: "unavailable" }, previousTotalMinor: o.totalAmountMinor, currentTotalMinor: null, message: "Mock supplier reports no rooms.", checkedAt };
    const total = Math.round(o.totalAmountMinor * (this.opts.recheckMultiplier ?? 1));
    return {
      status: total === o.totalAmountMinor ? "not_supported" : "price_changed",
      offer: { ...o, totalAmountMinor: total, retrievedAt: checkedAt, verificationStatus: "estimated", isMock: true },
      previousTotalMinor: o.totalAmountMinor, currentTotalMinor: total,
      message: "Mock data cannot be live-checked; it remains illustrative.", checkedAt,
    };
  }
}
