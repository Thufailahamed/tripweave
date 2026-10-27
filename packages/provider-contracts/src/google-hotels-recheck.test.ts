import { describe, expect, it } from "vitest";
import type { NormalisedOffer } from "@tripweave/shared";
import { GoogleHotelsProvider } from "./google-hotels";
import { chooseGoogleLiveRate, parseGooglePropertyRates } from "./google-hotels-recheck";
import type { FetchLike } from "./resilience";

const propertyDetails = {
  property_token: "tok-1",
  featured_prices: [
    {
      source: "Booking.com",
      rooms: [
        {
          name: "Heritage Room",
          num_guests: 2,
          total_rate: { extracted_lowest: 200, extracted_before_taxes_fees: 180 },
          rate_per_night: { extracted_lowest: 50 },
          inclusions: ["Room only"],
        },
        {
          name: "Garden Room",
          num_guests: 2,
          rates: [
            {
              total_rate: { extracted_lowest: 223 },
              rate_per_night: { extracted_lowest: 55.75 },
              num_guests: 2,
              inclusions: ["Free breakfast", "Free cancellation until Mar 1"],
            },
          ],
        },
      ],
    },
    {
      source: "Agoda",
      num_guests: 2,
      total_rate: { extracted_lowest: 210 },
      rate_per_night: { extracted_lowest: 52.5 },
    },
  ],
};

const party = {
  adults: 2,
  children: 2,
  childAges: [8, 11],
  rooms: [
    { adults: 1, children: 1, childAges: [8] },
    { adults: 1, children: 1, childAges: [11] },
  ],
};

function googleOffer(over: Partial<NormalisedOffer> = {}): NormalisedOffer {
  return {
    offerId: "gh:tok-1:2027-03-05:2027-03-09:2:booking-com",
    providerKey: "google_hotels",
    externalOfferReference: "gh:tok-1:2027-03-05:2027-03-09:2:booking-com",
    source: "external",
    supplierId: null,
    supplierName: "Booking.com via Google Hotels",
    property: {
      id: "g:tok-1",
      name: "Test Hotel",
      destination: "Kandy",
      latitude: 7.29,
      longitude: 80.63,
      category: "comfort",
      starRating: 3,
      reviewScore: 8.8,
      amenities: ["breakfast"],
      ownerOrganizationId: null,
    },
    roomType: { id: null, name: "Room type to confirm", maxOccupancy: 2, maxAdults: 1 },
    stayStart: "2027-03-05",
    stayEnd: "2027-03-09",
    nights: 4,
    mealPlan: "BB",
    mealPlanStatus: "confirmed",
    roomsRequired: 2,
    occupancy: party,
    totalAmountMinor: 44_600,
    currency: "USD",
    taxAmountMinor: null,
    feeAmountMinor: null,
    taxesIncluded: null,
    cancellation: { refundable: null, freeCancellationUntil: null },
    payment: { type: "unknown" },
    retrievedAt: "2026-10-27T10:00:00.000Z",
    expiresAt: null,
    availabilityStatus: "unknown",
    verificationStatus: "supplier_reported",
    providerMetadata: { propertyToken: "tok-1", priceBasis: "strict_breakfast" },
    isMock: false,
    ...over,
  };
}

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

function entityHtml({ breakfast = true, total = 223 }: { breakfast?: boolean; total?: number } = {}) {
  const parent: any[] = [];
  parent[1] = "Test Hotel";
  parent[2] = [[7.29, 80.63], [["1 Test Road"]]];
  parent[3] = ["3-star hotel", 3];
  parent[7] = [[4.4, 100]];
  parent[6] = [];
  const offer: any[] = [];
  offer[0] = "Booking.com";
  offer[1] = "//www.gstatic.com/travel-hotels/branding/icon_184.png";
  offer[18] = ["2 guests", breakfast ? "Free breakfast" : "Room only"];
  offer[19] = ["$50", "$50", `$${total}`, 50, total];
  offer[24] = [["Garden Room", ["2 guests", breakfast ? "Free breakfast" : "Room only"], null, ["$50", "$50", `$${total}`, 50, total], "https://example.test/booking"]];
  offer[40] = 184;
  parent[6][16] = [[offer]];
  return `<html><body><script class="ds:1">AF_initDataCallback({key: 'ds:1', hash: '6', data:${JSON.stringify([parent])}, sideChannel: {}});</script></body></html>`;
}

