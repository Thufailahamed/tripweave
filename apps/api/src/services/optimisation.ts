import {
  AppError, convertWithSnapshot, nightsBetween, type FxSnapshot, type ItineraryStop, type MealPlan, type NormalisedOffer, type OptimisationObjective, type PricingConfig, type RouteLeg,
  optimisationRequestSchema,
} from "@tripweave/shared";
import type { z } from "zod";
import { inventory, ops, trips, type Db } from "@tripweave/database";
import { sellFromCost } from "@tripweave/pricing-engine";
import { validateItinerary, hasBlockingIssues } from "@tripweave/itinerary-engine";
import {
  evaluateSelection, filterCandidates, runSearch,
  type CandidatePackage, type HardConstraints, type InfeasibilityReport, type SearchInput, type SearchResult, type SearchStop, type StopFunnel,
} from "@tripweave/optimisation-engine";
import { searchAllProviders, ProviderError, mergeDiscoveredOffers, type ProviderOutcome } from "@tripweave/provider-contracts";
import type { Deps, Env, JobMessage } from "../env";
import { log } from "../middleware/core";
import { computeStopLegs } from "./routing";
import { enabledExternalProviders, loadIntegrations, loadPricing } from "./settings";

export const ALGORITHM_VERSION = "beam-v1";
export type OptimisationRequest = z.output<typeof optimisationRequestSchema>;

export interface PipelineCtx {
  env: Env;
  db: Db;
  deps: Deps;
}

export const dbOfferId = (orgId: string, offerId: string) => `${orgId}:${offerId}`;

/** Providers that add no live supplier rate: the catalogue, estimated discovery and illustrative mock data. */
const NON_LIVE_PROVIDER_KEYS = new Set(["internal", "osm_discovery", "mock"]);
const NO_LIVE_EXTERNAL_WARNING =
  "You asked to include external providers, but no live external supplier was available for this run. Only your own catalogue and any estimate-only discovery listings were searched. Enable Google Hotels in Settings → Integrations and run again for live cross-OTA prices.";

/** Explains a run where the agent asked for external rates but no live supplier was actually available. */
export function externalProviderWarning(requested: boolean, providerKeys: string[]): string | null {
  if (!requested || providerKeys.some((key) => !NON_LIVE_PROVIDER_KEYS.has(key))) return null;
  return NO_LIVE_EXTERNAL_WARNING;
}

const MEAL_ORDER: MealPlan[] = ["RO", "BB", "HB", "FB", "AI"];
/** A "minimum meal plan" accepts that plan and every richer one (e.g. BB accepts BB/HB/FB/AI). */
export function mealPlansAtLeast(min: MealPlan | null | undefined): MealPlan[] {
  if (!min) return [];
  return MEAL_ORDER.slice(MEAL_ORDER.indexOf(min));
}

export interface JobSummary {
  stage?: "fetched" | "done";
  candidates?: Record<string, string[]>;
  /** Stops whose provider search completed; a retry resumes at the next unfinished stop. */
  fetchedStops?: string[];
  providers?: (ProviderOutcome & { stopId: string })[];
  legs?: RouteLeg[];
  legWarnings?: string[];
  dropped?: number;
  notes?: string[];
  funnel?: StopFunnel[];
  infeasible?: InfeasibilityReport | null;
  omittedObjectives?: SearchResult["omittedObjectives"];
  stats?: SearchResult["stats"];
  warnings?: string[];
  packageIds?: string[];
  currency?: string;
  itineraryIssues?: ReturnType<typeof validateItinerary>;
}

export function toSearchStops(stops: ItineraryStop[]): SearchStop[] {
  return [...stops]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({ id: s.id, destination: s.destination, latitude: s.latitude, longitude: s.longitude, arrivalDate: s.arrivalDate, departureDate: s.departureDate, nights: nightsBetween(s.arrivalDate, s.departureDate) }));
}

