import { createParser } from "@openuidev/lang-core";
import {
  PLANNING_COMPONENT_NAMES,
  PLANNING_PROP_SCHEMAS,
  getPlanningJSONSchema,
  type ClarificationSubmission,
  type PlanningComponentName,
  type PlanningHotelOffer,
  type PlanningItineraryView,
  type PlanningPackageView,
  type PlanningQuestion,
  type PlanningSnapshot,
} from "@tripweave/planning-contract";
import { AppError, SUPPORTED_CURRENCIES, isIsoDate, toMinorUnits, type BudgetScope, type ParsedTrip } from "@tripweave/shared";
import { quotes, trips } from "@tripweave/database";
import { buildStops, validateItinerary } from "@tripweave/itinerary-engine";
import type { AppContext } from "../lib/http";
import { audit, getTenant } from "../middleware/auth";
import { presentPackageList } from "./package-presentation";
import { allocateRooms } from "./party";
import { computeStopLegs } from "./routing";

const COMPONENT_SET = new Set<string>(PLANNING_COMPONENT_NAMES);

type StoredParseResult = {
  parsed: ParsedTrip;
  engine?: string;
  model?: string | null;
  warnings?: string[];
  parsedAt?: string;
  suggestedItinerary?: { plan: { destination: string; nights: number }[]; dayVisitOnly?: string[]; question?: string } | null;
} | null;

function asStoredParse(value: unknown): StoredParseResult {
  if (!value || typeof value !== "object") return null;
  const candidate = value as StoredParseResult;
  return candidate && typeof candidate === "object" && "parsed" in candidate ? candidate : null;
}

function numberQuestion(id: PlanningQuestion["id"], label: string, currentValue: number | null, min: number, max: number, help?: string): PlanningQuestion {
  return { id, label, kind: "number", required: true, currentValue, min, max, ...(help ? { help } : {}) };
}

function dateQuestion(id: PlanningQuestion["id"], label: string, currentValue: string | null): PlanningQuestion {
  return { id, label, kind: "date", required: true, currentValue };
}

/** Questions are derived from the saved trip, never from model output. */
export function buildPlanningQuestions(trip: trips.TripRecord, itinerary: trips.ItineraryRecord | null): PlanningQuestion[] {
  const parse = asStoredParse(trip.parseResult);
  const parsed = parse?.parsed ?? null;
  const questions: PlanningQuestion[] = [];
  if (!trip.arrivalDate) questions.push(dateQuestion("arrival_date", "Arrival date", null));
  if (!trip.departureDate) questions.push(dateQuestion("departure_date", "Departure date", null));
  if (parsed && parsed.adults === null) questions.push(numberQuestion("adults", "Number of adults", trip.party.adults, 1, 60));
  if (parsed && parsed.children === null) questions.push(numberQuestion("children", "Number of children", trip.party.children, 0, 40));
  if (trip.party.children > 0 && trip.party.childAges.length < trip.party.children) {
    questions.push({
      id: "child_ages",
      label: "Children's ages",
      help: "Comma-separated ages, for example 8, 11. Ages must be 17 or under.",
      kind: "text",
      required: true,
      currentValue: trip.party.childAges.join(", "),
    });
  }
  if (trip.budgetAmountMinor === null) {
    questions.push(numberQuestion("budget_amount", `Budget amount (${trip.budgetCurrency})`, null, 0, 100_000_000, "Use the major currency unit, for example 4500."));
  }
  if (parsed && trip.budgetAmountMinor !== null && parsed.budgetCurrency === null) {
    questions.push({
      id: "budget_currency",
      label: "Budget currency",
      kind: "select",
      required: true,
      currentValue: trip.budgetCurrency,
      options: SUPPORTED_CURRENCIES.map((code) => ({ value: code, label: code })),
    });
  }
  if (parsed && trip.budgetAmountMinor !== null && parsed.budgetScope === null) {
    questions.push({
      id: "budget_scope",
      label: "Budget covers",
      kind: "select",
      required: true,
      currentValue: trip.budgetScope,
      options: [
        { value: "accommodation_only", label: "Accommodation only" },
        { value: "all_inclusive_trip", label: "The whole trip" },
      ],
    });
  }
  const suggested = parse?.suggestedItinerary;
  if (!itinerary && suggested?.plan?.length) {
    const plan = suggested.plan.map((stop) => `${stop.destination} (${stop.nights} night${stop.nights === 1 ? "" : "s"})`).join(", ");
    questions.push({
      id: "confirm_suggested_plan",
      label: "Use the suggested overnight plan?",
      help: `${plan}. This saves a draft itinerary you can still edit.`,
      kind: "boolean",
      required: true,
      currentValue: false,
    });
  }
  return questions.slice(0, 20);
}

