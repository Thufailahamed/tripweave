/** Domain types shared by the engines, providers, API and web app. */

export type OrganizationType = "tour_operator" | "hotel_management";

export type MealPlan = "RO" | "BB" | "HB" | "FB" | "AI";
export const MEAL_PLANS: readonly MealPlan[] = ["RO", "BB", "HB", "FB", "AI"];
export const MEAL_PLAN_LABELS: Record<MealPlan, string> = {
  RO: "Room only",
  BB: "Bed & breakfast",
  HB: "Half board",
  FB: "Full board",
  AI: "All inclusive",
};

export type HotelCategory = "budget" | "standard" | "comfort" | "boutique" | "premium" | "luxury";
export const HOTEL_CATEGORIES: readonly HotelCategory[] = [
  "budget",
  "standard",
  "comfort",
  "boutique",
  "premium",
  "luxury",
];
/** Ordinal rank used for "minimum category" hard constraints and quality scoring. */
export const CATEGORY_RANK: Record<HotelCategory, number> = {
  budget: 1,
  standard: 2,
  comfort: 3,
  boutique: 4,
  premium: 5,
  luxury: 6,
};

/** Freshness / verification state of an offer. */
export type VerificationStatus =
  | "estimated"
  | "company_managed"
  | "supplier_reported"
  | "live_checked"
  | "expired"
  | "unavailable"
  | "requires_confirmation"
  | "booked";

export type AvailabilityStatus = "confirmed" | "unknown" | "on_request" | "unavailable";

export type OfferSource = "internal" | "external" | "mock";

export interface PartyConfiguration {
  adults: number;
  children: number;
  childAges: number[];
  rooms: RoomAllocation[];
}

export interface RoomAllocation {
  adults: number;
  children: number;
  childAges?: number[];
}

export interface CancellationTerms {
  refundable: boolean | null;
  /** Calendar date (YYYY-MM-DD) until which cancellation is free, when known. */
  freeCancellationUntil?: string | null;
  penaltyDescription?: string | null;
}

export interface PaymentTerms {
  type: "pay_now" | "pay_at_hotel" | "credit" | "deposit" | "unknown";
  description?: string | null;
}

export interface NightlyRate {
  date: string;
  amountMinor: number;
}

/**
 * Provider-independent hotel offer. Optional fields exist because suppliers differ; a missing
 * availability value must never be interpreted as confirmed availability.
 */
export interface NormalisedOffer {
  offerId: string;
  providerKey: string;
  externalOfferReference: string;
  source: OfferSource;
  supplierId: string | null;
  supplierName: string;
  property: {
    id: string;
    name: string;
    destination: string;
    latitude: number | null;
    longitude: number | null;
    category: HotelCategory | null;
    starRating: number | null;
    /** 0..10 guest review score when verified; null when unrated. */
    reviewScore: number | null;
    amenities: string[];
    ownerOrganizationId: string | null;
    preferredPartner?: boolean;
  };
  roomType: {
    id: string | null;
    name: string;
    maxOccupancy: number;
    maxAdults: number;
  };
  stayStart: string;
  stayEnd: string;
  nights: number;
  mealPlan: MealPlan;
  /**
   * Whether the source confirmed the board basis. Aggregators and map listings often publish a
   * price without saying what it includes; that must stay visible rather than being guessed.
   */
  mealPlanStatus?: "confirmed" | "unconfirmed";
  roomsRequired: number;
  occupancy: PartyConfiguration;
  /** Supplier cost for the entire stay across all rooms, in the supplier currency. */
  totalAmountMinor: number;
  currency: string;
  taxAmountMinor: number | null;
  feeAmountMinor: number | null;
  /** True when totalAmountMinor already includes taxes and fees. */
  taxesIncluded: boolean | null;
  nightlyRates?: NightlyRate[];
  cancellation: CancellationTerms;
  payment: PaymentTerms;
  retrievedAt: string;
  expiresAt: string | null;
  availabilityStatus: AvailabilityStatus;
  verificationStatus: VerificationStatus;
  /** Opaque provider data safe to store (never credentials). */
  providerMetadata?: Record<string, unknown>;
  /** Marks illustrative / mock data so UIs can never display it as live. */
  isMock: boolean;
  rateSource?: { ratePlanId?: string; agreementId?: string; contractReference?: string };
}

export type RouteSource = "routing_api" | "estimated" | "unavailable";

export interface RouteLeg {
  fromStopId: string;
  toStopId: string;
  distanceKm: number | null;
  durationMinutes: number | null;
  source: RouteSource;
}

export interface ItineraryStop {
  id: string;
  sequence: number;
  destination: string;
  latitude: number | null;
  longitude: number | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  activities: string[];
  notes?: string | null;
}

export type OptimisationObjective =
  | "budget_explorer"
  | "best_value"
  | "comfort_journey"
  | "premium_experience"
  | "company_preferred";

export const OBJECTIVE_LABELS: Record<OptimisationObjective, string> = {
  budget_explorer: "Budget Explorer",
  best_value: "Best Value",
  comfort_journey: "Comfort Journey",
  premium_experience: "Premium Experience",
  company_preferred: "Company Preferred",
};

export const ALL_OBJECTIVES: readonly OptimisationObjective[] = [
  "budget_explorer",
  "best_value",
  "comfort_journey",
  "premium_experience",
  "company_preferred",
];

export type QuoteStatus =
  | "draft"
  | "preparing"
  | "ready_for_review"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";

export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["preparing", "ready_for_review", "cancelled"],
  preparing: ["draft", "ready_for_review", "cancelled"],
  ready_for_review: ["draft", "sent", "cancelled"],
  sent: ["viewed", "accepted", "rejected", "expired", "cancelled", "draft"],
  viewed: ["accepted", "rejected", "expired", "cancelled", "draft"],
  accepted: [],
  rejected: ["draft"],
  expired: ["draft"],
  cancelled: [],
};

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

export type TripStatus =
  | "new"
  | "needs_clarification"
  | "planning"
  | "optimised"
  | "quoted"
  | "won"
  | "lost"
  | "archived";

export type BudgetScope = "accommodation_only" | "all_inclusive_trip";