function provider(body: unknown = propertyDetails) {
  return new GoogleHotelsProvider({
    apiKey: "key",
    fetch: (() => json(body)) as FetchLike,
    now: () => new Date("2026-10-27T10:00:00.000Z"),
  });
}

function entityProvider(options: { breakfast?: boolean; total?: number } = {}) {
  return new GoogleHotelsProvider({
    apiKey: "key",
    direct: { enabled: true, maxProperties: 5 },
    fetch: (() => Promise.resolve(new Response(entityHtml(options), { status: 200 }))) as FetchLike,
    now: () => new Date("2026-10-27T10:00:00.000Z"),
  });
}

describe("Google Hotels live property rates", () => {
  it("parses seller rates and prefers a breakfast-included rate", () => {
    const rates = parseGooglePropertyRates(propertyDetails, { rooms: 2 });
    const breakfast = rates.find((r) => r.source === "Booking.com" && r.room === "Garden Room")!;
    expect(breakfast).toMatchObject({ totalMinor: 44_600, breakfast: "included" });
    expect(breakfast.freeCancellation).toBe(true);
    expect(chooseGoogleLiveRate(rates, { requireBreakfast: true, partySize: 2 })?.totalMinor).toBe(44_600);
    expect(chooseGoogleLiveRate(rates, { requireBreakfast: false, partySize: 2 })?.totalMinor).toBe(40_000);
    expect(chooseGoogleLiveRate(rates, { requireBreakfast: true, partySize: 3 })).toBeNull();
  });

  it("confirms an unchanged live rate and gives it a 15-minute expiry", async () => {
    const result = await entityProvider().recheckPrice({ offer: googleOffer(), organizationId: "org", party });
    expect(result.status).toBe("confirmed");
    expect(result.currentTotalMinor).toBe(44_600);
    expect(result.offer).toMatchObject({ verificationStatus: "live_checked", expiresAt: "2026-10-27T10:15:00.000Z" });
    expect(result.offer?.providerMetadata?.recheck).toMatchObject({ source: "Booking.com", room: "Garden Room", method: "entity_rate" });
  });

  it("returns price_changed with the live total", async () => {
    const result = await entityProvider({ total: 230 }).recheckPrice({ offer: googleOffer(), organizationId: "org", party });
    expect(result.status).toBe("price_changed");
    expect(result.currentTotalMinor).toBe(46_000);
    expect(result.offer?.totalAmountMinor).toBe(46_000);
  });

  it("returns unavailable for a strict breakfast offer with no breakfast rate", async () => {
    const result = await entityProvider({ breakfast: false }).recheckPrice({ offer: googleOffer(), organizationId: "org", party });
    expect(result.status).toBe("unavailable");
    expect(result.offer).toBeNull();
    expect(result.message).toMatch(/breakfast/i);
  });

  it("rechecks an unconfirmed offer from the property-details endpoint", async () => {
    const result = await provider().recheckPrice({
      offer: googleOffer({ mealPlan: "RO", mealPlanStatus: "unconfirmed", totalAmountMinor: 40_000 }),
      organizationId: "org",
      party,
    });
    expect(result.status).toBe("confirmed");
    expect(result.currentTotalMinor).toBe(40_000);
    expect(result.offer?.providerMetadata?.recheck).toMatchObject({ method: "property_details" });
  });

  it("returns not_supported when the offer has no Google property token", async () => {
    const result = await provider().recheckPrice({ offer: googleOffer({ providerMetadata: {} }), organizationId: "org", party });
    expect(result.status).toBe("not_supported");
  });
});