/** Stops still needing a provider query after a partial or retried fetch stage. */
export function pendingStops<T extends { id: string }>(stops: T[], fetchedStops: string[] | undefined): T[] {
  const done = new Set(fetchedStops ?? []);
  return stops.filter((s) => !done.has(s.id));
}

/** Assembles the engine input from the trip, request and stored data. Pure; no I/O. */
export function buildSearchInput(a: {
  trip: trips.TripRecord;
  request: OptimisationRequest;
  stops: SearchStop[];
  candidatesByStop: Record<string, NormalisedOffer[]>;
  legs: RouteLeg[];
  fx: FxSnapshot;
  pricing: PricingConfig;
  objectives?: OptimisationObjective[];
  now?: () => number;
}): { input: SearchInput; notes: string[] } {
  const { trip, request: req } = a;
  const notes: string[] = [];
  const c = req.constraints;
  const currency = c.budgetCurrency ?? trip.budgetCurrency;
  const special = trip.specialRequirements as Partial<{ requiredAmenities: string[]; preferredAmenities: string[]; maxLegDurationMinutes: number | null; requiredMealPlans: string[]; requireFreeCancellation: boolean }>;

  let budgetMinor: number | null = c.budgetAmountMinor ?? null;
  if (budgetMinor === null && trip.budgetAmountMinor !== null) {
    if (trip.budgetScope === "accommodation_only") budgetMinor = trip.budgetAmountMinor;
    else notes.push("The stated budget covers the whole trip, so it cannot constrain accommodation on its own. Add transport and activity costs when quoting to compare against it.");
  }
  const requiredMealPlans = (c.requiredMealPlans.length ? c.requiredMealPlans : (special.requiredMealPlans as MealPlan[] | undefined)?.length ? (special.requiredMealPlans as MealPlan[]) : mealPlansAtLeast(trip.preferredMealPlan as MealPlan | null)) as MealPlan[];
  const constraints: HardConstraints = {
    budgetMinor,
    strictBudget: c.strictBudget,
    maxLegDurationMinutes: c.maxLegDurationMinutes ?? special.maxLegDurationMinutes ?? null,
    minimumCategory: c.minimumCategory ?? null,
    requiredAmenities: [...new Set([...(special.requiredAmenities ?? []), ...c.requiredAmenities])],
    requiredMealPlans,
    requireFreeCancellation: !!(c.requireFreeCancellation || special.requireFreeCancellation),
    requireConfirmedAvailability: c.requireConfirmedAvailability,
    allowUnconfirmedMealPlans: c.allowUnconfirmedMealPlans,
  };
  const input: SearchInput = {
    stops: a.stops,
    candidatesByStop: a.candidatesByStop,
    party: { adults: trip.party.adults, children: trip.party.children, rooms: trip.party.rooms },
    constraints,
    preferredAmenities: [...new Set([...(special.preferredAmenities ?? []), ...c.preferredAmenities])],
    currency,
    convert: (amount, from) => convertWithSnapshot(amount, from, currency, a.fx),
    // Budgets are compared at selling price, so markup is accounted for before a hotel is shortlisted.
    budgetBasis: (cost) => sellFromCost(cost, currency, a.pricing),
    legs: a.legs,
    objectives: a.objectives ?? req.objectives,
    config: { beamWidth: req.beamWidth, candidateLimitPerStop: req.candidateLimitPerStop },
    now: a.now,
  };
  return { input, notes };
}

/* ======================= job creation & dispatch ======================= */

