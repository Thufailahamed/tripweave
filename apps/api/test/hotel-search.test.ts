import { beforeAll, describe, expect, it } from "vitest";
import { InternalInventoryProvider, OsmDiscoveryProvider, type HotelProvider } from "@tripweave/provider-contracts";
import { inventory } from "@tripweave/database";
import type { FetchLike } from "@tripweave/provider-contracts";
import { createHotel, Harness } from "./harness";

const KANDY = { lat: 7.2906, lng: 80.6337 };

/** Two real Kandy listings: one duplicates the catalogue hotel, one is genuinely new. */
const OVERPASS = {
  elements: [
    { type: "node", id: 101, lat: 7.2906, lon: 80.6437, tags: { name: "Lakeside Heritage Hotel & Spa", tourism: "hotel", stars: "4" } },
    { type: "node", id: 102, lat: 7.295, lon: 80.635, tags: { name: "Kandy Riverside Villas", tourism: "hotel" } },
  ],
};

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

describe("live hotel search merged with the catalogue", () => {
  let h: Harness;
  let operator: Awaited<ReturnType<Harness["register"]>>;
  let cataloguePropertyId: string;

  beforeAll(async () => {
    h = new Harness({
      buildProviders: (env, db, orgId, opts) => {
        const internal = new InternalInventoryProvider({ load: (q) => inventory.loadInternalInventory(db, q.organizationId, q) });
        const providers: HotelProvider[] = [internal];
        if (opts.includeExternal) {
          providers.push(
            new OsmDiscoveryProvider({
              fetch: (() => json(OVERPASS)) as FetchLike,
              benchmark: async () => ({ nightlyMinor: 5_000, currency: "USD", basis: "test catalogue" }),
              now: () => h.now,
              sleep: async () => {},
            }),
          );
        }
        return providers;
      },
    });
    operator = await h.register("Discovery Tours", "tour_operator");
    const hotel = await createHotel(operator, { name: "Lakeside Heritage Kandy", city: "Kandy", lat: KANDY.lat, lng: 80.6437, price: 200, category: "boutique" });
    cataloguePropertyId = hotel.propertyId;
  });

  it("searches the catalogue and discovery sources, dedupes, and persists new properties", async () => {
    const result = await operator.ok("POST", "/hotel-search", {
      destination: "Kandy",
      latitude: KANDY.lat,
      longitude: KANDY.lng,
      checkIn: "2026-12-10",
      checkOut: "2026-12-12",
      party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
      includeExternal: true,
    });

    expect(result.providers.map((p: any) => p.providerKey).sort()).toEqual(["internal", "osm_discovery"]);
    expect(result.providers.every((p: any) => p.status === "ok")).toBe(true);
    expect(result.duplicates).toBe(1);
    expect(result.offers).toHaveLength(2);

    const names = result.offers.map((o: any) => o.property.name).sort();
    expect(names).toEqual(["Kandy Riverside Villas", "Lakeside Heritage Kandy"]);

    const discovered = result.offers.find((o: any) => o.providerKey === "osm_discovery")!;
    expect(discovered).toMatchObject({ availabilityStatus: "unknown", verificationStatus: "estimated", mealPlanStatus: "unconfirmed" });
    expect(discovered.supplierName).toMatch(/estimated/i);

    // The discovered property is now part of the organisation's hotel catalogue.
    const hotels = await operator.ok("GET", "/hotels?scope=all");
    const saved = hotels.find((p: any) => p.name === "Kandy Riverside Villas");
    expect(saved).toBeTruthy();
    expect(saved.source).toBe("provider");
    expect(saved.city).toBe("Kandy");
  });

  it("optimises with the discovered hotels and produces packages from them", async () => {
    const created = await operator.ok("POST", "/trips", {
      title: "Kandy discovery trip",
      arrivalDate: "2026-12-10",
      departureDate: "2026-12-12",
      party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
      budgetAmountMinor: 100_000,
      budgetCurrency: "USD",
      budgetScope: "accommodation_only",
    });
    await operator.ok("PUT", `/trips/${created.id}/itinerary`, {
      title: "Kandy",
      confirm: true,
      stops: [{ destination: "Kandy", latitude: KANDY.lat, longitude: KANDY.lng, arrivalDate: "2026-12-10", departureDate: "2026-12-12", activities: [] }],
    });

    const start = await operator.post(`/trips/${created.id}/optimisations`, {});
    expect(start.status).toBe(202);
    await h.settle();

    const job = await operator.ok("GET", `/optimisations/${start.body.data.jobId}`);
    expect(job.status).toBe("succeeded");
    expect(job.result.providers.map((p: any) => p.providerKey).sort()).toEqual(["internal", "osm_discovery"]);
    expect(job.result.notes.join(" ")).toMatch(/merged into it/i);

    const { packages } = await operator.ok("GET", `/trips/${created.id}/packages`);
    expect(packages.length).toBeGreaterThan(0);
    const selection = packages
      .flatMap((p: any) => p.package.selections)
      .find((s: any) => s.offer.providerKey === "osm_discovery");
    expect(selection).toBeTruthy();
    expect(selection.offer.property.name).toBe("Kandy Riverside Villas");
    expect(selection.offer.property.id).not.toBe(cataloguePropertyId);
    expect(selection.offer.mealPlanStatus).toBe("unconfirmed");
    const warnings = packages.flatMap((p: any) => p.package.assumptions).join(" ");
    expect(warnings).toMatch(/must be confirmed/i);
  });
});
