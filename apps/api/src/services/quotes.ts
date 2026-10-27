import { AppError, MEAL_PLAN_LABELS, canTransitionQuote, type FxSnapshot, type PricingConfig, type QuoteStatus, type quoteItemSchema } from "@tripweave/shared";
import { identity, inventory, quotes, trips, type Db } from "@tripweave/database";
import { computePricing, type CostLine, type PricingResult } from "@tripweave/pricing-engine";
import { toClientView, type ClientQuoteView, type QuoteViewSource } from "@tripweave/proposal-renderer";
import type { z } from "zod";
import { selectionLines, type StoredPackage } from "./pricing";

export type QuoteItemInput = z.output<typeof quoteItemSchema>;

export const DEFAULT_EXCLUSIONS = ["International flights", "Travel insurance", "Meals and drinks not listed as included", "Personal expenses and gratuities"];
export const DEFAULT_TERMS =
  "Prices are quoted in the stated currency and are subject to availability at the time of confirmation. A booking is only confirmed once written confirmation is issued by us. " +
  "Cancellation and amendment conditions follow the terms stated for each accommodation. This quotation is valid until the date shown; after that, prices and availability must be re-confirmed.";

export function defaultInclusions(pkg: StoredPackage): string[] {
  const items = pkg.selections.map((s) => `${s.offer.nights} night${s.offer.nights === 1 ? "" : "s"} at ${s.offer.property.name} (${s.destination}) – ${s.offer.roomType.name}, ${MEAL_PLAN_LABELS[s.offer.mealPlan]}`);
  return items;
}

export function extraLines(items: QuoteItemInput[]): CostLine[] {
  return items.map((i) => ({ category: i.category, description: i.description, quantity: i.quantity, unitCostMinor: i.unitCostMinor, currency: i.currency, optional: i.optional || !i.included }));
}

/** Refuses to quote anything that is illustrative, expired or no longer available. */
export function assertQuotable(pkg: StoredPackage, now: Date): void {
  const problems: string[] = [];
  for (const s of pkg.selections) {
    const o = s.offer;
    if (o.isMock) problems.push(`${o.property.name} is illustrative mock data and cannot be quoted.`);
    if (o.availabilityStatus === "unavailable" || o.verificationStatus === "unavailable") problems.push(`${o.property.name} is unavailable.`);
    if (o.verificationStatus === "expired" || (o.expiresAt && o.expiresAt < now.toISOString())) problems.push(`The rate for ${o.property.name} has expired; re-price the package first.`);
  }
  if (problems.length) throw new AppError("unprocessable", problems.join(" "), { problems });
}

export interface BuiltVersion {
  version: quotes.VersionInput;
  pricing: PricingResult;
}

export async function buildVersion(args: {
  db: Db;
  organizationId: string;
  userId: string;
  currency: string;
  pkg: StoredPackage;
  trip: trips.TripRecord;
  stops: unknown[];
  itineraryTitle: string;
  config: PricingConfig;
  fx: FxSnapshot;
  extraItems: QuoteItemInput[];
  discountMinor: number;
  inclusions?: string[];
  exclusions?: string[];
  terms?: string;
  clientNotes?: string;
  internalNotes?: string;
}): Promise<BuiltVersion> {
  const lines = [...selectionLines(args.pkg), ...extraLines(args.extraItems)];
  const pricing = computePricing({ currency: args.currency, lines, fx: args.fx, config: args.config, discountMinor: args.discountMinor });
  const version: quotes.VersionInput = {
    itinerarySnapshot: { title: args.itineraryTitle, stops: args.stops },
    pricingSnapshot: pricing,
    packageSnapshot: args.pkg,
    totalCostMinor: pricing.totalCostMinor,
    sellingPriceMinor: pricing.sellingPriceMinor,
    grossProfitMinor: pricing.grossProfitMinor,
    grossMarginBp: pricing.grossMarginBp,
    fxSnapshot: pricing.fx,
    termsSnapshot: {
      terms: args.terms ?? DEFAULT_TERMS,
      inclusions: args.inclusions ?? defaultInclusions(args.pkg),
      exclusions: args.exclusions ?? DEFAULT_EXCLUSIONS,
      clientNotes: args.clientNotes ?? "",
      // Kept so a later version can carry the same extra items forward (contains costs: stripped for non-margin viewers).
      extraItems: args.extraItems,
    },
    internalNotes: args.internalNotes ?? null,
    approvalRequired: pricing.approval.required,
    createdBy: args.userId,
    items: pricing.lines.map((l) => ({
      category: l.category, description: l.description, quantity: l.quantity, unitCostMinor: l.unitCostMinor, totalCostMinor: l.totalCostMinor,
      unitSellingMinor: l.unitSellingMinor, totalSellingMinor: l.totalSellingMinor, currency: l.currency, optional: l.optional,
      tax: { taxMinor: l.taxMinor ?? null }, source: { ...(l.sourceReference ?? {}), originalCurrency: l.originalCurrency, originalTotalMinor: l.originalTotalMinor, fxRate: l.fxRate },
    })),
  };
  return { version, pricing };
}

