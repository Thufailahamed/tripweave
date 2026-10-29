import { describe, expect, it } from "vitest";
import { Harness } from "./harness";

describe("optimisation run warnings", () => {
  it("warns when external providers are requested but no live supplier is available", async () => {
    const h = new Harness();
    const operator = await h.register("Synapstore", "tour_operator");
    const trip = await operator.ok("POST", "/trips", {
      title: "Kandy, Ella & Galle",
      arrivalDate: "2026-12-10",
      departureDate: "2026-12-12",
      party: { adults: 2, children: 2, childAges: [8, 11], rooms: [{ adults: 1, children: 1, childAges: [8] }, { adults: 1, children: 1, childAges: [11] }] },
      budgetAmountMinor: 400_000,
      budgetCurrency: "USD",
      budgetScope: "accommodation_only",
    });
    await operator.ok("PUT", `/trips/${trip.id}/itinerary`, {
      title: "Kandy",
      confirm: true,
      stops: [{ destination: "Kandy", latitude: 7.2906, longitude: 80.6337, arrivalDate: "2026-12-10", departureDate: "2026-12-12", activities: [] }],
    });

    const start = await operator.post(`/trips/${trip.id}/optimisations`, { constraints: { includeExternalProviders: true } });
    expect(start.status).toBe(202);
    await h.settle();

    const job = await operator.ok("GET", `/optimisations/${start.body.data.jobId}`);
    expect(job.result.warnings.join(" ")).toMatch(/no live external supplier/i);
  });
});
