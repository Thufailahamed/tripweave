import { describe, expect, it } from "vitest";
import { priceStay, selectRuleForDate, type RatePlanLike, type RateRuleLike } from "./rates";

const rule = (o: Partial<RateRuleLike> & { id: string }): RateRuleLike => ({
  applicableStartDate: "2026-12-01",
  applicableEndDate: "2027-03-31",
  amountMinor: 10_000,
  priority: 0,
  occupancyConditions: {},
  taxTreatment: { included: false, taxBp: 0, serviceChargeBp: 0 },
  extraPersonRules: { baseAdults: 2, extraAdultMinor: 0, extraChildMinor: 0, childFreeUnderAge: 0 },
  blackoutDates: [],
  ...o,
});
const plan: RatePlanLike = {
  id: "p",
  currency: "USD",
  pricingBasis: "per_room_per_night",
  minimumNights: 1,
  maximumNights: null,
  effectiveFrom: "2026-12-01",
  effectiveTo: "2027-03-31",
  status: "active",
};

describe("rate precedence", () => {
  it("prefers priority, then narrower span, then newer", () => {
    const seasonal = rule({ id: "a", amountMinor: 100 });
    const dated = rule({ id: "b", amountMinor: 200, applicableStartDate: "2026-12-24", applicableEndDate: "2026-12-26" });
    expect(selectRuleForDate([seasonal, dated], "2026-12-25", 2)!.id).toBe("b");
    expect(selectRuleForDate([seasonal, dated], "2026-12-28", 2)!.id).toBe("a");
    const hi = rule({ id: "c", priority: 5 });
    expect(selectRuleForDate([seasonal, dated, hi], "2026-12-25", 2)!.id).toBe("c");
    const older = rule({ id: "d", updatedAt: "2026-01-01" });
    const newer = rule({ id: "e", updatedAt: "2026-02-01" });
    expect(selectRuleForDate([older, newer], "2026-12-28", 2)!.id).toBe("e");
  });
  it("skips blackout dates and occupancy mismatches", () => {
    const r = rule({ id: "a", blackoutDates: ["2026-12-25"], occupancyConditions: { maxAdults: 2 } });
    expect(selectRuleForDate([r], "2026-12-25", 2)).toBeNull();
    expect(selectRuleForDate([r], "2026-12-26", 3)).toBeNull();
    expect(selectRuleForDate([r], "2026-12-26", 2)).not.toBeNull();
  });
});

describe("priceStay", () => {
  it("sums nights, rooms and handles tax/service charge", () => {
    const r = rule({ id: "a", amountMinor: 10_000, taxTreatment: { included: false, taxBp: 1_000, serviceChargeBp: 1_000 } });
    const res = priceStay(plan, [r], { checkIn: "2026-12-10", checkOut: "2026-12-12", rooms: [{ adults: 2, children: 0 }] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      // 10000 + 10% SC (1000) + 10% tax on 11000 (1100) = 12100 per night
      expect(res.totalMinor).toBe(24_200);
      expect(res.nightly).toHaveLength(2);
    }
  });
  it("charges extra adults and children", () => {
    const r = rule({ id: "a", extraPersonRules: { baseAdults: 2, extraAdultMinor: 3_000, extraChildMinor: 2_000, childFreeUnderAge: 5 } });
    const res = priceStay(plan, [r], { checkIn: "2026-12-10", checkOut: "2026-12-11", rooms: [{ adults: 3, children: 2, childAges: [3, 8] }] });
    expect(res.ok && res.totalMinor).toBe(10_000 + 3_000 + 2_000);
  });
  it("reports gaps, min nights and out-of-contract stays", () => {
    const r = rule({ id: "a", applicableEndDate: "2026-12-15" });
    expect(priceStay(plan, [r], { checkIn: "2026-12-14", checkOut: "2026-12-17", rooms: [{ adults: 2, children: 0 }] })).toMatchObject({ ok: false, reason: "no_rate_for_date" });
    expect(priceStay({ ...plan, minimumNights: 3 }, [r], { checkIn: "2026-12-10", checkOut: "2026-12-12", rooms: [{ adults: 2, children: 0 }] })).toMatchObject({ ok: false, reason: "below_minimum_nights" });
    expect(priceStay(plan, [r], { checkIn: "2026-11-30", checkOut: "2026-12-02", rooms: [{ adults: 2, children: 0 }] })).toMatchObject({ ok: false, reason: "plan_not_effective" });
  });
  it("per-person basis multiplies by chargeable guests", () => {
    const r = rule({ id: "a", amountMinor: 4_000 });
    const res = priceStay({ ...plan, pricingBasis: "per_person_per_night" }, [r], { checkIn: "2026-12-10", checkOut: "2026-12-11", rooms: [{ adults: 2, children: 0 }] });
    expect(res.ok && res.totalMinor).toBe(8_000);
  });
});
