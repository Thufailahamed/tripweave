import { describe, expect, it } from "vitest";
import {
  GoogleHotelsConsentError,
  chooseGoogleHotelsEntityRate,
  encodeGoogleHotelsTs,
  fetchGoogleHotelsEntity,
  parseGoogleHotelsEntity,
  type GoogleHotelsEntityRate,
} from "./google-hotels-direct";
import type { FetchLike } from "./resilience";

/* A trimmed version of the `ds:1` payload Google embeds in an entity page.
 * The positions mirror the live page: metadata on the root object, rate
 * sections under root[6], a full provider card with room variants under
 * section[16], and a compact provider card under section[2]. */
function entityHtml(): string {
  const parent: any[] = [];
  parent[1] = "Test Hotel";
  parent[2] = [[1.23, 4.56], [["1 Test Road"]]];
  parent[3] = ["4-star hotel", 4];
  parent[7] = [[4.5, 123]];
  parent[11] = ["A test hotel."];
  parent[6] = [];

  const fullOffer: any[] = [];
  fullOffer[0] = "Booking.com";
  fullOffer[1] = "//www.gstatic.com/travel-hotels/branding/icon_184.png";
  fullOffer[18] = ["Free cancellation until Mar 1", "Free Wi-Fi", "Free breakfast", "2 guests"];
  fullOffer[19] = ["$167", "$167", "$668", 167, 167];
  fullOffer[24] = [
    ["Heritage Room", ["1 double bed", "2 guests", "Free cancellation until Mar 1", "breakfast"], null, ["$167", "$167", "$668", 167, 167], "https://example.test/booking-2"],
    ["Heritage Room", ["1 double bed", "3 guests", "Free cancellation until Mar 1", "breakfast"], null, ["$218", "$218", "$873", 218, 218], "https://example.test/booking-3"],
  ];
  fullOffer[40] = 184;

  const compactOffer: any[] = [];
  compactOffer[0] = ["Priceline", 220, "https://example.test/priceline", null];
  compactOffer[12] = [];
  compactOffer[12][4] = ["$140", null, 140, null, 140];
  compactOffer[12][5] = ["$561", null, 561, null, 561];
  compactOffer[12][12] = [[2, null, 1], [1, "Mar 1", "11:59 PM", "3/1"]];

  parent[6][2] = [[[], [], [compactOffer]]];
  parent[6][16] = [[fullOffer]];

  const payload = JSON.stringify([parent]);
  return `<html><body><script class="ds:1">AF_initDataCallback({key: 'ds:1', hash: '6', data:${payload}, sideChannel: {}});</script></body></html>`;
}

function fractionalEntityHtml(): string {
  const parent: any[] = [];
  parent[1] = "Test Hotel";
  parent[2] = [[1.23, 4.56], [["1 Test Road"]]];
  parent[3] = ["4-star hotel", 4];
  parent[7] = [[4.5, 123]];
  parent[6] = [];

  const fullOffer: any[] = [];
  fullOffer[0] = "Booking.com";
  fullOffer[1] = "//www.gstatic.com/travel-hotels/branding/icon_184.png";
  fullOffer[18] = ["Free cancellation until Mar 1", "Free breakfast", "2 guests"];
  fullOffer[19] = ["$167", "$167", "$668", 167, 167];
  fullOffer[24] = [["Heritage Room", ["1 double bed", "2 guests", "Free cancellation until Mar 1", "breakfast"], null, ["$167", "$167", "$668", 167, 167], "https://example.test/booking-2"]];
  fullOffer[40] = 184;

  const duplicateBooking: any[] = [];
  duplicateBooking[0] = ["Booking.com", 184, "https://example.test/booking-compact", null];
  duplicateBooking[12] = [];
  duplicateBooking[12][4] = ["$167", null, 167.01562, null, 167];
  duplicateBooking[12][5] = ["$668", null, 668.0625, null, 668];
  duplicateBooking[12][12] = [[2, null, 1], [1, "Mar 1", "11:59 PM", "3/1"]];

  const priceline: any[] = [];
  priceline[0] = ["Priceline", 220, "https://example.test/priceline", null];
  priceline[12] = [];
  priceline[12][4] = ["$167", null, 167.01562, null, 167];
  priceline[12][5] = ["$668", null, 668.0625, null, 668];
  priceline[12][12] = [[2, null, 1], [1, "Mar 1", "11:59 PM", "3/1"]];

  parent[6][2] = [[[], [], [duplicateBooking, priceline]]];
  parent[6][16] = [[fullOffer]];

  const payload = JSON.stringify([parent]);
  return `<html><body><script class="ds:1">AF_initDataCallback({key: 'ds:1', hash: '6', data:${payload}, sideChannel: {}});</script></body></html>`;
}

