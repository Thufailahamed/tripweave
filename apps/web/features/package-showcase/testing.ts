import type { PackageShowcaseSnapshot, PlanningHotelOffer, PlanningPackageView } from "@tripweave/planning-contract";
import { makeOffer } from "@/features/planning/testing";

/**
 * Two packages from one run. pkg_1 is within budget, live checked and all-internal. pkg_2 is over budget,
 * uses an external rate that has not been checked, so it cannot be quoted yet. Every number is fixed so
 * tests can assert the exact server values.
 */
export const KANDY_OFFER = makeOffer({ offerId: "offer-a", name: "Lakeside Heritage Kandy", destination: "Kandy" });
export const ELLA_OFFER = makeOffer({ offerId: "offer-b", name: "Hill Terrace Ella", destination: "Ella", stayStart: "2026-12-12", stayEnd: "2026-12-13", nights: 1, totalAmountMinor: 9000 });
export const TEA_VALLEY_OFFER = makeOffer({
  offerId: "offer-c",
  name: "Tea Valley Lodge",
  destination: "Ella",
  providerKey: "google_hotels",
  source: "external",
  stayStart: "2026-12-12",
  stayEnd: "2026-12-14",
  nights: 2,
  totalAmountMinor: 42000,
  mealPlan: "HB",
  mealPlanStatus: "unconfirmed",
});

const party = { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] };

export const LIVE_VALID_UNTIL = "2999-01-01T00:00:00.000Z";

export function selectionOf(stopId: string, offer: ReturnType<typeof makeOffer>) {
  return { stopId, destination: offer.property.destination, offer, coverImageId: null };
}

export function makePackage(ref: string, number: number, overrides: Partial<PlanningPackageView> & { selections: ReturnType<typeof selectionOf>[]; sellingPriceMinor: number; budgetDifferenceMinor: number | null; score: number; objective?: string; verified?: boolean; validUntil?: string | null }): PlanningPackageView {
  const { selections, sellingPriceMinor, budgetDifferenceMinor, score, objective = "best_value", verified = true, validUntil = LIVE_VALID_UNTIL, ...rest } = overrides;
  return {
    ref,
    id: `${ref}-id`,
    jobId: "job_1",
    parentId: null,
    number,
    objective,
    manuallyModified: false,
    feasibility: "feasible",
    createdAt: "2026-10-27T10:00:00.000Z",
    verification: { status: verified ? "verified" : "pending", allVerified: verified, checkedAt: "2026-10-27T10:00:00.000Z", validUntil, checks: selections.map((item) => ({ status: verified ? "confirmed" : "not_supported", stopId: item.stopId })) },
    package: {
      objective,
      selections,
      currency: "USD",
      budgetDifferenceMinor,
      withinBudget: budgetDifferenceMinor === null ? null : budgetDifferenceMinor >= 0,
      objectiveScore: score,
      score,
      breakdown: { budgetFit: 0.9, quality: 0.8, location: 0.7, amenities: 0.6, cancellation: 1, preference: 0.5, value: 0.8 },
      travel: { legs: [{ fromStopId: "stop_1", toStopId: "stop_2", durationMinutes: 150, distanceKm: 62, source: "routing_api" }], totalDriveMinutes: 150, anyEstimated: false, anyUnavailable: false },
      assumptions: ["Transfers use the main road."],
      unverified: verified ? [] : ["Rates for the Ella hotel have not been checked."],
      explanation: ["Within the trip budget.", "Free cancellation at the first hotel."],
    },
    pricing: { currency: "USD", sellingPriceMinor, totalPayableMinor: sellingPriceMinor, sellingTaxMinor: 0, warnings: [] },
    ...rest,
  } as PlanningPackageView;
}

export const PKG_1 = makePackage("pkg_1", 1, {
  selections: [selectionOf("stop_1", KANDY_OFFER), selectionOf("stop_2", ELLA_OFFER)],
  sellingPriceMinor: 36_000,
  budgetDifferenceMinor: 14_000,
  score: 84,
  objective: "best_value",
});

export const PKG_2 = makePackage("pkg_2", 2, {
  selections: [selectionOf("stop_1", KANDY_OFFER), selectionOf("stop_2", TEA_VALLEY_OFFER)],
  sellingPriceMinor: 52_000,
  budgetDifferenceMinor: -2_000,
  score: 91,
  objective: "comfort_journey",
  verified: false,
  validUntil: null,
});

function offerRef(offer: ReturnType<typeof makeOffer>, ref: string, packageIds: string[]): PlanningHotelOffer {
  return { ref, offerId: offer.offerId, packageIds, stopId: "stop_1", destination: offer.property.destination, offer, coverImageId: null };
}

export function makeShowcaseSnapshot(overrides: Partial<PackageShowcaseSnapshot> = {}): PackageShowcaseSnapshot {
  return {
    generatedAt: "2026-10-28T10:00:00.000Z",
    job: { id: "job_1", completedAt: "2026-10-27T10:05:00.000Z", notices: ["The budget covers accommodation only."] },
    trip: { ref: "trip", id: "trip_1", title: "Hill country", arrivalDate: "2026-12-10", departureDate: "2026-12-14", party, budgetAmountMinor: 50_000, budgetCurrency: "USD", budgetScope: "accommodation_only" },
    packages: [PKG_1, PKG_2],
    offers: [offerRef(KANDY_OFFER, "offer_1", ["pkg_1-id", "pkg_2-id"]), offerRef(ELLA_OFFER, "offer_2", ["pkg_1-id"]), offerRef(TEA_VALLEY_OFFER, "offer_3", ["pkg_2-id"])],
    permissions: { canValidatePrices: true, canCreateQuotes: true, canRunOptimisation: true, canSeeMargins: false, canSeeContracts: false },
    allowedActions: ["open_itinerary", "validate_package", "create_quote", "open_optimise"],
    allowlist: [],
    ...overrides,
  };
}
