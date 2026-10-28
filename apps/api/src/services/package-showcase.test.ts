import { describe, expect, it } from "vitest";
import type { PackageShowcaseSnapshot, PlanningPackageView, PlanningHotelOffer } from "@tripweave/planning-contract";
import type { NormalisedOffer } from "@tripweave/shared";
import { PACKAGE_SHOWCASE_EXAMPLES, buildPackageShowcaseContext } from "@tripweave/ai";
import { buildPackageFallbackProgram, validatePackageShowcaseProgram } from "./package-showcase";

function offer(overrides: { offerId: string; name: string; destination?: string; stayStart?: string; stayEnd?: string }): NormalisedOffer {
  const { name, destination = "Kandy", ...rest } = overrides;
  return {
    providerKey: "google_hotels",
    externalOfferReference: rest.offerId,
    source: "external",
    supplierId: null,
    supplierName: "Google Hotels",
    property: { id: `property-${rest.offerId}`, name, destination, latitude: 7.29, longitude: 80.64, category: "boutique", starRating: 4, reviewScore: 8.8, amenities: [], ownerOrganizationId: null },
    roomType: { id: "room_1", name: "Deluxe Double", maxOccupancy: 2, maxAdults: 2 },
    stayStart: "2026-12-10",
    stayEnd: "2026-12-12",
    nights: 2,
    mealPlan: "BB",
    mealPlanStatus: "confirmed",
    roomsRequired: 1,
    occupancy: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
    totalAmountMinor: 30_000,
    currency: "USD",
    taxAmountMinor: null,
    feeAmountMinor: null,
    taxesIncluded: true,
    cancellation: { refundable: true, freeCancellationUntil: "2026-12-05" },
    payment: { type: "credit" },
    retrievedAt: "2026-10-27T10:00:00.000Z",
    expiresAt: null,
    availabilityStatus: "confirmed",
    verificationStatus: "verified",
    isMock: false,
    ...rest,
  } as unknown as NormalisedOffer;
}

function packageView(ref: string, number: number, objective: string, offers: NormalisedOffer[], overrides: Partial<PlanningPackageView> = {}): PlanningPackageView {
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
    verification: { status: "verified", allVerified: true, checkedAt: "2026-10-27T10:00:00.000Z", validUntil: "2026-10-28T12:00:00.000Z", checks: [] },
    package: {
      objective,
      selections: offers.map((o, index) => ({ stopId: `stop_${index + 1}`, destination: o.property.destination, offer: o, coverImageId: null })),
      currency: "USD",
      budgetDifferenceMinor: 5_000,
      withinBudget: true,
      objectiveScore: 80,
      score: 82,
      breakdown: { budgetFit: 0.9, quality: 0.8, location: 0.7, amenities: 0.6, cancellation: 1, preference: 0.5, value: 0.8 },
      travel: { legs: [], totalDriveMinutes: 0, anyEstimated: false, anyUnavailable: false },
      assumptions: [],
      unverified: [],
      explanation: ["Within budget with free cancellation."],
    },
    pricing: { currency: "USD", sellingPriceMinor: 36_000, totalPayableMinor: 36_000, sellingTaxMinor: 0, warnings: [] },
    ...overrides,
  } as PlanningPackageView;
}

const hotelA = offer({ offerId: "offer-a", name: "Lakeside Heritage Kandy" });
const hotelB = offer({ offerId: "offer-b", name: "Hill Terrace Ella", destination: "Ella", stayStart: "2026-12-12", stayEnd: "2026-12-14" });
const hotelC = offer({ offerId: "offer-c", name: "Tea Valley Lodge", destination: "Ella" });

/** Two packages share offer-a, so the offer lists both package refs, as in a real run. */
const packageA = packageView("pkg_1", 1, "best_value", [hotelA, hotelB]);
const packageB = packageView("pkg_2", 2, "lowest_price", [hotelA, hotelC]);

function offerView(ref: string, o: NormalisedOffer, packageIds: string[]) {
  return { ref, offerId: o.offerId, packageIds, stopId: "stop_1", destination: o.property.destination, offer: o, coverImageId: null };
}

