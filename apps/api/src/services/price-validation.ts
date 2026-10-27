import { AppError, type NormalisedOffer } from "@tripweave/shared";
import { trips } from "@tripweave/database";
import type { PriceCheckResult } from "@tripweave/provider-contracts";
import { loadJobSearchInput, recheckOffer, type PipelineCtx } from "./optimisation";
import type { StoredPackage } from "./pricing";

export const PRICE_VALIDITY_MINUTES = 15;

export type PackageValidationStatus = PriceCheckResult["status"] | "not_required" | "error";

export interface PackageValidationCheck {
  stopId: string;
  offerId: string;
  propertyName: string;
  status: PackageValidationStatus;
  previousTotalMinor: number;
  currentTotalMinor: number | null;
  message?: string;
}

export interface PackageValidationSummary {
  status: "verified" | "failed";
  allVerified: boolean;
  checkedAt: string;
  validUntil: string | null;
  checks: PackageValidationCheck[];
}

/**
 * Re-checks every external hotel in a package against its live supplier rate. The package is only
 * updated when every external check succeeds; a partial failure records the failed summary and
 * leaves the old prices untouched so an unverified package can never be quoted.
 */
export async function validatePackagePrices(
  ctx: PipelineCtx,
  organizationId: string,
  packageId: string,
  opts: { validityMinutes?: number } = {},
): Promise<{ rec: trips.PackageRecord; pkg: StoredPackage; verification: PackageValidationSummary; changed: boolean }> {
  const rec = await trips.getPackage(ctx.db, organizationId, packageId);
  if (!rec) throw new AppError("not_found", "Package not found");
  const pkg = rec.package as unknown as StoredPackage;
  const base = await loadJobSearchInput(ctx, organizationId, rec.jobId);
  const now = ctx.deps.now();
  const checkedAt = now.toISOString();
  const validityMinutes = Math.max(1, opts.validityMinutes ?? PRICE_VALIDITY_MINUTES);
  const validUntil = new Date(now.getTime() + validityMinutes * 60_000).toISOString();
  const checks: PackageValidationCheck[] = [];
  const updated: StoredPackage["selections"] = [];
  let failed = false;
  let changed = false;

  for (const selection of pkg.selections) {
    const offer = selection.offer;
    if (offer.source !== "external") {
      checks.push({
        stopId: selection.stopId,
        offerId: offer.offerId,
        propertyName: offer.property.name,
        status: "not_required",
        previousTotalMinor: offer.totalAmountMinor,
        currentTotalMinor: offer.totalAmountMinor,
      });
      updated.push(selection);
      continue;
    }

    let result: PriceCheckResult;
    try {
      result = await recheckOffer(ctx, organizationId, offer, base.input.party);
    } catch (e) {
      failed = true;
      checks.push({
        stopId: selection.stopId,
        offerId: offer.offerId,
        propertyName: offer.property.name,
        status: "error",
        previousTotalMinor: offer.totalAmountMinor,
        currentTotalMinor: null,
        message: e instanceof AppError ? e.message : "The supplier price check failed.",
      });
      updated.push(selection);
      continue;
    }

    checks.push({
      stopId: selection.stopId,
      offerId: offer.offerId,
      propertyName: offer.property.name,
      status: result.status,
      previousTotalMinor: result.previousTotalMinor,
      currentTotalMinor: result.currentTotalMinor,
      message: result.message,
    });

    if ((result.status === "confirmed" || result.status === "price_changed") && result.offer) {
      const costMinor = base.input.convert(result.offer.totalAmountMinor, result.offer.currency);
      if (costMinor === null) {
        failed = true;
        updated.push(selection);
        continue;
      }
      if (result.offer.totalAmountMinor !== offer.totalAmountMinor) changed = true;
      updated.push({ ...selection, offer: result.offer, costMinor });
    } else {
      failed = true;
      updated.push(selection);
    }
  }

  const allVerified = !failed && checks.every((c) => c.status === "confirmed" || c.status === "price_changed" || c.status === "not_required");
  const verification: PackageValidationSummary = {
    status: allVerified ? "verified" : "failed",
    allVerified,
    checkedAt,
    validUntil: allVerified ? validUntil : null,
    checks,
  };

  const nextPkg: StoredPackage = allVerified
    ? {
        ...pkg,
        selections: updated,
        totalCostMinor: updated.reduce((sum, s) => sum + s.costMinor, 0),
        costPerNightMinor: Math.round(
          updated.reduce((sum, s) => sum + s.costMinor, 0) / Math.max(1, updated.reduce((sum, s) => sum + s.offer.nights, 0)),
        ),
        // A live check resolves the "price not checked" warning; availability remains unknown unless a bookable supplier confirms it.
        unverified: (pkg.unverified ?? []).filter((line) => !/price has not been live-checked/i.test(line)),
        explanation: (pkg.explanation ?? []).map((line) => line.replace(/supplier-reported rate \(not price-checked\)/gi, "live-checked rate")),
      }
    : pkg;

  await trips.updatePackageValidation(ctx.db, organizationId, packageId, {
    packageJson: nextPkg,
    totalCostMinor: nextPkg.totalCostMinor,
    verification,
    items: (allVerified ? updated : pkg.selections).map((s) => ({ stopId: s.stopId, costMinor: s.costMinor })),
  });

  const fresh = await trips.getPackage(ctx.db, organizationId, packageId);
  return { rec: fresh!, pkg: nextPkg, verification, changed };
}
