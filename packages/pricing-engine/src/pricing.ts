import {
  AppError,
  allocateProportional,
  convertWithSnapshot,
  currencyExponent,
  mulDiv,
  percentOf,
  type FxSnapshot,
  type PricingConfig,
} from "@tripweave/shared";

/* ---------- primitive formulas ---------- */

/** Selling price = cost / (1 - margin). Rounded up so the achieved margin is never below target. */
export function sellingPriceForMargin(costMinor: number, marginBp: number): number {
  if (marginBp < 0 || marginBp >= 10_000) throw new Error("Margin must be in [0, 100%)");
  return mulDiv(costMinor, 10_000, 10_000 - marginBp, "ceil");
}

/** Gross margin (basis points) = (selling - cost) / selling. Zero when there is no selling price. */
export function grossMarginBp(sellingMinor: number, costMinor: number): number {
  if (sellingMinor <= 0) return 0;
  return mulDiv(sellingMinor - costMinor, 10_000, sellingMinor);
}

/** Markup (basis points) = (selling - cost) / cost. Zero when cost is zero (undefined mathematically). */
export function markupBp(sellingMinor: number, costMinor: number): number {
  if (costMinor <= 0) return 0;
  return mulDiv(sellingMinor - costMinor, 10_000, costMinor);
}

/* ---------- types ---------- */

export type CostCategory = "accommodation" | "transport" | "activity" | "guide" | "meal" | "other";

export interface CostLine {
  id?: string;
  category: CostCategory;
  description: string;
  quantity: number;
  unitCostMinor: number;
  currency: string;
  /** Supplier commission received, reducing our net cost. */
  commissionBp?: number;
  optional?: boolean;
  sourceReference?: Record<string, unknown>;
  taxMinor?: number | null;
}

export interface PricedLine {
  id?: string;
  category: CostCategory;
  description: string;
  quantity: number;
  optional: boolean;
  originalCurrency: string;
  originalUnitCostMinor: number;
  originalTotalMinor: number;
  currency: string;
  fxRate: string;
  commissionMinor: number;
  totalCostMinor: number;
  unitCostMinor: number;
  totalSellingMinor: number;
  unitSellingMinor: number;
  sourceReference?: Record<string, unknown>;
  taxMinor?: number | null;
}

export interface PricingResult {
  currency: string;
  lines: PricedLine[];
  totalCostMinor: number;
  paymentFeeMinor: number;
  sellingPriceBeforeDiscountMinor: number;
  discountMinor: number;
  sellingPriceMinor: number;
  sellingTaxMinor: number;
  totalPayableMinor: number;
  grossProfitMinor: number;
  grossMarginBp: number;
  markupBp: number;
  categoryTotals: Record<string, { costMinor: number; sellingMinor: number }>;
  warnings: string[];
  approval: { required: boolean; reasons: string[] };
  fx: FxSnapshot;
  config: PricingConfig;
}

export interface PricingInput {
  currency: string;
  lines: CostLine[];
  fx: FxSnapshot;
  config: PricingConfig;
  discountMinor?: number;
}

/* ---------- engine ---------- */

function roundUpTo(amountMinor: number, currency: string, roundTo: PricingConfig["roundTo"]): number {
  if (roundTo === "none") return amountMinor;
  const unit = 10 ** currencyExponent(currency);
  const step = roundTo === "unit" ? unit : roundTo === "ten" ? unit * 10 : unit * 100;
  return Math.ceil(amountMinor / step) * step;
}

/** Computes a selling price for a given net cost under the configured pricing mode. */
export function sellFromCost(costMinor: number, currency: string, c: PricingConfig): number {
  const f = c.paymentFeeBp;
  const denomFee = 10_000 - f;
  if (denomFee <= 0) throw new AppError("unprocessable", "Payment fee must be below 100%");
  let selling: number;
  if (c.mode === "target_margin") {
    const d = 10_000 - c.targetMarginBp - f;
    if (d <= 0) throw new AppError("unprocessable", "Target margin plus payment fee must be below 100%");
    selling = mulDiv(costMinor, 10_000, d, "ceil");
  } else if (c.mode === "percent_markup") {
    selling = mulDiv(costMinor, 10_000 + c.markupBp, denomFee, "ceil");
  } else {
    selling = mulDiv(costMinor + c.fixedMarkupMinor, 10_000, denomFee, "ceil");
  }
  if (c.minimumProfitMinor > 0) {
    const required = mulDiv(costMinor + c.minimumProfitMinor, 10_000, denomFee, "ceil");
    selling = Math.max(selling, required);
  }
  selling = roundUpTo(selling, currency, c.roundTo);
  return Math.max(selling, c.minimumSellingPriceMinor);
}

