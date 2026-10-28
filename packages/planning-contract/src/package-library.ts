import { createLibrary, defineComponent } from "@openuidev/lang-core";
import { z } from "zod/v4";
import { optionalSafeText, refIdSchema, safeText } from "./questions";

/**
 * Finite allowlist for the trip package presentation. It is separate from the planner's library:
 * the planner composes a conversation, while this library composes the packages page from one
 * optimisation run. Names, descriptions and Zod key order are the contract for the prompt, the
 * server validator and the React renderer.
 */
export const PACKAGE_SHOWCASE_COMPONENT_NAMES = [
  "PackageShowcase",
  "Lead",
  "Note",
  "PackageCard",
  "PackageCompare",
  "HotelStay",
  "PriceBreakdown",
  "BudgetFit",
  "LivePriceStatus",
  "PackageInsight",
  "NextSteps",
] as const;

export type PackageShowcaseComponentName = (typeof PACKAGE_SHOWCASE_COMPONENT_NAMES)[number];

const noop = () => null;

const descriptions: Partial<Record<PackageShowcaseComponentName, string>> = {};

function define(name: PackageShowcaseComponentName, description: string, props: z.ZodObject) {
  descriptions[name] = description;
  return defineComponent({ name, description, props, component: noop });
}

export const packageShowcaseDescriptions = descriptions as Record<PackageShowcaseComponentName, string>;

const LeadSchema = z.object({
  text: safeText(600),
});
const Lead = define(
  "Lead",
  "Editorial opening sentence or two that frames the packages, for example what sets them apart or who each one suits. Plain text only: never prices, totals, ratings, dates, nights, percentages or links. Those come from the blocks.",
  LeadSchema,
);

const NoteSchema = z.object({
  tone: z.enum(["info", "tip", "caution"]),
  title: safeText(100),
  body: optionalSafeText(400),
});
const Note = define(
  "Note",
  "A short callout: tip for a useful observation, caution for something the traveller should confirm (for example a meal plan still to confirm or a live check that is due), info for context. Plain text only; never prices, percentages, ratings or links.",
  NoteSchema,
);

const PackageCardSchema = z.object({
  packageId: refIdSchema,
  emphasis: z.enum(["lead", "standard"]).optional(),
});
const PackageCard = define(
  "PackageCard",
  "A rich card for one package from CONTEXT: hero photograph, selling price, budget position, score, the hotel for each stop and live-price status. It expands to show the stays and terms. Pass the packageId. Set emphasis to lead for the recommended package and standard for the others.",
  PackageCardSchema,
);

const PackageCompareSchema = z.object({
  packageIds: z.array(refIdSchema).min(2).max(6),
  title: optionalSafeText(80),
});
const PackageCompare = define(
  "PackageCompare",
  "Interactive side-by-side comparison of two to six packages from CONTEXT. The reader can switch between total, per-night and per-person amounts, sort by price or score and open any package. Use only packageIds listed in CONTEXT.packages.",
  PackageCompareSchema,
);

const HotelStaySchema = z.object({
  offerId: refIdSchema,
  packageId: refIdSchema.optional(),
});
const HotelStay = define(
  "HotelStay",
  "Detailed card for one hotel stay from CONTEXT.offers: property, room, meal plan, dates, nights, cancellation terms, review score and when the rate was retrieved. Pass the offerId and, when it belongs to a package, the packageId.",
  HotelStaySchema,
);

/**
 * Each component gets its own props schema instance. The OpenUI library registers components by their
 * schema object, so sharing one would collapse several components into one.
 */
const packageIdProps = () =>
  z.object({
    packageId: refIdSchema,
  });

const PriceBreakdown = define(
  "PriceBreakdown",
  "Itemised price for one package from CONTEXT: the selling total, tax, payable total, per night and per person, with the supplier cost lines only when the viewer may see them. Pass the packageId. Use it when the reader asks what the price includes.",
  packageIdProps(),
);

const BudgetFit = define(
  "BudgetFit",
  "Budget meter for one package from CONTEXT: its selling price against the trip budget, with a total and per-person switch. Pass the packageId. Use it when the reader asks whether a package fits the budget.",
  packageIdProps(),
);

const LivePriceStatus = define(
  "LivePriceStatus",
  "Live-price status for one package from CONTEXT: whether every hotel rate was checked, when, how long the check is valid, and what changed. Offers a button to re-check. Pass the packageId. Use it when the reader asks whether prices are current.",
  packageIdProps(),
);

