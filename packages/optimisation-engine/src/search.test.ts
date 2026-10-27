import { describe, expect, it } from "vitest";
import type { HotelCategory, MealPlan, NormalisedOffer, RouteLeg } from "@tripweave/shared";
import { evaluateSelection, runSearch, type HardConstraints, type SearchInput, type SearchStop } from "./index";

const stops: SearchStop[] = [
  { id: "s1", destination: "Kandy", latitude: 7.2906, longitude: 80.6337, arrivalDate: "2026-12-10", departureDate: "2026-12-11", nights: 1 },
  { id: "s2", destination: "Nuwara Eliya", latitude: 6.9497, longitude: 80.7891, arrivalDate: "2026-12-11", departureDate: "2026-12-12", nights: 1 },
  { id: "s3", destination: "Ella", latitude: 6.8667, longitude: 81.0466, arrivalDate: "2026-12-12", departureDate: "2026-12-13", nights: 1 },
];

interface O {
  id: string;
  stop: number;
  price: number;
  category?: HotelCategory | null;
  review?: number | null;
  meal?: MealPlan;
  mealUnconfirmed?: boolean;
  refundable?: boolean | null;
  amenities?: string[];
  currency?: string;
  availability?: NormalisedOffer["availabilityStatus"];
  expiresAt?: string | null;
  preferred?: boolean;
  source?: NormalisedOffer["source"];
  maxOcc?: number;
  verification?: NormalisedOffer["verificationStatus"];
}

function offer(o: O): NormalisedOffer {
  const s = stops[o.stop]!;
  return {
    offerId: o.id,
    providerKey: "internal",
    externalOfferReference: o.id,
    source: o.source ?? "internal",
    supplierId: "sup",
    supplierName: "Supplier",
    property: {
      id: `prop-${o.id}`,
      name: `Hotel ${o.id}`,
      destination: s.destination,
      latitude: s.latitude! + 0.01,
      longitude: s.longitude! + 0.01,
      category: o.category === undefined ? "comfort" : o.category,
      starRating: null,
      reviewScore: o.review === undefined ? 8 : o.review,
      amenities: o.amenities ?? ["wifi", "pool"],
      ownerOrganizationId: null,
      preferredPartner: o.preferred ?? false,
    },
    roomType: { id: `rt-${o.id}`, name: "Deluxe", maxOccupancy: o.maxOcc ?? 3, maxAdults: 2 },
    stayStart: s.arrivalDate,
    stayEnd: s.departureDate,
    nights: 1,
    mealPlan: o.meal ?? "BB",
    mealPlanStatus: o.mealUnconfirmed ? "unconfirmed" : undefined,
    roomsRequired: 1,
    occupancy: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
    totalAmountMinor: o.price,
    currency: o.currency ?? "USD",
    taxAmountMinor: null,
    feeAmountMinor: null,
    taxesIncluded: true,
    cancellation: { refundable: o.refundable === undefined ? true : o.refundable, freeCancellationUntil: "2026-12-01" },
    payment: { type: "credit" },
    retrievedAt: "2026-10-01T00:00:00Z",
    expiresAt: o.expiresAt ?? null,
    availabilityStatus: o.availability ?? "confirmed",
    verificationStatus: o.verification ?? "company_managed",
    isMock: false,
  };
}

const constraints = (c: Partial<HardConstraints> = {}): HardConstraints => ({
  budgetMinor: null,
  strictBudget: true,
  maxLegDurationMinutes: null,
  minimumCategory: null,
  requiredAmenities: [],
  requiredMealPlans: [],
  requireFreeCancellation: false,
  requireConfirmedAvailability: false,
  allowUnconfirmedMealPlans: false,
  ...c,
});

const legs: RouteLeg[] = [
  { fromStopId: "s1", toStopId: "s2", distanceKm: 80, durationMinutes: 150, source: "routing_api" },
  { fromStopId: "s2", toStopId: "s3", distanceKm: 55, durationMinutes: 140, source: "routing_api" },
];