export async function createOptimisationJob(ctx: PipelineCtx, who: { organizationId: string; userId: string }, tripId: string, request: OptimisationRequest): Promise<string> {
  const { db } = ctx;
  const trip = await trips.getTrip(db, who.organizationId, tripId);
  if (!trip) throw new AppError("not_found", "Trip not found");
  const itinerary = request.itineraryId ? await trips.getItinerary(db, who.organizationId, request.itineraryId) : await trips.getLatestItinerary(db, who.organizationId, tripId);
  if (!itinerary || itinerary.tripRequestId !== tripId || itinerary.stops.length === 0) throw new AppError("precondition_failed", "Create and confirm an itinerary with overnight stops before generating packages.");
  const issues = validateItinerary(itinerary.stops, [], { tripArrival: trip.arrivalDate, tripDeparture: trip.departureDate });
  if (hasBlockingIssues(issues)) throw new AppError("precondition_failed", `The itinerary has problems that must be fixed first: ${issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ")}`, { issues });
  const sub = await db.prepare("SELECT monthly_optimisation_limit AS lim FROM subscriptions WHERE organization_id = ?").bind(who.organizationId).first<{ lim: number }>();
  if (sub && (await trips.countJobsThisMonth(db, who.organizationId)) >= Number(sub.lim)) throw new AppError("precondition_failed", "The monthly optimisation limit for this subscription has been reached.");
  const pricing = await loadPricing(db, who.organizationId);
  const fx = (await ops.latestFxSnapshot(db, who.organizationId)) ?? { pivot: trip.budgetCurrency, rates: {}, asOf: ctx.deps.now().toISOString(), source: "none" };
  const { input } = buildSearchInput({ trip, request, stops: toSearchStops(itinerary.stops), candidatesByStop: {}, legs: [], fx, pricing });
  return trips.createJob(db, who.organizationId, who.userId, {
    tripRequestId: tripId, itineraryId: itinerary.id, algorithmVersion: ALGORITHM_VERSION, request, constraints: input.constraints,
    scoring: { objectives: request.objectives, beamWidth: request.beamWidth, candidateLimitPerStop: request.candidateLimitPerStop, pricing: { mode: pricing.mode, targetMarginBp: pricing.targetMarginBp } }, fx,
  });
}

/** Queue → (Workflow | inline). Without bindings (local/test) the pipeline runs via deps.schedule. */
export async function dispatchJob(ctx: PipelineCtx, msg: JobMessage): Promise<void> {
  if (ctx.env.JOBS) {
    await ctx.env.JOBS.send(msg);
    return;
  }
  ctx.deps.schedule(runPipeline(ctx, msg.jobId, { finalAttempt: true }).catch((e) => log("error", "inline_pipeline_failed", { jobId: msg.jobId, error: String(e).slice(0, 300) })));
}

/** Consumer-side start: prefer the durable Workflow when bound, else run inline within the consumer. */
export async function startJob(ctx: PipelineCtx, msg: JobMessage, finalAttempt: boolean): Promise<"done" | "retry"> {
  if (ctx.env.OPTIMISATION_WORKFLOW) {
    try {
      await ctx.env.OPTIMISATION_WORKFLOW.create({ id: msg.jobId, params: msg });
      return "done";
    } catch (e) {
      // Instance already exists (duplicate queue message) -> nothing to do.
      if (/already exist|exists/i.test(String((e as Error).message))) return "done";
      throw e;
    }
  }
  return runPipeline(ctx, msg.jobId, { finalAttempt });
}

/* ======================= pipeline stages ======================= */

async function loadJobData(ctx: PipelineCtx, jobId: string) {
  const job = await trips.getJobUnscoped(ctx.db, jobId);
  if (!job) throw new AppError("not_found", "Optimisation job not found");
  const trip = await trips.getTrip(ctx.db, job.organizationId, job.tripRequestId);
  const itinerary = await trips.getItinerary(ctx.db, job.organizationId, job.itineraryId);
  if (!trip || !itinerary) throw new AppError("not_found", "The trip or itinerary for this job no longer exists");
  const request = optimisationRequestSchema.parse(job.request);
  return { job, trip, itinerary, request, summary: (job.resultSummary ?? {}) as JobSummary };
}

export async function stagePrepare(ctx: PipelineCtx, jobId: string): Promise<boolean> {
  return trips.claimJob(ctx.db, jobId);
}

