import type {
  HotelCategory,
  MealPlan,
  NormalisedOffer,
  OptimisationObjective,
  RoomAllocation,
  RouteLeg,
} from "@tripweave/shared";

export interface SearchStop {
  id: string;
  destination: string;
  latitude: number | null;
  longitude: number | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
}

export interface PartyInfo {
  adults: number;
  children: number;
  rooms: RoomAllocation[];
}

/** Hard constraints are never silently relaxed: a combination that violates one is not produced. */
export interface HardConstraints {
  /** Budget in the comparison currency, evaluated through `budgetBasis` (usually the selling price). */
  budgetMinor: number | null;
  strictBudget: boolean;
  maxLegDurationMinutes: number | null;
  minimumCategory: HotelCategory | null;
  requiredAmenities: string[];
  requiredMealPlans: MealPlan[];
  requireFreeCancellation: boolean;
  requireConfirmedAvailability: boolean;
  /** Accept discovery listings that do not publish a board basis; the package warns to confirm it. */
  allowUnconfirmedMealPlans: boolean;
}

export type RejectionCode =
  | "dates_mismatch"
  | "capacity"
  | "meal_plan"
  | "amenities"
  | "category"
  | "expired"
  | "unavailable"
  | "availability_unconfirmed"
  | "cancellation"
  | "currency"
  | "over_budget";

export interface CriterionWeights {
  budget: number;
  quality: number;
  location: number;
  amenities: number;
  cancellation: number;
  preference: number;
  value: number;
}

export interface SearchConfig {
  beamWidth: number;
  candidateLimitPerStop: number;
  timeoutMs: number;
  /** Score assigned to unknown ratings/locations: neutral-low, never perfect. */
  missingDataScore: number;
  maxPackagesPerObjective: number;
  /** Two packages are "too similar" unless they differ in at least this many stops... */
  minDifferingStops: number;
  /** ...or their total cost differs by at least this many basis points. */
  minCostDeltaBp: number;
  weights?: Partial<Record<OptimisationObjective, Partial<CriterionWeights>>>;
}

export interface SearchInput {
  stops: SearchStop[];
  candidatesByStop: Record<string, NormalisedOffer[]>;
  party: PartyInfo;
  constraints: HardConstraints;
  preferredAmenities: string[];
  preferredCategory?: HotelCategory | null;
  /** Comparison currency for all internal maths. */
  currency: string;
  /** Converts an offer total into the comparison currency; null when no rate is available. */
  convert: (amountMinor: number, fromCurrency: string) => number | null;
  /** Maps accumulated net cost to the amount compared with the budget (defaults to identity). */
  budgetBasis?: (costMinor: number) => number;
  legs: RouteLeg[];
  objectives: OptimisationObjective[];
  config?: Partial<SearchConfig>;
  /** Injected for deterministic tests. */
  now?: () => number;
}

export interface CandidateMetrics {
  /** All 0..1, higher is better. */
  cost: number;
  quality: number;
  location: number;
  amenities: number;
  cancellation: number;
  preference: number;
  value: number;
  centreDistanceKm: number | null;
  unrated: boolean;
}

export interface PackageSelection {
  stopId: string;
  destination: string;
  offer: NormalisedOffer;
  costMinor: number;
  metrics: CandidateMetrics;
}

export interface PackageScore {
  budgetFit: number;
  quality: number;
  location: number;
  amenities: number;
  cancellation: number;
  preference: number;
  value: number;
}

export interface CandidatePackage {
  objective: OptimisationObjective;
  signature: string;
  selections: PackageSelection[];
  currency: string;
  totalCostMinor: number;
  costPerNightMinor: number;
  /** Budget minus the (selling-basis) cost; null when no budget. Negative = over budget. */
  budgetDifferenceMinor: number | null;
  withinBudget: boolean | null;
  /** Score used to rank within the objective (0..100). */
  objectiveScore: number;
  /** Neutral score under the default weights so packages are comparable across objectives (0..100). */
  score: number;
  breakdown: PackageScore;
  travel: { legs: RouteLeg[]; totalDriveMinutes: number | null; anyEstimated: boolean; anyUnavailable: boolean };
  assumptions: string[];
  unverified: string[];
  explanation: string[];
  diversityNote?: string;
}

export interface StopFunnel {
  stopId: string;
  destination: string;
  total: number;
  accepted: number;
  rejections: Partial<Record<RejectionCode, number>>;
}

export interface InfeasibilityReport {
  reasons: { code: string; message: string; stopId?: string }[];
  suggestions: string[];
  minimumBudgetMinor: number | null;
}

export interface SearchResult {
  packages: CandidatePackage[];
  funnel: StopFunnel[];
  infeasible: InfeasibilityReport | null;
  omittedObjectives: { objective: OptimisationObjective; reason: string }[];
  stats: { combinationsEvaluated: number; beamWidth: number; timedOut: boolean; durationMs: number };
  warnings: string[];
}
