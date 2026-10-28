import { createLibrary, defineComponent } from "@openuidev/lang-core";
import { z } from "zod/v4";
import { optionalSafeText, refIdSchema, safeText } from "./questions";

/**
 * Finite allowlist of interface blocks the model may compose. The names, descriptions and Zod key
 * order are the contract used by both the server prompt/validator and the React renderer.
 */
export const PLANNING_COMPONENT_NAMES = [
  "PlanningCanvas",
  "TripHero",
  "TripRequirementSummary",
  "ClarificationForm",
  "DestinationTimeline",
  "HotelCard",
  "HotelComparison",
  "PackageSummary",
  "PackageComparison",
  "BudgetMeter",
  "CostBreakdown",
  "RouteSummary",
  "RecommendationExplanation",
  "QuickActions",
] as const;

export type PlanningComponentName = (typeof PLANNING_COMPONENT_NAMES)[number];

const noop = () => null;

function define(name: PlanningComponentName, description: string, props: z.ZodObject) {
  return defineComponent({ name, description, props, component: noop });
}

const TripHeroSchema = z.object({
  tripId: refIdSchema,
  itineraryId: refIdSchema.optional(),
});
export { TripHeroSchema };
const TripHero = define(
  "TripHero",
  "Editorial cover for the trip: the first destination's photograph, trip title, dates, party, budget and primary next steps. Pass the tripId from CONTEXT and, when it exists, the itineraryId. Use it as the first block for an overview or recommendation.",
  TripHeroSchema,
);

const TripRequirementSummarySchema = z.object({
  tripId: refIdSchema,
  focus: z.enum(["overview", "missing", "preferences"]).optional(),
});
export { TripRequirementSummarySchema };
const TripRequirementSummary = define(
  "TripRequirementSummary",
  "Authoritative requirement summary for this trip: dates, party, budget, preferences and what is still missing. Pass the tripId from CONTEXT.",
  TripRequirementSummarySchema,
);

const ClarificationFormSchema = z.object({
  prompt: optionalSafeText(200),
});
export { ClarificationFormSchema };
const ClarificationForm = define(
  "ClarificationForm",
  "Interactive form for the open clarification questions computed by the backend. Use only when CONTEXT.questions is not empty. Never invent fields or options.",
  ClarificationFormSchema,
);

const DestinationTimelineSchema = z.object({
  itineraryId: refIdSchema,
});
export { DestinationTimelineSchema };
const DestinationTimeline = define(
  "DestinationTimeline",
  "Ordered overnight stops with dates, nights and travel legs from the saved itinerary. Pass the itineraryId from CONTEXT.",
  DestinationTimelineSchema,
);

const HotelCardSchema = z.object({
  offerId: refIdSchema,
  packageId: refIdSchema.optional(),
});
export { HotelCardSchema };
const HotelCard = define(
  "HotelCard",
  "One hotel offer from CONTEXT with authoritative price, room, meal plan, cancellation and availability. Pass an offerId and, optionally, the packageId it came from.",
  HotelCardSchema,
);

const HotelComparisonSchema = z.object({
  offerIds: z.array(refIdSchema).min(1).max(10),
});
export { HotelComparisonSchema };
const HotelComparison = define(
  "HotelComparison",
  "Side-by-side comparison of hotel offers from CONTEXT. Use only offerIds listed in CONTEXT.offers.",
  HotelComparisonSchema,
);

const PackageSummarySchema = z.object({
  packageId: refIdSchema,
});
export { PackageSummarySchema };
const PackageSummary = define(
  "PackageSummary",
  "Summary of one optimised package from CONTEXT, including its selling price, budget position and hotels. Pass the packageId.",
  PackageSummarySchema,
);

const PackageComparisonSchema = z.object({
  packageIds: z.array(refIdSchema).min(1).max(6),
});
export { PackageComparisonSchema };
const PackageComparison = define(
  "PackageComparison",
  "Comparison of two or more optimised packages from CONTEXT. Use only packageIds listed in CONTEXT.packages.",
  PackageComparisonSchema,
);

const BudgetMeterSchema = z.object({
  packageId: refIdSchema,
});
export { BudgetMeterSchema };
const BudgetMeter = define(
  "BudgetMeter",
  "Visual budget position for one package from CONTEXT: selling price against the trip budget, with a total/per-person switch. Pass the packageId. Use it when the user asks whether a package fits the budget.",
  BudgetMeterSchema,
);

const CostBreakdownSchema = z.object({
  packageId: refIdSchema,
});
export { CostBreakdownSchema };
const CostBreakdown = define(
  "CostBreakdown",
  "Authoritative cost breakdown for one package from CONTEXT. Internal cost and margin lines appear only when the viewer is authorised. Pass the packageId.",
  CostBreakdownSchema,
);

