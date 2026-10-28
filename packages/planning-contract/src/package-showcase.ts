import type { PartyConfiguration } from "@tripweave/shared";
import type { PlanningHotelOffer, PlanningPackageView } from "./snapshot";

/**
 * Host-handled interactions for the generated package presentation. Each one maps to a fixed
 * operation in the packages page. There is no generic URL, fetch or mutation action.
 */
export const PACKAGE_SHOWCASE_ACTIONS = ["focus_package", "validate_package", "create_quote", "open_itinerary", "open_optimise"] as const;

export type PackageShowcaseAction = (typeof PACKAGE_SHOWCASE_ACTIONS)[number];

export interface PackageShowcaseTrip {
  ref: "trip";
  id: string;
  title: string;
  arrivalDate: string | null;
  departureDate: string | null;
  party: PartyConfiguration;
  budgetAmountMinor: number | null;
  budgetCurrency: string;
  budgetScope: string;
}

export interface PackageShowcasePermissions {
  canValidatePrices: boolean;
  canCreateQuotes: boolean;
  canRunOptimisation: boolean;
  canSeeMargins: boolean;
  canSeeContracts: boolean;
}

/**
 * Everything the package presentation may refer to, built on the server from one optimisation run.
 * The browser resolves the model's refs (pkg_1, offer_1) against this snapshot, so every price,
 * hotel, date and live-check state on screen comes from here rather than from generated text.
 */
export interface PackageShowcaseSnapshot {
  generatedAt: string;
  job: {
    id: string;
    completedAt: string | null;
    /** Short notes the optimiser recorded for this run (for example, budget scope caveats). */
    notices: string[];
  };
  trip: PackageShowcaseTrip;
  packages: PlanningPackageView[];
  offers: PlanningHotelOffer[];
  permissions: PackageShowcasePermissions;
  allowedActions: PackageShowcaseAction[];
  allowlist: readonly string[];
}
