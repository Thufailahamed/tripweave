import { addDays, eachNight, nightsBetween, type HotelCategory, type MealPlan, type NormalisedOffer, type RoomAllocation } from "@tripweave/shared";
import { priceStay, type RatePlanLike, type RateRuleLike } from "@tripweave/pricing-engine";
import type { HotelAvailabilityInput, HotelProvider, HotelSearchInput, PriceCheckInput, PriceCheckResult, PropertySearchResult, RoomOffer } from "./types";

/** Structural view of the data the internal provider needs (satisfied by database.inventory.InternalInventory). */
export interface InternalProperty {
  id: string; ownerOrganizationId: string | null; name: string; city: string; latitude: number | null; longitude: number | null;
  category: HotelCategory; starClassification: number | null; reviewScore: number | null; amenities: string[]; preferredPartner: boolean;
}
export interface InternalRoomType { id: string; propertyId: string; name: string; maximumAdults: number; maximumOccupancy: number }
export interface InternalPlan extends RatePlanLike {
  organizationId: string; propertyId: string; roomTypeId: string; name: string; mealPlan: MealPlan; supplierId: string | null; supplierAgreementId: string | null;
  cancellationPolicy: { refundable?: boolean; freeCancellationDaysBeforeArrival?: number; penaltyDescription?: string };
  paymentTerms: { type?: string; description?: string }; scope: string;
}
export interface InternalAgreement { id: string; status: string; effectiveFrom: string; effectiveTo: string; contractReference: string }
export interface InternalInventoryData {
  properties: InternalProperty[];
  roomTypes: Map<string, InternalRoomType[]>;
  plans: Map<string, InternalPlan[]>;
  rules: Map<string, (RateRuleLike & { ratePlanId: string })[]>;
  inventory: Map<string, Map<string, number | null>>;
  agreements: Map<string, InternalAgreement>;
  suppliers: Map<string, { id: string; name: string }>;
}
export interface InternalInventorySource {
  load(q: { organizationId: string; destination: string; checkIn: string; checkOut: string }): Promise<InternalInventoryData>;
}

export const INTERNAL_PROVIDER_KEY = "internal";

/** Smallest number of identical rooms that can hold the party, honouring each room's allocation. */
function roomsFor(party: HotelSearchInput["party"], room: InternalRoomType): RoomAllocation[] | null {
  for (const r of party.rooms) {
    if (r.adults > room.maximumAdults || r.adults + r.children > room.maximumOccupancy) return null;
  }
  return party.rooms;
}

function availability(inv: Map<string, number | null> | undefined, nights: string[], rooms: number): NormalisedOffer["availabilityStatus"] {
  if (!inv) return "unknown";
  let unknown = false;
  for (const d of nights) {
    if (!inv.has(d)) {
      unknown = true;
      continue;
    }
    const q = inv.get(d);
    if (q === null || q === undefined) unknown = true;
    else if (q < rooms) return "unavailable";
  }
  return unknown ? "unknown" : "confirmed";
}

/** Company-managed contract rates (own plans, plus plans partners explicitly shared). */
export class InternalInventoryProvider implements HotelProvider {
  readonly key = INTERNAL_PROVIDER_KEY;
  readonly displayName = "Company inventory";
  readonly isMock = false;
  constructor(private readonly source: InternalInventorySource, private readonly now: () => Date = () => new Date()) {}

  async searchProperties(input: HotelSearchInput): Promise<PropertySearchResult[]> {
    const data = await this.source.load({ organizationId: input.organizationId, destination: input.destination, checkIn: input.checkIn, checkOut: input.checkOut });
    return data.properties.map((p) => ({ providerKey: this.key, externalPropertyId: p.id, name: p.name, destination: p.city, latitude: p.latitude, longitude: p.longitude, category: p.category, starRating: p.starClassification, reviewScore: p.reviewScore, amenities: p.amenities, isMock: false }));
  }

