import { CATEGORY_RANK, nightsBetween, type OptimisationObjective } from "@tripweave/shared";
import { haversineKm } from "@tripweave/itinerary-engine";
import type { Accepted } from "./constraints";
import type { CandidateMetrics, CriterionWeights, PackageScore, SearchConfig, SearchStop } from "./types";

export const DEFAULT_CONFIG: SearchConfig = {
  beamWidth: 25,
  candidateLimitPerStop: 12,
  timeoutMs: 8_000,
  missingDataScore: 0.4,
  maxPackagesPerObjective: 1,
  minDifferingStops: 1,
  minCostDeltaBp: 300,
};

/** Neutral weights used to report a comparable overall score (spec 11.5 defaults). */
export const DEFAULT_WEIGHTS: CriterionWeights = {
  budget: 0.3,
  quality: 0.25,
  location: 0.2,
  amenities: 0.15,
  cancellation: 0.1,
  preference: 0,
  value: 0,
};

export const OBJECTIVE_WEIGHTS: Record<OptimisationObjective, CriterionWeights> = {
  budget_explorer: { budget: 0.65, quality: 0.1, location: 0.08, amenities: 0.04, cancellation: 0.08, preference: 0, value: 0.05 },
  best_value: { budget: 0.15, quality: 0.15, location: 0.15, amenities: 0.1, cancellation: 0.1, preference: 0, value: 0.35 },
  comfort_journey: { budget: 0.1, quality: 0.3, location: 0.3, amenities: 0.15, cancellation: 0.1, preference: 0, value: 0.05 },
  premium_experience: { budget: 0.03, quality: 0.5, location: 0.12, amenities: 0.25, cancellation: 0.05, preference: 0, value: 0.05 },
  company_preferred: { budget: 0.2, quality: 0.15, location: 0.1, amenities: 0.05, cancellation: 0.1, preference: 0.4, value: 0 },
};

export function weightsFor(objective: OptimisationObjective, cfg: SearchConfig): CriterionWeights {
  const w = { ...OBJECTIVE_WEIGHTS[objective], ...(cfg.weights?.[objective] ?? {}) };
  const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum])) as unknown as CriterionWeights;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function qualityScore(c: Accepted, cfg: SearchConfig): { score: number; unrated: boolean } {
  const p = c.offer.property;
  const review = p.reviewScore === null ? null : clamp01(p.reviewScore / 10);
  const cat = p.category === null ? null : (CATEGORY_RANK[p.category] - 1) / 5;
  const stars = p.starRating === null ? null : clamp01((p.starRating - 1) / 4);
  const catOrStars = cat ?? stars;
  const unrated = review === null;
  const r = review ?? cfg.missingDataScore;
  const k = catOrStars ?? cfg.missingDataScore;
  return { score: clamp01(0.6 * r + 0.4 * k), unrated };
}

export function cancellationScore(c: Accepted): number {
  const x = c.offer.cancellation;
  if (x.refundable === false) return 0;
  if (x.refundable === null) return 0.3;
  if (x.freeCancellationUntil) {
    try {
      const days = nightsBetween(x.freeCancellationUntil, c.offer.stayStart);
      return clamp01(0.6 + 0.4 * Math.min(days / 14, 1));
    } catch {
      return 0.7;
    }
  }
  return 0.7;
}

export function preferenceScore(c: Accepted): number {
  const o = c.offer;
  if (o.property.preferredPartner) return 1;
  if (o.source === "internal") return o.verificationStatus === "company_managed" ? 0.8 : 0.6;
  return 0;
}

/** Computes metrics for each candidate of a stop; cost is min-max normalised within the pool. */
export function scorePool(
  stop: SearchStop,
  pool: Accepted[],
  preferredAmenities: string[],
  cfg: SearchConfig,
): Map<string, CandidateMetrics> {
  const costs = pool.map((p) => p.costMinor);
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  const out = new Map<string, CandidateMetrics>();
  for (const c of pool) {
    const cost = max === min ? 1 : 1 - (c.costMinor - min) / (max - min);
    const q = qualityScore(c, cfg);
    const p = c.offer.property;
    let centre: number | null = null;
    if (stop.latitude !== null && stop.longitude !== null && p.latitude !== null && p.longitude !== null) {
      centre = haversineKm(
        { latitude: stop.latitude, longitude: stop.longitude },
        { latitude: p.latitude, longitude: p.longitude },
      );
    }
    const location = centre === null ? cfg.missingDataScore : clamp01(1 - centre / 15);
    let amenities: number;
    if (preferredAmenities.length > 0) {
      const have = new Set(p.amenities.map((a) => a.toLowerCase().trim()));
      amenities = preferredAmenities.filter((a) => have.has(a.toLowerCase().trim())).length / preferredAmenities.length;
    } else {
      amenities = clamp01(p.amenities.length / 12);
    }
    out.set(c.offer.offerId, {
      cost,
      quality: q.score,
      location,
      amenities,
      cancellation: cancellationScore(c),
      preference: preferenceScore(c),
      value: clamp01(q.score * (0.5 + 0.5 * cost)),
      centreDistanceKm: centre === null ? null : Math.round(centre * 10) / 10,
      unrated: q.unrated,
    });
  }
  return out;
}

/** Stop-level weighted score used to rank candidates and partial combinations. */
export function stopScore(m: CandidateMetrics, w: CriterionWeights): number {
  return (
    w.budget * m.cost +
    w.quality * m.quality +
    w.location * m.location +
    w.amenities * m.amenities +
    w.cancellation * m.cancellation +
    w.preference * m.preference +
    w.value * m.value
  );
}

export function combine(score: PackageScore, w: CriterionWeights): number {
  return (
    w.budget * score.budgetFit +
    w.quality * score.quality +
    w.location * score.location +
    w.amenities * score.amenities +
    w.cancellation * score.cancellation +
    w.preference * score.preference +
    w.value * score.value
  );
}

export function budgetFit(costBasis: number, budget: number | null, poolMin: number, poolMax: number): number {
  if (budget !== null && budget > 0) {
    if (costBasis <= budget) return clamp01(1 - 0.5 * (costBasis / budget));
    return clamp01(0.5 - (costBasis - budget) / budget);
  }
  return poolMax === poolMin ? 1 : clamp01(1 - (costBasis - poolMin) / (poolMax - poolMin));
}
