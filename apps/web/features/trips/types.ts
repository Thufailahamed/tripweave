import type { AvailabilityStatus, ItineraryStop, MealPlan, NormalisedOffer, OptimisationObjective, ParsedTrip, PartyConfiguration, RouteLeg, SpecialRequirements, VerificationStatus } from "@tripweave/shared";

export type { NormalisedOffer, RouteLeg, ItineraryStop, ParsedTrip, PartyConfiguration, AvailabilityStatus, VerificationStatus };

export const TRIP_STATUSES = ["new", "needs_clarification", "planning", "optimised", "quoted", "won", "lost", "archived"] as const;

export interface Trip {
  id: string;
  customerId: string | null;
  customerName?: string | null;
  title: string;
  description: string;
  arrivalDate: string | null;
  departureDate: string | null;
  party: PartyConfiguration;
  budgetAmountMinor: number | null;
  budgetCurrency: string;
  budgetScope: "accommodation_only" | "all_inclusive_trip" | string;
  preferredHotelCategory: string | null;
  preferredMealPlan: MealPlan | null | string;
  specialRequirements: Partial<SpecialRequirements>;
  parseResult: ParseResult | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface OvernightSuggestion {
  plan: { destination: string; nights: number }[];
  dayVisitOnly: string[];
  needsConfirmation: boolean;
  question: string;
}

export interface ParseResult {
  parsed: ParsedTrip;
  engine: string;
  model?: string | null;
  warnings: string[];
  suggestedItinerary: OvernightSuggestion | null;
  parsedAt?: string;
}

export interface ParseResponse {
  parsed: ParsedTrip;
  engine: string;
  model?: string | null;
  warnings: string[];
  questions: string[];
  suggestedItinerary: OvernightSuggestion | null;
  applied: boolean;
  assumptions: string[];
  itinerary: Itinerary | null;
  trip: Trip;
}

export interface Itinerary {
  id: string;
  tripRequestId: string;
  version: number;
  title: string;
  summary: string;
  origin: string | null;
  arrivalInformation: Record<string, unknown>;
  departureInformation: Record<string, unknown>;
  status: "draft" | "suggested" | "confirmed" | string;
  createdAt: string;
  updatedAt: string;
  stops: ItineraryStop[];
}

export interface ItineraryIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  stopId?: string;
}

export interface ItineraryView {
  trip: Trip;
  itinerary: Itinerary | null;
  legs: RouteLeg[];
  issues: ItineraryIssue[];
  legSource: string;
  warnings: string[];
}

export interface JobSummaryRow {
  id: string;
  status: string;
  progress: number;
  stage: string | null;
  createdAt: string;
  completedAt?: string | null;
  errorSummary: string | null;
}

export interface TripDetail {
  trip: Trip;
  itinerary: Itinerary | null;
  latestJob: JobSummaryRow | null;
  statusHistory: { id: string; from_status: string | null; to_status: string; changed_by_name: string | null; created_at: string }[];
  quotes: { id: string; quoteNumber: string; status: string; currentVersion: number; sellingPriceMinor: number; currency: string }[];
}

export interface StopFunnel {
  stopId: string;
  destination: string;
  total: number;
  accepted: number;
  rejections: Record<string, number>;
}

export interface InfeasibilityReport {
  reasons: { code: string; message: string; stopId?: string }[];
  suggestions: string[];
  minimumBudgetMinor: number | null;
}

export interface ProviderOutcomeRow {
  providerKey: string;
  status: "ok" | "error" | "timeout" | "skipped";
  offers: number;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  isMock: boolean;
  stopId?: string;
}

export interface JobDetail {
  id: string;
  tripRequestId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "infeasible" | "cancelled" | string;
  progress: number;
  stage: string | null;
  algorithmVersion: string;
  attempt: number;
  constraints: Record<string, unknown>;
  errorCode: string | null;
  errorSummary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result?: {
    funnel?: StopFunnel[];
    infeasible?: InfeasibilityReport | null;
    omittedObjectives?: { objective: OptimisationObjective; reason: string }[];
    stats?: { combinationsEvaluated: number; beamWidth: number; timedOut: boolean; durationMs: number };
    warnings?: string[];
    notes?: string[];
    providers?: ProviderOutcomeRow[];
    legs?: RouteLeg[];
    dropped?: number;
  };
}