async function loadItineraryView(ctx: AppContext, itinerary: trips.ItineraryRecord | null, trip: trips.TripRecord): Promise<PlanningItineraryView | null> {
  if (!itinerary) return null;
  const { legs, warnings, source } = await computeStopLegs(ctx.env, ctx.get("db"), ctx.get("deps"), itinerary.stops);
  const issues = validateItinerary(itinerary.stops, legs, { tripArrival: trip.arrivalDate, tripDeparture: trip.departureDate });
  return {
    ref: "itinerary",
    id: itinerary.id,
    title: itinerary.title,
    summary: itinerary.summary,
    status: itinerary.status,
    stops: itinerary.stops,
    legs,
    issues,
    legSource: source,
    warnings,
  };
}

export async function buildPlanningSnapshot(ctx: AppContext, tripId: string): Promise<PlanningSnapshot> {
  const a = getTenant(ctx);
  const db = ctx.get("db");
  const trip = await trips.getTrip(db, a.organizationId, tripId);
  if (!trip) throw new AppError("not_found", "Trip not found");
  const [itinerary, jobs] = await Promise.all([trips.getLatestItinerary(db, a.organizationId, tripId), trips.listJobsForTrip(db, a.organizationId, tripId)]);
  const job = jobs.find((row) => row.status === "succeeded" || row.status === "infeasible") ?? null;
  const records = job?.status === "succeeded" ? await trips.listJobPackages(db, a.organizationId, job.id) : [];
  const presented = ((await presentPackageList(ctx, records.slice(0, 20))) as unknown as PlanningPackageView[]).map((pkg, index) => ({ ...pkg, ref: `pkg_${index + 1}` }));
  const offersById = new Map<string, PlanningHotelOffer>();
  for (const pkg of presented) {
    for (const selection of pkg.package.selections) {
      const existing = offersById.get(selection.offer.offerId);
      if (existing) {
        if (!existing.packageIds.includes(pkg.id)) existing.packageIds.push(pkg.id);
      } else {
        offersById.set(selection.offer.offerId, {
          ref: `offer_${offersById.size + 1}`,
          offerId: selection.offer.offerId,
          packageIds: [pkg.id],
          stopId: selection.stopId,
          destination: selection.destination,
          offer: selection.offer,
          coverImageId: selection.coverImageId ?? null,
        });
      }
    }
  }
  const quotesPage = a.permissions.has("quotes:read") ? await quotes.listQuotes(db, a.organizationId, { tripId, page: 1, pageSize: 20 }) : null;
  const questions = buildPlanningQuestions(trip, itinerary);
  const parse = asStoredParse(trip.parseResult);
  const itineraryView = await loadItineraryView(ctx, itinerary, trip);
  const permissions = {
    canWriteTrips: a.permissions.has("trips:write"),
    canRunOptimisation: a.permissions.has("optimisation:run"),
    canCreateQuotes: a.permissions.has("quotes:write"),
    canSeeMargins: a.permissions.has("margins:view"),
    canSeeContracts: a.permissions.has("agreements:manage"),
  };
  const quoteSummaries = (quotesPage?.items ?? []).map((quote, index) => ({
    ref: `quote_${index + 1}`,
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    currentVersion: quote.currentVersion,
    sellingPriceMinor: quote.sellingPriceMinor ?? null,
    currency: quote.currency,
  }));
  const allowedActions = [
    ...(permissions.canWriteTrips && questions.length > 0 ? (["apply_clarification"] as const) : []),
    ...(["open_packages", "open_itinerary"] as const),
    ...(permissions.canRunOptimisation ? (["open_optimise"] as const) : []),
    ...(quoteSummaries.length > 0 ? (["open_quote"] as const) : []),
  ];
  return {
    generatedAt: ctx.get("deps").now().toISOString(),
    trip: {
      ref: "trip",
      id: trip.id,
      title: trip.title,
      description: trip.description,
      status: trip.status,
      arrivalDate: trip.arrivalDate,
      departureDate: trip.departureDate,
      party: trip.party,
      budgetAmountMinor: trip.budgetAmountMinor,
      budgetCurrency: trip.budgetCurrency,
      budgetScope: trip.budgetScope as BudgetScope,
      preferredHotelCategory: trip.preferredHotelCategory,
      preferredMealPlan: trip.preferredMealPlan,
      specialRequirements: trip.specialRequirements as PlanningSnapshot["trip"]["specialRequirements"],
      parseResult: parse?.parsed
        ? {
            parsed: parse.parsed,
            engine: parse.engine ?? "unknown",
            model: parse.model ?? null,
            warnings: parse.warnings ?? [],
            parsedAt: parse.parsedAt,
          }
        : null,
    },
    itinerary: itineraryView,
    packages: presented,
    offers: [...offersById.values()].slice(0, 40),
    quotes: quoteSummaries,
    questions,
    missingFields: questions.map((question) => question.label),
    permissions,
    sources: {
      engine: parse?.engine ?? "none",
      model: parse?.model ?? null,
      warnings: parse?.warnings ?? [],
      parseEngine: parse?.engine ?? null,
      parsedAt: parse?.parsedAt ?? null,
    },
    allowedActions,
    allowlist: PLANNING_COMPONENT_NAMES,
  };
}