const RouteSummarySchema = z.object({
  itineraryId: refIdSchema.optional(),
  packageId: refIdSchema.optional(),
});
export { RouteSummarySchema };
const RouteSummary = define(
  "RouteSummary",
  "Travel legs and total drive time for the itinerary or a package from CONTEXT. Pass itineraryId, packageId, or both.",
  RouteSummarySchema,
);

const RecommendationExplanationSchema = z.object({
  packageId: refIdSchema,
});
export { RecommendationExplanationSchema };
const RecommendationExplanation = define(
  "RecommendationExplanation",
  "The grounded, deterministic reasons for recommending one package from CONTEXT. Never add facts or numbers yourself. Pass the packageId.",
  RecommendationExplanationSchema,
);

const QuickActionsSchema = z.object({});
export { QuickActionsSchema };
const QuickActions = define(
  "QuickActions",
  "A row of permitted next-step actions derived from the server (itinerary, optimisation, packages). Takes no arguments. Use it at the end of a reply when a next step is genuinely useful; never invent an action.",
  QuickActionsSchema,
);

const PlanningCanvasSchema = z.object({
  title: safeText(80),
  blocks: z.array(
    z.union([
      TripHero.ref,
      TripRequirementSummary.ref,
      ClarificationForm.ref,
      DestinationTimeline.ref,
      HotelCard.ref,
      HotelComparison.ref,
      PackageSummary.ref,
      PackageComparison.ref,
      BudgetMeter.ref,
      CostBreakdown.ref,
      RouteSummary.ref,
      RecommendationExplanation.ref,
      QuickActions.ref,
    ]),
  ),
  subtitle: optionalSafeText(300),
});
export { PlanningCanvasSchema };
const PlanningCanvas = define(
  "PlanningCanvas",
  "Top-level container for one planning reply. Put the most useful block first. The title and subtitle are short plain-text framing, not a place for prices or claims.",
  PlanningCanvasSchema,
);

export const planningComponents = [
  PlanningCanvas,
  TripHero,
  TripRequirementSummary,
  ClarificationForm,
  DestinationTimeline,
  HotelCard,
  HotelComparison,
  PackageSummary,
  PackageComparison,
  BudgetMeter,
  CostBreakdown,
  RouteSummary,
  RecommendationExplanation,
  QuickActions,
];

export const planningComponentGroups = [
  {
    name: "Frame",
    components: ["PlanningCanvas"],
    notes: ["Always emit exactly one PlanningCanvas as root. Keep the title and subtitle short and factual."],
  },
  {
    name: "Requirements & clarification",
    components: ["TripHero", "TripRequirementSummary", "ClarificationForm", "QuickActions"],
    notes: [
      "Open an overview or recommendation with TripHero so the reply has a photographic cover; pass the tripId.",
      "Use TripRequirementSummary when the user asks what is known or what is missing.",
      "Use ClarificationForm only when CONTEXT.questions has entries; it renders the backend's questions, so do not repeat them as prose only.",
      "QuickActions takes no arguments and only renders actions the server already permits.",
    ],
  },
  {
    name: "Itinerary & routes",
    components: ["DestinationTimeline", "RouteSummary"],
    notes: ["Use destination/route blocks only when CONTEXT.itinerary exists, and pass its ID. DestinationTimeline renders the destination photography."],
  },
  {
    name: "Hotels, packages & budget",
    components: ["HotelCard", "HotelComparison", "PackageSummary", "PackageComparison", "BudgetMeter", "RecommendationExplanation", "CostBreakdown"],
    notes: [
      "Use only IDs present in CONTEXT. Never invent a hotel, package, offer, price, availability or review.",
      "For a recommendation, pair RecommendationExplanation with PackageSummary or PackageComparison.",
      "BudgetMeter answers budget-fit questions; CostBreakdown explains what the price includes. Both read server pricing.",
      "Hotel and package blocks show real uploaded hotel photos when they exist, otherwise curated destination photography.",
    ],
  },
];

type PlanningLibrary = ReturnType<typeof createLibrary>;
let cachedLibrary: PlanningLibrary | null = null;

/**
 * Built lazily because the OpenUI library mints an id with crypto at construction time. Cloudflare
 * Workers forbids crypto and other I/O in the module-global scope, so importing this module must not
 * construct the library; only a request handler (or a test) may do so.
 */
export function getPlanningLibrary(): PlanningLibrary {
  cachedLibrary ??= createLibrary({
    id: "tripweave-planning",
    root: "PlanningCanvas",
    components: planningComponents,
    componentGroups: planningComponentGroups,
  });
  return cachedLibrary;
}

export function getPlanningLibrarySpec() {
  return getPlanningLibrary().toSpec();
}

export function getPlanningJSONSchema() {
  return getPlanningLibrary().toJSONSchema();
}