/** Resolves external/mock provider properties to internal rows and stores every offer for later reuse. */
export async function persistOffers(ctx: PipelineCtx, organizationId: string, offers: NormalisedOffer[]): Promise<NormalisedOffer[]> {
  const idCache = new Map<string, string>();
  const out: NormalisedOffer[] = [];
  for (const o of offers) {
    let propertyId = o.property.id;
    if (o.source !== "internal") {
      const key = `${o.providerKey}:${o.property.id}`;
      let internal = idCache.get(key);
      if (!internal) {
        const p = o.property;
        internal =
          o.source === "mock"
            ? await inventory.upsertMockProperty(ctx.db, organizationId, { name: p.name, city: p.destination, latitude: p.latitude, longitude: p.longitude, category: p.category, starRating: p.starRating, amenities: p.amenities, reviewScore: p.reviewScore })
            : await inventory.upsertProviderProperty(ctx.db, o.providerKey, { id: p.id, name: p.name, city: p.destination, latitude: p.latitude, longitude: p.longitude, category: p.category, starRating: p.starRating, amenities: p.amenities, reviewScore: p.reviewScore });
        idCache.set(key, internal);
      }
      propertyId = internal;
    }
    out.push({ ...o, property: { ...o.property, id: propertyId }, providerMetadata: { ...o.providerMetadata, externalPropertyId: o.property.id } });
  }
  await inventory.saveOffers(
    ctx.db,
    organizationId,
    out.map((o) => ({
      id: dbOfferId(organizationId, o.offerId), providerKey: o.providerKey, externalRef: o.externalOfferReference, propertyId: o.property.id, roomTypeId: o.roomType.id, roomTypeName: o.roomType.name,
      stayStart: o.stayStart, stayEnd: o.stayEnd, occupancy: o.occupancy, mealPlan: o.mealPlan, totalMinor: o.totalAmountMinor, currency: o.currency, taxMinor: o.taxAmountMinor, feeMinor: o.feeAmountMinor,
      cancellation: o.cancellation, payment: o.payment, retrievedAt: o.retrievedAt, expiresAt: o.expiresAt, availability: o.availabilityStatus, verification: o.verificationStatus, isMock: o.isMock, offerJson: o,
      metadata: { rateSource: o.rateSource ?? null },
    })),
  );
  return out;
}

