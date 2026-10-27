import { describe, expect, it } from "vitest";
import type { NormalisedOffer } from "@tripweave/shared";
import { GoogleHotelsProvider, chooseGooglePrice } from "./google-hotels";
import { OsmDiscoveryProvider, normalizeHotelName, parseOverpassElements } from "./discovery";
import { mergeDiscoveredOffers } from "./merge";
import type { FetchLike } from "./resilience";

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

const party = { adults: 2, children: 2, childAges: [8, 11], rooms: [{ adults: 1, children: 1, childAges: [8] }, { adults: 1, children: 1, childAges: [11] }] };

describe("OpenStreetMap discovery", () => {
  const overpass: { elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] } = {
    elements: [
      { type: "node", id: 1, lat: 7.29, lon: 80.63, tags: { name: "Kandy Grand Hotel", tourism: "hotel", stars: "5", "internet_access": "wlan", "swimming_pool": "yes" } },
      { type: "node", id: 2, lat: 7.3, lon: 80.64, tags: { name: "Kandy View Guest House", tourism: "guest_house" } },
      { type: "node", id: 3, lat: 7.31, lon: 80.65, tags: { tourism: "hotel" } },
      { type: "way", id: 4, center: { lat: 7.29, lon: 80.63 }, tags: { name: "Kandy Grand Hotel", tourism: "hotel" } },
    ],
  };

  it("parses named hotels, maps stars and amenities, and drops unnamed/duplicate listings", () => {
    const props = parseOverpassElements(overpass, "Kandy");
    expect(props).toHaveLength(2);
    expect(props[0]).toMatchObject({ name: "Kandy Grand Hotel", category: "luxury", starRating: 5, amenities: expect.arrayContaining(["wifi", "pool"]) });
    expect(props[1]).toMatchObject({ name: "Kandy View Guest House", category: "comfort" });
  });

  it("falls back to Nominatim listings when Overpass is unavailable", async () => {
    const seen: { url: string; userAgent: string }[] = [];
    const rows = [
      { osm_type: "node", osm_id: 11, lat: "7.291", lon: "80.635", category: "tourism", type: "hotel", name: "Kandy Lake Hotel", extratags: { stars: "4", internet_access: "wlan" } },
      { osm_type: "way", osm_id: 12, lat: "7.3", lon: "80.65", category: "tourism", type: "guest_house", name: "Kandy Hills Guest House" },
      { osm_type: "node", osm_id: 13, lat: "7.3", lon: "80.65", category: "tourism", type: "hotel" },
      { osm_type: "node", osm_id: 14, lat: "7.3", lon: "80.65", category: "building", type: "yes", name: "Not a hotel" },
    ];
    const p = new OsmDiscoveryProvider({
      fetch: ((url: string, init?: RequestInit) => {
        seen.push({ url, userAgent: String((init?.headers as Record<string, string>)?.["User-Agent"] ?? "") });
        if (url.includes("overpass")) return Promise.resolve(new Response("busy", { status: 502 }));
        return json(rows);
      }) as FetchLike,
      nominatimUrl: "https://nominatim.test",
      overpassUrl: "https://overpass.test",
      benchmark: async () => ({ nightlyMinor: 10_000, currency: "USD", basis: "test" }),
      now: () => new Date("2026-10-27T10:00:00Z"),
      sleep: async () => {},
      minIntervalMs: 0,
    });
    const props = await p.searchProperties({ organizationId: "org", destination: "Kandy", latitude: 7.29, longitude: 80.63, checkIn: "2026-12-10", checkOut: "2026-12-12", party, currency: "USD" });
    expect(props.map((x) => x.name).sort()).toEqual(["Kandy Hills Guest House", "Kandy Lake Hotel"]);
    expect(props[0]).toMatchObject({ category: "premium", starRating: 4, amenities: expect.arrayContaining(["wifi"]) });
    expect(seen[0]!.url).toContain("overpass.test");
    expect(seen.every((s) => s.userAgent.startsWith("TripWeave/"))).toBe(true);
    expect(seen.filter((s) => s.url.includes("nominatim.test")).length).toBeGreaterThan(0);
  });

  it("builds honest estimated offers benchmarked against the catalogue", async () => {
    const p = new OsmDiscoveryProvider({
      fetch: (() => json(overpass)) as FetchLike,
      benchmark: async () => ({ nightlyMinor: 10_000, currency: "USD", basis: "3 catalogue rates" }),
      now: () => new Date("2026-10-27T10:00:00Z"),
      sleep: async () => {},
      nominatimDiscovery: false,
    });
    const offers = await p.getAvailability({ organizationId: "org", destination: "Kandy", latitude: 7.29, longitude: 80.63, checkIn: "2026-12-10", checkOut: "2026-12-12", party, currency: "USD" });
    expect(offers).toHaveLength(2);
    const grand = offers.find((o) => o.property.name === "Kandy Grand Hotel")!;
    expect(grand.totalAmountMinor).toBe(10_000 * 2.1 * 2 * 2); // luxury factor, 2 nights, 2 rooms
    expect(grand).toMatchObject({ verificationStatus: "estimated", availabilityStatus: "unknown", mealPlan: "RO", mealPlanStatus: "unconfirmed", isMock: false });
    expect(grand.providerMetadata?.attribution).toMatch(/OpenStreetMap/);
    expect(grand.providerMetadata?.bookingSearchUrl).toMatch(/booking\.com/);
    const guest = offers.find((o) => o.property.name === "Kandy View Guest House")!;
    expect(guest.totalAmountMinor).toBe(10_000 * 1 * 2 * 2);
  });
});

