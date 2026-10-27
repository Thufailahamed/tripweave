import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultBuildProviders } from "../src/services/providers";
import { enabledExternalProviders, integrationSchema } from "../src/services/settings";
import type { Env } from "../src/env";

const build = (env: Partial<Env>, opts: { includeExternal?: boolean; externalProviders?: string[] } = {}) =>
  defaultBuildProviders(env as Env, {} as never, "org", { includeExternal: opts.includeExternal ?? true, includeMock: false, externalProviders: opts.externalProviders }).map((p) => p.key);

const creds = { HOTELBEDS_API_KEY: "k", HOTELBEDS_SECRET: "s", AMADEUS_CLIENT_ID: "i", AMADEUS_CLIENT_SECRET: "s" };

afterEach(() => vi.unstubAllGlobals());

describe("external supplier selection", () => {
  it("only builds suppliers the platform allows AND has credentials for", () => {
    expect(build({ ...creds, HOTEL_EXTERNAL_PROVIDER: "none" })).toEqual(["internal"]);
    expect(build({ ...creds, HOTEL_EXTERNAL_PROVIDER: "hotelbeds,amadeus" })).toEqual(["internal", "hotelbeds", "amadeus"]);
    expect(build({ ...creds, HOTEL_EXTERNAL_PROVIDER: "Amadeus" })).toEqual(["internal", "amadeus"]);
    expect(build({ HOTEL_EXTERNAL_PROVIDER: "hotelbeds,amadeus", AMADEUS_CLIENT_ID: "i" })).toEqual(["internal"]); // half a credential pair is not a credential
  });

  it("honours the organisation's per-supplier switches and the request's includeExternal flag", () => {
    const env = { ...creds, HOTEL_EXTERNAL_PROVIDER: "hotelbeds,amadeus" };
    expect(build(env, { externalProviders: ["amadeus"] })).toEqual(["internal", "amadeus"]);
    expect(build(env, { externalProviders: [] })).toEqual(["internal"]);
    expect(build(env, { includeExternal: false })).toEqual(["internal"]);
  });

  it("reads switches from settings saved before a supplier existed", () => {
    expect(enabledExternalProviders({ externalProviders: { hotelbeds: true } as never })).toEqual(["hotelbeds"]);
    expect(enabledExternalProviders({ externalProviders: { hotelbeds: false, amadeus: true } })).toEqual(["amadeus"]);
    expect(enabledExternalProviders({})).toEqual([]);
  });

  it("defaults the direct entity-enrichment pilot flag off and persists it when enabled", () => {
    expect(integrationSchema.parse({}).googleHotelsDirect).toBe(false);
    expect(integrationSchema.parse({ googleHotelsDirect: true }).googleHotelsDirect).toBe(true);
  });

  it("passes the direct pilot flag through to the Google Hotels provider", async () => {
    const calls: string[] = [];
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    const entity = (() => {
      const parent: any[] = [];
      parent[1] = "Cheap Hotel";
      parent[2] = [[7.29, 80.63], [["1 Test Road"]]];
      parent[3] = ["4-star hotel", 4];
      parent[7] = [[4.4, 100]];
      parent[6] = [];
      const offer: any[] = [];
      offer[0] = "Booking.com";
      offer[1] = "//www.gstatic.com/travel-hotels/branding/icon_184.png";
      offer[18] = ["Free cancellation until Mar 1", "2 guests", "breakfast"];
      offer[19] = ["$50", "$50", "$200", 50, 50];
      offer[24] = [["Heritage Room", ["2 guests", "breakfast"], null, ["$50", "$50", "$200", 50, 50], "https://example.test/booking"]];
      offer[40] = 184;
      parent[6][16] = [[offer]];
      return `<html><body><script class="ds:1">AF_initDataCallback({key: 'ds:1', hash: '6', data:${JSON.stringify([parent])}, sideChannel: {}});</script></body></html>`;
    })();

    vi.stubGlobal("fetch", (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("serpapi.com")) {
        return json({
          properties: [{ name: "Cheap Hotel", property_token: "tok-cheap", gps_coordinates: { latitude: 7.29, longitude: 80.63 }, extracted_hotel_class: 4, overall_rating: 4.4, reviews: 100, amenities: ["Free breakfast"], prices: [{ source: "Booking.com", total_rate: { extracted_lowest: 400 } }] }],
        });
      }
      return Promise.resolve(new Response(entity, { status: 200 }));
    });

    const env = { SERPAPI_API_KEY: "key", HOTEL_EXTERNAL_PROVIDER: "google_hotels" } as Env;
    const input = { organizationId: "org", destination: "Kandy", checkIn: "2027-03-05", checkOut: "2027-03-09", party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] }, currency: "USD" };

    const enabled = defaultBuildProviders(env, {} as never, "org", { includeExternal: true, includeMock: false, externalProviders: ["google_hotels"], googleHotelsDirect: true });
    const enriched = await enabled.find((p) => p.key === "google_hotels")!.getAvailability(input);
    expect(calls.some((url) => url.includes("/travel/hotels/entity/tok-cheap"))).toBe(true);
    expect(enriched[0]!.providerMetadata?.directEnrichment).toMatchObject({ status: "ok", strictBreakfastTotalMinor: 20_000 });

    calls.length = 0;
    const disabled = defaultBuildProviders(env, {} as never, "org", { includeExternal: true, includeMock: false, externalProviders: ["google_hotels"], googleHotelsDirect: false });
    const plain = await disabled.find((p) => p.key === "google_hotels")!.getAvailability(input);
    expect(calls.some((url) => url.includes("/travel/hotels/entity/"))).toBe(false);
    expect(plain[0]!.providerMetadata?.directEnrichment).toBeUndefined();
  });
});
