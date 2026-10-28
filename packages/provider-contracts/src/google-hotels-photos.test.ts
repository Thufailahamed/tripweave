import { describe, expect, it } from "vitest";
import type { FetchLike } from "./resilience";
import { bookingLinksForOffer, fetchGoogleHotelPhotos, GOOGLE_PHOTO_LIMIT, GoogleHotelsProvider, photosFromGoogle } from "./google-hotels";

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
const party = { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] };
const input = { organizationId: "org", destination: "Ella", checkIn: "2027-03-09", checkOut: "2027-03-12", party, currency: "USD" };

describe("Google Hotels photographs", () => {
  it("keeps https thumbnails and originals, drops duplicates and anything that is not https", () => {
    const photos = photosFromGoogle([
      { thumbnail: "https://lh5.googleusercontent.com/p/a=s287", original_image: "https://cf.bstatic.com/a.jpg" },
      { thumbnail: "https://lh5.googleusercontent.com/p/a=s287" },
      { thumbnail: "http://insecure.example/b.jpg" },
      { thumbnail: "javascript:alert(1)" },
      { original_image: "https://cf.bstatic.com/c.jpg" },
      "not an image",
    ]);
    expect(photos).toEqual([
      { thumbnail: "https://lh5.googleusercontent.com/p/a=s287", original: "https://cf.bstatic.com/a.jpg" },
      { thumbnail: "https://cf.bstatic.com/c.jpg", original: "https://cf.bstatic.com/c.jpg" },
    ]);
  });

  it("bounds the number of photos per property", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ thumbnail: `https://lh5.googleusercontent.com/p/${i}` }));
    expect(photosFromGoogle(many)).toHaveLength(GOOGLE_PHOTO_LIMIT);
  });

  it("stores the search result's photos, description and link on the offer", async () => {
    const provider = new GoogleHotelsProvider({
      apiKey: "key",
      fetch: (() =>
        json({
          properties: [
            {
              name: "Photo Hotel",
              property_token: "tok-photo",
              link: "https://photohotel.example",
              description: "Hill-country views.",
              check_in_time: "2:00 PM",
              images: [{ thumbnail: "https://lh5.googleusercontent.com/p/x", original_image: "https://photohotel.example/x.jpg" }],
              prices: [{ source: "Agoda", total_rate: { extracted_lowest: 300 } }],
            },
          ],
        })) as FetchLike,
    });
    const [offer] = await provider.getAvailability(input);
    expect(offer!.providerMetadata).toMatchObject({
      images: [{ thumbnail: "https://lh5.googleusercontent.com/p/x", original: "https://photohotel.example/x.jpg" }],
      description: "Hill-country views.",
      link: "https://photohotel.example/",
      checkInTime: "2:00 PM",
    });
  });

  it("looks up photos for one property token", async () => {
    let url = "";
    const photos = await fetchGoogleHotelPhotos({
      apiKey: "key",
      token: "tok-1",
      checkIn: "2027-03-09",
      checkOut: "2027-03-12",
      fetchImpl: ((u: string) => {
        url = u;
        return json({ images: [{ thumbnail: "https://lh5.googleusercontent.com/p/y" }] });
      }) as FetchLike,
    });
    expect(url).toContain("property_token=tok-1");
    expect(photos).toEqual([{ thumbnail: "https://lh5.googleusercontent.com/p/y", original: null }]);
  });
});

describe("Google Hotels booking links", () => {
  const offer = {
    offerId: "gh:tok",
    providerKey: "google_hotels",
    externalOfferReference: "gh:tok",
    source: "external",
    supplierId: null,
    supplierName: "Agoda via Google Hotels",
    property: { id: "g:tok", name: "Ravana Range", destination: "Ella", latitude: null, longitude: null, category: "comfort", starRating: 3, reviewScore: 8.4, amenities: [], ownerOrganizationId: null },
    roomType: { id: null, name: "Triple Room", maxOccupancy: 2, maxAdults: 1 },
    stayStart: "2027-03-09",
    stayEnd: "2027-03-12",
    nights: 3,
    mealPlan: "BB",
    mealPlanStatus: "confirmed",
    roomsRequired: 2,
    occupancy: { adults: 2, children: 2, childAges: [8, 11], rooms: [{ adults: 1, children: 1, childAges: [8] }, { adults: 1, children: 1, childAges: [11] }] },
    totalAmountMinor: 18_800,
    currency: "USD",
    taxAmountMinor: null,
    feeAmountMinor: null,
    taxesIncluded: true,
    cancellation: { refundable: true, freeCancellationUntil: null },
    payment: { type: "unknown", description: "" },
    retrievedAt: "2026-10-28T11:00:00Z",
    expiresAt: null,
    availabilityStatus: "unknown",
    verificationStatus: "live_checked",
    providerMetadata: { propertyToken: "ChoI79jtspymzKvoARoNL2cvMTFramRwX3h4dxAB", link: "https://ravanarange.com/", cheapestSource: "Agoda", recheck: { source: "Agoda", link: "https://www.google.com/travel/clk?pc=abc" } },
    isMock: false,
  } as unknown as Parameters<typeof bookingLinksForOffer>[0];

  it("links the live-checked seller, the dated Google Hotels page and the hotel's website", () => {
    const links = bookingLinksForOffer(offer);
    expect(links.map((l) => l.kind)).toEqual(["seller", "google", "website"]);
    expect(links[0]).toEqual({ kind: "seller", label: "Book on Agoda", url: "https://www.google.com/travel/clk?pc=abc" });
    const google = new URL(links[1]!.url);
    expect(google.pathname).toBe("/travel/hotels/entity/ChoI79jtspymzKvoARoNL2cvMTFramRwX3h4dxAB");
    expect(google.searchParams.get("ts")).toBeTruthy();
    expect(links[1]!.label).toBe("Compare on Google Hotels (per room, ×2)");
    expect(links[2]).toMatchObject({ kind: "website", label: "ravanarange.com" });
  });

  it("gives no links for catalogue or illustrative stays, and drops unsafe seller links", () => {
    expect(bookingLinksForOffer({ ...offer, providerKey: "internal" })).toEqual([]);
    expect(bookingLinksForOffer({ ...offer, isMock: true })).toEqual([]);
    const unsafe = bookingLinksForOffer({ ...offer, providerMetadata: { ...offer.providerMetadata, recheck: { link: "javascript:alert(1)" } } });
    expect(unsafe.some((l) => l.kind === "seller")).toBe(false);
  });
});