describe("Google Hotels aggregation", () => {
  const response = {
    properties: [
      {
        name: "Ceylon Grand",
        property_token: "tok-1",
        gps_coordinates: { latitude: 7.29, longitude: 80.63 },
        extracted_hotel_class: 5,
        overall_rating: 4.6,
        reviews: 321,
        amenities: ["Free Wi-Fi", "Pool", "Spa", "Breakfast"],
        prices: [
          { source: "Booking.com", rate_per_night: { extracted_lowest: 100 }, free_cancellation: true },
          { source: "Expedia.com", rate_per_night: { extracted_lowest: 120 } },
        ],
      },
      { name: "No Price Inn", property_token: "tok-2", extracted_hotel_class: 3, prices: [] },
    ],
  };

  it("chooses the cheapest source and scales the total by rooms", async () => {
    let seenUrl = "";
    const p = new GoogleHotelsProvider({
      apiKey: "test-key",
      fetch: ((url: string) => {
        seenUrl = url;
        return json(response);
      }) as FetchLike,
      now: () => new Date("2026-10-27T10:00:00Z"),
    });
    const offers = await p.getAvailability({ organizationId: "org", destination: "Kandy", checkIn: "2026-12-10", checkOut: "2026-12-12", party, currency: "USD" });
    expect(offers).toHaveLength(1);
    const o = offers[0]!;
    expect(o.supplierName).toBe("Booking.com via Google Hotels");
    expect(o.totalAmountMinor).toBe(100 * 100 * 2 * 2);
    expect(o.property.reviewScore).toBe(9.2);
    expect(o.mealPlanStatus).toBe("unconfirmed");
    expect(o.providerMetadata?.priceSources).toEqual([
      { source: "Booking.com", totalMinor: 40_000 },
      { source: "Expedia.com", totalMinor: 48_000 },
    ]);
    expect(seenUrl).toContain("children_ages=8%2C11");
    expect(seenUrl).toContain("engine=google_hotels");
  });

  it("picks the cheapest total, not the cheapest nightly, across sources", () => {
    const choice = chooseGooglePrice(
      {
        prices: [
          { source: "Booking.com", rate_per_night: { extracted_lowest: 90 }, total_rate: { extracted_lowest: 300 } },
          { source: "Agoda", rate_per_night: { extracted_lowest: 110 }, total_rate: { extracted_lowest: 250 } },
        ],
      },
      2,
      1,
    );
    expect(choice?.source).toBe("Agoda");
    expect(choice?.totalMinor).toBe(25_000);
  });
});

describe("discovery dedupe", () => {
  const base = (over: Partial<NormalisedOffer>): NormalisedOffer =>
    ({
      offerId: "o",
      providerKey: "internal",
      externalOfferReference: "o",
      source: "internal",
      supplierId: null,
      supplierName: "Company",
      property: { id: "p", name: "Lakeside Heritage", destination: "Kandy", latitude: 7.29, longitude: 80.63, category: "boutique", starRating: 4, reviewScore: 9, amenities: [], ownerOrganizationId: null },
      roomType: { id: null, name: "Room", maxOccupancy: 3, maxAdults: 2 },
      stayStart: "2026-12-10",
      stayEnd: "2026-12-11",
      nights: 1,
      mealPlan: "BB",
      roomsRequired: 1,
      occupancy: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
      totalAmountMinor: 10_000,
      currency: "USD",
      taxAmountMinor: null,
      feeAmountMinor: null,
      taxesIncluded: true,
      cancellation: { refundable: true },
      payment: { type: "credit" },
      retrievedAt: "2026-10-27T00:00:00Z",
      expiresAt: null,
      availabilityStatus: "confirmed",
      verificationStatus: "company_managed",
      isMock: false,
      ...over,
    }) as NormalisedOffer;

  it("drops OSM listings that duplicate a catalogue hotel by name and proximity", () => {
    const catalog = base({ offerId: "cat", providerKey: "internal" });
    const dup = base({ offerId: "osm1", providerKey: "osm_discovery", source: "external", property: { ...catalog.property, id: "osm:1", name: "Lakeside Heritage Hotel & Spa" } });
    const other = base({ offerId: "osm2", providerKey: "osm_discovery", source: "external", property: { ...catalog.property, id: "osm:2", name: "Kandy Hillside Villa", latitude: 7.31 } });
    const res = mergeDiscoveredOffers([catalog, dup, other]);
    expect(res.duplicates).toBe(1);
    expect(res.offers.map((o) => o.offerId)).toEqual(["cat", "osm2"]);
  });

  it("normalises hotel suffixes before comparing", () => {
    expect(normalizeHotelName("The Lakeside Heritage Hotel & Spa")).toBe("lakeside heritage");
  });
});
