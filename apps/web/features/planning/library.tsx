"use client";
import { createLibrary } from "@openuidev/react-lang";
import { planningComponentGroups } from "@tripweave/planning-contract";
import { QuickActions } from "./components/actions";
import { BudgetMeter } from "./components/budget";
import { PlanningCanvas } from "./components/canvas";
import { ClarificationForm } from "./components/clarification";
import { CostBreakdown } from "./components/costs";
import { TripHero } from "./components/hero";
import { HotelCard, HotelComparison } from "./components/hotels";
import { PackageComparison, PackageSummary, RecommendationExplanation } from "./components/packages";
import { TripRequirementSummary } from "./components/requirements";
import { RouteSummary } from "./components/routes";
import { TripMap } from "./components/map";
import { DestinationTimeline } from "./components/timeline";
import { PlaceMap } from "./components/place-map";
import { RouteStop, RouteStops } from "./components/route-stops";
import { Callout, ComparisonTable, DayPlan, FollowUps, KeyFacts, Lead, PlaceCard, PlaceGallery, TipList } from "./components/travel";

type PlanningLibrary = ReturnType<typeof createLibrary>;
let cached: PlanningLibrary | null = null;

/**
 * Created lazily for the same reason as the shared contract: createLibrary mints an id, and module
 * evaluation can happen before a Cloudflare Worker request context is available. The component
 * definitions themselves are static and safe at module scope.
 */
export function getPlanningLibrary(): PlanningLibrary {
  cached ??= createLibrary({
    id: "tripweave-planning",
    root: "PlanningCanvas",
    components: [
      PlanningCanvas,
      TripHero,
      TripRequirementSummary,
      ClarificationForm,
      DestinationTimeline,
      TripMap,
      HotelCard,
      HotelComparison,
      PackageSummary,
      PackageComparison,
      BudgetMeter,
      CostBreakdown,
      RouteSummary,
      RecommendationExplanation,
      QuickActions,
      Lead,
      PlaceCard,
      PlaceGallery,
      PlaceMap,
      RouteStop,
      RouteStops,
      DayPlan,
      TipList,
      KeyFacts,
      Callout,
      ComparisonTable,
      FollowUps,
    ],
    componentGroups: planningComponentGroups,
  });
  return cached;
}
