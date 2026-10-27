import { MEAL_PLAN_LABELS, OBJECTIVE_LABELS, formatMoney, type OptimisationObjective } from "@tripweave/shared";
import type { CandidatePackage, PackageSelection } from "./types";

const OBJECTIVE_REASON: Record<OptimisationObjective, string> = {
  budget_explorer: "Lowest overall cost among combinations that meet every mandatory requirement.",
  best_value: "Best balance of hotel quality, location and flexibility relative to price.",
  comfort_journey: "Prioritises well-located, well-reviewed hotels with sensible travel between stops.",
  premium_experience: "Prioritises the highest quality properties and amenities available within the constraints.",
  company_preferred: "Prioritises contracted inventory and preferred partner properties.",
};

const SOURCE_TEXT: Record<string, string> = {
  company_managed: "company-managed contract rate",
  supplier_reported: "supplier-reported rate (not price-checked)",
  live_checked: "live price check passed",
  estimated: "estimated rate",
  requires_confirmation: "rate requires confirmation",
  expired: "expired rate",
  unavailable: "unavailable",
  booked: "booked",
};

function describeSelection(s: PackageSelection, currency: string): string {
  const o = s.offer;
  return `${s.destination}: ${o.property.name} – ${o.roomType.name}, ${MEAL_PLAN_LABELS[o.mealPlan]}, ${o.nights} night${o.nights === 1 ? "" : "s"} (${formatMoney(s.costMinor, currency)})`;
}

/**
 * Deterministic, fully grounded explanation. Every figure comes from structured results; an AI
 * layer may rephrase it but must not add facts (see packages/ai explainer guardrails).
 */
export function buildExplanation(pkg: Omit<CandidatePackage, "explanation" | "assumptions" | "unverified">): {
  explanation: string[];
  assumptions: string[];
  unverified: string[];
} {
  const cur = pkg.currency;
  const nights = pkg.selections.reduce((s, x) => s + x.offer.nights, 0);
  const explanation: string[] = [OBJECTIVE_REASON[pkg.objective]];
  explanation.push(
    `Total accommodation cost ${formatMoney(pkg.totalCostMinor, cur)} for ${nights} night${nights === 1 ? "" : "s"} (${formatMoney(pkg.costPerNightMinor, cur)} per night).`,
  );
  if (pkg.budgetDifferenceMinor !== null) {
    explanation.push(
      pkg.budgetDifferenceMinor >= 0
        ? `${formatMoney(pkg.budgetDifferenceMinor, cur)} under the stated budget.`
        : `${formatMoney(-pkg.budgetDifferenceMinor, cur)} over the stated budget.`,
    );
  }
  for (const s of pkg.selections) explanation.push(describeSelection(s, cur));

  const refundable = pkg.selections.filter((s) => s.offer.cancellation.refundable === true).length;
  const nonRefundable = pkg.selections.filter((s) => s.offer.cancellation.refundable === false).length;
  if (nonRefundable > 0)
    explanation.push(`${nonRefundable} of ${pkg.selections.length} stays are non-refundable; ${refundable} offer free cancellation.`);
  else if (refundable === pkg.selections.length) explanation.push("All stays offer free cancellation under the stated terms.");

  if (pkg.travel.totalDriveMinutes !== null && pkg.travel.legs.length > 0) {
    explanation.push(
      `Total driving between stops is about ${Math.round(pkg.travel.totalDriveMinutes / 6) / 10} hours${pkg.travel.anyEstimated ? " (estimated, no routing data)" : ""}.`,
    );
  }

  const assumptions: string[] = [];
  const unverified: string[] = [];
  for (const s of pkg.selections) {
    const o = s.offer;
    const src = SOURCE_TEXT[o.verificationStatus] ?? o.verificationStatus;
    explanation.push(`${o.property.name}: ${src}; retrieved ${o.retrievedAt.slice(0, 10)}${o.isMock ? " – ILLUSTRATIVE DATA, not a live price" : ""}.`);
    if (o.isMock) unverified.push(`${o.property.name}: illustrative mock data, not a real rate.`);
    if (o.availabilityStatus !== "confirmed")
      unverified.push(`${o.property.name}: availability is ${o.availabilityStatus.replace("_", " ")}, not confirmed.`);
    if (o.verificationStatus !== "live_checked" && o.verificationStatus !== "company_managed")
      unverified.push(`${o.property.name}: price has not been live-checked.`);
    if (o.mealPlanStatus === "unconfirmed") {
      const basis = o.providerMetadata?.breakfastBasis;
      assumptions.push(
        o.providerKey === "google_hotels" && basis === "free"
          ? `${o.property.name}: Google Hotels lists free breakfast, but the booked rate's board basis must be confirmed before quoting.`
          : `${o.property.name}: the meal plan (${MEAL_PLAN_LABELS[o.mealPlan]}) is not published by the source and must be confirmed before quoting.`,
      );
    }
    if (s.metrics.unrated) assumptions.push(`${o.property.name} has no verified guest rating; quality was scored conservatively.`);
    if (s.metrics.centreDistanceKm === null) assumptions.push(`${o.property.name}: location relative to ${s.destination} is unknown.`);
    if (o.currency !== cur) assumptions.push(`${o.property.name} is priced in ${o.currency} and converted to ${cur} using the job's exchange-rate snapshot.`);
    if (o.expiresAt) assumptions.push(`${o.property.name}: offer expires ${o.expiresAt.slice(0, 16).replace("T", " ")} UTC.`);
  }
  if (pkg.travel.anyUnavailable) assumptions.push("Travel time is unavailable for some legs because coordinates are missing.");
  return { explanation, assumptions: [...new Set(assumptions)], unverified: [...new Set(unverified)] };
}

export function objectiveLabel(o: OptimisationObjective): string {
  return OBJECTIVE_LABELS[o];
}