/** Extracts every ElementNode reachable from the root, with a hard cap against absurd programs. */
function collectNodes(root: unknown): { nodes: { typeName: string; props: Record<string, unknown> }[]; tooMany: boolean } {
  const nodes: { typeName: string; props: Record<string, unknown> }[] = [];
  const visitValue = (value: unknown): void => {
    if (nodes.length > 40) return;
    if (Array.isArray(value)) {
      for (const item of value) visitValue(item);
      return;
    }
    if (value && typeof value === "object" && (value as { type?: unknown }).type === "element") {
      const node = value as { typeName: string; props: Record<string, unknown> };
      nodes.push({ typeName: node.typeName, props: node.props });
      for (const child of Object.values(node.props ?? {})) visitValue(child);
    }
  };
  visitValue(root);
  return { nodes, tooMany: nodes.length > 40 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const PRICE_OR_URL = /(?:\b(?:USD|EUR|GBP|LKR)\b\s?\d|[$€£]\s?\d|\d[\d,.]*\s?\b(?:USD|EUR|GBP|LKR|dollars?|euros?|pounds?|rupees?)\b|https?:\/\/|www\.)/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Every string the model writes, at any depth, is plain text. Length and bounds are checked by the
 * component's Zod schema; this rejects control characters and anything that looks like a price or link.
 */
function freeTextProblem(value: unknown): string | null {
  if (typeof value === "string") {
    if (value.length > 1_000) return "is too long";
    if (CONTROL_CHARACTERS.test(value)) return "contains control characters";
    if (PRICE_OR_URL.test(value)) return "must not contain prices or URLs";
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = freeTextProblem(item);
      if (problem) return problem;
    }
  }
  return null;
}

/** The parser represents omitted optional arguments as null; the Zod schemas expect them to be absent. */
function withoutNulls(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== null && value !== undefined));
}

/**
 * Validates a complete program against the allowlist and the snapshot. The parser enforces prop types
 * and required arguments; each node is then checked against its component schema (lengths, bounds,
 * enums), every string is checked as plain text, and every reference must resolve to the current
 * snapshot. Tools and non-allowlisted components are rejected before any generated UI is rendered.
 */