export interface QuoteRights {
  canSeeMargins: boolean;
}

/** Removes every internal cost/margin field for staff without margin visibility. */
export function presentVersion(v: quotes.VersionRecord, rights: QuoteRights) {
  if (rights.canSeeMargins) return v;
  const pricing = v.pricing as { sellingPriceBeforeDiscountMinor?: number; discountMinor?: number; sellingPriceMinor?: number; sellingTaxMinor?: number; totalPayableMinor?: number; currency?: string; approval?: { required: boolean } };
  const pkg = v.package as unknown as StoredPackage;
  return {
    ...v,
    totalCostMinor: undefined,
    grossProfitMinor: undefined,
    grossMarginBp: undefined,
    fx: {},
    terms: { ...(v.terms as Record<string, unknown>), extraItems: undefined },
    internalNotes: v.internalNotes,
    pricing: { currency: pricing.currency, sellingPriceBeforeDiscountMinor: pricing.sellingPriceBeforeDiscountMinor, discountMinor: pricing.discountMinor, sellingPriceMinor: pricing.sellingPriceMinor, sellingTaxMinor: pricing.sellingTaxMinor, totalPayableMinor: pricing.totalPayableMinor, approval: pricing.approval },
    package: { ...pkg, totalCostMinor: undefined, costPerNightMinor: undefined, selections: pkg.selections.map((s) => ({ ...s, costMinor: undefined, offer: { ...s.offer, totalAmountMinor: undefined, nightlyRates: undefined, taxAmountMinor: undefined, feeAmountMinor: undefined, rateSource: undefined, providerMetadata: undefined, supplierName: undefined } })) },
    items: v.items.map((i) => ({ ...i, unitCostMinor: undefined, totalCostMinor: undefined })),
  };
}

export function assertTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransitionQuote(from, to)) throw new AppError("invalid_transition", `A quotation cannot move from "${from}" to "${to}".`, { from, to });
}

/** Builds the sanitised client view for a quote version; the only data a client may ever see. */
export async function clientViewFor(db: Db, organizationId: string, quote: quotes.QuoteRecord, versionNumber: number, imageUrl: (imageId: string) => string): Promise<ClientQuoteView> {
  const [version, org, trip, customer] = await Promise.all([
    quotes.getVersion(db, quote.id, versionNumber),
    identity.getOrganization(db, organizationId),
    trips.getTrip(db, organizationId, quote.tripRequestId),
    quote.customerId ? trips.getCustomer(db, organizationId, quote.customerId) : Promise.resolve(null),
  ]);
  if (!version || !org || !trip) throw new AppError("not_found", "Quotation not found");
  const pkg = version.package as unknown as StoredPackage;
  const images = await inventory.firstImagesFor(db, pkg.selections.map((s) => s.offer.property.id));
  const enriched = {
    ...version,
    package: { selections: pkg.selections.map((s) => ({ destination: s.destination, offer: s.offer, imageUrl: images.get(s.offer.property.id) ? imageUrl(images.get(s.offer.property.id)!) : null })) },
  };
  const source: QuoteViewSource = {
    quote: { quoteNumber: quote.quoteNumber, status: quote.status, currency: quote.currency, validUntil: quote.validUntil },
    version: { versionNumber: version.versionNumber, createdAt: version.createdAt, itinerary: version.itinerary as never, package: enriched.package as never, pricing: version.pricing as never, terms: version.terms as never, items: version.items },
    organization: { name: org.name, branding: org.branding as never },
    customerName: customer?.name ?? null,
    trip: { title: trip.title, arrivalDate: trip.arrivalDate, departureDate: trip.departureDate, party: trip.party },
  };
  return toClientView(source);
}
