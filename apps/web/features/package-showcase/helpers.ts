import type { PackageShowcaseSnapshot, PackageShowcaseTrip, PlanningHotelOffer, PlanningPackageView } from "@tripweave/planning-contract";

/**
 * Pure derivations from the server snapshot. Every number a block shows is either a server field or a
 * plain arithmetic on server fields, so none of it can come from generated text.
 */

export type PackageVerification = {
  status?: string;
  allVerified?: boolean;
  checkedAt?: string | null;
  validUntil?: string | null;
  checks?: { status?: string }[];
};

export function verificationOf(pkg: PlanningPackageView): PackageVerification {
  return pkg.verification as PackageVerification;
}

export function resolveShowcasePackage(snapshot: PackageShowcaseSnapshot, key: string): PlanningPackageView | null {
  return snapshot.packages.find((pkg) => pkg.id === key || pkg.ref === key) ?? null;
}

export function resolveShowcaseOffer(snapshot: PackageShowcaseSnapshot, key: string): PlanningHotelOffer | null {
  return snapshot.offers.find((entry) => entry.offerId === key || entry.ref === key) ?? null;
}

/** Adults and children both pay for a stay, so per-traveller figures divide by the whole party. */
export function travellerCount(trip: PackageShowcaseTrip): number {
  return Math.max(1, trip.party.adults + trip.party.children);
}

export function nightsOf(pkg: PlanningPackageView): number {
  return pkg.package.selections.reduce((total, selection) => total + selection.offer.nights, 0);
}

export function sellingPriceOf(pkg: PlanningPackageView): number | null {
  return pkg.pricing?.sellingPriceMinor ?? null;
}

export function perNightMinor(amountMinor: number | null, nights: number): number | null {
  if (amountMinor === null || nights <= 0) return null;
  return Math.round(amountMinor / nights);
}

export function perTravellerMinor(amountMinor: number | null, travellers: number): number | null {
  if (amountMinor === null) return null;
  return Math.round(amountMinor / Math.max(1, travellers));
}

export type LiveState = "live" | "expired" | "indicative";

/**
 * Same rule the packages page uses to decide whether a package is live checked. A check that was
 * confirmed but has passed its validity window is shown as expired, never as live.
 */
export function liveStatus(pkg: PlanningPackageView, now = Date.now()): { state: LiveState; checkedAt: string | null; validUntil: string | null } {
  const verification = verificationOf(pkg);
  const checkedAt = verification.checkedAt ?? null;
  const validUntil = verification.validUntil ?? null;
  if (!verification.allVerified) return { state: "indicative", checkedAt, validUntil };
  const validUntilMs = validUntil ? Date.parse(validUntil) : NaN;
  if (checkedAt && Number.isFinite(validUntilMs) && validUntilMs > now) return { state: "live", checkedAt, validUntil };
  return { state: "expired", checkedAt, validUntil };
}

/**
 * Quotations from external rates need a fresh live check first. The packages page enforces the same rule,
 * and the quotation API enforces it again on the server.
 */
export function needsLiveCheck(pkg: PlanningPackageView, now = Date.now()): boolean {
  const external = pkg.package.selections.some((selection) => selection.offer.source === "external");
  return external && liveStatus(pkg, now).state !== "live";
}

export function checkCounts(pkg: PlanningPackageView): { confirmed: number; total: number } {
  const checks = verificationOf(pkg).checks ?? [];
  const confirmed = checks.filter((check) => check.status === "confirmed" || check.status === "price_changed" || check.status === "not_required").length;
  return { confirmed, total: checks.length };
}

export type CompareSort = "recommended" | "price" | "score";

/** Sorts a copy; "recommended" keeps the order the caller gave, which is the optimiser's order. */
export function sortPackages(packages: PlanningPackageView[], sort: CompareSort): PlanningPackageView[] {
  const copy = [...packages];
  if (sort === "price") copy.sort((a, b) => (sellingPriceOf(a) ?? Number.MAX_SAFE_INTEGER) - (sellingPriceOf(b) ?? Number.MAX_SAFE_INTEGER));
  if (sort === "score") copy.sort((a, b) => b.package.score - a.package.score);
  return copy;
}

/** The package with the lowest selling price, or null when none is priced. */
export function lowestPricedId(packages: PlanningPackageView[]): string | null {
  let best: { id: string; price: number } | null = null;
  for (const pkg of packages) {
    const price = sellingPriceOf(pkg);
    if (price !== null && (best === null || price < best.price)) best = { id: pkg.id, price };
  }
  return best?.id ?? null;
}

/** Budget position in the trip budget's currency. The server decides the comparison; this only reports it. */
export function budgetPosition(pkg: PlanningPackageView, trip: PackageShowcaseTrip): { difference: number | null; meterFraction: number | null } {
  const difference = pkg.package.budgetDifferenceMinor;
  const price = sellingPriceOf(pkg);
  const sameCurrency = pkg.package.currency === trip.budgetCurrency;
  if (difference === null || trip.budgetAmountMinor === null || price === null || !sameCurrency || trip.budgetAmountMinor <= 0) {
    return { difference, meterFraction: null };
  }
  return { difference, meterFraction: Math.min(1, price / trip.budgetAmountMinor) };
}