export function computePricing(input: PricingInput): PricingResult {
  const { currency, fx, config } = input;
  const warnings: string[] = [];

  const lines: PricedLine[] = input.lines.map((l) => {
    const originalTotal = l.unitCostMinor * l.quantity;
    const converted = convertWithSnapshot(originalTotal, l.currency, currency, fx);
    if (converted === null) {
      throw new AppError("unprocessable", `No exchange rate available to convert ${l.currency} to ${currency}`, {
        from: l.currency,
        to: currency,
      });
    }
    const commission = l.commissionBp ? percentOf(converted, l.commissionBp) : 0;
    const totalCost = converted - commission;
    const rate =
      l.currency === currency
        ? "1"
        : String(convertWithSnapshot(10 ** currencyExponent(l.currency), l.currency, currency, fx) ?? 0);
    return {
      id: l.id,
      category: l.category,
      description: l.description,
      quantity: l.quantity,
      optional: l.optional ?? false,
      originalCurrency: l.currency,
      originalUnitCostMinor: l.unitCostMinor,
      originalTotalMinor: originalTotal,
      currency,
      fxRate: rate,
      commissionMinor: commission,
      totalCostMinor: totalCost,
      unitCostMinor: Math.round(totalCost / l.quantity),
      totalSellingMinor: 0,
      unitSellingMinor: 0,
      sourceReference: l.sourceReference,
      taxMinor: l.taxMinor ?? null,
    };
  });

  const included = lines.filter((l) => !l.optional);
  const baseCost = included.reduce((s, l) => s + l.totalCostMinor, 0);
  if (included.length === 0) warnings.push("No costed items are included in this pricing calculation.");
  if (baseCost === 0 && included.length > 0) warnings.push("Total cost is zero; margin and markup are not meaningful.");

  const sellingBeforeDiscount = sellFromCost(baseCost, currency, config);
  const requestedDiscount = input.discountMinor ?? 0;
  if (requestedDiscount > sellingBeforeDiscount) {
    throw new AppError("unprocessable", "Discount cannot exceed the selling price");
  }
  const selling = sellingBeforeDiscount - requestedDiscount;
  const fee = percentOf(selling, config.paymentFeeBp);
  const profit = selling - baseCost - fee;
  const marginBp = grossMarginBp(selling, baseCost + fee);
  const mkBp = markupBp(selling, baseCost + fee);
  const sellingTax = percentOf(selling, config.sellingTaxBp);

  // Allocate the (post-discount) selling price across included lines proportionally to cost.
  const alloc = allocateProportional(
    selling,
    included.map((l) => l.totalCostMinor),
  );
  included.forEach((l, i) => {
    l.totalSellingMinor = alloc[i] ?? 0;
    l.unitSellingMinor = Math.round(l.totalSellingMinor / l.quantity);
  });
  // Optional lines are priced individually with the same rules and excluded from totals.
  for (const l of lines.filter((x) => x.optional)) {
    l.totalSellingMinor = sellFromCost(l.totalCostMinor, currency, config);
    l.unitSellingMinor = Math.round(l.totalSellingMinor / l.quantity);
  }

  const reasons: string[] = [];
  if (sellingBeforeDiscount > 0 && requestedDiscount * 10_000 > config.maxDiscountBp * sellingBeforeDiscount)
    reasons.push("Discount exceeds the configured maximum discount");
  if (selling > 0 && marginBp < config.approvalMarginFloorBp)
    reasons.push("Gross margin is below the approval threshold");
  if (profit < 0) {
    reasons.push("Selling price is below cost");
    warnings.push("This quotation would be sold at a loss.");
  }

  const categoryTotals: PricingResult["categoryTotals"] = {};
  for (const l of included) {
    const t = (categoryTotals[l.category] ??= { costMinor: 0, sellingMinor: 0 });
    t.costMinor += l.totalCostMinor;
    t.sellingMinor += l.totalSellingMinor;
  }

  return {
    currency,
    lines,
    totalCostMinor: baseCost,
    paymentFeeMinor: fee,
    sellingPriceBeforeDiscountMinor: sellingBeforeDiscount,
    discountMinor: requestedDiscount,
    sellingPriceMinor: selling,
    sellingTaxMinor: sellingTax,
    totalPayableMinor: selling + sellingTax,
    grossProfitMinor: profit,
    grossMarginBp: marginBp,
    markupBp: mkBp,
    categoryTotals,
    warnings,
    approval: { required: reasons.length > 0, reasons },
    fx,
    config,
  };
}