describe("Google Hotels direct entity parser", () => {
  it("encodes the same Google Hotels ts as the live 1A1C page", () => {
    expect(
      encodeGoogleHotelsTs({
        checkIn: "2027-03-05",
        checkOut: "2027-03-09",
        adults: 1,
        childAges: [8],
        rooms: 1,
        currency: "USD",
      }),
    ).toBe("CAESDAoCCAMKBAgCEAgQABoiCgQKAhoAEhoSFAoHCOsPEAMYBRIHCOsPEAMYCRgEMgIIASoJCgU6A1VTRBoA");
  });

  it("parses entity metadata and full room rates", () => {
    const entity = parseGoogleHotelsEntity(entityHtml(), { nights: 4, currency: "USD" });

    expect(entity.name).toBe("Test Hotel");
    expect(entity.address).toBe("1 Test Road");
    expect(entity.coords).toEqual([1.23, 4.56]);
    expect(entity.stars).toBe(4);
    expect(entity.rating).toBe(4.5);
    expect(entity.reviews).toBe(123);

    const twoGuests = entity.rates.find((rate) => rate.source === "Booking.com" && rate.guests === 2)!;
    expect(twoGuests).toMatchObject({ room: "Heritage Room", total: 668, nightly: 167, breakfast: "included", cancellation: "Free cancellation until Mar 1", kind: "room" });

    const threeGuests = entity.rates.find((rate) => rate.source === "Booking.com" && rate.guests === 3)!;
    expect(threeGuests.total).toBe(873);
  });

  it("parses compact provider cards with unknown board and occupancy", () => {
    const entity = parseGoogleHotelsEntity(entityHtml(), { nights: 4, currency: "USD" });
    const priceline = entity.rates.find((rate) => rate.source === "Priceline")!;
    expect(priceline).toMatchObject({ total: 561, nightly: 140, room: null, guests: null, breakfast: "unknown", kind: "compact" });
  });

  it("strict breakfast selection ignores cheaper room-only and unknown rates", () => {
    const entity = parseGoogleHotelsEntity(entityHtml(), { nights: 4, currency: "USD" });

    const picked = chooseGoogleHotelsEntityRate(entity.rates, { requireBreakfast: true, partySize: 2 });
    expect(picked).toMatchObject({ total: 668, breakfast: "included" });

    const three = chooseGoogleHotelsEntityRate(entity.rates, { requireBreakfast: true, partySize: 3 });
    expect(three?.total).toBe(873);

    const onlyCompact = entity.rates.filter((rate) => rate.source === "Priceline");
    expect(chooseGoogleHotelsEntityRate(onlyCompact, { requireBreakfast: true, partySize: 2 })).toBeNull();
  });

  it("normalises fractional entity totals and drops compact duplicates of a full rate", () => {
    const entity = parseGoogleHotelsEntity(fractionalEntityHtml(), { nights: 4, currency: "USD" });
    const booking = entity.rates.filter((rate) => rate.source === "Booking.com");
    expect(booking).toHaveLength(1);
    expect(booking[0]).toMatchObject({ kind: "room", total: 668, nightly: 167 });

    const priceline = entity.rates.find((rate) => rate.source === "Priceline")!;
    expect(priceline).toMatchObject({ total: 668, nightly: 167 });

    for (const rate of entity.rates) {
      expect(Number.isInteger(rate.total)).toBe(true);
      expect(rate.nightly === null || Number.isInteger(rate.nightly)).toBe(true);
    }
  });

  it("can use an unknown-board compact rate when explicitly allowed", () => {
    const entity = parseGoogleHotelsEntity(entityHtml(), { nights: 4, currency: "USD" });
    const picked = chooseGoogleHotelsEntityRate(entity.rates, { requireBreakfast: false, partySize: 2, allowUnknownOccupancy: true });
    expect(picked?.total).toBe(561);
  });

  it("fetches an entity page and returns the parsed entity", async () => {
    let seenUrl = "";
    const result = await fetchGoogleHotelsEntity({
      token: "tok-1",
      destination: "Kandy",
      checkIn: "2027-03-05",
      checkOut: "2027-03-09",
      adults: 1,
      childAges: [8],
      rooms: 1,
      currency: "USD",
      retries: 0,
      fetchImpl: ((url: string) => {
        seenUrl = url;
        return Promise.resolve(new Response(entityHtml(), { status: 200 }));
      }) as FetchLike,
    });

    expect(result.name).toBe("Test Hotel");
    expect(result.rates).toHaveLength(3);
    expect(seenUrl).toContain("/travel/hotels/entity/tok-1");
    expect(seenUrl).toContain("ts=");
    expect(result.attempts).toBe(1);
  });

  it("retries a rate-limited entity request before succeeding", async () => {
    let calls = 0;
    const result = await fetchGoogleHotelsEntity({
      token: "tok-2",
      destination: "Kandy",
      checkIn: "2027-03-05",
      checkOut: "2027-03-09",
      adults: 1,
      childAges: [8],
      rooms: 1,
      currency: "USD",
      retries: 1,
      sleep: async () => {},
      fetchImpl: (() => {
        calls++;
        return Promise.resolve(calls === 1 ? new Response("busy", { status: 429 }) : new Response(entityHtml(), { status: 200 }));
      }) as FetchLike,
    });

    expect(calls).toBe(2);
    expect(result.attempts).toBe(2);
  });

  it("refuses a Google consent wall instead of treating it as a rate page", async () => {
    await expect(
      fetchGoogleHotelsEntity({
        token: "tok-3",
        destination: "Kandy",
        checkIn: "2027-03-05",
        checkOut: "2027-03-09",
        adults: 1,
        childAges: [8],
        rooms: 1,
        currency: "USD",
        retries: 0,
        fetchImpl: (() => Promise.resolve(new Response("Before you continue to Google", { status: 200 }))) as FetchLike,
      }),
    ).rejects.toBeInstanceOf(GoogleHotelsConsentError);
  });
});

describe("Google Hotels entity rate selection", () => {
  const rate = (over: Partial<GoogleHotelsEntityRate>): GoogleHotelsEntityRate => ({
    source: "Booking.com",
    room: "Room",
    guests: 2,
    breakfast: "unknown",
    cancellation: null,
    nightly: 100,
    total: 400,
    currency: "USD",
    link: null,
    kind: "room",
    ...over,
  });

  it("requires an explicit breakfast-included rate and known occupancy", () => {
    const rates = [
      rate({ source: "RoomOnly", total: 300, breakfast: "not_included" }),
      rate({ source: "Unknown", total: 250, breakfast: "unknown" }),
      rate({ source: "Compact", total: 200, guests: null, kind: "compact" }),
      rate({ source: "Breakfast", total: 500, breakfast: "included" }),
    ];
    expect(chooseGoogleHotelsEntityRate(rates, { requireBreakfast: true, partySize: 2 })?.source).toBe("Breakfast");
    expect(chooseGoogleHotelsEntityRate(rates, { requireBreakfast: true, partySize: 3 })).toBeNull();
  });
});
