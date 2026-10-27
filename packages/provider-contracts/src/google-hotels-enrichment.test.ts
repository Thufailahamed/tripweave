import { describe, expect, it } from "vitest";
import { GoogleHotelsProvider } from "./google-hotels";
import type { FetchLike } from "./resilience";
import type { NormalisedOffer } from "@tripweave/shared";

const party = {
  adults: 2,
  children: 2,
  childAges: [8, 11],
  rooms: [
    { adults: 1, children: 1, childAges: [8] },
    { adults: 1, children: 1, childAges: [11] },
  ],
};

const searchResponse = {
  properties: [
    {
      name: "Cheap Hotel",
      property_token: "tok-cheap",
      gps_coordinates: { latitude: 7.29, longitude: 80.63 },
      extracted_hotel_class: 4,
      overall_rating: 4.4,
      reviews: 100,
      amenities: ["Free breakfast"],
      prices: [{ source: "Booking.com", total_rate: { extracted_lowest: 400 } }],
    },
    {
      name: "Pricey Hotel",
      property_token: "tok-pricey",
      gps_coordinates: { latitude: 7.3, longitude: 80.64 },
      extracted_hotel_class: 5,
      overall_rating: 4.7,
      reviews: 200,
      amenities: ["Free breakfast"],
      prices: [{ source: "Agoda", total_rate: { extracted_lowest: 800 } }],
    },
  ],
};

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

function entityPage({ token, total, nightly, breakfast = "breakfast", compact = false }: { token: string; total: number; nightly: number; breakfast?: string; compact?: boolean }): string {
  const parent: any[] = [];
  parent[1] = token === "tok-cheap" ? "Cheap Hotel" : "Pricey Hotel";
  parent[2] = [[7.29, 80.63], [["1 Test Road"]]];
  parent[3] = ["4-star hotel", 4];
  parent[7] = [[4.4, 100]];
  parent[6] = [];

  const money = [`$${nightly}`, `$${nightly}`, `$${total}`, nightly, nightly];
  if (compact) {
    const offer: any[] = [];
    offer[0] = ["Agoda", 220, "https://example.test/agoda", null];
    offer[12] = [];
    offer[12][4] = money;
    offer[12][5] = money;
    parent[6][2] = [[[], [], [offer]]];
  } else {
    const offer: any[] = [];
    offer[0] = "Booking.com";
    offer[1] = "//www.gstatic.com/travel-hotels/branding/icon_184.png";
    offer[18] = ["Free cancellation until Mar 1", "2 guests", breakfast];
    offer[19] = money;
    offer[24] = [["Heritage Room", ["2 guests", "Free cancellation until Mar 1", breakfast], null, money, "https://example.test/booking"]];
    offer[40] = 184;
    parent[6][16] = [[offer]];
  }

  const payload = JSON.stringify([parent]);
  return `<html><body><script class="ds:1">AF_initDataCallback({key: 'ds:1', hash: '6', data:${payload}, sideChannel: {}});</script></body></html>`;
}

function provider(fetchImpl: FetchLike, direct: Record<string, unknown> = {}) {
  return new GoogleHotelsProvider({
    apiKey: "test-key",
    fetch: fetchImpl,
    now: () => new Date("2026-10-27T10:00:00Z"),
    direct: { enabled: true, cacheTtlMs: 0, ...direct },
  });
}

const offer = (offers: NormalisedOffer[], name: string) => offers.find((o) => o.property.name === name)!;
const enrichment = (o: NormalisedOffer) => o.providerMetadata?.directEnrichment as Record<string, unknown> | undefined;

