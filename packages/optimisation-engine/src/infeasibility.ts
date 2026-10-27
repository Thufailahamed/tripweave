import { formatMoney } from "@tripweave/shared";
import { filterCandidates, type Accepted } from "./constraints";
import type { InfeasibilityReport, RejectionCode, SearchInput, SearchStop, StopFunnel } from "./types";

const LABEL: Record<RejectionCode, string> = {
  dates_mismatch: "the offer dates do not match the stay",
  capacity: "the room type cannot accommodate the party",
  meal_plan: "the required meal plan is not offered",
  amenities: "required amenities are missing",
  category: "the hotel is below the minimum category",
  expired: "the rate has expired",
  unavailable: "no rooms are available",
  availability_unconfirmed: "availability is not confirmed",
  cancellation: "free cancellation is not offered",
  currency: "no exchange rate is available",
  over_budget: "the price exceeds the budget",
};

const RELAX: Record<RejectionCode, string> = {
  dates_mismatch: "Check the stay dates for this stop",
  capacity: "Allow additional rooms or larger room types",
  meal_plan: "Accept additional meal plans",
  amenities: "Make some required amenities optional",
  category: "Lower the minimum hotel category",
  expired: "Refresh supplier rates",
  unavailable: "Choose different dates or destinations",
  availability_unconfirmed: "Allow offers whose availability is unconfirmed",
  cancellation: "Allow non-refundable rates",
  currency: "Add an exchange rate for this currency",
  over_budget: "Increase the accommodation budget",
};

export function analyseInfeasibility(
  input: SearchInput,
  stops: SearchStop[],
  funnel: StopFunnel[],
  accepted: Accepted[][],
  nowIso: string,
): InfeasibilityReport {
  const reasons: InfeasibilityReport["reasons"] = [];
  const suggestions: string[] = [];
  let minimumBudget: number | null = null;
  const basis = input.budgetBasis ?? ((c: number) => c);

  stops.forEach((stop, i) => {
    const f = funnel[i]!;
    if (f.accepted > 0) return;
    if (f.total === 0) {
      reasons.push({ code: "no_candidates", stopId: stop.id, message: `No hotels were found for ${stop.destination}.` });
      suggestions.push(`Add hotels or enable supplier search for ${stop.destination}.`);
      return;
    }
    const top = Object.entries(f.rejections)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 3)
      .map(([code, n]) => `${LABEL[code as RejectionCode]} (${n})`)
      .join("; ");
    reasons.push({
      code: "no_valid_candidates",
      stopId: stop.id,
      message: `None of ${f.total} hotels for ${stop.destination} meet every requirement: ${top}.`,
    });
    for (const code of Object.keys(f.rejections) as RejectionCode[]) {
      const probe = filterCandidates(stop, input.candidatesByStop[stop.id] ?? [], input, { nowIso, ignore: new Set([code]) });
      if (probe.accepted.length > 0)
        suggestions.push(`${RELAX[code]} to admit ${probe.accepted.length} hotel(s) in ${stop.destination}.`);
    }
  });

  for (const leg of input.legs) {
    const max = input.constraints.maxLegDurationMinutes;
    if (max !== null && leg.durationMinutes !== null && leg.durationMinutes > max) {
      reasons.push({
        code: "route_constraint",
        stopId: leg.toStopId,
        message: `A ${Math.round(leg.durationMinutes)}-minute leg exceeds the ${max}-minute limit${leg.source === "estimated" ? " (estimated)" : ""}.`,
      });
      suggestions.push("Increase the maximum journey duration or reorder the itinerary stops.");
    }
  }

  if (accepted.every((a) => a.length > 0)) {
    const total = accepted.reduce((s, pool) => s + Math.min(...pool.map((p) => p.costMinor)), 0);
    const b = input.constraints.budgetMinor;
    if (b !== null && basis(total) > b) {
      minimumBudget = basis(total);
      reasons.push({
        code: "budget",
        message: `The cheapest valid combination costs ${formatMoney(basis(total), input.currency)}, above the ${formatMoney(b, input.currency)} budget.`,
      });
      suggestions.push(`Increase the budget to at least ${formatMoney(basis(total), input.currency)}.`);
    } else if (reasons.length === 0) {
      reasons.push({
        code: "no_distinct_assignment",
        message: "Every valid hotel is needed by more than one stop; no combination uses a different hotel at each stop.",
      });
      suggestions.push("Add more hotel options for the destinations.");
    }
  }
  return { reasons, suggestions: [...new Set(suggestions)], minimumBudgetMinor: minimumBudget };
}