export async function stageFetch(ctx: PipelineCtx, jobId: string): Promise<{ offers: number }> {
  const { job, trip, itinerary, request, summary } = await loadJobData(ctx, jobId);
  const org = job.organizationId;
  const stops = toSearchStops(itinerary.stops);
  const integrations = await loadIntegrations(ctx.db, org);
  const providers = ctx.deps.buildProviders(ctx.env, ctx.db, org, {
    includeExternal: request.constraints.includeExternalProviders && enabledExternalProviders(integrations).length > 0,
    externalProviders: enabledExternalProviders(integrations),
    googleHotelsDirect: integrations.googleHotelsDirect,
    includeMock: request.constraints.includeMockProvider && integrations.mockProvider,
  });
  const providerWarning = externalProviderWarning(request.constraints.includeExternalProviders, providers.map((p) => p.key));
  const warnings = providerWarning && !(summary.warnings ?? []).includes(providerWarning) ? [...(summary.warnings ?? []), providerWarning] : (summary.warnings ?? []);

  await trips.updateJobProgress(ctx.db, jobId, 10, "routing");
  const legsResult = await computeStopLegs(ctx.env, ctx.db, ctx.deps, itinerary.stops);

  const candidates: Record<string, string[]> = { ...(summary.candidates ?? {}) };
  const outcomes: JobSummary["providers"] = [...(summary.providers ?? [])];
  const fetched = new Set(summary.fetchedStops ?? []);
  const baseNotes = summary.notes ?? [];
  let dropped = summary.dropped ?? 0;
  let duplicates = 0;
  let total = 0;
  for (const [i, stop] of stops.entries()) {
    const existing = candidates[stop.id];
    if (fetched.has(stop.id) && existing) {
      total += existing.length;
      continue;
    }
    await trips.updateJobProgress(ctx.db, jobId, 15 + Math.round((i / stops.length) * 45), `searching:${stop.destination}`);
    const res = await searchAllProviders(providers, {
      organizationId: org, destination: stop.destination, latitude: stop.latitude, longitude: stop.longitude, checkIn: stop.arrivalDate, checkOut: stop.departureDate,
      party: { adults: trip.party.adults, children: trip.party.children, childAges: trip.party.childAges, rooms: trip.party.rooms }, currency: trip.budgetCurrency,
    }, {
      timeoutMs: 20_000, concurrency: 3, retry: { retries: 2, baseDelayMs: 300, maxDelayMs: 3_000, sleep: ctx.deps.sleep },
      onCall: (o) => ops.recordProviderCall(ctx.db, { organizationId: org, providerKey: o.providerKey, operation: "availability", status: o.status === "ok" ? "ok" : o.status === "timeout" ? "timeout" : "error", latencyMs: o.latencyMs, errorCode: o.errorCode }),
    });
    dropped += res.dropped;
    for (let j = outcomes.length - 1; j >= 0; j--) if (outcomes[j]!.stopId === stop.id) outcomes.splice(j, 1);
    for (const o of res.outcomes) outcomes.push({ ...o, stopId: stop.id });
    const merged = mergeDiscoveredOffers(res.offers);
    duplicates += merged.duplicates;
    const saved = await persistOffers(ctx, org, merged.offers);
    candidates[stop.id] = saved.map((o) => o.offerId);
    fetched.add(stop.id);
    total += saved.length;
    // Persist after each stop so a later failure resumes here instead of paying for earlier stops again.
    await trips.saveJobSummary(ctx.db, jobId, {
      ...summary, stage: "fetched", candidates, providers: outcomes, fetchedStops: [...fetched],
      legs: legsResult.legs, legWarnings: legsResult.warnings, dropped, notes: baseNotes, warnings,
      currency: request.constraints.budgetCurrency ?? trip.budgetCurrency,
    } satisfies JobSummary);
  }
  const fetchNotes = duplicates > 0 ? [`${duplicates} discovery listing${duplicates === 1 ? "" : "s"} already existed in your catalogue or another source and ${duplicates === 1 ? "was" : "were"} merged into it.`] : [];
  await trips.saveJobSummary(ctx.db, jobId, { ...summary, stage: "fetched", candidates, providers: outcomes, fetchedStops: [...fetched], legs: legsResult.legs, legWarnings: legsResult.warnings, dropped, notes: [...baseNotes, ...fetchNotes], warnings, currency: request.constraints.budgetCurrency ?? trip.budgetCurrency } satisfies JobSummary);
  await trips.updateJobProgress(ctx.db, jobId, 65, "optimising");
  return { offers: total };
}

export async function loadCandidates(ctx: PipelineCtx, organizationId: string, candidates: Record<string, string[]>): Promise<Record<string, NormalisedOffer[]>> {
  const byStop: Record<string, NormalisedOffer[]> = {};
  const all = [...new Set(Object.values(candidates).flat())];
  const map = await inventory.getOffersByIds<NormalisedOffer>(ctx.db, organizationId, all.map((id) => dbOfferId(organizationId, id)));
  for (const [stopId, ids] of Object.entries(candidates)) byStop[stopId] = ids.map((id) => map.get(dbOfferId(organizationId, id))).filter((o): o is NormalisedOffer => !!o);
  return byStop;
}