const pool: O[] = [
  { id: "k-cheap", stop: 0, price: 4_000, category: "budget", review: 6.5, refundable: false, amenities: ["wifi"] },
  { id: "k-mid", stop: 0, price: 9_000, category: "comfort", review: 8.2 },
  { id: "k-boutique", stop: 0, price: 14_000, category: "boutique", review: 9.1, amenities: ["wifi", "pool", "spa", "view"] },
  { id: "k-lux", stop: 0, price: 28_000, category: "luxury", review: 9.5, amenities: ["wifi", "pool", "spa", "view", "gym"] },
  { id: "k-pref", stop: 0, price: 8_500, category: "comfort", review: 7.9, preferred: true },
  { id: "n-cheap", stop: 1, price: 5_000, category: "standard", review: 7.0 },
  { id: "n-mid", stop: 1, price: 10_000, category: "comfort", review: 8.0 },
  { id: "n-boutique", stop: 1, price: 15_000, category: "boutique", review: 9.0, amenities: ["wifi", "pool", "spa", "view"] },
  { id: "n-lux", stop: 1, price: 30_000, category: "luxury", review: 9.4, amenities: ["wifi", "pool", "spa", "view", "gym"] },
  { id: "e-cheap", stop: 2, price: 4_500, category: "budget", review: 7.2 },
  { id: "e-mid", stop: 2, price: 9_500, category: "comfort", review: 8.3 },
  { id: "e-boutique", stop: 2, price: 16_000, category: "boutique", review: 9.3, amenities: ["wifi", "pool", "spa", "view"] },
  { id: "e-lux", stop: 2, price: 32_000, category: "luxury", review: 9.6, amenities: ["wifi", "pool", "spa", "view", "gym"] },
];

function input(over: Partial<SearchInput> = {}, offers: O[] = pool): SearchInput {
  const byStop: Record<string, NormalisedOffer[]> = { s1: [], s2: [], s3: [] };
  for (const o of offers) byStop[stops[o.stop]!.id]!.push(offer(o));
  return {
    stops,
    candidatesByStop: byStop,
    party: { adults: 2, children: 0, rooms: [{ adults: 2, children: 0 }] },
    constraints: constraints(),
    preferredAmenities: ["spa"],
    currency: "USD",
    convert: (m, from) => (from === "USD" ? m : from === "LKR" ? Math.round(m / 300) : null),
    legs,
    objectives: ["budget_explorer", "best_value", "comfort_journey", "premium_experience", "company_preferred"],
    now: () => Date.parse("2026-10-27T00:00:00Z"),
    ...over,
  };
}