describe("Google Hotels entity enrichment", () => {
  it("enriches only the bounded cheapest properties and attaches rate-level breakfast evidence", async () => {
    const calls: string[] = [];
    const p = provider(
      ((url: string) => {
        calls.push(url);
        if (url.includes("serpapi.com")) return json(searchResponse);
        if (url.includes("tok-cheap")) return Promise.resolve(new Response(entityPage({ token: "tok-cheap", total: 200, nightly: 50 }), { status: 200 }));
        return Promise.resolve(new Response(entityPage({ token: "tok-pricey", total: 800, nightly: 200, compact: true }), { status: 200 }));
      }) as FetchLike,
      { maxProperties: 1 },
    );

    const offers = await p.getAvailability({
      organizationId: "org",
      destination: "Kandy",
      checkIn: "2027-03-05",
      checkOut: "2027-03-09",
      party,
      currency: "USD",
    });

    expect(calls.filter((url) => url.includes("/travel/hotels/entity/"))).toHaveLength(1);
    const cheap = offer(offers, "Cheap Hotel");
    expect(cheap.totalAmountMinor).toBe(80_000);
    expect(cheap.mealPlan).toBe("BB");
    expect(cheap.mealPlanStatus).toBe("unconfirmed");
    expect(cheap.providerMetadata?.boardBasisSource).toBe("property_amenity");
    expect(enrichment(cheap)).toMatchObject({
      status: "ok",
      cached: false,
      rateCount: 1,
      entityTotalMinor: 40_000,
      strictBreakfastTotalMinor: 40_000,
      strictBreakfastSource: "Booking.com",
      strictBreakfastRoom: "Heritage Room",
      strictBreakfastGuests: 2,
    });

    const pricey = offer(offers, "Pricey Hotel");
    expect(pricey.totalAmountMinor).toBe(160_000);
    expect(enrichment(pricey)).toMatchObject({ status: "skipped", reason: "outside_top_n" });
  });

  it("does not fetch entity pages when the flag is disabled", async () => {
    const calls: string[] = [];
    const p = new GoogleHotelsProvider({
      apiKey: "test-key",
      fetch: ((url: string) => {
        calls.push(url);
        if (url.includes("serpapi.com")) return json(searchResponse);
        return Promise.resolve(new Response(entityPage({ token: "tok-cheap", total: 200, nightly: 50 }), { status: 200 }));
      }) as FetchLike,
      now: () => new Date("2026-10-27T10:00:00Z"),
      direct: { enabled: false },
    });

    const offers = await p.getAvailability({ organizationId: "org", destination: "Kandy", checkIn: "2027-03-05", checkOut: "2027-03-09", party, currency: "USD" });
    expect(calls.every((url) => !url.includes("/travel/hotels/entity/"))).toBe(true);
    expect(offers.every((o) => enrichment(o) === undefined)).toBe(true);
  });

  it("keeps SerpApi offers when an entity page fails", async () => {
    const p = provider(
      ((url: string) => {
        if (url.includes("serpapi.com")) return json(searchResponse);
        return Promise.resolve(new Response("Google Hotels entity returned HTTP 500", { status: 500 }));
      }) as FetchLike,
      { maxProperties: 2, retries: 0 },
    );

    const offers = await p.getAvailability({ organizationId: "org", destination: "Kandy", checkIn: "2027-03-05", checkOut: "2027-03-09", party, currency: "USD" });
    expect(offers).toHaveLength(2);
    expect(offers.every((o) => o.totalAmountMinor > 0)).toBe(true);
    expect(enrichment(offer(offers, "Cheap Hotel"))).toMatchObject({ status: "error", errorCode: "http" });
    expect(enrichment(offer(offers, "Cheap Hotel"))?.strictBreakfastTotalMinor).toBeNull();
  });

  it("caches entity results for the same token and stay", async () => {
    let entityCalls = 0;
    const cache = new Map();
    const p = provider(
      ((url: string) => {
        if (url.includes("serpapi.com")) return json(searchResponse);
        entityCalls++;
        return Promise.resolve(new Response(entityPage({ token: "tok-cheap", total: 200, nightly: 50 }), { status: 200 }));
      }) as FetchLike,
      { maxProperties: 1, cacheTtlMs: 60_000, cache },
    );
    const input = { organizationId: "org", destination: "Kandy", checkIn: "2027-03-05", checkOut: "2027-03-09", party, currency: "USD" };

    const first = await p.getAvailability(input);
    const second = await p.getAvailability(input);
    expect(entityCalls).toBe(1);
    expect(enrichment(offer(first, "Cheap Hotel"))?.cached).toBe(false);
    expect(enrichment(offer(second, "Cheap Hotel"))?.cached).toBe(true);
    expect(enrichment(offer(second, "Cheap Hotel"))?.strictBreakfastTotalMinor).toBe(40_000);
  });

  it("does not infer breakfast from a compact rate with an unknown board basis", async () => {
    const p = provider(
      ((url: string) => {
        if (url.includes("serpapi.com")) return json(searchResponse);
        return Promise.resolve(new Response(entityPage({ token: "tok-pricey", total: 800, nightly: 200, compact: true }), { status: 200 }));
      }) as FetchLike,
      { maxProperties: 2 },
    );

    const offers = await p.getAvailability({ organizationId: "org", destination: "Kandy", checkIn: "2027-03-05", checkOut: "2027-03-09", party, currency: "USD" });
    const pricey = offer(offers, "Pricey Hotel");
    expect(enrichment(pricey)).toMatchObject({ status: "ok", rateCount: 1, strictBreakfastTotalMinor: null });
    expect(pricey.mealPlanStatus).toBe("unconfirmed");
  });
});
