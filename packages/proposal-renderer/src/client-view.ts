import { MEAL_PLAN_LABELS, type Branding, type MealPlan } from "@tripweave/shared";

/**
 * The ONLY shape that may be shown to a client. It is built by an explicit allow-list so internal
 * costs, margins, supplier names, contract references, staff notes and provider identifiers can
 * never leak by accident when internal records gain new fields.
 */
export interface ClientQuoteView {
  quoteNumber: string;
  version: number;
  status: string;
  currency: string;
  issuedAt: string;
  validUntil: string | null;
  organization: { name: string; branding: Branding };
  customerName: string | null;
  trip: { title: string; arrivalDate: string | null; departureDate: string | null; adults: number; children: number; rooms: number };
  itinerary: { destination: string; arrivalDate: string; departureDate: string; nights: number; activities: string[] }[];
  stays: {
    destination: string;
    propertyName: string;
    propertyCategory: string | null;
    roomType: string;
    mealPlan: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    cancellation: string;
    imageUrl: string | null;
  }[];
  lineItems: { category: string; description: string; quantity: number; totalMinor: number; optional: boolean }[];
  totals: { subtotalMinor: number; discountMinor: number; taxMinor: number; totalPayableMinor: number };
  inclusions: string[];
  exclusions: string[];
  terms: string;
  clientNotes: string;
}

/** Structural inputs (callers cast stored JSON snapshots to these shapes). Extra fields are ignored by design. */
interface StopLike { destination: string; arrivalDate: string; departureDate: string; nights: number; activities?: string[] }
interface SelectionLike {
  destination: string;
  imageUrl?: string | null;
  offer: {
    property: { name: string; category: string | null };
    roomType: { name: string };
    mealPlan: MealPlan;
    stayStart: string;
    stayEnd: string;
    nights: number;
    cancellation: { refundable: boolean | null; freeCancellationUntil?: string | null };
  };
}
interface PricingLike { sellingPriceBeforeDiscountMinor?: number; discountMinor?: number; sellingPriceMinor?: number; sellingTaxMinor?: number; totalPayableMinor?: number }
interface TermsLike { terms?: string; inclusions?: string[]; exclusions?: string[]; clientNotes?: string }

export interface QuoteViewSource {
  quote: { quoteNumber: string; status: string; currency: string; validUntil: string | null };
  version: {
    versionNumber: number;
    createdAt: string;
    itinerary: { stops?: StopLike[] };
    package: { selections?: SelectionLike[] };
    pricing: PricingLike;
    terms: TermsLike;
    items: { category: string; description: string; quantity: number; totalSellingMinor: number; optional: boolean }[];
  };
  organization: { name: string; branding: Branding };
  customerName: string | null;
  trip: { title: string; arrivalDate: string | null; departureDate: string | null; party: { adults: number; children: number; rooms: unknown[] } };
}

function cancellationText(c: { refundable: boolean | null; freeCancellationUntil?: string | null }): string {
  if (c.refundable === true) return c.freeCancellationUntil ? `Free cancellation until ${c.freeCancellationUntil}` : "Free cancellation (see terms)";
  if (c.refundable === false) return "Non-refundable";
  return "Cancellation terms to be confirmed";
}

export function toClientView(src: QuoteViewSource): ClientQuoteView {
  const stops = src.version.itinerary.stops ?? [];
  const selections = src.version.package.selections ?? [];
  const pricing = src.version.pricing;
  const terms = src.version.terms;
  const lines = src.version.items;
  const included = lines.filter((l) => !l.optional);
  const subtotal = pricing.sellingPriceBeforeDiscountMinor ?? included.reduce((s, l) => s + l.totalSellingMinor, 0);
  return {
    quoteNumber: src.quote.quoteNumber,
    version: src.version.versionNumber,
    status: src.quote.status,
    currency: src.quote.currency,
    issuedAt: src.version.createdAt,
    validUntil: src.quote.validUntil,
    organization: { name: src.organization.name, branding: src.organization.branding },
    customerName: src.customerName,
    trip: { title: src.trip.title, arrivalDate: src.trip.arrivalDate, departureDate: src.trip.departureDate, adults: src.trip.party.adults, children: src.trip.party.children, rooms: src.trip.party.rooms.length },
    itinerary: stops.map((s) => ({ destination: s.destination, arrivalDate: s.arrivalDate, departureDate: s.departureDate, nights: s.nights, activities: [...(s.activities ?? [])] })),
    stays: selections.map((s) => ({
      destination: s.destination,
      propertyName: s.offer.property.name,
      propertyCategory: s.offer.property.category,
      roomType: s.offer.roomType.name,
      mealPlan: MEAL_PLAN_LABELS[s.offer.mealPlan] ?? s.offer.mealPlan,
      checkIn: s.offer.stayStart,
      checkOut: s.offer.stayEnd,
      nights: s.offer.nights,
      cancellation: cancellationText(s.offer.cancellation),
      imageUrl: s.imageUrl ?? null,
    })),
    lineItems: lines.map((l) => ({ category: l.category, description: l.description, quantity: l.quantity, totalMinor: l.totalSellingMinor, optional: l.optional })),
    totals: {
      subtotalMinor: subtotal,
      discountMinor: pricing.discountMinor ?? 0,
      taxMinor: pricing.sellingTaxMinor ?? 0,
      totalPayableMinor: pricing.totalPayableMinor ?? (pricing.sellingPriceMinor ?? subtotal) + (pricing.sellingTaxMinor ?? 0),
    },
    inclusions: terms.inclusions ?? [],
    exclusions: terms.exclusions ?? [],
    terms: terms.terms ?? "",
    clientNotes: terms.clientNotes ?? "",
  };
}
