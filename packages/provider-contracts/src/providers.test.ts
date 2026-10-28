import { describe, expect, it } from "vitest";
import type { PartyConfiguration } from "@tripweave/shared";
import {
  AmadeusProvider, HotelbedsProvider, InternalInventoryProvider, MockProvider, ProviderError, mapWithConcurrency, searchAllProviders, withRetry,
  type HotelAvailabilityInput, type InternalInventoryData,
} from "./index";

const party: PartyConfiguration = { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] };
const input: HotelAvailabilityInput = { organizationId: "org-1", destination: "Kandy", checkIn: "2026-12-10", checkOut: "2026-12-12", party, latitude: 7.29, longitude: 80.63 };
const NOW = new Date("2026-10-27T10:00:00Z");
const noSleep = async () => {};
const retry = { retries: 2, baseDelayMs: 1, maxDelayMs: 2, sleep: noSleep };
const opts = { timeoutMs: 500, concurrency: 3, retry };

function inventory(): InternalInventoryData {
  return {
    properties: [{ id: "p1", ownerOrganizationId: "org-1", name: "Heritage Kandy", city: "Kandy", latitude: 7.29, longitude: 80.63, category: "boutique", starClassification: 4, reviewScore: 9, amenities: ["wifi"], preferredPartner: true }],
    roomTypes: new Map([["p1", [{ id: "r1", propertyId: "p1", name: "Deluxe", maximumAdults: 2, maximumOccupancy: 3 }]]]),
    plans: new Map([["p1", [{
      id: "plan1", organizationId: "org-1", propertyId: "p1", roomTypeId: "r1", name: "Contract BB", mealPlan: "BB", supplierId: "s1", supplierAgreementId: "ag1", currency: "USD", pricingBasis: "per_room_per_night",
      minimumNights: 1, maximumNights: null, effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31", status: "active", scope: "owner",
      cancellationPolicy: { refundable: true, freeCancellationDaysBeforeArrival: 7 }, paymentTerms: { type: "credit" },
    }]]]),
    rules: new Map([["plan1", [{ id: "rule1", ratePlanId: "plan1", applicableStartDate: "2026-01-01", applicableEndDate: "2027-12-31", amountMinor: 12_000, priority: 0, occupancyConditions: {}, taxTreatment: { included: false, taxBp: 0, serviceChargeBp: 1_000 }, extraPersonRules: { baseAdults: 2, extraAdultMinor: 0, extraChildMinor: 0, childFreeUnderAge: 0 }, blackoutDates: [] }]]]),
    inventory: new Map([["r1", new Map([["2026-12-10", 4], ["2026-12-11", 4]])]]),
    agreements: new Map([["ag1", { id: "ag1", status: "active", effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31", contractReference: "HH-2026" }]]),
    suppliers: new Map([["s1", { id: "s1", name: "Heritage Direct" }]]),
  };
}

describe("InternalInventoryProvider", () => {
  const provider = (data = inventory()) => new InternalInventoryProvider({ load: async () => data }, () => NOW);

  it("prices contract rates deterministically with company-managed provenance", async () => {
    const [offer] = await provider().getAvailability(input);
    expect(offer).toBeDefined();
    expect(offer!.totalAmountMinor).toBe(2 * 13_200); // 2 nights × (120.00 + 10% service charge)
    expect(offer!.verificationStatus).toBe("company_managed");
    expect(offer!.availabilityStatus).toBe("confirmed");
    expect(offer!.isMock).toBe(false);
    expect(offer!.cancellation.freeCancellationUntil).toBe("2026-12-03");
    expect(offer!.rateSource?.contractReference).toBe("HH-2026");
  });

  it("treats missing inventory as unknown availability, never confirmed; zero stock as unavailable", async () => {
    const d = inventory();
    d.inventory = new Map();
    expect((await provider(d).getAvailability(input))[0]!.availabilityStatus).toBe("unknown");
    d.inventory = new Map([["r1", new Map([["2026-12-10", 0], ["2026-12-11", 5]])]]);
    expect((await provider(d).getAvailability(input))[0]!.availabilityStatus).toBe("unavailable");
  });

  it("skips plans whose supplier agreement does not cover the stay", async () => {
    const d = inventory();
    d.agreements.set("ag1", { id: "ag1", status: "active", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-10", contractReference: "HH-2026" });
    expect(await provider(d).getAvailability(input)).toHaveLength(0);
    d.agreements.set("ag1", { id: "ag1", status: "terminated", effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31", contractReference: "HH-2026" });
    expect(await provider(d).getAvailability(input)).toHaveLength(0);
  });

  it("does not offer rooms that cannot hold the party", async () => {
    const big: PartyConfiguration = { adults: 4, children: 0, childAges: [], rooms: [{ adults: 4, children: 0 }] };
    expect(await provider().getAvailability({ ...input, party: big })).toHaveLength(0);
  });

  it("shared plans hide contract details and indicative scope is only an estimate", async () => {
    const d = inventory();
    const plan = d.plans.get("p1")![0]!;
    d.plans.set("p1", [{ ...plan, organizationId: "org-2", scope: "indicative_only" }]);
    const [offer] = await provider(d).getAvailability(input);
    expect(offer!.verificationStatus).toBe("estimated");
    expect(offer!.rateSource?.contractReference).toBeUndefined();
    expect(offer!.rateSource?.agreementId).toBeUndefined();
  });

  it("rechecks by recomputing current rules and detects price changes / removal", async () => {
    const d = inventory();
    const p = provider(d);
    const [offer] = await p.getAvailability(input);
    expect((await p.recheckPrice({ offer: offer!, organizationId: "org-1", party })).status).toBe("confirmed");
    d.rules.get("plan1")![0]!.amountMinor = 15_000;
    const changed = await p.recheckPrice({ offer: offer!, organizationId: "org-1", party });
    expect(changed.status).toBe("price_changed");
    expect(changed.currentTotalMinor).toBe(2 * 16_500);
    d.plans.set("p1", []);
    expect((await p.recheckPrice({ offer: offer!, organizationId: "org-1", party })).status).toBe("unavailable");
  });
});

describe("MockProvider", () => {
  it("always labels data as mock and never as live or confirmed", async () => {
    const offers = await new MockProvider().getAvailability(input);
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.isMock).toBe(true);
      expect(o.source).toBe("mock");
      expect(o.verificationStatus).not.toBe("live_checked");
      expect(o.availabilityStatus).not.toBe("confirmed");
      expect(o.property.name).toMatch(/Mock/);
    }
    const re = await new MockProvider().recheckPrice({ offer: offers[0]!, organizationId: "o", party });
    expect(re.offer!.verificationStatus).not.toBe("live_checked");
  });
});

const hbResponse = {
  hotels: { hotels: [{
    code: 1234, name: "Grand Test Hotel", categoryName: "4 STARS", destinationName: "Kandy", latitude: "7.29", longitude: "80.63", currency: "USD",
    rooms: [{ code: "DBL.ST", name: "Double Standard", rates: [
      { rateKey: "RK-1", rateClass: "NOR", rateType: "BOOKABLE", net: "210.50", allotment: 3, paymentType: "AT_WEB", boardCode: "BB", rooms: 1, adults: 2, children: 0, cancellationPolicies: [{ amount: "100.00", from: "2026-12-05T23:59:00+05:30" }], taxes: { taxes: [{ included: true, amount: "10.50", currency: "USD" }], allIncluded: true } },
      { rateKey: "RK-2", rateClass: "NRF", rateType: "RECHECK", net: "180.00", paymentType: "AT_HOTEL", boardCode: "RO", rooms: 1, adults: 2, children: 0 },
      { rateKey: "RK-3", rateClass: "NOR", net: "not-a-number", boardCode: "BB" },
    ] }],
  }] },
};

function hbFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  };
  return { f, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const hb = (f: (u: string, i?: RequestInit) => Promise<Response>) => new HotelbedsProvider({ apiKey: "KEY", secret: "SECRET", baseUrl: "https://api.test.hotelbeds.com", fetch: f, now: () => NOW, sleep: noSleep, minIntervalMs: 0, retries: 2 });

describe("HotelbedsProvider", () => {
  it("signs requests (SHA-256 of key+secret+epoch seconds) and normalises offers", async () => {
    const { f, calls } = hbFetch(() => json(hbResponse));
    const offers = await hb(f).getAvailability(input);
    const expected = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`KEYSECRET${Math.floor(NOW.getTime() / 1000)}`));
    const hex = [...new Uint8Array(expected)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["X-Signature"]).toBe(hex);
    expect(headers["Api-key"]).toBe("KEY");
    expect(JSON.parse(String(calls[0]!.init.body)).geolocation.latitude).toBe(7.29);

    expect(offers).toHaveLength(2); // the malformed RK-3 rate is discarded
    const [a, b] = offers;
    expect(a!.totalAmountMinor).toBe(21_050);
    expect(a!.mealPlan).toBe("BB");
    expect(a!.verificationStatus).toBe("supplier_reported");
    expect(a!.availabilityStatus).toBe("confirmed");
    expect(a!.cancellation).toMatchObject({ refundable: true, freeCancellationUntil: "2026-12-05" });
    expect(a!.property.category).toBe("premium");
    expect(a!.property.reviewScore).toBeNull(); // never invented
    expect(a!.property.amenities).toEqual([]);
    expect(b!.verificationStatus).toBe("requires_confirmation");
    expect(b!.availabilityStatus).toBe("unknown"); // missing allotment is NOT confirmed
    expect(b!.cancellation.refundable).toBe(false);
    expect(b!.payment.type).toBe("pay_at_hotel");
  });

  it("counts taxes Hotelbeds lists as not included in the cost, so the quotation covers them", async () => {
    const response = structuredClone(hbResponse);
    response.hotels.hotels[0]!.rooms[0]!.rates = [{ rateKey: "RK-4", rateClass: "NOR", rateType: "BOOKABLE", net: "200.00", allotment: 3, paymentType: "AT_WEB", boardCode: "BB", rooms: 1, adults: 2, children: 0, cancellationPolicies: [], taxes: { taxes: [{ included: false, amount: "25.00", currency: "USD" }, { included: true, amount: "5.00", currency: "USD" }], allIncluded: false } }];
    const { f } = hbFetch(() => json(response));
    const [offer] = await hb(f).getAvailability(input);
    expect(offer).toMatchObject({ totalAmountMinor: 22_500, taxAmountMinor: 3_000, taxesIncluded: true });
  });

  it("price check upgrades verification to live_checked and reports price changes", async () => {
    const checkResponse = (net: string) => ({ hotel: { ...hbResponse.hotels.hotels[0], rooms: [{ code: "DBL.ST", name: "Double Standard", rates: [{ ...hbResponse.hotels.hotels[0]!.rooms[0]!.rates[0]!, net }] }] } });
    const { f: same } = hbFetch((url) => (url.endsWith("/checkrates") ? json(checkResponse("210.50")) : json(hbResponse)));
    const [offer] = await hb(same).getAvailability(input);
    const ok = await hb(same).recheckPrice({ offer: offer!, organizationId: "o", party });
    expect(ok.status).toBe("confirmed");
    expect(ok.offer!.verificationStatus).toBe("live_checked");
    const { f: higher } = hbFetch(() => json(checkResponse("230.00")));
    const changed = await hb(higher).recheckPrice({ offer: offer!, organizationId: "o", party });
    expect(changed.status).toBe("price_changed");
    expect(changed.currentTotalMinor).toBe(23_000);
    const { f: gone } = hbFetch(() => json({ hotel: null }));
    expect((await hb(gone).recheckPrice({ offer: offer!, organizationId: "o", party })).status).toBe("unavailable");
  });

  it("classifies errors: retries 5xx/429, never retries auth/bad requests", async () => {
    let n = 0;
    const flaky = hbFetch(() => (++n < 3 ? new Response("boom", { status: 503 }) : json(hbResponse)));
    expect(await hb(flaky.f).getAvailability(input)).toHaveLength(2);
    expect(flaky.calls).toHaveLength(3);

    const auth = hbFetch(() => new Response("no", { status: 401 }));
    await expect(hb(auth.f).getAvailability(input)).rejects.toMatchObject({ code: "auth", retryable: false });
    expect(auth.calls).toHaveLength(1);

    const limited = hbFetch(() => new Response("slow down", { status: 429 }));
    await expect(hb(limited.f).getAvailability(input)).rejects.toMatchObject({ code: "rate_limited" });
    expect(limited.calls).toHaveLength(3); // initial + 2 retries (bounded)

    const bad = hbFetch(() => new Response("{not json", { status: 200 }));
    await expect(hb(bad.f).getAvailability(input)).rejects.toMatchObject({ code: "bad_response" });
  });

  it("refuses unsupported searches instead of guessing", async () => {
    const { f } = hbFetch(() => json(hbResponse));
    await expect(hb(f).getAvailability({ ...input, latitude: null, longitude: null })).rejects.toMatchObject({ code: "unsupported" });
    const mixed: PartyConfiguration = { adults: 3, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }, { adults: 1, children: 0 }] };
    await expect(hb(f).getAvailability({ ...input, party: mixed })).rejects.toMatchObject({ code: "unsupported" });
  });
});

const amList = { data: [
  { hotelId: "MCLONGHM", name: "Test Kandy Hotel", chainCode: "MC", iataCode: "KDY", geoCode: { latitude: 7.29, longitude: 80.63 } },
  { hotelId: "XXKANDY2", name: "Second Kandy Hotel", geoCode: { latitude: 7.3, longitude: 80.64 } },
] };
const amOffers = { data: [
  { type: "hotel-offers", available: true, hotel: { hotelId: "MCLONGHM", name: "TEST KANDY HOTEL", cityCode: "KDY" }, offers: [
    { id: "OFFER-A", checkInDate: "2026-12-10", checkOutDate: "2026-12-12", boardType: "BREAKFAST", room: { type: "A1K", typeEstimated: { category: "STANDARD_ROOM", beds: 1, bedType: "KING" }, description: { text: "Standard King\nFree wifi" } }, guests: { adults: 2 },
      price: { currency: "USD", base: "190.00", total: "210.50", taxes: [{ amount: "20.50", currency: "USD", included: true }], variations: { average: { total: "105.25" }, changes: [{ startDate: "2026-12-10", endDate: "2026-12-12", total: "105.25" }] } },
      policies: { paymentType: "GUARANTEE", cancellations: [{ amount: "100.00", deadline: "2026-12-05T23:59:00+05:30" }] } },
    { id: "OFFER-B", boardType: "ROOM_ONLY", room: { type: "B2Q" }, guests: { adults: 2 }, price: { currency: "USD", total: "180.00", taxes: [{ amount: "15.00", currency: "USD", included: false }] }, policies: { paymentType: "PREPAY", cancellations: [{ type: "FULL_STAY" }] } },
    { id: "OFFER-C", price: { currency: "USD", total: "not-a-number" } },
    { id: "OFFER-D", price: { currency: "XYZ", total: "50.00" } },
  ] },
  { available: false, hotel: { hotelId: "XXKANDY2" }, offers: [{ id: "OFFER-E", price: { currency: "USD", total: "10.00" } }] },
] };

function amFetch(over: { list?: unknown; offers?: unknown; pricing?: (url: string) => Response; token?: () => Response } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    if (url.includes("/v1/security/oauth2/token")) return over.token ? over.token() : json({ access_token: "TOKEN-" + calls.filter((c) => c.url.includes("oauth2")).length, expires_in: 1799 });
    if (url.includes("/by-geocode")) return json(over.list ?? amList);
    if (url.includes("/v3/shopping/hotel-offers/")) return over.pricing ? over.pricing(url) : json({ data: null });
    if (url.includes("/v3/shopping/hotel-offers")) return json(over.offers ?? amOffers);
    return new Response("not found", { status: 404 });
  };
  return { f, calls };
}
const am = (f: (u: string, i?: RequestInit) => Promise<Response>, now: () => Date = () => NOW) => new AmadeusProvider({ clientId: "ID", clientSecret: "SECRET", baseUrl: "https://test.api.amadeus.com", fetch: f, now, sleep: noSleep, minIntervalMs: 0, retries: 2 });

describe("AmadeusProvider", () => {
  it("authenticates with client credentials, finds hotels by geocode, then normalises offers", async () => {
    const { f, calls } = amFetch();
    const offers = await am(f).getAvailability(input);
    const token = calls.find((c) => c.url.includes("oauth2"))!;
    expect(String(token.init.body)).toBe("grant_type=client_credentials&client_id=ID&client_secret=SECRET");
    const list = calls.find((c) => c.url.includes("/by-geocode"))!;
    expect(list.url).toContain("latitude=7.29");
    expect((list.init.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN-1");
    const offerCall = calls.find((c) => c.url.includes("/v3/shopping/hotel-offers?"))!;
    expect(offerCall.url).toContain("hotelIds=MCLONGHM%2CXXKANDY2");
    expect(offerCall.url).toContain("roomQuantity=1");

    expect(offers.map((o) => o.externalOfferReference)).toEqual(["OFFER-A", "OFFER-B"]); // unparseable amount, unsupported currency and closed hotel dropped
    const [a, b] = offers;
    expect(a).toMatchObject({ offerId: "amadeus:OFFER-A", totalAmountMinor: 21_050, currency: "USD", mealPlan: "BB", taxesIncluded: true, taxAmountMinor: 2_050, verificationStatus: "supplier_reported", availabilityStatus: "confirmed", isMock: false });
    expect(a!.roomType.name).toBe("Standard King");
    expect(a!.property).toMatchObject({ id: "MCLONGHM", latitude: 7.29, longitude: 80.63, category: null, starRating: null, reviewScore: null, amenities: [] });
    expect(a!.payment.type).toBe("pay_at_hotel");
    expect(a!.cancellation).toMatchObject({ refundable: true, freeCancellationUntil: "2026-12-05" });
    expect(a!.nightlyRates).toEqual([{ date: "2026-12-10", amountMinor: 10_525 }, { date: "2026-12-11", amountMinor: 10_525 }]);
    // The 15.00 tax is not included in the 180.00 base price, so the payable cost is 195.00.
    expect(b).toMatchObject({ taxesIncluded: true, totalAmountMinor: 19_500, taxAmountMinor: 1_500, mealPlan: "RO" });
    expect(b!.payment.type).toBe("pay_now");
    expect(b!.cancellation.refundable).toBe(false);
    expect(b!.providerMetadata).toMatchObject({ taxesNotIncludedPerRoomMinor: 1_500 });
    expect(b!.nightlyRates).toBeUndefined();
  });

  it("caches the token and requests a new one after it expires", async () => {
    let now = NOW.getTime();
    const { f, calls } = amFetch();
    const p = am(f, () => new Date(now));
    await p.getAvailability(input);
    await p.getAvailability(input);
    expect(calls.filter((c) => c.url.includes("oauth2"))).toHaveLength(1);
    now += 31 * 60_000;
    await p.getAvailability(input);
    expect(calls.filter((c) => c.url.includes("oauth2"))).toHaveLength(2);
  });

  it("re-authenticates once when a token is rejected, and surfaces bad credentials without retrying", async () => {
    let first = true;
    const { f, calls } = amFetch();
    const rejectOnce = async (url: string, init?: RequestInit) => {
      if (url.includes("/by-geocode") && first) {
        first = false;
        return new Response("expired", { status: 401 });
      }
      return f(url, init);
    };
    expect((await am(rejectOnce).getAvailability(input)).length).toBe(2);
    expect(calls.filter((c) => c.url.includes("oauth2"))).toHaveLength(2); // initial token + one forced refresh

    const badCreds = amFetch({ token: () => new Response("{}", { status: 401 }) });
    await expect(am(badCreds.f).getAvailability(input)).rejects.toMatchObject({ code: "auth", retryable: false });
    expect(badCreds.calls).toHaveLength(1);
  });

  it("prices one room and multiplies by the room count, without claiming multi-room stock", async () => {
    const { f } = amFetch();
    const twoRooms: PartyConfiguration = { adults: 4, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }, { adults: 2, children: 0 }] };
    const [a] = await am(f).getAvailability({ ...input, party: twoRooms });
    expect(a!.roomsRequired).toBe(2);
    expect(a!.totalAmountMinor).toBe(42_100);
    expect(a!.taxAmountMinor).toBe(4_100);
    expect(a!.availabilityStatus).toBe("unknown");
    expect(a!.nightlyRates!.reduce((s, n) => s + n.amountMinor, 0)).toBe(42_100);
  });

  it("chunks hotel ids into batches of 20", async () => {
    const many = { data: Array.from({ length: 45 }, (_, i) => ({ hotelId: "H" + String(i).padStart(7, "0") })) };
    const { f, calls } = amFetch({ list: many, offers: { data: [] } });
    await am(f).getAvailability({ ...input, limit: 45 });
    expect(calls.filter((c) => c.url.includes("/v3/shopping/hotel-offers?"))).toHaveLength(3);
  });

  it("price check upgrades verification to live_checked and reports price changes or removal", async () => {
    const pricing = (total: string) => (url: string) => {
      expect(url).toContain("/v3/shopping/hotel-offers/OFFER-A");
      return json({ data: { available: true, hotel: { hotelId: "MCLONGHM", name: "TEST KANDY HOTEL" }, offers: [{ ...amOffers.data[0]!.offers![0], price: { currency: "USD", total } }] } });
    };
    const [offer] = await am(amFetch().f).getAvailability(input);
    const same = await am(amFetch({ pricing: pricing("210.50") }).f).recheckPrice({ offer: offer!, organizationId: "o", party });
    expect(same.status).toBe("confirmed");
    expect(same.offer!.verificationStatus).toBe("live_checked");
    expect(same.offer!.offerId).toBe(offer!.offerId);
    expect(same.offer!.property.latitude).toBe(7.29); // kept from the search; the pricing endpoint has no coordinates
    const higher = await am(amFetch({ pricing: pricing("230.00") }).f).recheckPrice({ offer: offer!, organizationId: "o", party });
    expect(higher).toMatchObject({ status: "price_changed", currentTotalMinor: 23_000 });
    const gone = await am(amFetch({ pricing: () => new Response("{}", { status: 400 }) }).f).recheckPrice({ offer: offer!, organizationId: "o", party });
    expect(gone.status).toBe("unavailable");
    const closed = await am(amFetch({ pricing: () => json({ data: { available: false, offers: [] } }) }).f).recheckPrice({ offer: offer!, organizationId: "o", party });
    expect(closed.status).toBe("unavailable");
  });

  it("classifies errors like the other suppliers: retries 5xx, rejects malformed responses", async () => {
    let n = 0;
    const base = amFetch();
    const flaky = async (url: string, init?: RequestInit) => (url.includes("/by-geocode") && ++n < 3 ? new Response("boom", { status: 503 }) : base.f(url, init));
    expect((await am(flaky).getAvailability(input)).length).toBe(2);
    expect(n).toBe(3);
    const badFetch = async (url: string, init?: RequestInit) => (url.includes("/v3/shopping/hotel-offers?") ? new Response("{not json", { status: 200 }) : base.f(url, init));
    await expect(am(badFetch).getAvailability(input)).rejects.toMatchObject({ code: "bad_response" });
  });

  it("refuses unsupported searches instead of guessing", async () => {
    const { f } = amFetch();
    await expect(am(f).getAvailability({ ...input, latitude: null, longitude: null })).rejects.toMatchObject({ code: "unsupported" });
    const kids: PartyConfiguration = { adults: 2, children: 1, childAges: [6], rooms: [{ adults: 2, children: 1, childAges: [6] }] };
    await expect(am(f).getAvailability({ ...input, party: kids })).rejects.toMatchObject({ code: "unsupported" });
    const mixed: PartyConfiguration = { adults: 3, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }, { adults: 1, children: 0 }] };
    await expect(am(f).getAvailability({ ...input, party: mixed })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("works with explicit hotel ids and without coordinates", async () => {
    const { f, calls } = amFetch();
    const offers = await am(f).getAvailability({ ...input, latitude: null, longitude: null, propertyIds: ["MCLONGHM"] });
    expect(offers.length).toBe(2);
    expect(calls.some((c) => c.url.includes("/by-geocode"))).toBe(false);
  });
});

describe("resilience & multi-provider search", () => {
  it("withRetry backs off exponentially and stops on non-retryable errors", async () => {
    const delays: number[] = [];
    let n = 0;
    const r = await withRetry(async () => { if (++n < 3) throw new ProviderError("x", "upstream", "e", true); return "ok"; }, { retries: 3, baseDelayMs: 100, maxDelayMs: 1000, random: () => 1, sleep: async (ms) => { delays.push(ms); } });
    expect(r).toBe("ok");
    expect(delays).toEqual([100, 200]);
    await expect(withRetry(async () => { throw new ProviderError("x", "auth", "e", false); }, retry)).rejects.toThrow();
  });

  it("mapWithConcurrency bounds in-flight work and preserves order", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return n * 2; });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("a failing supplier does not prevent results from healthy ones", async () => {
    const healthy = new InternalInventoryProvider({ load: async () => inventory() }, () => NOW);
    const down = new MockProvider({ failWith: "upstream" });
    const calls: string[] = [];
    const res = await searchAllProviders([healthy, down], input, { ...opts, onCall: (o) => { calls.push(`${o.providerKey}:${o.status}`); } });
    expect(res.offers.length).toBe(1);
    expect(res.outcomes.find((o) => o.providerKey === "mock")).toMatchObject({ status: "error", errorCode: "upstream" });
    expect(res.outcomes.find((o) => o.providerKey === "internal")?.status).toBe("ok");
    expect(calls).toEqual(expect.arrayContaining(["internal:ok", "mock:error"]));
  });

  it("recovers from transient supplier failures via retries", async () => {
    const flaky = new MockProvider({ failFirst: 2 });
    const res = await searchAllProviders([flaky], input, opts);
    expect(res.outcomes[0]!.status).toBe("ok");
    expect(res.offers.length).toBeGreaterThan(0);
    expect(flaky.callCount).toBe(3);
  });

  it("times out slow suppliers and reports it", async () => {
    const slow = new MockProvider({ latencyMs: 200 });
    const res = await searchAllProviders([slow], input, { ...opts, timeoutMs: 20, retry: { ...retry, retries: 0 } });
    expect(res.outcomes[0]!.status).toBe("timeout");
    expect(res.offers).toHaveLength(0);
  });

  it("drops malformed offers and mislabels mock-as-live defensively", async () => {
    const m = new MockProvider();
    const bad = { getAvailability: async () => [{ ...(await m.getAvailability(input))[0]!, totalAmountMinor: -5 }, { ...(await m.getAvailability(input))[0]!, verificationStatus: "live_checked" as const }], key: "mock", isMock: true, displayName: "m", searchProperties: async () => [], recheckPrice: m.recheckPrice.bind(m) };
    const res = await searchAllProviders([bad], input, opts);
    expect(res.dropped).toBe(1);
    expect(res.offers[0]!.verificationStatus).toBe("estimated");
  });
});