export interface PackageSelectionView {
  stopId: string;
  destination: string;
  costMinor: number;
  offer: NormalisedOffer;
  metrics: { unrated?: boolean; centreDistanceKm?: number | null } & Record<string, unknown>;
}

export interface PackageBody {
  objective: OptimisationObjective;
  signature: string;
  selections: PackageSelectionView[];
  currency: string;
  totalCostMinor: number;
  costPerNightMinor: number;
  budgetDifferenceMinor: number | null;
  withinBudget: boolean | null;
  objectiveScore: number;
  score: number;
  breakdown: { budgetFit: number; quality: number; location: number; amenities: number; cancellation: number; preference: number; value: number };
  travel: { legs: RouteLeg[]; totalDriveMinutes: number | null; anyEstimated: boolean; anyUnavailable: boolean };
  assumptions: string[];
  unverified: string[];
  explanation: string[];
  diversityNote?: string;
}

export interface PackagePricing {
  currency: string;
  sellingPriceMinor: number;
  totalPayableMinor: number;
  sellingTaxMinor: number;
  warnings: string[];
  // Present only when the API considers the viewer authorised (margins:view).
  totalCostMinor?: number;
  grossProfitMinor?: number;
  grossMarginBp?: number;
  markupBp?: number;
  paymentFeeMinor?: number;
  approval?: { required: boolean; reasons?: string[] } & Record<string, unknown>;
}

export interface PackageView {
  id: string;
  jobId: string;
  parentId: string | null;
  number: number;
  objective: OptimisationObjective;
  manuallyModified: boolean;
  feasibility: string;
  createdAt: string;
  package: PackageBody;
  pricing: PackagePricing | null;
}

export interface PackagesResponse {
  job: {
    id: string;
    status: string;
    completedAt: string | null;
    infeasible: InfeasibilityReport | null;
    omittedObjectives: { objective: OptimisationObjective; reason: string }[];
    warnings: string[];
    notes: string[];
    funnel: StopFunnel[];
    providers: ProviderOutcomeRow[];
  } | null;
  packages: PackageView[];
}

export interface RepriceResponse {
  package: PackageView;
  changes: { stopId: string; offerId: string; status: string; previousTotalMinor: number; currentTotalMinor: number | null; message?: string }[];
  valid: boolean;
  violations: { stopId: string; offerId: string; reasons: string[] }[];
  previousTotalMinor: number;
  newTotalMinor: number;
}

export interface AlternativesResponse {
  stopId: string;
  currentOfferId: string | null;
  funnel: StopFunnel;
  alternatives: { sellingMinor: number; costMinor?: number; currency: string; offer: NormalisedOffer }[];
}

export interface VerifyResponse {
  status: string;
  previousTotalMinor: number;
  currentTotalMinor: number | null;
  message?: string;
  checkedAt: string;
  offer: NormalisedOffer | null;
}

export const REJECTION_LABELS: Record<string, string> = {
  dates_mismatch: "Dates do not match the stay",
  capacity: "Rooms cannot fit the party",
  meal_plan: "Meal plan below the minimum",
  amenities: "Missing required amenities",
  category: "Below the minimum category",
  expired: "Rate expired",
  unavailable: "Unavailable",
  availability_unconfirmed: "Availability not confirmed",
  cancellation: "No free cancellation",
  currency: "No exchange rate for the currency",
  over_budget: "Over budget",
};

export const BUDGET_SCOPE_LABELS: Record<string, string> = {
  accommodation_only: "Accommodation only",
  all_inclusive_trip: "Whole trip",
};

export function routeSourceLabel(source: string): string {
  return source === "routing_api" ? "Routing data" : source === "estimated" ? "Estimated" : "Unavailable";
}