const PackageInsight = define(
  "PackageInsight",
  "The grounded reasons for one package from CONTEXT: score breakdown, drive time between stops, assumptions and anything not yet verified. Never add facts or numbers yourself. Pass the packageId.",
  packageIdProps(),
);

const NextStepsSchema = z.object({});
const NextSteps = define(
  "NextSteps",
  "A row of next steps the server permits for this trip: create a quotation from a package, review the itinerary or run the optimisation again. Takes no arguments. Put it last.",
  NextStepsSchema,
);

const PackageShowcaseSchema = z.object({
  title: safeText(80),
  blocks: z
    .array(
      z.union([
        Lead.ref,
        Note.ref,
        PackageCard.ref,
        PackageCompare.ref,
        HotelStay.ref,
        PriceBreakdown.ref,
        BudgetFit.ref,
        LivePriceStatus.ref,
        PackageInsight.ref,
        NextSteps.ref,
      ]),
    )
    .min(1)
    .max(8),
  subtitle: optionalSafeText(200),
  note: optionalSafeText(60),
});
const PackageShowcase = define(
  "PackageShowcase",
  "Top-level container for the package presentation. The title is an evocative headline built around the trip, for example 'Three ways to spend six nights on the hill country'. The subtitle is one sentence that frames the choice. The note is a short handwritten aside of two to five words. Blocks list the components in reading order; lead with the recommended package.",
  PackageShowcaseSchema,
);

export const packageShowcaseComponents = [
  PackageShowcase,
  Lead,
  Note,
  PackageCard,
  PackageCompare,
  HotelStay,
  PriceBreakdown,
  BudgetFit,
  LivePriceStatus,
  PackageInsight,
  NextSteps,
];

/** Zod prop schema for every component. The server validates each node against these as well as the parser. */
export const PACKAGE_PROP_SCHEMAS = {
  PackageShowcase: PackageShowcaseSchema,
  Lead: LeadSchema,
  Note: NoteSchema,
  PackageCard: PackageCardSchema,
  PackageCompare: PackageCompareSchema,
  HotelStay: HotelStaySchema,
  PriceBreakdown: packageIdProps(),
  BudgetFit: packageIdProps(),
  LivePriceStatus: packageIdProps(),
  PackageInsight: packageIdProps(),
  NextSteps: NextStepsSchema,
} as const satisfies Record<PackageShowcaseComponentName, z.ZodType>;

export const packageShowcaseComponentGroups = [
  {
    name: "Frame",
    components: ["PackageShowcase"],
    notes: ["Always emit exactly one PackageShowcase as root. Keep the title and subtitle short and factual, with no prices."],
  },
  {
    name: "Packages",
    components: ["PackageCard", "PackageCompare", "PackageInsight", "BudgetFit"],
    notes: [
      "Show every package the reader should weigh, using PackageCard for a rich card and PackageCompare to contrast two to six of them.",
      "Mark the recommended package with PackageCard emphasis lead and explain it with PackageInsight.",
    ],
  },
  {
    name: "Stays and prices",
    components: ["HotelStay", "PriceBreakdown", "LivePriceStatus"],
    notes: [
      "Use HotelStay for a hotel the reader is likely to ask about, passing the packageId when it belongs to one.",
      "Use LivePriceStatus when the reader asks whether prices are current, and PriceBreakdown when they ask what a price includes.",
    ],
  },
  {
    name: "Text and next steps",
    components: ["Lead", "Note", "NextSteps"],
    notes: ["Use Note for one caution or tip, never for a price. Put NextSteps last."],
  },
];

type PackageShowcaseLibrary = ReturnType<typeof createLibrary>;
let cachedLibrary: PackageShowcaseLibrary | null = null;

/**
 * Built lazily for the same reason as the planner library: createLibrary mints an id, and Cloudflare
 * Workers forbids that work in module scope.
 */
export function getPackageShowcaseLibrary(): PackageShowcaseLibrary {
  cachedLibrary ??= createLibrary({
    id: "tripweave-package-showcase",
    root: "PackageShowcase",
    components: packageShowcaseComponents,
    componentGroups: packageShowcaseComponentGroups,
  });
  return cachedLibrary;
}

export function getPackageShowcaseLibrarySpec() {
  return getPackageShowcaseLibrary().toSpec();
}

export function getPackageShowcaseJSONSchema() {
  return getPackageShowcaseLibrary().toJSONSchema();
}
