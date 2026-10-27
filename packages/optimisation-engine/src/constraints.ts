import { CATEGORY_RANK, type NormalisedOffer } from "@tripweave/shared";
import type {
  HardConstraints,
  PartyInfo,
  RejectionCode,
  SearchInput,
  SearchStop,
  StopFunnel,
} from "./types";

export interface Accepted {
  offer: NormalisedOffer;
  costMinor: number;
}

const norm = (s: string) => s.toLowerCase().trim();

/**
 * A Google Hotels offer can carry a rate-level breakfast-included total. When the trip requires
 * breakfast, use that total and promote the offer to a confirmed BB rate; otherwise keep the
 * cheaper cross-OTA price and leave the board basis unconfirmed.
 */
export function withStrictBreakfastOffer(offer: NormalisedOffer, c: Pick<HardConstraints, "requiredMealPlans">): NormalisedOffer {
  if (offer.providerKey !== "google_hotels" || !c.requiredMealPlans.includes("BB")) return offer;
  // Enrichment records rate-level evidence under `directEnrichment`; older flat metadata is still read
  // so offers stored before the nested shape was introduced keep working.
  const direct = offer.providerMetadata?.directEnrichment;
  const nested = direct && typeof direct === "object" && !Array.isArray(direct) ? (direct as Record<string, unknown>) : undefined;
  const total = offer.providerMetadata?.strictBreakfastTotalMinor ?? nested?.strictBreakfastTotalMinor;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) return offer;
  const sourceValue = offer.providerMetadata?.strictBreakfastSource ?? nested?.strictBreakfastSource;
  const roomValue = offer.providerMetadata?.strictBreakfastRoom ?? nested?.strictBreakfastRoom;
  const source = typeof sourceValue === "string" ? sourceValue : offer.supplierName;
  const room = typeof roomValue === "string" ? roomValue : null;
  return {
    ...offer,
    mealPlan: "BB",
    mealPlanStatus: "confirmed",
    totalAmountMinor: total,
    supplierName: `${source} via Google Hotels`,
    roomType: room ? { ...offer.roomType, name: room } : offer.roomType,
    providerMetadata: {
      ...offer.providerMetadata,
      boardBasisSource: "rate",
      priceBasis: "strict_breakfast",
    },
  };
}

export function missingAmenities(offer: NormalisedOffer, required: string[]): string[] {
  const have = new Set([...offer.property.amenities].map(norm));
  return required.filter((r) => !have.has(norm(r)));
}

/** Verifies that every room in the party fits the offered room type. */
export function roomsFit(offer: NormalisedOffer, party: PartyInfo): boolean {
  if (offer.roomsRequired < party.rooms.length) return false;
  return party.rooms.every(
    (r) => r.adults + r.children <= offer.roomType.maxOccupancy && r.adults <= offer.roomType.maxAdults,
  );
}

export function rejectionReasons(
  offer: NormalisedOffer,
  stop: SearchStop,
  c: HardConstraints,
  party: PartyInfo,
  nowIso: string,
  convert: SearchInput["convert"],
  ignore: ReadonlySet<RejectionCode> = new Set(),
): RejectionCode[] {
  const out: RejectionCode[] = [];
  const add = (code: RejectionCode, cond: boolean) => {
    if (cond && !ignore.has(code)) out.push(code);
  };
  add("dates_mismatch", offer.stayStart !== stop.arrivalDate || offer.stayEnd !== stop.departureDate);
  add("capacity", !roomsFit(offer, party));
  add(
    "meal_plan",
    c.requiredMealPlans.length > 0 &&
      !(
        (offer.mealPlanStatus !== "unconfirmed" && c.requiredMealPlans.includes(offer.mealPlan)) ||
        (c.allowUnconfirmedMealPlans && offer.mealPlanStatus === "unconfirmed")
      ),
  );
  add("amenities", c.requiredAmenities.length > 0 && missingAmenities(offer, c.requiredAmenities).length > 0);
  add(
    "category",
    c.minimumCategory !== null &&
      (offer.property.category === null || CATEGORY_RANK[offer.property.category] < CATEGORY_RANK[c.minimumCategory]),
  );
  add(
    "expired",
    offer.verificationStatus === "expired" || (offer.expiresAt !== null && offer.expiresAt < nowIso),
  );
  add("unavailable", offer.availabilityStatus === "unavailable" || offer.verificationStatus === "unavailable");
  add(
    "availability_unconfirmed",
    c.requireConfirmedAvailability && offer.availabilityStatus !== "confirmed",
  );
  add("cancellation", c.requireFreeCancellation && offer.cancellation.refundable !== true);
  add("currency", convert(offer.totalAmountMinor, offer.currency) === null);
  return out;
}

export interface FilterOptions {
  nowIso: string;
  ignore?: ReadonlySet<RejectionCode>;
}

export function filterCandidates(
  stop: SearchStop,
  offers: NormalisedOffer[],
  input: Pick<SearchInput, "constraints" | "party" | "convert" | "budgetBasis">,
  opts: FilterOptions,
): { accepted: Accepted[]; funnel: StopFunnel } {
  const rejections: StopFunnel["rejections"] = {};
  const accepted: Accepted[] = [];
  const seen = new Set<string>();
  for (const original of offers) {
    if (seen.has(original.offerId)) continue;
    seen.add(original.offerId);
    const offer = withStrictBreakfastOffer(original, input.constraints);
    const reasons = rejectionReasons(offer, stop, input.constraints, input.party, opts.nowIso, input.convert, opts.ignore);
    const cost = input.convert(offer.totalAmountMinor, offer.currency);
    if (
      reasons.length === 0 &&
      cost !== null &&
      input.constraints.strictBudget &&
      input.constraints.budgetMinor !== null &&
      (input.budgetBasis?.(cost) ?? cost) > input.constraints.budgetMinor &&
      !opts.ignore?.has("over_budget")
    ) {
      reasons.push("over_budget");
    }
    if (reasons.length > 0) {
      for (const r of reasons) rejections[r] = (rejections[r] ?? 0) + 1;
      continue;
    }
    accepted.push({ offer, costMinor: cost! });
  }
  return {
    accepted,
    funnel: { stopId: stop.id, destination: stop.destination, total: seen.size, accepted: accepted.length, rejections },
  };
}