export function validatePlanningProgram(
  program: string,
  snapshot: PlanningSnapshot,
  options: { requireMap?: boolean } = {},
): { ok: true } | { ok: false; errors: string[] } {
  if (typeof program !== "string" || program.trim().length === 0) return { ok: false, errors: ["empty program"] };
  if (program.length > 40_000) return { ok: false, errors: ["program too large"] };
  let parser: ReturnType<typeof createParser>;
  try {
    parser = createParser(getPlanningJSONSchema(), "PlanningCanvas");
  } catch {
    return { ok: false, errors: ["validator unavailable"] };
  }
  const result = parser.parse(program);
  const errors: string[] = [];
  if (result.meta.incomplete) errors.push("incomplete program");
  for (const error of result.meta.errors) if (error.severity !== "warning") errors.push(`${error.code}: ${error.message}`);
  if (result.meta.unresolved.length > 0) errors.push(`unresolved references: ${result.meta.unresolved.join(", ")}`);
  if (result.queryStatements.length > 0 || result.mutationStatements.length > 0) errors.push("tool calls are not allowed");
  if (!result.root) errors.push("missing root");
  if (result.root && result.root.typeName !== "PlanningCanvas") errors.push("root must be PlanningCanvas");
  const { nodes, tooMany } = collectNodes(result.root);
  if (tooMany) errors.push("too many components");
  if (errors.length > 0) return { ok: false, errors };

  const tripRefs = new Set([snapshot.trip.id, snapshot.trip.ref]);
  const itineraryRefs = new Set(snapshot.itinerary ? [snapshot.itinerary.id, snapshot.itinerary.ref] : []);
  const packageByRef = new Map(snapshot.packages.flatMap((pkg) => [[pkg.id, pkg] as const, [pkg.ref, pkg] as const]));
  const offerByRef = new Map(snapshot.offers.flatMap((offer) => [[offer.offerId, offer] as const, [offer.ref, offer] as const]));
  const hasItinerary = !!snapshot.itinerary;
  for (const node of nodes) {
    if (!COMPONENT_SET.has(node.typeName)) {
      errors.push(`unknown component: ${node.typeName}`);
      continue;
    }
    const props = withoutNulls(node.props ?? {});
    const schema = PLANNING_PROP_SCHEMAS[node.typeName as PlanningComponentName];
    const parsed = schema.safeParse(props);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 3)) errors.push(`${node.typeName}${issue.path.length > 0 ? `.${issue.path.join(".")}` : ""} ${issue.message}`);
      continue;
    }
    for (const [key, value] of Object.entries(props)) {
      const problem = freeTextProblem(value);
      if (problem) errors.push(`${node.typeName}.${key} ${problem}`);
    }
    const id = (key: string, required: boolean): string | null => {
      const value = props[key];
      if (value === undefined) {
        if (required) errors.push(`${node.typeName}.${key} is required`);
        return null;
      }
      if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
        errors.push(`${node.typeName}.${key} is not a valid ID`);
        return null;
      }
      return value;
    };
    const idArray = (key: string): string[] => (Array.isArray(props[key]) ? (props[key] as string[]) : []);
    switch (node.typeName) {
      case "PlanningCanvas":
        if (!Array.isArray(props.blocks) || props.blocks.length === 0) errors.push("PlanningCanvas.blocks must not be empty");
        break;
      case "TripHero": {
        const tripId = id("tripId", true);
        if (tripId && !tripRefs.has(tripId)) errors.push("TripHero references another trip");
        const itineraryKey = id("itineraryId", false);
        if (itineraryKey && (!hasItinerary || !itineraryRefs.has(itineraryKey))) errors.push("TripHero references another itinerary");
        break;
      }
      case "TripRequirementSummary": {
        const tripId = id("tripId", true);
        if (tripId && !tripRefs.has(tripId)) errors.push("TripRequirementSummary references another trip");
        break;
      }
      case "DestinationTimeline":
      case "TripMap": {
        const value = id("itineraryId", true);
        if (!hasItinerary) errors.push(`${node.typeName} requires an itinerary`);
        else if (value && !itineraryRefs.has(value)) errors.push(`${node.typeName} references another itinerary`);
        break;
      }
      case "HotelCard": {
        const offerKey = id("offerId", true);
        const packageKey = id("packageId", false);
        const offer = offerKey ? offerByRef.get(offerKey) : null;
        const pkg = packageKey ? packageByRef.get(packageKey) : null;
        if (offerKey && !offer) errors.push("HotelCard references an unknown offer");
        if (packageKey && !pkg) errors.push("HotelCard references an unknown package");
        if (offer && pkg && !offer.packageIds.includes(pkg.id)) errors.push("HotelCard offer does not belong to that package");
        break;
      }
      case "HotelComparison": {
        for (const offerKey of idArray("offerIds")) if (!offerByRef.has(offerKey)) errors.push("HotelComparison references an unknown offer");
        break;
      }
      case "PackageSummary":
      case "CostBreakdown":
      case "RecommendationExplanation":
      case "BudgetMeter": {
        const packageKey = id("packageId", true);
        if (packageKey && !packageByRef.has(packageKey)) errors.push(`${node.typeName} references an unknown package`);
        break;
      }
      case "PackageComparison": {
        for (const packageKey of idArray("packageIds")) if (!packageByRef.has(packageKey)) errors.push("PackageComparison references an unknown package");
        break;
      }
      case "RouteStops": {
        const stops = Array.isArray(props.stops) ? (props.stops as { typeName?: unknown }[]) : [];
        if (stops.some((stop) => stop?.typeName !== "RouteStop")) errors.push("RouteStops must contain only RouteStop blocks");
        break;
      }
      case "ComparisonTable": {
        const columns = Array.isArray(props.columns) ? props.columns.length : 0;
        const rows = Array.isArray(props.rows) ? (props.rows as unknown[][]) : [];
        if (rows.some((row) => !Array.isArray(row) || row.length !== columns + 1)) errors.push("ComparisonTable rows must have one label and one cell per column");
        break;
      }
      case "RouteSummary": {
        const itineraryKey = id("itineraryId", false);
        const packageKey = id("packageId", false);
        if (itineraryKey && !itineraryRefs.has(itineraryKey)) errors.push("RouteSummary references another itinerary");
        if (packageKey && !packageByRef.has(packageKey)) errors.push("RouteSummary references an unknown package");
        if (!itineraryKey && !packageKey && !hasItinerary) errors.push("RouteSummary has no route to show");
        break;
      }
      default:
        break;
    }
  }
  if (options.requireMap && !nodes.some((node) => node.typeName === "PlaceMap" || node.typeName === "TripMap")) {
    errors.push("this question asks about places or routes, so the reply must include a PlaceMap block (or TripMap for the saved itinerary)");
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

function lang(value: string): string {
  return JSON.stringify(value);
}

/** Deterministic, readable fallback built only from authoritative IDs. */
export function buildFallbackProgram(snapshot: PlanningSnapshot, reason: "unavailable" | "invalid" | "standard" = "standard"): string {
  const defs: string[] = [];
  const blocks: string[] = [];
  const add = (expression: string) => {
    const name = `block${blocks.length + 1}`;
    defs.push(`${name} = ${expression}`);
    blocks.push(name);
  };
  add(`TripRequirementSummary(${lang(snapshot.trip.ref)})`);
  if (snapshot.questions.length > 0) add(`ClarificationForm(${lang("These details are still missing.")})`);
  if (snapshot.itinerary) {
    add(`DestinationTimeline(${lang(snapshot.itinerary.ref)})`);
    add(`TripMap(${lang(snapshot.itinerary.ref)})`);
  }
  if (snapshot.packages.length === 1) {
    add(`PackageSummary(${lang(snapshot.packages[0]!.ref)})`);
  } else if (snapshot.packages.length > 1) {
    add(`PackageComparison(${langArray(snapshot.packages.slice(0, 4).map((pkg) => pkg.ref))})`);
  }
  const first = snapshot.packages[0];
  if (first) {
    if (first.pricing) add(`CostBreakdown(${lang(first.ref)})`);
    if (first.package.explanation.length > 0) add(`RecommendationExplanation(${lang(first.ref)})`);
    if (first.package.travel.legs.length > 0 || snapshot.itinerary) add(`RouteSummary(null, ${lang(first.ref)})`);
  }
  if (snapshot.offers.length > 1) add(`HotelComparison(${langArray(snapshot.offers.slice(0, 4).map((offer) => offer.ref))})`);
  const subtitle =
    reason === "unavailable"
      ? "AI generation is unavailable. This standard summary uses the latest server data."
      : reason === "invalid"
        ? "The generated view could not be validated. This standard summary uses the latest server data."
        : "A standard summary of the latest server data.";
  return [`root = PlanningCanvas(${lang("Trip planning overview")}, [${blocks.join(", ")}], ${lang(subtitle)})`, ...defs].join("\n");
}

function langArray(values: string[]): string {
  return `[${values.map((value) => lang(value)).join(", ")}]`;
}

function parseChildAges(value: unknown): number[] {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const ages: number[] = [];
  for (const part of parts) {
    const text = String(part).trim();
    const age = typeof part === "number" ? part : Number(text);
    if (text === "" || !Number.isInteger(age) || age < 0 || age > 17) throw new AppError("validation_failed", "Children's ages must be whole numbers between 0 and 17");
    ages.push(age);
  }
  if (ages.length === 0) throw new AppError("validation_failed", "Enter at least one child's age");
  if (ages.length > 40) throw new AppError("validation_failed", "Too many children's ages");
  return ages;
}

/**
 * Applies structured answers deterministically. Values are validated against the current question
 * list; the model never supplies or sees the resulting database patch.
 */
export async function applyClarificationAnswers(ctx: AppContext, tripId: string, submission: ClarificationSubmission): Promise<{ applied: string[]; snapshot: PlanningSnapshot; warnings: string[] }> {
  const a = getTenant(ctx);
  const db = ctx.get("db");
  if (!a.permissions.has("trips:write")) throw new AppError("forbidden", "You do not have permission to update trip requirements");
  const trip = await trips.getTrip(db, a.organizationId, tripId);
  if (!trip) throw new AppError("not_found", "Trip not found");
  const itinerary = await trips.getLatestItinerary(db, a.organizationId, tripId);
  const questions = buildPlanningQuestions(trip, itinerary);
  const allowed = new Map(questions.map((question) => [question.id, question]));
  const answers = new Map(submission.answers.map((answer) => [answer.questionId, answer]));
  for (const answer of submission.answers) if (!allowed.has(answer.questionId)) throw new AppError("validation_failed", "That clarification question is no longer open", { issues: [{ path: "answers", message: `Unknown or closed question: ${answer.questionId}` }] });

  const patch: Partial<trips.TripInput> & { parseResult?: unknown } = {};
  const warnings: string[] = [];
  let adults = trip.party.adults;
  let children = trip.party.children;
  let childAges = [...trip.party.childAges];
  let partyChanged = false;
  let budgetMajor: number | null = trip.budgetAmountMinor === null ? null : Number((trip.budgetAmountMinor / 100).toFixed(2));
  let budgetCurrency = trip.budgetCurrency;

  const answerValue = (questionId: PlanningQuestion["id"]): unknown => answers.get(questionId)?.value;
  const date = (questionId: "arrival_date" | "departure_date"): string | null => {
    const value = answerValue(questionId);
    if (value === undefined) return null;
    if (typeof value !== "string" || !isIsoDate(value)) throw new AppError("validation_failed", "Enter a valid date in YYYY-MM-DD format", { issues: [{ path: "answers", message: `${questionId} must be a valid date` }] });
    return value;
  };
  const number = (questionId: "adults" | "children" | "budget_amount"): number | null => {
    const value = answerValue(questionId);
    if (value === undefined) return null;
    const question = allowed.get(questionId)!;
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < (question.min ?? Number.MIN_SAFE_INTEGER) || value > (question.max ?? Number.MAX_SAFE_INTEGER)) {
      throw new AppError("validation_failed", "Enter a whole number within the allowed range", { issues: [{ path: "answers", message: `${questionId} is outside its allowed range` }] });
    }
    return value;
  };

  const arrival = date("arrival_date");
  if (arrival) patch.arrivalDate = arrival;
  const departure = date("departure_date");
  if (departure) patch.departureDate = departure;
  const effectiveArrival = patch.arrivalDate ?? trip.arrivalDate;
  const effectiveDeparture = patch.departureDate ?? trip.departureDate;
  if (effectiveArrival && effectiveDeparture && effectiveDeparture <= effectiveArrival) throw new AppError("validation_failed", "Departure must be after arrival", { issues: [{ path: "answers", message: "departure_date must be after arrival_date" }] });

  const adultsAnswer = number("adults");
  if (adultsAnswer !== null) (adults = adultsAnswer), (partyChanged = true);
  const childrenAnswer = number("children");
  if (childrenAnswer !== null) {
    children = childrenAnswer;
    if (children < childAges.length) childAges = childAges.slice(0, children);
    if (children === 0) childAges = [];
    partyChanged = true;
  }
  const childAgesAnswer = answerValue("child_ages");
  if (childAgesAnswer !== undefined) {
    childAges = parseChildAges(childAgesAnswer);
    const expectedChildren = childrenAnswer ?? children;
    if (childAges.length !== expectedChildren) throw new AppError("validation_failed", "Provide one age for each child", { issues: [{ path: "answers", message: "child_ages must match the number of children" }] });
    children = expectedChildren;
    partyChanged = true;
  }
  if (partyChanged) {
    if (children > 0 && childAges.length !== children) childAges = [];
    const allocation = allocateRooms(adults, children, childAges, null);
    patch.party = { adults, children, childAges, rooms: allocation.rooms };
    if (allocation.assumption) warnings.push(allocation.assumption);
  }

  const budgetAmount = number("budget_amount");
  if (budgetAmount !== null) budgetMajor = budgetAmount;
  const currencyAnswer = answerValue("budget_currency");
  if (currencyAnswer !== undefined) {
    if (typeof currencyAnswer !== "string" || !(SUPPORTED_CURRENCIES as readonly string[]).includes(currencyAnswer)) throw new AppError("validation_failed", "Choose a supported currency");
    budgetCurrency = currencyAnswer;
  }
  if (budgetAmount !== null || currencyAnswer !== undefined) {
    if (budgetMajor === null) throw new AppError("validation_failed", "Enter a budget amount first");
    patch.budgetAmountMinor = toMinorUnits(budgetMajor, budgetCurrency);
    patch.budgetCurrency = budgetCurrency;
  }
  const scopeAnswer = answerValue("budget_scope");
  if (scopeAnswer !== undefined) {
    if (scopeAnswer !== "accommodation_only" && scopeAnswer !== "all_inclusive_trip") throw new AppError("validation_failed", "Choose a valid budget scope");
    patch.budgetScope = scopeAnswer;
  }

  const confirmPlan = answerValue("confirm_suggested_plan");
  if (confirmPlan !== undefined && typeof confirmPlan !== "boolean") throw new AppError("validation_failed", "Choose whether to use the suggested plan");
  const saveSuggestedPlan = confirmPlan === true;
  const dismissSuggestedPlan = confirmPlan === false;
  const parse = asStoredParse(trip.parseResult);
  if (saveSuggestedPlan && !parse?.suggestedItinerary?.plan?.length) throw new AppError("validation_failed", "There is no suggested plan to confirm");
  if (saveSuggestedPlan && !effectiveArrival) throw new AppError("validation_failed", "Add an arrival date before creating the itinerary");

  // Keep the saved parse result in step with the applied answers so old questions do not linger.
  if (parse?.parsed) {
    const parsed = { ...parse.parsed };
    if (patch.arrivalDate) parsed.arrivalDate = patch.arrivalDate;
    if (patch.departureDate) parsed.departureDate = patch.departureDate;
    if (adultsAnswer !== null) parsed.adults = adultsAnswer;
    if (childrenAnswer !== null || childAgesAnswer !== undefined) {
      parsed.children = children;
      parsed.childAges = childAges;
    }
    if (patch.budgetAmountMinor !== undefined) {
      parsed.budgetAmount = budgetMajor;
      parsed.budgetCurrency = budgetCurrency as ParsedTrip["budgetCurrency"];
    }
    if (patch.budgetScope) parsed.budgetScope = patch.budgetScope as ParsedTrip["budgetScope"];
    patch.parseResult = { ...parse, parsed, ...(dismissSuggestedPlan ? { suggestedItinerary: null } : {}) };
  }
  if (Object.keys(patch).length === 0) throw new AppError("validation_failed", "No requirements were changed");
  await trips.updateTrip(db, a.organizationId, a.userId, tripId, patch);
  if (saveSuggestedPlan) {
    const plan = parse!.suggestedItinerary!.plan;
    const stops = buildStops(plan, effectiveArrival!);
    await trips.saveItinerary(db, tripId, { title: "From AI planning", summary: parse!.suggestedItinerary!.question ?? "", status: "draft", stops });
  }
  const after = buildPlanningQuestions((await trips.getTrip(db, a.organizationId, tripId))!, await trips.getLatestItinerary(db, a.organizationId, tripId));
  if (["new", "needs_clarification"].includes(trip.status) && after.length === 0) await trips.setTripStatus(db, a.organizationId, tripId, "planning", a.userId);
  await audit(ctx, "trip.planning_clarifications_applied", "trip", tripId, { questions: submission.answers.map((answer) => answer.questionId) });
  return { applied: submission.answers.map((answer) => answer.questionId), snapshot: await buildPlanningSnapshot(ctx, tripId), warnings };
}