describe("runSearch", () => {
  it("generates genuinely different packages per objective", () => {
    const r = runSearch(input());
    expect(r.infeasible).toBeNull();
    expect(r.packages.length).toBeGreaterThanOrEqual(4);
    const sigs = new Set(r.packages.map((p) => p.signature));
    expect(sigs.size).toBe(r.packages.length);
    const budget = r.packages.find((p) => p.objective === "budget_explorer")!;
    const premium = r.packages.find((p) => p.objective === "premium_experience")!;
    expect(budget.totalCostMinor).toBe(4_000 + 5_000 + 4_500);
    expect(premium.totalCostMinor).toBeGreaterThan(budget.totalCostMinor * 2);
    for (const p of r.packages) {
      expect(p.totalCostMinor).toBe(p.selections.reduce((s, x) => s + x.costMinor, 0));
      expect(p.selections).toHaveLength(3);
      expect(p.explanation.length).toBeGreaterThan(3);
    }
  });

  it("company preferred objective favours preferred partners", () => {
    const r = runSearch(input({ objectives: ["company_preferred"] }));
    expect(r.packages[0]!.selections[0]!.offer.offerId).toBe("k-pref");
  });

  it("respects a strict budget (never exceeds it)", () => {
    const r = runSearch(input({ constraints: constraints({ budgetMinor: 25_000 }) }));
    expect(r.packages.length).toBeGreaterThan(0);
    for (const p of r.packages) {
      expect(p.totalCostMinor).toBeLessThanOrEqual(25_000);
      expect(p.withinBudget).toBe(true);
    }
  });

  it("reports minimum budget and suggestions when infeasible", () => {
    const r = runSearch(input({ constraints: constraints({ budgetMinor: 10_000 }) }));
    expect(r.packages).toHaveLength(0);
    expect(r.infeasible).not.toBeNull();
    expect(r.infeasible!.reasons.length).toBeGreaterThan(0);
  });

  it("does not silently relax mandatory meal plan; explains and suggests relaxation", () => {
    const offers = pool.map((o) => (o.stop === 2 ? { ...o, meal: "RO" as MealPlan } : o));
    const r = runSearch(input({ constraints: constraints({ requiredMealPlans: ["BB"] }) }, offers));
    expect(r.packages).toHaveLength(0);
    expect(r.funnel[2]!.accepted).toBe(0);
    expect(r.infeasible!.suggestions.join(" ")).toMatch(/meal plan/i);
  });

  it("accepts an unpublished meal plan only when explicitly allowed, and flags it", () => {
    const offers = pool.map((o): O => (o.stop === 2 ? { ...o, meal: "RO" as MealPlan, mealUnconfirmed: true } : o));
    const r = runSearch(input({ constraints: constraints({ requiredMealPlans: ["BB"] }) }, offers));
    expect(r.funnel[2]!.rejections.meal_plan).toBeGreaterThan(0);
    expect(r.funnel[2]!.accepted).toBe(0);
    expect(r.packages).toHaveLength(0);

    const allowed = runSearch(input({ constraints: constraints({ requiredMealPlans: ["BB"], allowUnconfirmedMealPlans: true }) }, offers));
    expect(allowed.funnel[2]!.rejections.meal_plan ?? 0).toBe(0);
    expect(allowed.packages.length).toBeGreaterThan(0);
    expect(allowed.packages[0]!.assumptions.join(" ")).toMatch(/must be confirmed/i);
  });

  it("accepts an unpublished meal plan when no meal plan is required, and flags it", () => {
    const offers = pool.map((o): O => (o.stop === 2 ? { ...o, meal: "RO" as MealPlan, mealUnconfirmed: true } : o));
    const r = runSearch(input({}, offers));
    expect(r.funnel[2]!.rejections.meal_plan ?? 0).toBe(0);
    expect(r.packages.length).toBeGreaterThan(0);
    expect(r.packages[0]!.assumptions.join(" ")).toMatch(/must be confirmed/i);
  });

  it("rejects expired, unavailable and (when required) unconfirmed offers", () => {
    const offers: O[] = [
      { id: "k1", stop: 0, price: 1000, expiresAt: "2026-10-01T00:00:00Z" },
      { id: "k2", stop: 0, price: 1000, availability: "unavailable" },
      { id: "k3", stop: 0, price: 1000, availability: "unknown" },
      { id: "n1", stop: 1, price: 1000 },
      { id: "e1", stop: 2, price: 1000 },
    ];
    const r = runSearch(input({ constraints: constraints({ requireConfirmedAvailability: true }) }, offers));
    expect(r.funnel[0]!.accepted).toBe(0);
    expect(r.funnel[0]!.rejections.expired).toBe(1);
    expect(r.funnel[0]!.rejections.unavailable).toBe(1);
    expect(r.funnel[0]!.rejections.availability_unconfirmed).toBeGreaterThanOrEqual(1);
    const loose = runSearch(input({}, offers));
    expect(loose.funnel[0]!.accepted).toBe(1); // unknown availability accepted but flagged
    expect(loose.packages[0]!.unverified.some((u) => /availability/.test(u))).toBe(true);
  });

  it("does not treat unrated hotels as perfect", () => {
    const offers: O[] = [
      { id: "k-unrated", stop: 0, price: 9_000, category: null, review: null },
      { id: "k-rated", stop: 0, price: 9_000, category: "comfort", review: 8 },
      { id: "n1", stop: 1, price: 9_000 },
      { id: "e1", stop: 2, price: 9_000 },
    ];
    const r = runSearch(input({ objectives: ["comfort_journey"] }, offers));
    expect(r.packages[0]!.selections[0]!.offer.offerId).toBe("k-rated");
    const unrated = runSearch(input({ objectives: ["comfort_journey"] }, offers.filter((o) => o.id !== "k-rated")));
    expect(unrated.packages[0]!.assumptions.join(" ")).toMatch(/no verified guest rating/);
  });

  it("enforces maximum journey duration as a hard constraint", () => {
    const r = runSearch(input({ constraints: constraints({ maxLegDurationMinutes: 120 }) }));
    expect(r.packages).toHaveLength(0);
    expect(r.infeasible!.reasons.some((x) => x.code === "route_constraint")).toBe(true);
  });

  it("converts currencies and handles unconvertible offers", () => {
    const offers: O[] = [
      { id: "k1", stop: 0, price: 3_000_000, currency: "LKR" },
      { id: "k2", stop: 0, price: 1_000, currency: "JPY" },
      { id: "n1", stop: 1, price: 5_000 },
      { id: "e1", stop: 2, price: 5_000 },
    ];
    const r = runSearch(input({ objectives: ["budget_explorer"] }, offers));
    expect(r.funnel[0]!.rejections.currency).toBe(1);
    expect(r.packages[0]!.selections[0]!.costMinor).toBe(10_000);
  });

  it("requires adequate room capacity and free cancellation when asked", () => {
    const small = pool.map((o) => ({ ...o, maxOcc: 1 }));
    expect(runSearch(input({}, small)).packages).toHaveLength(0);
    const nonref = pool.map((o) => ({ ...o, refundable: false }));
    const r = runSearch(input({ constraints: constraints({ requireFreeCancellation: true }) }, nonref));
    expect(r.packages).toHaveLength(0);
    expect(r.infeasible!.suggestions.join(" ")).toMatch(/non-refundable/i);
  });

  it("uses budget basis (selling price) for the budget check", () => {
    // 25% markup: cheapest valid cost 13,500 -> 16,875 selling; a 17,000 budget fits, 16,000 does not
    const r = runSearch(
      input({ constraints: constraints({ budgetMinor: 17_000 }), budgetBasis: (c) => Math.ceil(c * 1.25) }),
    );
    expect(r.packages.length).toBeGreaterThan(0);
    for (const p of r.packages) expect(Math.ceil(p.totalCostMinor * 1.25)).toBeLessThanOrEqual(17_000);
    const none = runSearch(input({ constraints: constraints({ budgetMinor: 16_000 }), budgetBasis: (c) => Math.ceil(c * 1.25) }));
    expect(none.packages).toHaveLength(0);
    expect(none.infeasible!.minimumBudgetMinor).toBe(Math.ceil(13_500 * 1.25));
  });

  it("falls back to greedy search on timeout and flags it", () => {
    let t = 0;
    const r = runSearch(input({ config: { timeoutMs: 5 }, now: () => (t += 10) }));
    expect(r.stats.timedOut).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/time limit/);
    expect(r.packages.length).toBeGreaterThan(0);
  });

  it("never enumerates the full cartesian product", () => {
    const many: O[] = [];
    for (let s = 0; s < 3; s++) for (let i = 0; i < 60; i++) many.push({ id: `h${s}-${i}`, stop: s, price: 5_000 + i * 100, review: 5 + (i % 5) });
    const r = runSearch(input({ config: { beamWidth: 10, candidateLimitPerStop: 8 } }, many));
    expect(r.stats.combinationsEvaluated).toBeLessThan(5 * 3 * 10 * 12);
    expect(r.packages.length).toBeGreaterThan(0);
  });
});

