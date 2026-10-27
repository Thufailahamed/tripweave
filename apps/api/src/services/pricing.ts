import { computePricing, type CostLine, type PricingResult } from "@tripweave/pricing-engine";
import type { FxSnapshot, NormalisedOffer, PricingConfig } from "@tripweave/shared";
import type { trips } from "@tripweave/database";

export interface StoredPackage extends Record<string, unknown> {
  objective: string;
  currency: string;
  totalCostMinor: number;
  selections: { stopId: string; destination: string; costMinor: number; offer: NormalisedOffer; metrics: unknown }[];
  stops?: unknown[];
  unverified?: string[];
  explanation?: string[];
}

export function selectionLines(pkg: StoredPackage): CostLine[] {
  return pkg.selections.map((s) => ({
    category: "accommodation" as const,
    description: `${s.offer.property.name} – ${s.offer.roomType.name} (${s.offer.nights} night${s.offer.nights === 1 ? "" : "s"}, ${s.destination})`,
    quantity: 1,
    unitCostMinor: s.offer.totalAmountMinor,
    currency: s.offer.currency,
    taxMinor: s.offer.taxAmountMinor,
    sourceReference: { offerId: s.offer.offerId, propertyId: s.offer.property.id, stopId: s.stopId, providerKey: s.offer.providerKey, verificationStatus: s.offer.verificationStatus },
  }));
}

export function priceStoredPackage(pkg: StoredPackage, currency: string, fx: FxSnapshot, config: PricingConfig, extraLines: CostLine[] = [], discountMinor = 0): PricingResult {
  return computePricing({ currency, lines: [...selectionLines(pkg), ...extraLines], fx, config, discountMinor });
}

export interface ViewerRights {
  canSeeMargins: boolean;
  canSeeContracts: boolean;
}

/**
 * Shapes a stored package for staff display. Selling price is always shown; margin, markup and profit
 * need `margins:view`; contract references need `agreements:manage`.
 */
export function presentPackage(rec: trips.PackageRecord, rights: ViewerRights, pricing: PricingResult | null) {
  const pkg = rec.package as unknown as StoredPackage;
  const selections = pkg.selections.map((s) => {
    const offer = { ...s.offer } as NormalisedOffer & { rateSource?: NormalisedOffer["rateSource"] };
    if (!rights.canSeeContracts && offer.rateSource) offer.rateSource = { ratePlanId: offer.rateSource.ratePlanId };
    return rights.canSeeMargins ? { ...s, offer } : { ...s, costMinor: undefined, offer: redactOfferCosts(offer) };
  });
  const visiblePkg = rights.canSeeMargins
    ? pkg
    : { ...pkg, totalCostMinor: undefined, costPerNightMinor: undefined, explanation: redactExplanation((pkg as unknown as { explanation: string[] }).explanation ?? []) };
  const rawVerification = rec.verification as { checks?: { previousTotalMinor?: number; currentTotalMinor?: number | null; [key: string]: unknown }[]; [key: string]: unknown };
  const verification = rights.canSeeMargins
    ? rawVerification
    : Object.keys(rawVerification).length > 0
      ? { ...rawVerification, checks: rawVerification.checks?.map(({ previousTotalMinor: _previous, currentTotalMinor: _current, ...check }) => check) }
      : rawVerification;
  return {
    id: rec.id,
    jobId: rec.jobId,
    parentId: rec.parentId,
    number: rec.number,
    objective: rec.objective,
    manuallyModified: rec.manuallyModified,
    feasibility: rec.feasibility,
    createdAt: rec.createdAt,
    verification,
    package: { ...visiblePkg, selections },
    pricing: pricing
      ? {
          currency: pricing.currency,
          sellingPriceMinor: pricing.sellingPriceMinor,
          totalPayableMinor: pricing.totalPayableMinor,
          sellingTaxMinor: pricing.sellingTaxMinor,
          warnings: pricing.warnings,
          ...(rights.canSeeMargins
            ? { totalCostMinor: pricing.totalCostMinor, grossProfitMinor: pricing.grossProfitMinor, grossMarginBp: pricing.grossMarginBp, markupBp: pricing.markupBp, paymentFeeMinor: pricing.paymentFeeMinor, approval: pricing.approval }
            : {}),
        }
      : null,
  };
}

/**
 * Supplier cost + selling price would reveal the margin, so users without `margins:view` never receive
 * supplier cost figures (package totals, per-hotel costs, nightly rates, taxes, supplier identity).
 */
export function redactOfferCosts<T extends NormalisedOffer>(o: T): T {
  return { ...o, totalAmountMinor: undefined, nightlyRates: undefined, taxAmountMinor: undefined, feeAmountMinor: undefined, supplierName: undefined, providerMetadata: undefined } as unknown as T;
}

/** Removes cost-bearing sentences/figures from deterministic explanation lines. */
export function redactExplanation(lines: string[]): string[] {
  return lines
    .filter((l) => !/^Total accommodation cost/.test(l))
    .map((l) => l.replace(/\s*\((?:[A-Z]{3}\s)?[^()]*\d[\d,]*\.\d{2}\)\s*$/, "").replace(/\s*\([^()]*\d[\d,]*\.\d{2}\)(?=[:.]| –)/g, ""));
}
