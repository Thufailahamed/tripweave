import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalisedOffer } from "@tripweave/shared";
import type { PriceCheckResult } from "@tripweave/provider-contracts";

vi.mock("@tripweave/database", () => ({
  trips: { getPackage: vi.fn(), updatePackageValidation: vi.fn() },
}));
vi.mock("../src/services/optimisation", () => ({
  loadJobSearchInput: vi.fn(),
  recheckOffer: vi.fn(),
}));

import { trips } from "@tripweave/database";
import { loadJobSearchInput, recheckOffer } from "../src/services/optimisation";
import { validatePackagePrices } from "../src/services/price-validation";

const NOW = new Date("2026-10-28T09:00:00.000Z");

function offer(id: string, total: number): NormalisedOffer {
  return {
    offerId: id,
    providerKey: "google_hotels",
    externalOfferReference: id,
    source: "external",
    supplierId: null,
    supplierName: "Booking.com via Google Hotels",
    property: { id: `g:${id}`, name: `Hotel ${id}`, destination: "Kandy", latitude: null, longitude: null, category: "comfort", starRating: 3, reviewScore: 8, amenities: [], ownerOrganizationId: null },
    roomType: { id: null, name: "Room", maxOccupancy: 2, maxAdults: 1 },
    stayStart: "2027-03-05",
    stayEnd: "2027-03-09",
    nights: 4,
    mealPlan: "BB",
    mealPlanStatus: "confirmed",
    roomsRequired: 2,
    occupancy: { adults: 2, children: 2, childAges: [8, 11], rooms: [{ adults: 1, children: 1 }, { adults: 1, children: 1 }] },
    totalAmountMinor: total,
    currency: "USD",
    taxAmountMinor: null,
    feeAmountMinor: null,
    taxesIncluded: null,
    cancellation: { refundable: true, freeCancellationUntil: null },
    payment: { type: "unknown" },
    retrievedAt: "2026-10-28T08:50:00.000Z",
    expiresAt: null,
    availabilityStatus: "unknown",
    verificationStatus: "supplier_reported",
    providerMetadata: {},
    isMock: false,
  };
}

const rec = {
  id: "p1", jobId: "j1", parentId: null, number: 1, objective: "budget_explorer", totalCostMinor: 60_000, currency: "USD",
  score: 0, objectiveScore: 0, breakdown: {}, feasibility: "feasible", manuallyModified: false, createdAt: NOW.toISOString(),
  verification: {},
  package: {
    objective: "budget_explorer", currency: "USD", totalCostMinor: 60_000,
    unverified: ["Hotel a: price has not been live-checked.", "Hotel a: availability is unknown, not confirmed."],
    explanation: ["Hotel a: supplier-reported rate (not price-checked)"],
    selections: [
      { stopId: "s1", destination: "Kandy", costMinor: 20_000, offer: offer("a", 20_000), metrics: {} },
      { stopId: "s2", destination: "Ella", costMinor: 20_000, offer: offer("b", 20_000), metrics: {} },
      { stopId: "s3", destination: "Galle", costMinor: 20_000, offer: offer("c", 20_000), metrics: {} },
    ],
  },
};

const ctx = { env: {}, db: {}, deps: { now: () => NOW } } as never;
const base = { input: { party: rec.package.selections[0]!.offer.occupancy, convert: (amount: number) => amount } };

const result = (status: PriceCheckResult["status"], total: number | null, previous: number): PriceCheckResult => ({
  status,
  offer: status === "unavailable" ? null : { ...offer("x", total ?? 0) },
  previousTotalMinor: previous,
  currentTotalMinor: total,
  checkedAt: NOW.toISOString(),
});

describe("package live-price validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trips.getPackage).mockResolvedValue(rec as never);
    vi.mocked(loadJobSearchInput).mockResolvedValue(base as never);
    vi.mocked(trips.updatePackageValidation).mockResolvedValue(true);
  });

  it("updates the package and records a 15-minute verification when every external check passes", async () => {
    vi.mocked(recheckOffer)
      .mockResolvedValueOnce(result("confirmed", 20_000, 20_000))
      .mockResolvedValueOnce(result("price_changed", 21_000, 20_000))
      .mockResolvedValueOnce(result("confirmed", 20_000, 20_000));

    const out = await validatePackagePrices(ctx, "org", "p1");
    expect(out.verification).toMatchObject({ status: "verified", allVerified: true, validUntil: "2026-10-28T09:15:00.000Z" });
    expect(out.changed).toBe(true);
    expect(out.pkg.totalCostMinor).toBe(61_000);
    expect(out.pkg.unverified).toEqual(["Hotel a: availability is unknown, not confirmed."]);
    expect(out.pkg.explanation?.[0]).toContain("live-checked rate");
    expect(trips.updatePackageValidation).toHaveBeenCalledWith(expect.anything(), "org", "p1", expect.objectContaining({ totalCostMinor: 61_000, packageJson: expect.objectContaining({ totalCostMinor: 61_000 }) }));
  });

  it("does not update package prices when one external check fails", async () => {
    vi.mocked(recheckOffer)
      .mockResolvedValueOnce(result("confirmed", 20_000, 20_000))
      .mockResolvedValueOnce(result("confirmed", 20_000, 20_000))
      .mockResolvedValueOnce(result("unavailable", null, 20_000));

    const out = await validatePackagePrices(ctx, "org", "p1");
    expect(out.verification).toMatchObject({ status: "failed", allVerified: false, validUntil: null });
    expect(out.pkg.totalCostMinor).toBe(60_000);
    expect(trips.updatePackageValidation).toHaveBeenCalledWith(expect.anything(), "org", "p1", expect.objectContaining({
      totalCostMinor: 60_000,
      packageJson: expect.objectContaining({ totalCostMinor: 60_000 }),
      verification: expect.objectContaining({ status: "failed" }),
    }));
  });
});
