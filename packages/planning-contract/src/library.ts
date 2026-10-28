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
  "TripMap",
  "HotelCard",
  "HotelComparison",
  "PackageSummary",
  "PackageComparison",
  "BudgetMeter",
  "CostBreakdown",
  "RouteSummary",
  "RecommendationExplanation",
  "QuickActions",
  "Lead",
  "PlaceMap",
  "PlaceCard",
  "PlaceGallery",
  "RouteStop",
  "RouteStops",
  "DayPlan",
  "TipList",
  "KeyFacts",
  "Callout",
  "ComparisonTable",
  "FollowUps",
  "Highlight",
  "Highlights",
  "LocalFlavours",
  "Choice",
  "Choices",
  "BoardDay",
  "DayBoard",
] as const;

export type PlanningComponentName = (typeof PLANNING_COMPONENT_NAMES)[number];

const noop = () => null;

/** Prompt descriptions by component. The web renderer reuses them so both sides describe the same contract. */
const descriptions: Partial<Record<PlanningComponentName, string>> = {};

function define(name: PlanningComponentName, description: string, props: z.ZodObject) {
  descriptions[name] = description;
  return defineComponent({ name, description, props, component: noop });
}

export const planningComponentDescriptions = descriptions as Record<PlanningComponentName, string>;

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

