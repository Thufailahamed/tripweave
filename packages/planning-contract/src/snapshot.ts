import type {
  BudgetScope,
  HotelCategory,
  ItineraryStop,
  MealPlan,
  NormalisedOffer,
  ParsedTrip,
  PartyConfiguration,
  RouteLeg,
  SpecialRequirements,
} from "@tripweave/shared";
import type { PlanningQuestion } from "./questions";

export const PLANNING_ACTIONS = ["apply_clarification", "open_packages", "open_itinerary", "open_optimise", "open_quote"] as const;

export type PlanningAction = (typeof PLANNING_ACTIONS)[number];

export function isPlanningAction(value: string): value is PlanningAction {
  return (PLANNING_ACTIONS as readonly string[]).includes(value);
}

export interface PlanningTripSnapshot {
  /** Short, stable reference used by generated UI (the real database id stays on `id`). */
  ref: string;
  id: string;
  title: string;
  description: string;
  status: string;
  arrivalDate: string | null;
  departureDate: string | null;
  party: PartyConfiguration;
  budgetAmountMinor: number | null;
  budgetCurrency: string;
  budgetScope: BudgetScope | string;
  preferredHotelCategory: HotelCategory | string | null;
  preferredMealPlan: MealPlan | string | null;
  specialRequirements: Partial<SpecialRequirements>;
  parseResult: {
    parsed: ParsedTrip;
    engine: string;
    model?: string | null;
    warnings: string[];
    parsedAt?: string;
  } | null;
}

export interface PlanningItineraryView {
  ref: string;
  id: string;
  title: string;
  summary: string;
  status: string;
  stops: ItineraryStop[];
  legs: RouteLeg[];
  issues: { severity: "error" | "warning" | "info"; code: string; message: string; stopId?: string }[];
  legSource: string;
  warnings: string[];
}

export interface PlanningPackageSelection {
  stopId: string;
  destination: string;
  /** Present only when the viewer has `margins:view`. */
  costMinor?: number;
  offer: NormalisedOffer;
  coverImageId?: string | null;
  /** Dated links to see or book the stay; sent only to viewers who may see supplier costs. */
  bookingLinks?: { kind: "seller" | "google" | "website"; label: string; url: string }[];
}

export interface PlanningPricing {
  currency: string;
  sellingPriceMinor: number;
  totalPayableMinor: number;
  sellingTaxMinor: number;
  warnings: string[];
  /** Present only when the viewer has `margins:view`. */
  totalCostMinor?: number;
  grossProfitMinor?: number;
  grossMarginBp?: number;
  markupBp?: number;
  paymentFeeMinor?: number;
  approval?: { required: boolean; reasons?: string[] } & Record<string, unknown>;
}

export interface PlanningBreakdown {
  budgetFit: number;
  quality: number;
  location: number;
  amenities: number;
  cancellation: number;
  preference: number;
  value: number;
}

export interface PlanningPackageBody {
  objective: string;
  selections: PlanningPackageSelection[];
  currency: string;
  /** Present only when the viewer has `margins:view`. */
  totalCostMinor?: number;
  costPerNightMinor?: number;
  budgetDifferenceMinor: number | null;
  withinBudget: boolean | null;
  objectiveScore: number;
  score: number;
  breakdown: PlanningBreakdown;
  travel: { legs: RouteLeg[]; totalDriveMinutes: number | null; anyEstimated: boolean; anyUnavailable: boolean };
  assumptions: string[];
  unverified: string[];
  explanation: string[];
  diversityNote?: string;
}

export interface PlanningPackageView {
  /** Short, stable reference used by generated UI. */
  ref: string;
  id: string;
  jobId: string;
  parentId: string | null;
  number: number;
  objective: string;
  manuallyModified: boolean;
  feasibility: string;
  createdAt: string;
  verification: Record<string, unknown>;
  package: PlanningPackageBody;
  pricing: PlanningPricing | null;
}

export interface PlanningHotelOffer {
  /** Short, stable reference used by generated UI. */
  ref: string;
  offerId: string;
  packageIds: string[];
  stopId: string;
  destination: string;
  offer: NormalisedOffer;
  coverImageId?: string | null;
  /** Dated links to see or book the stay; sent only to viewers who may see supplier costs. */
  bookingLinks?: { kind: "seller" | "google" | "website"; label: string; url: string }[];
}

export interface PlanningQuoteSummary {
  ref: string;
  id: string;
  quoteNumber: string;
  status: string;
  currentVersion: number;
  sellingPriceMinor: number | null;
  currency: string;
}

export interface PlanningPermissions {
  canWriteTrips: boolean;
  canRunOptimisation: boolean;
  canCreateQuotes: boolean;
  canSeeMargins: boolean;
  canSeeContracts: boolean;
}

export interface PlanningSources {
  engine: string;
  model: string | null;
  warnings: string[];
  parseEngine: string | null;
  parsedAt: string | null;
}

export interface PlanningSnapshot {
  generatedAt: string;
  trip: PlanningTripSnapshot;
  itinerary: PlanningItineraryView | null;
  packages: PlanningPackageView[];
  offers: PlanningHotelOffer[];
  quotes: PlanningQuoteSummary[];
  questions: PlanningQuestion[];
  missingFields: string[];
  permissions: PlanningPermissions;
  sources: PlanningSources;
  allowedActions: PlanningAction[];
  allowlist: readonly string[];
}

export interface PlanningStarter {
  label: string;
  prompt: string;
}
