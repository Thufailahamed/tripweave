import { compareDates, dateInRange, eachNight, nightsBetween, percentOf, type RoomAllocation } from "@tripweave/shared";

export interface RateRuleLike {
  id: string;
  applicableStartDate: string;
  applicableEndDate: string;
  amountMinor: number;
  priority: number;
  occupancyConditions: { minAdults?: number; maxAdults?: number };
  taxTreatment: { included: boolean; taxBp: number; serviceChargeBp: number };
  extraPersonRules: { baseAdults: number; extraAdultMinor: number; extraChildMinor: number; childFreeUnderAge: number };
  blackoutDates: string[];
  updatedAt?: string;
}

export interface RatePlanLike {
  id: string;
  currency: string;
  pricingBasis: "per_room_per_night" | "per_person_per_night";
  minimumNights: number;
  maximumNights: number | null;
  effectiveFrom: string;
  effectiveTo: string;
  status: string;
}

/**
 * Rate precedence (explicit, documented in docs/pricing.md):
 *  1. Rule must cover the date, must not list the date as a blackout and must match the room's adult occupancy.
 *  2. Higher `priority` wins.
 *  3. Narrower date span wins (a single-date rate beats a seasonal rate).
 *  4. More recently updated wins.
 *  5. Lexicographically greater id wins (deterministic final tie-break).
 */
export function selectRuleForDate(rules: RateRuleLike[], date: string, adults: number): RateRuleLike | null {
  const eligible = rules.filter((r) => {
    if (!dateInRange(date, r.applicableStartDate, r.applicableEndDate)) return false;
    if (r.blackoutDates.includes(date)) return false;
    const { minAdults, maxAdults } = r.occupancyConditions;
    if (minAdults !== undefined && adults < minAdults) return false;
    if (maxAdults !== undefined && adults > maxAdults) return false;
    return true;
  });
  if (eligible.length === 0) return null;
  const span = (r: RateRuleLike) => nightsBetween(r.applicableStartDate, r.applicableEndDate);
  eligible.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (span(a) !== span(b)) return span(a) - span(b);
    const ua = a.updatedAt ?? "";
    const ub = b.updatedAt ?? "";
    if (ua !== ub) return ua < ub ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  return eligible[0] ?? null;
}

export interface RoomNightPrice {
  baseMinor: number;
  extrasMinor: number;
  serviceChargeMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxesIncluded: boolean;
}

export function priceRoomNight(
  rule: RateRuleLike,
  plan: Pick<RatePlanLike, "pricingBasis">,
  room: RoomAllocation,
): RoomNightPrice {
  const x = rule.extraPersonRules;
  const ages = room.childAges ?? [];
  // If a child's age is unknown we conservatively treat the child as chargeable.
  const chargeableChildren = Array.from({ length: room.children }, (_, i) => ages[i]).filter(
    (age) => age === undefined || age >= x.childFreeUnderAge,
  ).length;

  let base: number;
  let extras = 0;
  if (plan.pricingBasis === "per_person_per_night") {
    base = rule.amountMinor * (room.adults + chargeableChildren);
  } else {
    base = rule.amountMinor;
    extras += Math.max(0, room.adults - x.baseAdults) * x.extraAdultMinor;
    extras += chargeableChildren * x.extraChildMinor;
  }
  const net = base + extras;
  const t = rule.taxTreatment;
  if (t.included) {
    // Gross price quoted; derive the embedded tax purely for reporting.
    const denom = (10_000 + t.serviceChargeBp) * (10_000 + t.taxBp);
    const netOfTax = denom > 0 ? Math.round((net * 10_000 * 10_000) / denom) : net;
    const sc = percentOf(netOfTax, t.serviceChargeBp);
    const tax = net - netOfTax - sc;
    return {
      baseMinor: netOfTax,
      extrasMinor: 0,
      serviceChargeMinor: sc,
      taxMinor: Math.max(0, tax),
      totalMinor: net,
      taxesIncluded: true,
    };
  }
  const sc = percentOf(net, t.serviceChargeBp);
  const tax = percentOf(net + sc, t.taxBp);
  return {
    baseMinor: base,
    extrasMinor: extras,
    serviceChargeMinor: sc,
    taxMinor: tax,
    totalMinor: net + sc + tax,
    taxesIncluded: false,
  };
}

export type StayPriceFailure =
  | "plan_inactive"
  | "plan_not_effective"
  | "below_minimum_nights"
  | "above_maximum_nights"
  | "no_rate_for_date"
  | "invalid_dates";

export type StayPriceResult =
  | {
      ok: true;
      currency: string;
      nights: number;
      nightly: { date: string; amountMinor: number }[];
      totalMinor: number;
      taxMinor: number;
      serviceChargeMinor: number;
      taxesIncluded: boolean;
      ruleIds: string[];
    }
  | { ok: false; reason: StayPriceFailure; detail?: string };

export function priceStay(
  plan: RatePlanLike,
  rules: RateRuleLike[],
  input: { checkIn: string; checkOut: string; rooms: RoomAllocation[] },
): StayPriceResult {
  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights < 1) return { ok: false, reason: "invalid_dates" };
  if (plan.status !== "active") return { ok: false, reason: "plan_inactive" };
  const lastNight = eachNight(input.checkIn, input.checkOut).at(-1)!;
  if (compareDates(input.checkIn, plan.effectiveFrom) < 0 || compareDates(lastNight, plan.effectiveTo) > 0)
    return { ok: false, reason: "plan_not_effective" };
  if (nights < plan.minimumNights) return { ok: false, reason: "below_minimum_nights" };
  if (plan.maximumNights !== null && nights > plan.maximumNights) return { ok: false, reason: "above_maximum_nights" };

  const nightly: { date: string; amountMinor: number }[] = [];
  let tax = 0;
  let service = 0;
  let included = true;
  const ruleIds = new Set<string>();
  for (const date of eachNight(input.checkIn, input.checkOut)) {
    let dayTotal = 0;
    for (const room of input.rooms) {
      const rule = selectRuleForDate(rules, date, room.adults);
      if (!rule) return { ok: false, reason: "no_rate_for_date", detail: date };
      const p = priceRoomNight(rule, plan, room);
      dayTotal += p.totalMinor;
      tax += p.taxMinor;
      service += p.serviceChargeMinor;
      included = included && p.taxesIncluded;
      ruleIds.add(rule.id);
    }
    nightly.push({ date, amountMinor: dayTotal });
  }
  return {
    ok: true,
    currency: plan.currency,
    nights,
    nightly,
    totalMinor: nightly.reduce((s, n) => s + n.amountMinor, 0),
    taxMinor: tax,
    serviceChargeMinor: service,
    taxesIncluded: included,
    ruleIds: [...ruleIds],
  };
}