const snapshot: PackageShowcaseSnapshot = {
  generatedAt: "2026-10-28T10:00:00.000Z",
  job: { id: "job_1", completedAt: "2026-10-27T10:05:00.000Z", notices: ["The stated budget covers the whole trip."] },
  trip: {
    ref: "trip",
    id: "trip_1",
    title: "Hill country",
    arrivalDate: "2026-12-10",
    departureDate: "2026-12-14",
    party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
    budgetAmountMinor: 90_000,
    budgetCurrency: "USD",
    budgetScope: "all_inclusive_trip",
  },
  packages: [packageA, packageB],
  offers: [offerView("offer_1", hotelA, ["pkg_1-id", "pkg_2-id"]), offerView("offer_2", hotelB, ["pkg_1-id"]), offerView("offer_3", hotelC, ["pkg_2-id"])] as PlanningHotelOffer[],
  permissions: { canValidatePrices: true, canCreateQuotes: true, canRunOptimisation: true, canSeeMargins: false, canSeeContracts: false },
  allowedActions: ["open_itinerary", "validate_package", "create_quote", "open_optimise"],
  allowlist: [],
};

const validProgram = `root = PackageShowcase("Two ways through the hill country", [opening, card, compare, live, next], "The first option balances budget and location.", "two options")
opening = Lead("The first option balances the budget with the strongest location.")
card = PackageCard("pkg_1", "lead")
compare = PackageCompare(["pkg_1", "pkg_2"], "Side by side")
live = LivePriceStatus("pkg_1")
next = NextSteps()`;

/** Asserts validity and prints every error on failure, not a truncated object. */
function expectNoErrors(program: string, target: PackageShowcaseSnapshot = snapshot) {
  const result = validatePackageShowcaseProgram(program, target);
  expect(result.ok ? [] : result.errors).toEqual([]);
}