describe("evaluateSelection", () => {
  it("validates a manual replacement and reprices", () => {
    const base = input();
    const picks = {
      s1: base.candidatesByStop.s1!.find((o) => o.offerId === "k-mid")!,
      s2: base.candidatesByStop.s2!.find((o) => o.offerId === "n-mid")!,
      s3: base.candidatesByStop.s3!.find((o) => o.offerId === "e-boutique")!,
    };
    const ok = evaluateSelection(base, picks, "best_value");
    expect(ok.ok).toBe(true);
    expect(ok.package!.totalCostMinor).toBe(9_000 + 10_000 + 16_000);
  });
  it("rejects replacements that violate hard constraints", () => {
    const base = input({ constraints: constraints({ requiredMealPlans: ["BB"] }) });
    const bad = { ...base.candidatesByStop.s3![0]!, offerId: "bad", mealPlan: "RO" as MealPlan };
    const res = evaluateSelection(
      base,
      { s1: base.candidatesByStop.s1![0]!, s2: base.candidatesByStop.s2![0]!, s3: bad },
      "best_value",
    );
    expect(res.ok).toBe(false);
    expect(res.violations[0]!.reasons).toContain("meal_plan");
  });
  it("rejects over-budget replacement under a strict budget", () => {
    const base = input({ constraints: constraints({ budgetMinor: 20_000 }) });
    const res = evaluateSelection(
      base,
      { s1: base.candidatesByStop.s1!.find((o) => o.offerId === "k-lux")!, s2: base.candidatesByStop.s2![0]!, s3: base.candidatesByStop.s3![0]! },
      "premium_experience",
    );
    expect(res.ok).toBe(false);
  });
});