const TripMapSchema = z.object({
  itineraryId: refIdSchema,
});
export { TripMapSchema };
const TripMap = define(
  "TripMap",
  "Interactive map of the itinerary's stops in order, joined by a route line, with each stop's photograph and a select-to-explore card. Pass the itineraryId from CONTEXT. Use it for questions about where places are, the geography or the route.",
  TripMapSchema,
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

/** Travel-guide blocks do not depend on the saved trip, so they take text and place names only. */
const LeadSchema = z.object({
  text: safeText(600),
});
export { LeadSchema };
const Lead = define(
  "Lead",
  "Editorial opening paragraph (two or three sentences) that directly answers a general travel question. Plain text; never prices, opening hours, visa rules, ratings or URLs.",
  LeadSchema,
);

const PlaceCardSchema = z.object({
  name: safeText(80),
  note: optionalSafeText(240),
});
export { PlaceCardSchema };
const PlaceCard = define(
  "PlaceCard",
  "One destination, shown with a photograph the app finds for the place name. Pass a name with its region, for example 'Ella, Sri Lanka'. Add a short note about why it suits the question. Never pass a URL or image.",
  PlaceCardSchema,
);

const PlaceGallerySchema = z.object({
  title: optionalSafeText(80),
  places: z.array(safeText(80)).min(1).max(8),
});
export { PlaceGallerySchema };
const PlaceGallery = define(
  "PlaceGallery",
  "A browsable row of destinations or sights with photographs. Each place name should include its region, for example 'Kandy, Sri Lanka'. Selecting a place opens its description. Use it when the user asks where to go or what to see.",
  PlaceGallerySchema,
);

const PlaceMapSchema = z.object({
  title: optionalSafeText(80),
  places: z.array(safeText(80)).min(2).max(12),
});
export { PlaceMapSchema };
const PlaceMap = define(
  "PlaceMap",
  "Map of two or more named places with numbered markers, each located from its public coordinates, and a select-to-explore card. Pass place names with their regions, for example 'Ella, Sri Lanka'. Use it whenever the user asks where places are, how places relate, routes between them or distances.",
  PlaceMapSchema,
);

const RouteStopSchema = z.object({
  name: safeText(80),
  time: optionalSafeText(20),
  duration: optionalSafeText(30),
  note: optionalSafeText(240),
});
export { RouteStopSchema };
const RouteStop = define(
  "RouteStop",
  "One stop on a route: its place name with region, an optional time such as '9:00 AM', an optional duration such as '60-75 min' and a short note. The app supplies the photograph and marks it visited when the reader ticks it off.",
  RouteStopSchema,
);

const RouteStopsSchema = z.object({
  title: safeText(100),
  stops: z.array(RouteStop.ref).min(2).max(10),
  note: optionalSafeText(140),
});
export { RouteStopsSchema };
const RouteStops = define(
  "RouteStops",
  "An ordered route of two to ten RouteStop blocks, shown as a stop-by-stop timeline, with an optional one-line note under the title. Use it for a day's route, a journey between places, a walking tour or the order to visit places. Pass the RouteStop blocks as stops, in visiting order.",
  RouteStopsSchema,
);

const DayPlanSchema = z.object({
  day: safeText(40),
  title: safeText(100),
  activities: z.array(safeText(200)).min(1).max(8),
});
export { DayPlanSchema };
const DayPlan = define(
  "DayPlan",
  "One day of a suggested route or itinerary idea: a label such as 'Day 1', a headline and up to eight activities in order. Ideas, not bookings. Use several DayPlan blocks for a multi-day plan.",
  DayPlanSchema,
);

const TipListSchema = z.object({
  title: safeText(100),
  tips: z.array(safeText(220)).min(1).max(12),
});
export { TipListSchema };
const TipList = define(
  "TipList",
  "A practical checklist: packing items, things to book in advance, etiquette or local tips. Readers can tick items off. Plain text only.",
  TipListSchema,
);

const KeyFactsSchema = z.object({
  title: optionalSafeText(100),
  facts: z.array(safeText(160)).min(1).max(10),
});
export { KeyFactsSchema };
const KeyFacts = define(
  "KeyFacts",
  "Quick reference facts as 'Label: value' strings, for example 'Best season: December to March'. General guidance only; never prices or live data.",
  KeyFactsSchema,
);

const CalloutSchema = z.object({
  tone: z.enum(["info", "tip", "caution"]),
  title: safeText(100),
  body: optionalSafeText(400),
});
export { CalloutSchema };
const Callout = define(
  "Callout",
  "A highlighted note. Use tone 'caution' for entry requirements, health, safety or money rules and name the official source to check. Use 'tip' for a helpful shortcut and 'info' for context.",
  CalloutSchema,
);

const ComparisonTableSchema = z.object({
  title: optionalSafeText(100),
  columns: z.array(safeText(40)).min(2).max(5),
  rows: z.array(z.array(safeText(160)).min(2).max(6)).min(1).max(8),
});
export { ComparisonTableSchema };
const ComparisonTable = define(
  "ComparisonTable",
  "A small comparison table of qualitative differences, for example regions, seasons or travel styles. Each row lists its label then one cell per column. Never put prices, ratings or availability here.",
  ComparisonTableSchema,
);

const FollowUpsSchema = z.object({
  title: optionalSafeText(60),
  questions: z.array(safeText(160)).min(1).max(6),
});
export { FollowUpsSchema };
const FollowUps = define(
  "FollowUps",
  "Tappable next questions for the user, each sent as their next message. Use it at the end of a travel answer with two to four specific questions.",
  FollowUpsSchema,
);

const HighlightSchema = z.object({
  name: safeText(80),
  area: optionalSafeText(60),
  note: optionalSafeText(200),
});
export { HighlightSchema };
const Highlight = define(
  "Highlight",
  "One must-see place for Highlights: its name with region (for example 'Temple of the Tooth, Kandy'), an optional area such as 'Old town' and a one-line note on why it is worth it. The app supplies the photograph.",
  HighlightSchema,
);

const HighlightsSchema = z.object({
  title: optionalSafeText(80),
  items: z.array(Highlight.ref).min(2).max(6),
});
export { HighlightsSchema };
const Highlights = define(
  "Highlights",
  "Large photographic postcards of the two to six must-see places that answer the question, each with an area and a one-line note. Readers open a postcard for its story and can ask to plan a visit. Use it near the top of a destination or 'what to see' answer.",
  HighlightsSchema,
);

const LocalFlavoursSchema = z.object({
  title: safeText(80),
  items: z.array(safeText(60)).min(2).max(6),
  note: optionalSafeText(120),
});
export { LocalFlavoursSchema };
const LocalFlavours = define(
  "LocalFlavours",
  "A row of photographed local dishes, drinks or crafts to try, for example ['Kottu roti', 'Hoppers', 'Ceylon tea']. Pass the item names only; the app finds a photograph for each. The optional note is a short handwritten aside. Never prices.",
  LocalFlavoursSchema,
);

const ChoiceSchema = z.object({
  label: safeText(60),
  detail: optionalSafeText(60),
  note: optionalSafeText(140),
  reply: optionalSafeText(240),
});
export { ChoiceSchema };
const Choice = define(
  "Choice",
  "One option inside Choices: a short label such as 'Autumn maples', an optional detail line such as 'Late November' and a short note. reply is the message sent for the reader when they pick it, for example 'Plan it for late November, for the autumn colours.'",
  ChoiceSchema,
);

const ChoicesSchema = z.object({
  question: safeText(120),
  options: z.array(Choice.ref).min(2).max(6),
  custom: optionalSafeText(60),
});
export { ChoicesSchema };
const Choices = define(
  "Choices",
  "An interactive question with two to six Choice cards. Picking a card sends its reply as the reader's next message, so the plan continues from their choice. custom is an optional label for a free-text option such as 'Pick your own dates'. Use it when the best next step depends on a preference: when to go, pace, style, length or which region.",
  ChoicesSchema,
);

const BoardDaySchema = z.object({
  label: safeText(40),
  places: z.array(safeText(80)).min(1).max(4),
  title: optionalSafeText(80),
});
export { BoardDaySchema };
const BoardDay = define(
  "BoardDay",
  "One day inside DayBoard: a label such as 'Day 1' or 'Day 2 · Sat', one to four place names with regions in visiting order (shown as morning, afternoon and evening photographs) and an optional short title.",
  BoardDaySchema,
);

const DayBoardSchema = z.object({
  title: safeText(80),
  days: z.array(BoardDay.ref).min(1).max(7),
  note: optionalSafeText(140),
});
export { DayBoardSchema };
const DayBoard = define(
  "DayBoard",
  "A photographic day-by-day itinerary board of one to seven BoardDay blocks. Each day shows its places as photo tiles; readers can reorder ideas by asking. The optional note is a short handwritten aside. Use it for multi-day plans in a destination.",
  DayBoardSchema,
);

const PlanningCanvasSchema = z.object({
  title: safeText(80),
  blocks: z.array(
    z.union([
      TripHero.ref,
      TripRequirementSummary.ref,
      ClarificationForm.ref,
      DestinationTimeline.ref,
      TripMap.ref,
      HotelCard.ref,
      HotelComparison.ref,
      PackageSummary.ref,
      PackageComparison.ref,
      BudgetMeter.ref,
      CostBreakdown.ref,
      RouteSummary.ref,
      RecommendationExplanation.ref,
      QuickActions.ref,
      Lead.ref,
      PlaceCard.ref,
      PlaceGallery.ref,
      PlaceMap.ref,
      RouteStops.ref,
      DayPlan.ref,
      TipList.ref,
      KeyFacts.ref,
      Callout.ref,
      ComparisonTable.ref,
      FollowUps.ref,
      Highlights.ref,
      LocalFlavours.ref,
      Choices.ref,
      DayBoard.ref,
    ]),
  ),
  subtitle: optionalSafeText(300),
  chips: z.array(safeText(40)).max(5).optional(),
  note: optionalSafeText(80),
  highlight: optionalSafeText(40),
});
export { PlanningCanvasSchema };
const PlanningCanvas = define(
  "PlanningCanvas",
  "Top-level container for one planning reply. The title is an evocative headline (for example 'Four days of tea, temples and trains in Kandy'); the subtitle is one sentence that answers the question. chips are up to five short header labels. note is a short handwritten aside (for example 'walk early, wander late'). highlight is one word or place name from the title to mark with a highlighter. Put the most useful block first. Never prices or claims.",
  PlanningCanvasSchema,
);

export const planningComponents = [
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
  Highlight,
  Highlights,
  LocalFlavours,
  Choice,
  Choices,
  BoardDay,
  DayBoard,
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
    components: ["DestinationTimeline", "TripMap", "RouteSummary"],
    notes: [
      "Use destination/route blocks only when CONTEXT.itinerary exists, and pass its ID. DestinationTimeline renders the destination photography.",
      "TripMap shows where the stops are on a map. Pair it with DestinationTimeline for a map-and-stops overview.",
    ],
  },
  {
    name: "Travel guide",
    components: ["Lead", "Highlights", "Highlight", "LocalFlavours", "Choices", "Choice", "DayBoard", "BoardDay", "PlaceGallery", "PlaceCard", "PlaceMap", "RouteStops", "RouteStop", "DayPlan", "TipList", "KeyFacts", "Callout", "ComparisonTable", "FollowUps"],
    notes: [
      "Compose like a travel magazine: an evocative PlanningCanvas title with a highlight word and a handwritten note, then photographs first. Highlights for the must-see places, LocalFlavours for food and drink, DayBoard for a multi-day plan, Choices when the next step depends on the reader's preference.",
      "Highlights holds two to six Highlight blocks; DayBoard holds one to seven BoardDay blocks; Choices holds two to six Choice blocks. Define each child block on its own line and pass the references in the list.",
      "Choices drive the conversation: give each Choice a reply written in the reader's voice so picking it continues the plan.",
      "Use these for general travel questions that do not need the saved trip: destinations, seasons, things to see, route and day ideas, packing, etiquette and planning advice.",
      "Open with Lead, then choose two or three visual blocks such as PlaceGallery, DayPlan or TipList. Finish with FollowUps.",
      "PlaceCard and PlaceGallery take a place name with its region only; the app supplies the photograph, so never pass a URL or image.",
      "Use PlaceMap whenever the user asks where places are, how they relate, the route between them or distances. It takes two to twelve place names with regions and plots them on a map; the app locates them.",
      "For a day or a route in order, use RouteStops with two to ten RouteStop blocks: each RouteStop has the place with its region, a time, a duration and a short note. Put the RouteStop blocks in the stops list in visiting order.",
      "PlanningCanvas takes optional chips as its fourth argument, after the subtitle: up to five short labels for the header, such as the time window, the travel style or the season.",
      "General guidance is qualitative. Do not state prices, fares, opening hours, visa rules, ratings or availability as facts; use a caution Callout and name the official source instead.",
    ],
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

/**
 * Zod prop schema for every component. The OpenUI parser checks types and required arguments, but not
 * lengths or bounds, so the server validates each node against these schemas as well. The canvas is
 * checked on its framing fields only: its block references are validated by the parser.
 */
export const PLANNING_PROP_SCHEMAS = {
  PlanningCanvas: PlanningCanvasSchema.pick({ title: true, subtitle: true, chips: true, note: true, highlight: true }),
  TripHero: TripHeroSchema,
  TripRequirementSummary: TripRequirementSummarySchema,
  ClarificationForm: ClarificationFormSchema,
  DestinationTimeline: DestinationTimelineSchema,
  TripMap: TripMapSchema,
  HotelCard: HotelCardSchema,
  HotelComparison: HotelComparisonSchema,
  PackageSummary: PackageSummarySchema,
  PackageComparison: PackageComparisonSchema,
  BudgetMeter: BudgetMeterSchema,
  CostBreakdown: CostBreakdownSchema,
  RouteSummary: RouteSummarySchema,
  RecommendationExplanation: RecommendationExplanationSchema,
  QuickActions: QuickActionsSchema,
  Lead: LeadSchema,
  PlaceCard: PlaceCardSchema,
  PlaceGallery: PlaceGallerySchema,
  PlaceMap: PlaceMapSchema,
  RouteStop: RouteStopSchema,
  RouteStops: RouteStopsSchema.extend({ stops: z.array(z.unknown()).min(2).max(10) }),
  DayPlan: DayPlanSchema,
  TipList: TipListSchema,
  KeyFacts: KeyFactsSchema,
  Callout: CalloutSchema,
  ComparisonTable: ComparisonTableSchema,
  FollowUps: FollowUpsSchema,
  Highlight: HighlightSchema,
  Highlights: HighlightsSchema.extend({ items: z.array(z.unknown()).min(2).max(6) }),
  LocalFlavours: LocalFlavoursSchema,
  Choice: ChoiceSchema,
  Choices: ChoicesSchema.extend({ options: z.array(z.unknown()).min(2).max(6) }),
  BoardDay: BoardDaySchema,
  DayBoard: DayBoardSchema.extend({ days: z.array(z.unknown()).min(1).max(7) }),
} as const satisfies Record<PlanningComponentName, z.ZodType>;

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
