import { AppError, type NormalisedOffer } from "@tripweave/shared";
import { quotes, trips } from "@tripweave/database";
import type { PriceCheckResult } from "@tripweave/provider-contracts";
import { PRICE_VALIDITY_MINUTES } from "./price-validation";
import { recheckOffer, type PipelineCtx } from "./optimisation";
import type { StoredPackage } from "./pricing";

export interface BookingConfirmationCheck {
  stopId: string;
  offerId: string;
  propertyName: string;
  status: PriceCheckResult["status"] | "not_required" | "error";
  previousTotalMinor: number;
  currentTotalMinor: number | null;
  message?: string;
}

export interface BookingConfirmationResult {
  confirmation: quotes.BookingConfirmationRecord;
  checks: BookingConfirmationCheck[];
  allConfirmed: boolean;
  changed: boolean;
}

/**
 * Re-checks every external hotel on the accepted quotation immediately before booking. A price
 * change or unavailable rate produces a failed confirmation; the issued quote version is never
 * mutated, so the agent must create a revised version instead.
 */
export async function confirmQuoteForBooking(
  ctx: PipelineCtx,
  organizationId: string,
  userId: string,
  quoteId: string,
  opts: { validityMinutes?: number } = {},
): Promise<BookingConfirmationResult> {
  const quote = await quotes.getQuote(ctx.db, organizationId, quoteId);
  if (!quote) throw new AppError("not_found", "Quotation not found");
  if (quote.status !== "accepted") throw new AppError("precondition_failed", "Only an accepted quotation can be confirmed for booking.");
  const now = ctx.deps.now();
  if (quote.validUntil && quote.validUntil < now.toISOString().slice(0, 10)) throw new AppError("precondition_failed", "The quotation has expired; create a new quotation before confirming a booking.");
  const version = await quotes.getVersion(ctx.db, quote.id, quote.currentVersion);
  if (!version) throw new AppError("not_found", "Quotation version not found");
  const trip = await trips.getTrip(ctx.db, organizationId, quote.tripRequestId);
  if (!trip) throw new AppError("not_found", "Trip not found");
  const pkg = version.package as unknown as StoredPackage;
  const checks: BookingConfirmationCheck[] = [];
  let failed = false;
  let changed = false;

  for (const selection of pkg.selections) {
    const offer = selection.offer;
    if (offer.source !== "external") {
      checks.push({ stopId: selection.stopId, offerId: offer.offerId, propertyName: offer.property.name, status: "not_required", previousTotalMinor: offer.totalAmountMinor, currentTotalMinor: offer.totalAmountMinor });
      continue;
    }
    let result: PriceCheckResult;
    try {
      result = await recheckOffer(ctx, organizationId, offer, trip.party);
    } catch (e) {
      failed = true;
      checks.push({ stopId: selection.stopId, offerId: offer.offerId, propertyName: offer.property.name, status: "error", previousTotalMinor: offer.totalAmountMinor, currentTotalMinor: null, message: e instanceof AppError ? e.message : "The supplier price check failed." });
      continue;
    }
    checks.push({ stopId: selection.stopId, offerId: offer.offerId, propertyName: offer.property.name, status: result.status, previousTotalMinor: result.previousTotalMinor, currentTotalMinor: result.currentTotalMinor, message: result.message });
    if (result.status !== "confirmed" || result.currentTotalMinor !== offer.totalAmountMinor) {
      failed = true;
      if (result.status === "price_changed" || result.currentTotalMinor !== offer.totalAmountMinor) changed = true;
    }
  }

  const allConfirmed = !failed;
  const checkedAt = now.toISOString();
  const validUntil = allConfirmed ? new Date(now.getTime() + Math.max(1, opts.validityMinutes ?? PRICE_VALIDITY_MINUTES) * 60_000).toISOString() : null;
  const reference = `BC-${quote.quoteNumber}-v${version.versionNumber}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const confirmation = await quotes.createBookingConfirmation(ctx.db, organizationId, {
    quoteId: quote.id,
    quoteVersion: version.versionNumber,
    reference,
    status: allConfirmed ? "confirmed" : "failed",
    checkedAt,
    validUntil,
    currency: quote.currency,
    totalCostMinor: version.totalCostMinor,
    checks,
    createdBy: userId,
  });
  return { confirmation, checks, allConfirmed, changed };
}