export async function stageSearch(ctx: PipelineCtx, jobId: string): Promise<{ packages: number }> {
  const { job, trip, itinerary, request, summary } = await loadJobData(ctx, jobId);
  const org = job.organizationId;
  const pricing = await loadPricing(ctx.db, org);
  const fx = (job.fx as FxSnapshot | null) ?? { pivot: trip.budgetCurrency, rates: {}, asOf: ctx.deps.now().toISOString(), source: "none" };
  const candidatesByStop = await loadCandidates(ctx, org, summary.candidates ?? {});
  const stops = toSearchStops(itinerary.stops);
  const { input, notes } = buildSearchInput({ trip, request, stops, candidatesByStop, legs: summary.legs ?? [], fx, pricing });
  const result = runSearch(input);

  await trips.clearJobPackages(ctx.db, org, jobId); // a retried stage must not duplicate packages
  const ids = result.packages.length
    ? await trips.insertPackages(ctx.db, org, result.packages.map((p, idx) => toNewPackage(job.id, idx + 1, p, stops)))
    : [];
  const final: JobSummary = {
    ...summary, stage: "done", notes: [...(summary.notes ?? []), ...notes], funnel: result.funnel, infeasible: result.infeasible, omittedObjectives: result.omittedObjectives, stats: result.stats,
    warnings: [...new Set([...(summary.warnings ?? []), ...result.warnings, ...(summary.legWarnings ?? [])])], packageIds: ids,
  };
  await trips.finishJob(ctx.db, jobId, { status: result.packages.length > 0 ? "succeeded" : "infeasible", summary: final });
  if (result.packages.length > 0) await trips.setTripStatus(ctx.db, org, trip.id, "optimised", null);
  await ops.addNotification(ctx.db, { organizationId: org, kind: result.packages.length ? "optimisation_done" : "optimisation_infeasible", title: result.packages.length ? `Packages ready for ${trip.title}` : `No feasible packages for ${trip.title}`, body: result.packages.length ? `${result.packages.length} package(s) generated.` : (result.infeasible?.reasons[0]?.message ?? "No combination meets every requirement."), link: `/trips/${trip.id}/packages` });
  return { packages: result.packages.length };
}

export function toNewPackage(jobId: string, number: number, p: CandidatePackage, stops: SearchStop[], extra: { parentId?: string; manuallyModified?: boolean; verification?: unknown } = {}): trips.NewPackage {
  return {
    jobId, number, parentId: extra.parentId ?? null, objective: p.objective, totalCostMinor: p.totalCostMinor, currency: p.currency, score: p.score, objectiveScore: p.objectiveScore, breakdown: p.breakdown,
    selectedOffers: p.selections.map((s) => ({ stopId: s.stopId, offerId: s.offer.offerId })), package: { ...p, stops }, feasibility: p.withinBudget === false ? "over_budget" : "feasible",
    verification: extra.verification ?? { unverified: p.unverified }, manuallyModified: extra.manuallyModified ?? false,
    items: p.selections.map((s, i) => ({ stopId: s.stopId, sequence: i + 1, propertyId: s.offer.property.id, offerId: s.offer.offerId, costMinor: s.costMinor, currency: p.currency })),
  };
}

/**
 * Runs all stages. Stages are idempotent: a duplicate delivery of the same job is ignored once it
 * has been claimed, and transient failures return "retry" until the final attempt.
 */
export async function runPipeline(ctx: PipelineCtx, jobId: string, opts: { finalAttempt: boolean }): Promise<"done" | "retry"> {
  const started = Date.now();
  const claimed = await stagePrepare(ctx, jobId);
  if (!claimed) return "done"; // already running/finished (duplicate message)
  try {
    await stageFetch(ctx, jobId);
    await stageSearch(ctx, jobId);
    log("info", "optimisation_completed", { jobId, ms: Date.now() - started });
    return "done";
  } catch (e) {
    const transient = !(e instanceof AppError) || e.code === "provider_error";
    if (transient && !opts.finalAttempt) {
      await trips.requeueJob(ctx.db, jobId);
      log("warn", "optimisation_retry", { jobId, error: String((e as Error).message).slice(0, 200) });
      return "retry";
    }
    await failJob(ctx, jobId, e);
    return "done";
  }
}

