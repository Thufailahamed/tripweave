import { describe, expect, it } from "vitest";
import { sellFromCost } from "@tripweave/pricing-engine";
import { formatMoney, nightsBetween, pricingConfigSchema } from "@tripweave/shared";
import { Harness, seedHillCountry } from "./harness";

/**
 * Independent checks on the packages the optimiser stores. The expected values are recomputed from the
 * stored offers and the organisation's pricing rules, not copied from the package, so an arithmetic or
 * constraint error in the search, storage or pricing shows up here.
 */
const STOPS = [
  { destination: "Kandy", arrivalDate: "2026-12-10", departureDate: "2026-12-12" },
  { destination: "Ella", arrivalDate: "2026-12-12", departureDate: "2026-12-14" },
];
const BUDGET_MINOR = 90_000;
const PARTY = { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] };

describe("optimised packages: pricing and constraint correctness", () => {
  it("every stored package adds up, matches its stops and is priced by the pricing rules", async () => {
    const h = new Harness();
    const owner = await h.register("Package Correctness", "tour_operator", "package-correctness@example.com");
    await seedHillCountry(owner);
    await owner.ok("PUT", "/organization/integrations", { externalProviders: { hotelbeds: false } });
    const trip = await owner.ok<any>("POST", "/trips", {
      title: "Correctness",
      party: PARTY,
      budgetCurrency: "USD",
      budgetAmountMinor: BUDGET_MINOR,
      budgetScope: "accommodation_only",
      arrivalDate: STOPS[0]!.arrivalDate,
      departureDate: STOPS[1]!.departureDate,
    });
    await owner.ok("PUT", `/trips/${trip.id}/itinerary`, { confirm: true, stops: STOPS });
    await owner.ok("POST", `/trips/${trip.id}/optimisations`, { constraints: { includeExternalProviders: false } });
    await h.settle();
    const { packages } = await owner.ok<any>("GET", `/trips/${trip.id}/packages`);
    expect(packages.length).toBeGreaterThan(0);

    const pricing = pricingConfigSchema.parse({});
    const nightsPerStop = STOPS.map((stop) => nightsBetween(stop.arrivalDate, stop.departureDate));
    const totalNights = nightsPerStop.reduce((sum, n) => sum + n, 0);
    const signatures = new Set<string>();

    for (const pkg of packages) {
      const body = pkg.package;
      const label = `package #${pkg.number}`;
      expect(body.selections.map((s: any) => s.destination), label).toEqual(["Kandy", "Ella"]);

      body.selections.forEach((selection: any, index: number) => {
        const offer = selection.offer;
        expect(offer.stayStart, `${label} stop ${index + 1} check-in`).toBe(STOPS[index]!.arrivalDate);
        expect(offer.stayEnd, `${label} stop ${index + 1} check-out`).toBe(STOPS[index]!.departureDate);
        expect(offer.nights, `${label} stop ${index + 1} nights`).toBe(nightsPerStop[index]);
        expect(offer.currency, `${label} stop ${index + 1} currency`).toBe(body.currency);
        expect(offer.roomsRequired * offer.roomType.maxAdults, `${label} stop ${index + 1} can take the party`).toBeGreaterThanOrEqual(PARTY.adults);
        expect(selection.costMinor, `${label} stop ${index + 1} cost is the offer total`).toBe(offer.totalAmountMinor);
      });

      const expectedTotal = body.selections.reduce((sum: number, s: any) => sum + s.costMinor, 0);
      expect(body.totalCostMinor, `${label} total is the sum of its stays`).toBe(expectedTotal);
      expect(body.costPerNightMinor, `${label} cost per night`).toBe(Math.round(expectedTotal / totalNights));

      const expectedSelling = sellFromCost(expectedTotal, body.currency, pricing);
      expect(pkg.pricing.sellingPriceMinor, `${label} selling price follows the pricing rules`).toBe(expectedSelling);
      expect(pkg.pricing.sellingPriceMinor, `${label} selling price covers cost`).toBeGreaterThanOrEqual(expectedTotal);

      expect(body.budgetDifferenceMinor, `${label} budget difference is the budget minus the selling price`).toBe(BUDGET_MINOR - expectedSelling);
      expect(body.withinBudget, `${label} within-budget flag`).toBe(expectedSelling <= BUDGET_MINOR);

      const signature = body.selections.map((s: any) => s.offer.offerId).join("|");
      expect(signatures.has(signature), `${label} is not a duplicate of another package`).toBe(false);
      signatures.add(signature);
    }
  });
  it("keeps the budget comparison in step with the selling price when pricing changes after the run", async () => {
    const h = new Harness();
    const owner = await h.register("Package Repricing", "tour_operator", "package-repricing@example.com");
    await seedHillCountry(owner);
    await owner.ok("PUT", "/organization/integrations", { externalProviders: { hotelbeds: false } });
    const trip = await owner.ok<any>("POST", "/trips", {
      title: "Repricing",
      party: PARTY,
      budgetCurrency: "USD",
      budgetAmountMinor: BUDGET_MINOR,
      budgetScope: "accommodation_only",
      arrivalDate: STOPS[0]!.arrivalDate,
      departureDate: STOPS[1]!.departureDate,
    });
    await owner.ok("PUT", `/trips/${trip.id}/itinerary`, { confirm: true, stops: STOPS });
    await owner.ok("POST", `/trips/${trip.id}/optimisations`, { constraints: { includeExternalProviders: false } });
    await h.settle();
    await owner.ok("PUT", "/organization/pricing", { ...pricingConfigSchema.parse({}), mode: "percent_markup", markupBp: 4_000 });
    const { packages } = await owner.ok<any>("GET", `/trips/${trip.id}/packages`);
    const pkg = packages[0];
    const expectedSelling = sellFromCost(pkg.package.totalCostMinor, pkg.package.currency, { ...pricingConfigSchema.parse({}), mode: "percent_markup", markupBp: 4_000 });
    expect(pkg.pricing.sellingPriceMinor).toBe(expectedSelling);
    expect(pkg.package.budgetDifferenceMinor, "budget difference shown with the price must use the current selling price").toBe(BUDGET_MINOR - expectedSelling);
  });
  it("keeps the stored total and its explanation in agreement after a live price check", async () => {
    const h = new Harness();
    const owner = await h.register("Package Recheck", "tour_operator", "package-recheck@example.com");
    await seedHillCountry(owner);
    await owner.ok("PUT", "/organization/integrations", { externalProviders: { hotelbeds: false } });
    const trip = await owner.ok<any>("POST", "/trips", {
      title: "Recheck",
      party: PARTY,
      budgetCurrency: "USD",
      budgetAmountMinor: BUDGET_MINOR,
      budgetScope: "accommodation_only",
      arrivalDate: STOPS[0]!.arrivalDate,
      departureDate: STOPS[1]!.departureDate,
    });
    await owner.ok("PUT", `/trips/${trip.id}/itinerary`, { confirm: true, stops: STOPS });
    await owner.ok("POST", `/trips/${trip.id}/optimisations`, { constraints: { includeExternalProviders: false } });
    await h.settle();
    const first = (await owner.ok<any>("GET", `/trips/${trip.id}/packages`)).packages[0];
    await owner.ok("POST", `/packages/${first.id}/validate`, {});
    const after = (await owner.ok<any>("GET", `/trips/${trip.id}/packages`)).packages.find((pkg: any) => pkg.id === first.id);
    const cost = after.package.selections.reduce((sum: number, s: any) => sum + s.costMinor, 0);
    expect(after.package.totalCostMinor).toBe(cost);
    expect(after.package.explanation).toContain(`Total accommodation cost ${formatMoney(cost, after.package.currency)} for ${after.package.selections.reduce((sum: number, s: any) => sum + s.offer.nights, 0)} nights (${formatMoney(after.package.costPerNightMinor, after.package.currency)} per night).`);
  });
});