  async getAvailability(input: HotelAvailabilityInput): Promise<RoomOffer[]> {
    const data = await this.source.load({ organizationId: input.organizationId, destination: input.destination, checkIn: input.checkIn, checkOut: input.checkOut });
    const offers: RoomOffer[] = [];
    const nights = nightsBetween(input.checkIn, input.checkOut);
    const nightDates = eachNight(input.checkIn, input.checkOut);
    const lastNight = nightDates.at(-1);
    const retrievedAt = this.now().toISOString();
    for (const prop of data.properties) {
      if (input.propertyIds && !input.propertyIds.includes(prop.id)) continue;
      for (const room of data.roomTypes.get(prop.id) ?? []) {
        const rooms = roomsFor(input.party, room);
        if (!rooms) continue;
        for (const plan of (data.plans.get(prop.id) ?? []).filter((p) => p.roomTypeId === room.id)) {
          const agreement = plan.supplierAgreementId ? data.agreements.get(plan.supplierAgreementId) : undefined;
          if (plan.supplierAgreementId && plan.scope === "owner") {
            // A plan tied to an agreement is only usable while that agreement is valid for the whole stay.
            if (!agreement || agreement.status !== "active" || agreement.effectiveFrom > input.checkIn || (lastNight && agreement.effectiveTo < lastNight)) continue;
          }
          const priced = priceStay(plan, data.rules.get(plan.id) ?? [], { checkIn: input.checkIn, checkOut: input.checkOut, rooms });
          if (!priced.ok) continue;
          const policy = plan.cancellationPolicy;
          const freeUntil = policy.refundable && policy.freeCancellationDaysBeforeArrival !== undefined ? addDays(input.checkIn, -policy.freeCancellationDaysBeforeArrival) : null;
          const supplier = plan.supplierId ? data.suppliers.get(plan.supplierId) : undefined;
          const indicative = plan.scope === "indicative_only";
          const offerId = `int:${plan.id}:${input.checkIn}:${input.checkOut}:${rooms.map((r) => `${r.adults}-${r.children}`).join("_")}`;
          offers.push({
            offerId,
            providerKey: this.key,
            externalOfferReference: offerId,
            source: "internal",
            supplierId: plan.supplierId,
            supplierName: supplier?.name ?? "Company contract",
            property: { id: prop.id, name: prop.name, destination: prop.city, latitude: prop.latitude, longitude: prop.longitude, category: prop.category, starRating: prop.starClassification, reviewScore: prop.reviewScore, amenities: prop.amenities, ownerOrganizationId: prop.ownerOrganizationId, preferredPartner: prop.preferredPartner },
            roomType: { id: room.id, name: room.name, maxOccupancy: room.maximumOccupancy, maxAdults: room.maximumAdults },
            stayStart: input.checkIn,
            stayEnd: input.checkOut,
            nights,
            mealPlan: plan.mealPlan,
            roomsRequired: rooms.length,
            occupancy: input.party,
            totalAmountMinor: priced.totalMinor,
            currency: priced.currency,
            taxAmountMinor: priced.taxMinor,
            feeAmountMinor: priced.serviceChargeMinor,
            taxesIncluded: priced.taxesIncluded,
            nightlyRates: priced.nightly,
            cancellation: { refundable: policy.refundable ?? null, freeCancellationUntil: freeUntil, penaltyDescription: policy.penaltyDescription ?? null },
            payment: { type: (plan.paymentTerms.type as "credit") ?? "unknown", description: plan.paymentTerms.description ?? null },
            retrievedAt,
            expiresAt: null,
            availabilityStatus: availability(data.inventory.get(room.id), nightDates, rooms.length),
            verificationStatus: indicative ? "estimated" : "company_managed",
            providerMetadata: { ratePlanName: plan.name, ruleIds: priced.ruleIds, shared: plan.scope !== "owner", rateScope: plan.scope },
            isMock: false,
            rateSource: { ratePlanId: plan.id, ...(plan.scope === "owner" && agreement ? { agreementId: agreement.id, contractReference: agreement.contractReference } : {}) },
          });
        }
      }
    }
    return offers;
  }

  /** Company rates are recomputed from current rules; supplier-side live checks do not apply. */
  async recheckPrice(input: PriceCheckInput): Promise<PriceCheckResult> {
    const o = input.offer;
    const checkedAt = this.now().toISOString();
    const fresh = (await this.getAvailability({ organizationId: input.organizationId, destination: o.property.destination, checkIn: o.stayStart, checkOut: o.stayEnd, party: input.party, propertyIds: [o.property.id] })).find((x) => x.offerId === o.offerId);
    if (!fresh) return { status: "unavailable", offer: null, previousTotalMinor: o.totalAmountMinor, currentTotalMinor: null, message: "The rate is no longer valid or available.", checkedAt };
    if (fresh.availabilityStatus === "unavailable") return { status: "unavailable", offer: { ...fresh, verificationStatus: "unavailable" }, previousTotalMinor: o.totalAmountMinor, currentTotalMinor: fresh.totalAmountMinor, message: "No rooms left in inventory.", checkedAt };
    return { status: fresh.totalAmountMinor === o.totalAmountMinor ? "confirmed" : "price_changed", offer: fresh, previousTotalMinor: o.totalAmountMinor, currentTotalMinor: fresh.totalAmountMinor, checkedAt };
  }
}
