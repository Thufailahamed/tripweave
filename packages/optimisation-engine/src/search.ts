import type { NormalisedOffer, OptimisationObjective, RouteLeg } from "@tripweave/shared";
import { filterCandidates, rejectionReasons, type Accepted } from "./constraints";
import { buildExplanation } from "./explain";
import { analyseInfeasibility } from "./infeasibility";
import {
  DEFAULT_CONFIG,
  DEFAULT_WEIGHTS,
  budgetFit,
  combine,
  scorePool,
  stopScore,
  weightsFor,
} from "./scoring";
import type {
  CandidateMetrics,
  CandidatePackage,
  PackageScore,
  PackageSelection,
  RejectionCode,
  SearchConfig,
  SearchInput,
  SearchResult,
  SearchStop,
  StopFunnel,
} from "./types";

interface Ctx {
  input: SearchInput;
  cfg: SearchConfig;
  stops: SearchStop[];
  accepted: Accepted[][];
  metrics: Map<string, CandidateMetrics>[];
  basis: (c: number) => number;
  poolMinBasis: number;
  poolMaxBasis: number;
}

interface Partial_ {
  picks: Accepted[];
  cost: number;
  score: number;
  props: Set<string>;
  sig: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function travelSummary(legs: RouteLeg[]): CandidatePackage["travel"] {
  const known = legs.filter((l) => l.durationMinutes !== null);
  return {
    legs,
    totalDriveMinutes: known.length > 0 ? known.reduce((s, l) => s + (l.durationMinutes ?? 0), 0) : null,
    anyEstimated: legs.some((l) => l.source === "estimated"),
    anyUnavailable: legs.some((l) => l.source === "unavailable" || l.durationMinutes === null),
  };
}

function legConvenience(ctx: Ctx): number {
  const known = ctx.input.legs.filter((l) => l.durationMinutes !== null);
  if (known.length === 0) return ctx.stops.length <= 1 ? 1 : ctx.cfg.missingDataScore;
  const avg = known.reduce((s, l) => s + (l.durationMinutes ?? 0), 0) / known.length;
  const ref = ctx.input.constraints.maxLegDurationMinutes ?? 300;
  return clamp01(1 - avg / ref);
}

function buildPackage(ctx: Ctx, picks: Accepted[], objective: OptimisationObjective): CandidatePackage {
  const w = weightsFor(objective, ctx.cfg);
  const totalNights = ctx.stops.reduce((s, st) => s + st.nights, 0) || 1;
  const selections: PackageSelection[] = picks.map((p, i) => {
    const stop = ctx.stops[i]!;
    return {
      stopId: stop.id,
      destination: stop.destination,
      offer: p.offer,
      costMinor: p.costMinor,
      metrics: ctx.metrics[i]!.get(p.offer.offerId)!,
    };
  });
  const weighted = (pick: (m: CandidateMetrics) => number) =>
    selections.reduce((s, sel, i) => s + pick(sel.metrics) * ctx.stops[i]!.nights, 0) / totalNights;
  const total = selections.reduce((s, x) => s + x.costMinor, 0);
  const basisCost = ctx.basis(total);
  const budget = ctx.input.constraints.budgetMinor;
  const breakdown: PackageScore = {
    budgetFit: budgetFit(basisCost, budget, ctx.poolMinBasis, ctx.poolMaxBasis),
    quality: weighted((m) => m.quality),
    location: 0.5 * weighted((m) => m.location) + 0.5 * legConvenience(ctx),
    amenities: weighted((m) => m.amenities),
    cancellation: weighted((m) => m.cancellation),
    preference: weighted((m) => m.preference),
    value: weighted((m) => m.value),
  };
  const base = {
    objective,
    signature: selections.map((s) => s.offer.offerId).join("|"),
    selections,
    currency: ctx.input.currency,
    totalCostMinor: total,
    costPerNightMinor: Math.round(total / totalNights),
    budgetDifferenceMinor: budget === null ? null : budget - basisCost,
    withinBudget: budget === null ? null : basisCost <= budget,
    objectiveScore: Math.round(combine(breakdown, w) * 1000) / 10,
    score: Math.round(combine(breakdown, DEFAULT_WEIGHTS) * 1000) / 10,
    breakdown,
    travel: travelSummary(ctx.input.legs),
  };
  return { ...base, ...buildExplanation(base) };
}

const CLAIM_PRIORITY: OptimisationObjective[] = ["budget_explorer", "premium_experience", "company_preferred", "comfort_journey", "best_value"];

/** Objectives whose primary goal is lowest total cost (all mandatory constraints still apply). */
function isCostFirst(objective: OptimisationObjective): boolean {
  return objective === "budget_explorer";
}

function beam(ctx: Ctx, objective: OptimisationObjective, deadline: number, clock: () => number, counters: { evaluated: number; timedOut: boolean }): Partial_[] {
  const w = weightsFor(objective, ctx.cfg);
  const { stops, cfg } = ctx;
  const budget = ctx.input.constraints.strictBudget ? ctx.input.constraints.budgetMinor : null;
  const costFirst = isCostFirst(objective);

  // Candidate pools: top-N by stop score plus the two cheapest so cost-constrained search stays feasible.
  const pools = stops.map((_, i) => {
    const all = ctx.accepted[i]!;
    const m = ctx.metrics[i]!;
    const ranked = [...all].sort(
      (a, b) =>
        (costFirst ? 0 : stopScore(m.get(b.offer.offerId)!, w) - stopScore(m.get(a.offer.offerId)!, w)) ||
        a.costMinor - b.costMinor ||
        stopScore(m.get(b.offer.offerId)!, w) - stopScore(m.get(a.offer.offerId)!, w) ||
        a.offer.offerId.localeCompare(b.offer.offerId),
    );
    const top = ranked.slice(0, cfg.candidateLimitPerStop);
    const cheapest = [...all].sort((a, b) => a.costMinor - b.costMinor || a.offer.offerId.localeCompare(b.offer.offerId)).slice(0, 2);
    for (const c of cheapest) if (!top.includes(c)) top.push(c);
    return top;
  });
  const minRemaining = stops.map((_, i) =>
    ctx.accepted.slice(i + 1).reduce((s, pool) => s + Math.min(...pool.map((p) => p.costMinor)), 0),
  );

  let beams: Partial_[] = [{ picks: [], cost: 0, score: 0, props: new Set(), sig: "" }];
  for (let i = 0; i < stops.length; i++) {
    const width = counters.timedOut ? 1 : cfg.beamWidth;
    const next: Partial_[] = [];
    for (const partial of beams) {
      if (!counters.timedOut && clock() > deadline) counters.timedOut = true;
      for (const cand of pools[i]!) {
        if (partial.props.has(cand.offer.property.id)) continue;
        const cost = partial.cost + cand.costMinor;
        if (budget !== null && ctx.basis(cost + minRemaining[i]!) > budget) continue;
        counters.evaluated++;
        next.push({
          picks: [...partial.picks, cand],
          cost,
          score: partial.score + stopScore(ctx.metrics[i]!.get(cand.offer.offerId)!, w),
          props: new Set([...partial.props, cand.offer.property.id]),
          sig: `${partial.sig}|${cand.offer.offerId}`,
        });
      }
    }
    // Budget Explorer minimises cost outright (the score only breaks ties); other objectives maximise the weighted score.
    next.sort((a, b) => (costFirst ? a.cost - b.cost || b.score - a.score : b.score - a.score || a.cost - b.cost) || a.sig.localeCompare(b.sig));
    beams = next.slice(0, counters.timedOut ? 1 : width);
    if (beams.length === 0) return [];
  }
  return beams;
}

function differingStops(a: CandidatePackage, b: CandidatePackage): number {
  return a.selections.filter((s, i) => s.offer.property.id !== b.selections[i]?.offer.property.id).length;
}

function tooSimilar(p: CandidatePackage, chosen: CandidatePackage[], cfg: SearchConfig): CandidatePackage | null {
  for (const c of chosen) {
    const diff = differingStops(p, c);
    const deltaBp = Math.round((Math.abs(p.totalCostMinor - c.totalCostMinor) * 10_000) / Math.max(c.totalCostMinor, 1));
    if (diff < cfg.minDifferingStops || (diff * 2 < p.selections.length && deltaBp < cfg.minCostDeltaBp)) return c;
  }
  return null;
}

function prepare(input: SearchInput): {
  ctx: Ctx | null;
  funnel: StopFunnel[];
  accepted: Accepted[][];
  nowIso: string;
  cfg: SearchConfig;
} {
  const cfg: SearchConfig = { ...DEFAULT_CONFIG, ...input.config };
  const clock = input.now ?? Date.now;
  const nowIso = new Date(clock()).toISOString();
  const basis = input.budgetBasis ?? ((c: number) => c);
  const funnel: StopFunnel[] = [];
  const accepted: Accepted[][] = [];
  for (const stop of input.stops) {
    const r = filterCandidates(stop, input.candidatesByStop[stop.id] ?? [], input, { nowIso });
    funnel.push(r.funnel);
    accepted.push(r.accepted);
  }
  if (accepted.some((a) => a.length === 0)) return { ctx: null, funnel, accepted, nowIso, cfg };
  const metrics = input.stops.map((s, i) => scorePool(s, accepted[i]!, input.preferredAmenities, cfg));
  const minTotal = accepted.reduce((s, p) => s + Math.min(...p.map((x) => x.costMinor)), 0);
  const maxTotal = accepted.reduce((s, p) => s + Math.max(...p.map((x) => x.costMinor)), 0);
  return {
    ctx: {
      input,
      cfg,
      stops: input.stops,
      accepted,
      metrics,
      basis,
      poolMinBasis: basis(minTotal),
      poolMaxBasis: basis(maxTotal),
    },
    funnel,
    accepted,
    nowIso,
    cfg,
  };
}

/** Bounded beam search producing diverse, genuinely different packages per objective. */
export function runSearch(input: SearchInput): SearchResult {
  const clock = input.now ?? Date.now;
  const started = clock();
  const { ctx, funnel, accepted, nowIso, cfg } = prepare(input);
  const warnings: string[] = [];
  const stats = { combinationsEvaluated: 0, beamWidth: cfg.beamWidth, timedOut: false, durationMs: 0 };

  const routeBlock = input.legs.some(
    (l) => input.constraints.maxLegDurationMinutes !== null && l.durationMinutes !== null && l.durationMinutes > input.constraints.maxLegDurationMinutes,
  );
  if (!ctx || routeBlock || input.stops.length === 0) {
    stats.durationMs = clock() - started;
    return {
      packages: [],
      funnel,
      infeasible: analyseInfeasibility(input, input.stops, funnel, accepted, nowIso),
      omittedObjectives: input.objectives.map((o) => ({ objective: o, reason: "No feasible combination exists." })),
      stats,
      warnings,
    };
  }

  const counters = { evaluated: 0, timedOut: false };
  const deadline = started + cfg.timeoutMs;
  const ranked = new Map<OptimisationObjective, CandidatePackage[]>();
  for (const objective of input.objectives) {
    const finals = beam(ctx, objective, deadline, clock, counters);
    const pkgs = finals.map((f) => buildPackage(ctx, f.picks, objective));
    pkgs.sort((a, b) => (isCostFirst(objective) ? a.totalCostMinor - b.totalCostMinor || b.objectiveScore - a.objectiveScore : b.objectiveScore - a.objectiveScore || a.totalCostMinor - b.totalCostMinor) || a.signature.localeCompare(b.signature));
    ranked.set(objective, pkgs);
  }
  stats.combinationsEvaluated = counters.evaluated;
  stats.timedOut = counters.timedOut;
  if (counters.timedOut) warnings.push("The search hit its time limit; results come from a reduced (greedy) search and may not be optimal.");

  if ([...ranked.values()].every((r) => r.length === 0)) {
    stats.durationMs = clock() - started;
    return {
      packages: [],
      funnel,
      infeasible: analyseInfeasibility(input, input.stops, funnel, accepted, nowIso),
      omittedObjectives: input.objectives.map((o) => ({ objective: o, reason: "No feasible combination exists." })),
      stats,
      warnings,
    };
  }

  const chosen: CandidatePackage[] = [];
  const omitted: SearchResult["omittedObjectives"] = [];
  // Distinctive objectives claim their best combination first; balanced ones take the next best distinct
  // option. Output is returned in the order the caller asked for.
  const claimOrder = [...input.objectives].sort((a, b) => CLAIM_PRIORITY.indexOf(a) - CLAIM_PRIORITY.indexOf(b));
  for (const objective of claimOrder) {
    const list = ranked.get(objective) ?? [];
    let taken = 0;
    let skipped: CandidatePackage | null = null;
    for (const pkg of list) {
      if (taken >= cfg.maxPackagesPerObjective) break;
      const similarTo = tooSimilar(pkg, chosen, cfg);
      if (similarTo) {
        skipped ??= similarTo;
        continue;
      }
      chosen.push(
        skipped
          ? {
              ...pkg,
              diversityNote:
                "The top result for this objective was too similar to a package already shown, so the next best distinct combination is presented.",
            }
          : pkg,
      );
      taken++;
    }
    if (taken === 0)
      omitted.push({ objective, reason: list.length === 0 ? "No feasible combination exists." : "No meaningfully different combination exists beyond the packages already shown." });
  }
  stats.durationMs = clock() - started;
  chosen.sort((a, b) => input.objectives.indexOf(a.objective) - input.objectives.indexOf(b.objective));
  return { packages: chosen, funnel, infeasible: null, omittedObjectives: omitted, stats, warnings };
}

export interface EvaluationResult {
  ok: boolean;
  violations: { stopId: string; offerId: string; reasons: RejectionCode[] }[];
  package: CandidatePackage | null;
  budgetOk: boolean | null;
}

/**
 * Validates a manually chosen set of offers (one per stop) against the hard constraints and
 * recalculates the package. Used when staff replace a hotel.
 */
export function evaluateSelection(
  input: SearchInput,
  offersByStop: Record<string, NormalisedOffer>,
  objective: OptimisationObjective,
): EvaluationResult {
  const cfg: SearchConfig = { ...DEFAULT_CONFIG, ...input.config };
  const nowIso = new Date((input.now ?? Date.now)()).toISOString();
  const violations: EvaluationResult["violations"] = [];
  const picks: Accepted[] = [];
  const properties = new Set<string>();
  for (const stop of input.stops) {
    const offer = offersByStop[stop.id];
    if (!offer) {
      violations.push({ stopId: stop.id, offerId: "", reasons: ["unavailable"] });
      continue;
    }
    const reasons = rejectionReasons(offer, stop, input.constraints, input.party, nowIso, input.convert);
    const cost = input.convert(offer.totalAmountMinor, offer.currency);
    if (properties.has(offer.property.id)) reasons.push("dates_mismatch");
    properties.add(offer.property.id);
    if (reasons.length > 0 || cost === null) violations.push({ stopId: stop.id, offerId: offer.offerId, reasons });
    else picks.push({ offer, costMinor: cost });
  }
  if (violations.length > 0 || picks.length !== input.stops.length)
    return { ok: false, violations, package: null, budgetOk: null };

  // Score the manual choice against the pools of alternatives so scores stay comparable.
  const basis = input.budgetBasis ?? ((c: number) => c);
  const accepted = input.stops.map((s, i) => {
    const pool = filterCandidates(s, input.candidatesByStop[s.id] ?? [], { ...input, constraints: { ...input.constraints, strictBudget: false } }, { nowIso }).accepted;
    return pool.some((p) => p.offer.offerId === picks[i]!.offer.offerId) ? pool : [...pool, picks[i]!];
  });
  const metrics = input.stops.map((s, i) => scorePool(s, accepted[i]!, input.preferredAmenities, cfg));
  const min = accepted.reduce((s, p) => s + Math.min(...p.map((x) => x.costMinor)), 0);
  const max = accepted.reduce((s, p) => s + Math.max(...p.map((x) => x.costMinor)), 0);
  const ctx: Ctx = { input, cfg, stops: input.stops, accepted, metrics, basis, poolMinBasis: basis(min), poolMaxBasis: basis(max) };
  const pkg = buildPackage(ctx, picks, objective);
  const budgetOk = pkg.withinBudget;
  const strictViolation = input.constraints.strictBudget && budgetOk === false;
  return {
    ok: !strictViolation,
    violations: strictViolation
      ? input.stops.map((s, i) => ({ stopId: s.id, offerId: picks[i]!.offer.offerId, reasons: ["over_budget" as RejectionCode] }))
      : [],
    package: pkg,
    budgetOk,
  };
}
