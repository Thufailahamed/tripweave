import { describe, expect, it } from "vitest";
import { pricingConfigSchema, type FxSnapshot } from "@tripweave/shared";
import { computePricing, grossMarginBp, markupBp, sellingPriceForMargin, sellFromCost } from "./pricing";

const fx: FxSnapshot = {
  pivot: "USD",
  rates: { LKR: "300.00", EUR: "0.90", GBP: "0.80" },
  asOf: "2026-10-01T00:00:00Z",
  source: "test",
};
const cfg = (o: Record<string, unknown> = {}) => pricingConfigSchema.parse(o);

describe("margin formulas", () => {
  it("USD 800 cost at 20% margin sells at USD 1000 (not 960 markup)", () => {
    expect(sellingPriceForMargin(80_000, 2_000)).toBe(100_000);
    expect(grossMarginBp(100_000, 80_000)).toBe(2_000);
    expect(markupBp(100_000, 80_000)).toBe(2_500);
  });
  it("rounds up so margin is never under target", () => {
    const s = sellingPriceForMargin(33_333, 2_000);
    expect(grossMarginBp(s, 33_333)).toBeGreaterThanOrEqual(2_000);
  });
  it("handles zero cost safely", () => {
    expect(sellingPriceForMargin(0, 2_000)).toBe(0);
    expect(grossMarginBp(0, 0)).toBe(0);
    expect(markupBp(500, 0)).toBe(0);
  });
});

describe("computePricing", () => {
  const lines = [
    { category: "accommodation" as const, description: "Hotel A", quantity: 1, unitCostMinor: 50_000, currency: "USD" },
    { category: "transport" as const, description: "Driver", quantity: 3, unitCostMinor: 10_000, currency: "USD" },
  ];
  it("prices to target margin and allocates exactly", () => {
    const r = computePricing({ currency: "USD", lines, fx, config: cfg({ targetMarginBp: 2_000 }) });
    expect(r.totalCostMinor).toBe(80_000);
    expect(r.sellingPriceMinor).toBe(100_000);
    expect(r.grossProfitMinor).toBe(20_000);
    expect(r.grossMarginBp).toBe(2_000);
    expect(r.lines.reduce((s, l) => s + l.totalSellingMinor, 0)).toBe(r.sellingPriceMinor);
  });
  it("supports percent and fixed markup", () => {
    const p = computePricing({ currency: "USD", lines, fx, config: cfg({ mode: "percent_markup", markupBp: 2_500 }) });
    expect(p.sellingPriceMinor).toBe(100_000);
    const f = computePricing({ currency: "USD", lines, fx, config: cfg({ mode: "fixed_markup", fixedMarkupMinor: 15_000 }) });
    expect(f.sellingPriceMinor).toBe(95_000);
  });
  it("converts currencies with a snapshot and keeps originals", () => {
    const r = computePricing({
      currency: "USD",
      lines: [{ category: "accommodation", description: "LKR hotel", quantity: 1, unitCostMinor: 30_000_000, currency: "LKR" }],
      fx,
      config: cfg({ targetMarginBp: 0 }),
    });
    expect(r.totalCostMinor).toBe(100_000);
    expect(r.lines[0]!.originalCurrency).toBe("LKR");
  });
  it("fails clearly when an FX rate is missing", () => {
    expect(() =>
      computePricing({
        currency: "USD",
        lines: [{ category: "other", description: "x", quantity: 1, unitCostMinor: 100, currency: "JPY" }],
        fx,
        config: cfg(),
      }),
    ).toThrow();
  });
  it("applies commission, minimum profit and flags discounts needing approval", () => {
    const r = computePricing({
      currency: "USD",
      lines: [{ ...lines[0]!, commissionBp: 1_000 }],
      fx,
      config: cfg({ targetMarginBp: 500, minimumProfitMinor: 20_000, maxDiscountBp: 500 }),
      discountMinor: 10_000,
    });
    expect(r.totalCostMinor).toBe(45_000);
    expect(r.sellingPriceBeforeDiscountMinor).toBeGreaterThanOrEqual(65_000);
    expect(r.approval.required).toBe(true);
  });
  it("treats payment fee as a cost of sale", () => {
    const r = computePricing({ currency: "USD", lines, fx, config: cfg({ targetMarginBp: 2_000, paymentFeeBp: 300 }) });
    expect(r.grossMarginBp).toBeGreaterThanOrEqual(2_000);
    expect(r.paymentFeeMinor).toBeGreaterThan(0);
  });
  it("excludes optional lines from totals", () => {
    const r = computePricing({
      currency: "USD",
      lines: [...lines, { category: "activity", description: "Safari", quantity: 2, unitCostMinor: 5_000, currency: "USD", optional: true }],
      fx,
      config: cfg(),
    });
    expect(r.totalCostMinor).toBe(80_000);
    expect(r.lines.find((l) => l.optional)!.totalSellingMinor).toBeGreaterThan(10_000);
  });
  it("adds selling tax on top without changing margin", () => {
    const r = computePricing({ currency: "USD", lines, fx, config: cfg({ sellingTaxBp: 1_000 }) });
    expect(r.totalPayableMinor).toBe(r.sellingPriceMinor + r.sellingTaxMinor);
  });
  it("rejects discounts above selling price", () => {
    expect(() => computePricing({ currency: "USD", lines, fx, config: cfg(), discountMinor: 9_999_999 })).toThrow();
  });
  it("sellFromCost honours minimum selling price", () => {
    expect(sellFromCost(100, "USD", cfg({ minimumSellingPriceMinor: 5_000 }))).toBe(5_000);
  });
});
