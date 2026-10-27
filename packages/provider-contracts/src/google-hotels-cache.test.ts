import { describe, expect, it } from "vitest";
import type { HotelSearchCache, HotelSearchCacheEntry } from "./types";
import type { FetchLike } from "./resilience";
import { GoogleHotelsProvider } from "./google-hotels";

class MemoryCache implements HotelSearchCache {
  readonly values = new Map<string, HotelSearchCacheEntry>();
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: HotelSearchCacheEntry) {
    this.values.set(key, value);
  }
}

const party = { adults: 2, children: 2, childAges: [8, 11], rooms: [{ adults: 1, children: 1, childAges: [8] }, { adults: 1, children: 1, childAges: [11] }] };
const input = { organizationId: "org", destination: "Kandy", checkIn: "2027-03-05", checkOut: "2027-03-09", party, currency: "USD" };
const search = {
  properties: [
    {
      name: "Cache Hotel",
      property_token: "tok-cache",
      gps_coordinates: { latitude: 7.29, longitude: 80.63 },
      extracted_hotel_class: 4,
      overall_rating: 4.4,
      reviews: 100,
      amenities: ["Free breakfast"],
      prices: [{ source: "Booking.com", total_rate: { extracted_lowest: 400 } }],
    },
  ],
};

describe("Google Hotels discovery cache", () => {
  it("reuses a fresh discovery result and marks it cached", async () => {
    let calls = 0;
    const cache = new MemoryCache();
    const p = new GoogleHotelsProvider({
      apiKey: "key",
      cache,
      cacheTtlSeconds: 900,
      now: () => new Date("2026-10-27T10:00:00Z"),
      fetch: (() => {
        calls++;
        return Promise.resolve(new Response(JSON.stringify(search), { status: 200, headers: { "content-type": "application/json" } }));
      }) as FetchLike,
    });

    const first = await p.getAvailability(input);
    const second = await p.getAvailability(input);
    expect(calls).toBe(1);
    expect(second[0]!.providerMetadata?.priceCache).toMatchObject({ cached: true });
    expect(second[0]!.expiresAt).toBe("2026-10-27T10:15:00.000Z");
    expect(first[0]!.totalAmountMinor).toBe(second[0]!.totalAmountMinor);
  });

  it("does not use the discovery cache for a live recheck", async () => {
    let calls = 0;
    const cache = new MemoryCache();
    const p = new GoogleHotelsProvider({
      apiKey: "key",
      cache,
      cacheTtlSeconds: 900,
      now: () => new Date("2026-10-27T10:00:00Z"),
      fetch: ((url: string) => {
        calls++;
        const body = url.includes("property_token")
          ? { featured_prices: [{ source: "Booking.com", total_rate: { extracted_lowest: 200 }, num_guests: 2, inclusions: ["Free breakfast"] }] }
          : search;
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
      }) as FetchLike,
    });

    const discovered = await p.getAvailability(input);
    await p.getAvailability(input);
    const offer = {
      ...discovered[0]!,
      providerMetadata: { ...discovered[0]!.providerMetadata, propertyToken: "tok-cache" },
      mealPlan: "RO" as const,
      mealPlanStatus: "unconfirmed" as const,
      totalAmountMinor: 40_000,
    };
    calls = 0;
    const result = await p.recheckPrice({ offer, organizationId: "org", party });
    expect(calls).toBe(1);
    expect(result.status).toBe("confirmed");
  });

  it("refetches after the discovery cache TTL", async () => {
    let now = Date.parse("2026-10-27T10:00:00Z");
    let calls = 0;
    const p = new GoogleHotelsProvider({
      apiKey: "key",
      cache: new MemoryCache(),
      cacheTtlSeconds: 900,
      now: () => new Date(now),
      fetch: (() => {
        calls++;
        return Promise.resolve(new Response(JSON.stringify(search), { status: 200, headers: { "content-type": "application/json" } }));
      }) as FetchLike,
    });
    await p.getAvailability(input);
    now += 16 * 60_000;
    await p.getAvailability(input);
    expect(calls).toBe(2);
  });
});