describe("package showcase validation", () => {
  it("accepts a program that references only snapshot packages and offers", () => {
    expectNoErrors(validProgram);
  });

  it("accepts the deterministic fallback for one or several packages", () => {
    expectNoErrors(buildPackageFallbackProgram(snapshot));
    expectNoErrors(buildPackageFallbackProgram(snapshot, "invalid"));
    const single = { ...snapshot, packages: [packageA] };
    expectNoErrors(buildPackageFallbackProgram(single, "unavailable"), single);
  });

  it("accepts every example once its placeholder refs point at real snapshot entities", () => {
    const refs: Record<string, string> = { REF_PACKAGE_A: "pkg_1", REF_PACKAGE_B: "pkg_2", REF_OFFER_A: "offer_1" };
    for (const example of PACKAGE_SHOWCASE_EXAMPLES) {
      const filled = example.replace(/REF_(?:PACKAGE_[AB]|OFFER_A)/g, (match) => refs[match]!);
      expectNoErrors(filled);
    }
  });

  it("rejects a placeholder ref that was copied from the examples unchanged", () => {
    const result = validatePackageShowcaseProgram(PACKAGE_SHOWCASE_EXAMPLES[0]!, snapshot);
    expect(result.ok).toBe(false);
  });

  it("rejects unknown components and tool calls", () => {
    const unknown = validatePackageShowcaseProgram(`root = PackageShowcase("x", [evil])\nevil = Evil("y")`, snapshot);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.errors.join(" ")).toMatch(/Evil/);
    const query = validatePackageShowcaseProgram(`root = PackageShowcase("x", [card])\ncard = PackageCard("pkg_1")\nq = Query("tool", {})`, snapshot);
    expect(query.ok).toBe(false);
  });

  it("rejects package and offer references the snapshot does not contain", () => {
    const badPackage = validatePackageShowcaseProgram(`root = PackageShowcase("x", [card])\ncard = PackageCard("pkg_9")`, snapshot);
    expect(badPackage.ok).toBe(false);
    if (!badPackage.ok) expect(badPackage.errors.join(" ")).toMatch(/unknown package/);
    const badOffer = validatePackageShowcaseProgram(`root = PackageShowcase("x", [stay, card])\nstay = HotelStay("offer_99")\ncard = PackageCard("pkg_1")`, snapshot);
    expect(badOffer.ok).toBe(false);
  });

  it("rejects a hotel that belongs to a different package than the one named", () => {
    const mismatched = validatePackageShowcaseProgram(`root = PackageShowcase("x", [stay, card])\nstay = HotelStay("offer_3", "pkg_1")\ncard = PackageCard("pkg_1")`, snapshot);
    expect(mismatched.ok).toBe(false);
    if (!mismatched.ok) expect(mismatched.errors.join(" ")).toMatch(/does not belong/);
  });

  it("requires at least one package-bearing block when packages exist", () => {
    const noPackages = validatePackageShowcaseProgram(`root = PackageShowcase("x", [lead, next])\nlead = Lead("Plan the trip.")\nnext = NextSteps()`, snapshot);
    expect(noPackages.ok).toBe(false);
    if (!noPackages.ok) expect(noPackages.errors.join(" ")).toMatch(/PackageCard or PackageCompare/);
  });

  it("rejects comparisons with one package or a package listed twice", () => {
    const duplicate = validatePackageShowcaseProgram(`root = PackageShowcase("x", [compare])\ncompare = PackageCompare(["pkg_1", "pkg_1"])`, snapshot);
    expect(duplicate.ok).toBe(false);
    const single = validatePackageShowcaseProgram(`root = PackageShowcase("x", [compare])\ncompare = PackageCompare(["pkg_1"])`, snapshot);
    expect(single.ok).toBe(false);
  });

  it("rejects prices, percentages, ratings and links written as text", () => {
    const cases = [
      `Lead("Save USD 300 on this stay.")`,
      `Lead("It costs $450 a night.")`,
      `Lead("About 320 dollars in total.")`,
      `Lead("Take 15% off the total.")`,
      `Lead("A 9.1/10 review score.")`,
      `Lead("A 5-star hotel with a pool.")`,
      `Lead("See https://example.com for rates.")`,
    ];
    for (const text of cases) {
      const program = `root = PackageShowcase("x", [lead, card])\nlead = ${text}\ncard = PackageCard("pkg_1")`;
      const result = validatePackageShowcaseProgram(program, snapshot);
      expect(result.ok, text).toBe(false);
      if (!result.ok) expect(result.errors.join(" ")).toMatch(/prices, ratings, percentages or URLs/);
    }
  });

  it("allows plain descriptive text, numbers that are not claims, and handwritten notes", () => {
    const program = `root = PackageShowcase("Three nights in the hills", [lead, card, note], "Two packages, one clear favourite.", "walk early")\nlead = Lead("The first option is the calmer choice for a relaxed pace.")\ncard = PackageCard("pkg_1", "lead")\nnote = Note("tip", "Pack layers", "Mornings are cooler on the hill country roads.")`;
    expectNoErrors(program);
  });

  it("returns an error rather than throwing on an empty or oversized program", () => {
    expect(validatePackageShowcaseProgram("   ", snapshot).ok).toBe(false);
    expect(validatePackageShowcaseProgram("x".repeat(40_001), snapshot).ok).toBe(false);
  });
});

describe("package showcase context", () => {
  it("passes refs, facts and live state to the model, and never a missing price as a value", () => {
    const context = buildPackageShowcaseContext(snapshot, "two adults, relaxed pace");
    expect(context.reader.focus).toBe("two adults, relaxed pace");
    expect(context.packages.map((pkg) => pkg.id)).toEqual(["pkg_1", "pkg_2"]);
    expect(context.packages[0]!.liveChecked).toBe(true);
    expect(context.packages[0]!.stays.map((stay) => stay.offerId)).toEqual(["offer_1", "offer_2"]);
    const unpriced = buildPackageShowcaseContext({ ...snapshot, packages: [{ ...packageB, pricing: null }] });
    expect(unpriced.packages[0]!.sellingPriceMinor).toBeNull();
  });

  it("marks a package as not live-checked once its validity window has passed", () => {
    const stale = { ...packageA, verification: { ...packageA.verification, validUntil: "2026-10-27T09:00:00.000Z" } };
    const context = buildPackageShowcaseContext({ ...snapshot, packages: [stale, packageB] });
    expect(context.packages[0]!.liveChecked).toBe(false);
  });
});