/** Marks a job failed with a user-safe message (internal details stay in logs). */
export async function failJob(ctx: PipelineCtx, jobId: string, e: unknown): Promise<void> {
  const message = e instanceof AppError || e instanceof ProviderError ? e.message : "The optimisation failed unexpectedly.";
  await trips.finishJob(ctx.db, jobId, { status: "failed", errorCode: e instanceof AppError ? e.code : "internal_error", errorSummary: message.slice(0, 300) });
  const job = await trips.getJobUnscoped(ctx.db, jobId);
  if (job) await ops.addNotification(ctx.db, { organizationId: job.organizationId, kind: "optimisation_failed", title: "Package generation failed", body: message.slice(0, 200), link: `/trips/${job.tripRequestId}/packages` });
  log("error", "optimisation_failed", { jobId, error: String((e as Error)?.message ?? e).slice(0, 300) });
}

/* ======================= re-pricing and manual replacement ======================= */

export async function loadJobSearchInput(ctx: PipelineCtx, organizationId: string, jobId: string, extraOffers: NormalisedOffer[] = []) {
  const job = await trips.getJob(ctx.db, organizationId, jobId);
  if (!job) throw new AppError("not_found", "Optimisation job not found");
  const { trip, itinerary, request, summary } = await loadJobData(ctx, jobId);
  const pricing = await loadPricing(ctx.db, organizationId);
  const latestFx = await ops.latestFxSnapshot(ctx.db, organizationId);
  const fx = latestFx ?? (job.fx as FxSnapshot);
  const candidatesByStop = await loadCandidates(ctx, organizationId, summary.candidates ?? {});
  for (const o of extraOffers) {
    for (const stop of itinerary.stops) {
      if (stop.arrivalDate === o.stayStart && stop.departureDate === o.stayEnd) {
        const list = (candidatesByStop[stop.id] ??= []);
        const idx = list.findIndex((x) => x.offerId === o.offerId);
        if (idx >= 0) list[idx] = o;
        else list.push(o);
      }
    }
  }
  const stops = toSearchStops(itinerary.stops);
  const built = buildSearchInput({ trip, request, stops, candidatesByStop, legs: summary.legs ?? [], fx, pricing });
  return { ...built, job, trip, stops, summary, request, pricing, fx, candidatesByStop };
}

export async function recheckOffer(ctx: PipelineCtx, organizationId: string, offer: NormalisedOffer, party: SearchInput["party"] & { childAges?: number[] }) {
  const integrations = await loadIntegrations(ctx.db, organizationId);
  const providers = ctx.deps.buildProviders(ctx.env, ctx.db, organizationId, { includeExternal: true, includeMock: true, googleHotelsDirect: integrations.googleHotelsDirect });
  const provider = providers.find((p) => p.key === offer.providerKey);
  if (!provider) throw new AppError("provider_error", `Provider "${offer.providerKey}" is not available for price checks in this environment.`);
  const started = Date.now();
  try {
    const result = await provider.recheckPrice({ offer, organizationId, party: { adults: party.adults, children: party.children, childAges: party.childAges ?? [], rooms: party.rooms } });
    await ops.recordProviderCall(ctx.db, { organizationId, providerKey: provider.key, operation: "recheck", status: "ok", latencyMs: Date.now() - started });
    if (result.offer) {
      await inventory.updateOfferVerification(ctx.db, organizationId, dbOfferId(organizationId, offer.offerId), result.offer, result.offer.verificationStatus, result.offer.availabilityStatus, result.offer.totalAmountMinor, result.offer.expiresAt);
    }
    return result;
  } catch (e) {
    await ops.recordProviderCall(ctx.db, { organizationId, providerKey: provider.key, operation: "recheck", status: e instanceof ProviderError && e.code === "timeout" ? "timeout" : "error", latencyMs: Date.now() - started, errorCode: e instanceof ProviderError ? e.code : "unknown" });
    throw new AppError("provider_error", e instanceof ProviderError ? `The supplier could not verify this rate: ${e.message}` : "The supplier price check failed.");
  }
}

export { filterCandidates, evaluateSelection };
