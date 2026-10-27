import { Hono } from "hono";
import { z } from "zod";
import { AppError, hotelCategorySchema, isoDateSchema, optimisationRequestSchema, partySchema, type NormalisedOffer } from "@tripweave/shared";
import { inventory, ops, trips } from "@tripweave/database";
import { evaluateSelection, filterCandidates, type SearchStop } from "@tripweave/optimisation-engine";
import { polishExplanation } from "@tripweave/ai";
import { searchAllProviders, mergeDiscoveredOffers } from "@tripweave/provider-contracts";
import type { Env, Vars } from "../env";
import { ok, parseBody, parseQuery, requireParam, type AppContext } from "../lib/http";
import { audit, can, getTenant, rateLimit, requirePermission, requireTenant } from "../middleware/auth";
import { createOptimisationJob, dbOfferId, dispatchJob, loadJobSearchInput, persistOffers, recheckOffer, toNewPackage, type PipelineCtx } from "../services/optimisation";
import { presentPackage, priceStoredPackage, redactOfferCosts, type StoredPackage } from "../services/pricing";
import { validatePackagePrices, PRICE_VALIDITY_MINUTES } from "../services/price-validation";
import { sellFromCost } from "@tripweave/pricing-engine";
import { enabledExternalProviders, loadIntegrations, loadPricing, requireFx } from "../services/settings";

export const optimisationRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
optimisationRoutes.use("*", requireTenant);

const pctx = (c: AppContext): PipelineCtx => ({ env: c.env, db: c.get("db"), deps: c.get("deps") });

/* ---------- jobs ---------- */

optimisationRoutes.post("/trips/:id/optimisations", requirePermission("optimisation:run"), rateLimit({ name: "optimise", limit: 30, windowSeconds: 3600, by: "user" }), async (c) => {
  const a = getTenant(c);
  const tripId = requireParam(c, "id");
  const request = await parseBody(c, optimisationRequestSchema);
  const idemKey = c.req.header("idempotency-key")?.slice(0, 80);
  const db = c.get("db");
  if (idemKey) {
    const hash = `${tripId}:${JSON.stringify(request)}`;
    if (!(await ops.claimIdempotency(db, a.organizationId, idemKey, hash))) {
      const prior = await ops.getIdempotency(db, a.organizationId, idemKey);
      if (prior && prior.requestHash !== hash) throw new AppError("conflict", "This Idempotency-Key was already used with a different request");
      if (prior?.body) return c.json(JSON.parse(prior.body), (prior.status ?? 202) as 202);
      throw new AppError("conflict", "A request with this Idempotency-Key is still being processed");
    }
  }
  try {
    const jobId = await createOptimisationJob(pctx(c), { organizationId: a.organizationId, userId: a.userId }, tripId, request);
    await dispatchJob(pctx(c), { type: "optimise", jobId, organizationId: a.organizationId });
    await audit(c, "optimisation.started", "optimisation_job", jobId, { tripId, objectives: request.objectives });
    const body = { data: { jobId, status: "queued" } };
    if (idemKey) await ops.completeIdempotency(db, a.organizationId, idemKey, 202, JSON.stringify(body));
    return c.json(body, 202);
  } catch (e) {
    if (idemKey) await ops.releaseIdempotency(db, a.organizationId, idemKey);
    throw e;
  }
});

optimisationRoutes.get("/trips/:id/optimisations", requirePermission("trips:read"), async (c) => {
  const orgId = getTenant(c).organizationId;
  if (!(await trips.getTrip(c.get("db"), orgId, requireParam(c, "id")))) throw new AppError("not_found", "Trip not found");
  const jobs = await trips.listJobsForTrip(c.get("db"), orgId, requireParam(c, "id"));
  return ok(c, jobs.map((j) => ({ id: j.id, status: j.status, progress: j.progress, stage: j.stage, createdAt: j.createdAt, completedAt: j.completedAt, errorSummary: j.errorSummary })));
});

optimisationRoutes.get("/optimisations/:id", requirePermission("trips:read"), async (c) => {
  const a = getTenant(c);
  const job = await trips.getJob(c.get("db"), a.organizationId, requireParam(c, "id"));
  if (!job) throw new AppError("not_found", "Optimisation job not found");
  const s = (job.resultSummary ?? {}) as Record<string, unknown>;
  return ok(c, {
    id: job.id, tripRequestId: job.tripRequestId, status: job.status, progress: job.progress, stage: job.stage, algorithmVersion: job.algorithmVersion, attempt: job.attempt,
    constraints: job.constraintsSnapshot, scoring: job.scoring, errorCode: job.errorCode, errorSummary: job.errorSummary, createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt,
    result: job.status === "succeeded" || job.status === "infeasible" ? { funnel: s.funnel, infeasible: s.infeasible, omittedObjectives: s.omittedObjectives, stats: s.stats, warnings: s.warnings, notes: s.notes, providers: s.providers, legs: s.legs, dropped: s.dropped } : undefined,
  });
});

optimisationRoutes.post("/optimisations/:id/cancel", requirePermission("optimisation:run"), async (c) => {
  const a = getTenant(c);
  const job = await trips.getJob(c.get("db"), a.organizationId, requireParam(c, "id"));
  if (!job) throw new AppError("not_found", "Optimisation job not found");
  if (!["queued", "running"].includes(job.status)) throw new AppError("invalid_transition", "Only queued or running jobs can be cancelled");
  await trips.finishJob(c.get("db"), job.id, { status: "cancelled" });
  await audit(c, "optimisation.cancelled", "optimisation_job", job.id);
  return ok(c, { id: job.id, status: "cancelled" });
});

/* ---------- packages ---------- */

async function presentList(c: AppContext, records: trips.PackageRecord[]) {
  const a = getTenant(c);
  const db = c.get("db");
  const pricing = await loadPricing(db, a.organizationId);
  const rights = { canSeeMargins: a.permissions.has("margins:view"), canSeeContracts: a.permissions.has("agreements:manage") };
  const propertyIds = records.flatMap((r) => {
    const pkg = r.package as unknown as StoredPackage;
    return pkg.selections.map((s) => s.offer.property.id);
  });
  const coverImages = await inventory.firstImagesFor(db, [...new Set(propertyIds)]);
  return Promise.all(
    records.map(async (r) => {
      let priced = null;
      try {
        const pkg = r.package as unknown as StoredPackage;
        const fx = await requireFx(db, a.organizationId, pkg.selections.map((s) => s.offer.currency).concat(pkg.currency));
        priced = priceStoredPackage(pkg, pkg.currency, fx, pricing);
      } catch {
        priced = null; // surfaced to the UI as "pricing unavailable"; the cost data is still shown
      }
      const shown = presentPackage(r, rights, priced);
      return {
        ...shown,
        package: {
          ...shown.package,
          selections: shown.package.selections.map((s) => ({ ...s, coverImageId: coverImages.get(s.offer.property.id) ?? null })),
        },
      };
    }),
  );
}

optimisationRoutes.get("/trips/:id/packages", requirePermission("trips:read"), async (c) => {
  const a = getTenant(c);
  const tripId = requireParam(c, "id");
  if (!(await trips.getTrip(c.get("db"), a.organizationId, tripId))) throw new AppError("not_found", "Trip not found");
  const q = parseQuery(c, z.object({ jobId: z.string().max(64).optional() }));
  const job = q.jobId ? await trips.getJob(c.get("db"), a.organizationId, q.jobId) : (await trips.listJobsForTrip(c.get("db"), a.organizationId, tripId)).find((j) => j.status === "succeeded" || j.status === "infeasible") ?? null;
  if (!job || job.tripRequestId !== tripId) return ok(c, { job: null, packages: [] });
  const recs = job.status === "succeeded" ? await trips.listJobPackages(c.get("db"), a.organizationId, job.id) : [];
  const summary = (job.resultSummary ?? {}) as Record<string, unknown>;
  return ok(c, { job: { id: job.id, status: job.status, completedAt: job.completedAt, infeasible: summary.infeasible ?? null, omittedObjectives: summary.omittedObjectives ?? [], warnings: summary.warnings ?? [], notes: summary.notes ?? [], funnel: summary.funnel ?? [], providers: summary.providers ?? [] }, packages: await presentList(c, recs) });
});

optimisationRoutes.get("/packages/:id", requirePermission("trips:read"), async (c) => {
  const rec = await trips.getPackage(c.get("db"), getTenant(c).organizationId, requireParam(c, "id"));
  if (!rec) throw new AppError("not_found", "Package not found");
  return ok(c, (await presentList(c, [rec]))[0]);
});

/** Hotels that could replace the one at `stopId` while still satisfying every hard constraint. */
optimisationRoutes.get("/packages/:id/alternatives", requirePermission("trips:read"), async (c) => {
  const a = getTenant(c);
  const rec = await trips.getPackage(c.get("db"), a.organizationId, requireParam(c, "id"));
  if (!rec) throw new AppError("not_found", "Package not found");
  const { stopId } = parseQuery(c, z.object({ stopId: z.string().min(1).max(64) }));
  const ctx = await loadJobSearchInput(pctx(c), a.organizationId, rec.jobId);
  const stop = ctx.stops.find((s: SearchStop) => s.id === stopId);
  if (!stop) throw new AppError("not_found", "Stop not found in this package's itinerary");
  const pkg = rec.package as unknown as StoredPackage;
  const usedElsewhere = new Set(pkg.selections.filter((s) => s.stopId !== stopId).map((s) => s.offer.property.id));
  const res = filterCandidates(stop, ctx.input.candidatesByStop[stopId] ?? [], { ...ctx.input, constraints: { ...ctx.input.constraints, strictBudget: false } }, { nowIso: c.get("deps").now().toISOString() });
  const current = pkg.selections.find((s) => s.stopId === stopId);
  return ok(c, {
    stopId, currentOfferId: current?.offer.offerId ?? null, funnel: res.funnel,
    alternatives: res.accepted.filter((x) => !usedElsewhere.has(x.offer.property.id)).sort((x, y) => x.costMinor - y.costMinor).slice(0, 50).map((x) => {
      const margins = can(c, "margins:view");
      const offer = stripOfferForList(x.offer, can(c, "agreements:manage"));
      return {
        // Selling price of this hotel on its own (accommodation only) is the price signal for everyone; supplier cost needs margins:view.
        sellingMinor: sellFromCost(x.costMinor, ctx.input.currency, ctx.pricing),
        costMinor: margins ? x.costMinor : undefined,
        currency: ctx.input.currency,
        offer: margins ? offer : redactOfferCosts(offer),
      };
    }),
  });
});

function stripOfferForList(o: NormalisedOffer, contracts: boolean): NormalisedOffer {
  return contracts ? o : { ...o, rateSource: o.rateSource ? { ratePlanId: o.rateSource.ratePlanId } : undefined };
}

optimisationRoutes.post("/packages/:id/hotels", requirePermission("packages:write"), async (c) => {
  const a = getTenant(c);
  const db = c.get("db");
  const rec = await trips.getPackage(db, a.organizationId, requireParam(c, "id"));
  if (!rec) throw new AppError("not_found", "Package not found");
  const body = await parseBody(c, z.object({ stopId: z.string().min(1).max(64), offerId: z.string().min(1).max(200) }));
  const stored = await inventory.getOffersByIds<NormalisedOffer>(db, a.organizationId, [dbOfferId(a.organizationId, body.offerId)]);
  const newOffer = stored.get(dbOfferId(a.organizationId, body.offerId));
  if (!newOffer) throw new AppError("not_found", "That hotel offer is not available. Search for it first.");
  const ctx = await loadJobSearchInput(pctx(c), a.organizationId, rec.jobId, [newOffer]);
  if (!ctx.stops.some((s: SearchStop) => s.id === body.stopId)) throw new AppError("validation_failed", "Unknown stop for this package");
  const pkg = rec.package as unknown as StoredPackage;
  const offersByStop: Record<string, NormalisedOffer> = Object.fromEntries(pkg.selections.map((s) => [s.stopId, s.offer]));
  offersByStop[body.stopId] = newOffer;
  const result = evaluateSelection(ctx.input, offersByStop, rec.objective as never);
  if (!result.ok || !result.package) {
    throw new AppError("unprocessable", "That hotel cannot be used: it breaks a mandatory requirement.", { violations: result.violations });
  }
  const [id] = await trips.insertPackages(db, a.organizationId, [toNewPackage(rec.jobId, await trips.nextCombinationNumber(db, rec.jobId), result.package, ctx.stops, { parentId: rec.id, manuallyModified: true, verification: { unverified: result.package.unverified, replacedStop: body.stopId } })]);
  await audit(c, "package.hotel_replaced", "package", id ?? null, { from: rec.id, stopId: body.stopId, offerId: body.offerId });
  const saved = await trips.getPackage(db, a.organizationId, id!);
  return ok(c, (await presentList(c, [saved!]))[0], 201);
});

optimisationRoutes.post("/packages/:id/reprice", requirePermission("packages:write"), async (c) => {
  const a = getTenant(c);
  const db = c.get("db");
  const rec = await trips.getPackage(db, a.organizationId, requireParam(c, "id"));
  if (!rec) throw new AppError("not_found", "Package not found");
  const { recheck } = await parseBody(c, z.object({ recheck: z.boolean().default(false) }));
  const pkg = rec.package as unknown as StoredPackage;
  const base = await loadJobSearchInput(pctx(c), a.organizationId, rec.jobId);
  const changes: { stopId: string; offerId: string; status: string; previousTotalMinor: number; currentTotalMinor: number | null; message?: string }[] = [];
  const offersByStop: Record<string, NormalisedOffer> = {};
  for (const s of pkg.selections) {
    let offer = s.offer;
    if (recheck) {
      const r = await recheckOffer(pctx(c), a.organizationId, s.offer, base.input.party);
      changes.push({ stopId: s.stopId, offerId: s.offer.offerId, status: r.status, previousTotalMinor: r.previousTotalMinor, currentTotalMinor: r.currentTotalMinor, message: r.message });
      if (r.offer) offer = r.offer;
      if (r.status === "unavailable") offer = { ...offer, availabilityStatus: "unavailable", verificationStatus: "unavailable" };
    }
    offersByStop[s.stopId] = offer;
  }
  const refreshed = Object.values(offersByStop);
  const ctx = await loadJobSearchInput(pctx(c), a.organizationId, rec.jobId, refreshed);
  const result = evaluateSelection(ctx.input, offersByStop, rec.objective as never);
  if (!result.package) throw new AppError("unprocessable", "The package can no longer be priced: one or more hotels are no longer valid.", { violations: result.violations, changes });
  const now = c.get("deps").now();
  const allVerified = recheck && changes.every((x) => x.status === "confirmed" || x.status === "price_changed");
  const verification = recheck
    ? { status: allVerified ? "verified" : "failed", allVerified, checkedAt: now.toISOString(), validUntil: allVerified ? new Date(now.getTime() + PRICE_VALIDITY_MINUTES * 60_000).toISOString() : null, changes }
    : { unverified: result.package.unverified, rechecked: false };
  const [id] = await trips.insertPackages(db, a.organizationId, [toNewPackage(rec.jobId, await trips.nextCombinationNumber(db, rec.jobId), result.package, ctx.stops, { parentId: rec.id, manuallyModified: rec.manuallyModified, verification })]);
  await audit(c, "package.repriced", "package", id ?? null, { from: rec.id, recheck, ok: result.ok, allVerified });
  const saved = await trips.getPackage(db, a.organizationId, id!);
  const margins = can(c, "margins:view");
  return ok(c, {
    package: (await presentList(c, [saved!]))[0],
    changes: margins ? changes : changes.map((x) => ({ stopId: x.stopId, offerId: x.offerId, status: x.status, message: x.message, previousTotalMinor: undefined, currentTotalMinor: undefined })),
    valid: result.ok, violations: result.violations,
    previousTotalMinor: margins ? rec.totalCostMinor : undefined, newTotalMinor: margins ? result.package.totalCostMinor : undefined,
  }, 201);
});

optimisationRoutes.post("/packages/:id/validate", requirePermission("packages:write"), rateLimit({ name: "validate-package", limit: 120, windowSeconds: 3600, by: "user" }), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const result = await validatePackagePrices(pctx(c), a.organizationId, id, { validityMinutes: Number(c.env.PRICE_VALIDITY_MINUTES ?? 15) });
  await audit(c, "package.price_validated", "package", id, { status: result.verification.status, allVerified: result.verification.allVerified, changed: result.changed });
  const [shown] = await presentList(c, [result.rec]);
  const margins = can(c, "margins:view");
  const verification = margins
    ? result.verification
    : { ...result.verification, checks: result.verification.checks.map(({ previousTotalMinor: _previous, currentTotalMinor: _current, ...check }) => check) };
  return ok(c, { package: shown, verification, changed: result.changed });
});

optimisationRoutes.post("/packages/:id/explain", requirePermission("packages:write"), async (c) => {
  const a = getTenant(c);
  const rec = await trips.getPackage(c.get("db"), a.organizationId, requireParam(c, "id"));
  if (!rec) throw new AppError("not_found", "Package not found");
  const integrations = await loadIntegrations(c.get("db"), a.organizationId);
  const llm = integrations.aiEngine === "rules" ? null : c.get("deps").buildLlm(c.env);
  const facts = (rec.package as unknown as { explanation: string[] }).explanation;
  const started = Date.now();
  const r = await polishExplanation(facts, llm);
  await ops.recordAiUsage(c.get("db"), { organizationId: a.organizationId, operation: "explain_package", engine: r.engine === "ai" ? (llm?.engine ?? "rules") : "rules", model: r.engine === "ai" ? llm?.model : null, inputChars: facts.join("").length, outputChars: r.text.length, latencyMs: Date.now() - started, status: r.engine === "ai" ? "ok" : "fallback" });
  return ok(c, r);
});

/* ---------- offers ---------- */

optimisationRoutes.get("/hotel-offers/:id", requirePermission("hotels:read"), async (c) => {
  const a = getTenant(c);
  const offer = (await inventory.getOffersByIds<NormalisedOffer>(c.get("db"), a.organizationId, [dbOfferId(a.organizationId, requireParam(c, "id"))])).get(dbOfferId(a.organizationId, requireParam(c, "id")));
  if (!offer) throw new AppError("not_found", "Offer not found");
  const shown = stripOfferForList(offer, can(c, "agreements:manage"));
  return ok(c, can(c, "margins:view") ? shown : redactOfferCosts(shown));
});

optimisationRoutes.post("/hotel-offers/:id/verify", requirePermission("packages:write"), rateLimit({ name: "verify", limit: 120, windowSeconds: 3600, by: "user" }), async (c) => {
  const a = getTenant(c);
  const offerId = requireParam(c, "id");
  const offer = (await inventory.getOffersByIds<NormalisedOffer>(c.get("db"), a.organizationId, [dbOfferId(a.organizationId, offerId)])).get(dbOfferId(a.organizationId, offerId));
  if (!offer) throw new AppError("not_found", "Offer not found");
  const party = { ...offer.occupancy, rooms: offer.occupancy.rooms };
  const r = await recheckOffer(pctx(c), a.organizationId, offer, party);
  await audit(c, "offer.verified", "offer", offerId, { status: r.status });
  const margins = can(c, "margins:view");
  const shown = r.offer ? stripOfferForList(r.offer, can(c, "agreements:manage")) : null;
  return ok(c, { status: r.status, previousTotalMinor: margins ? r.previousTotalMinor : undefined, currentTotalMinor: margins ? r.currentTotalMinor : undefined, message: r.message, checkedAt: r.checkedAt, offer: shown && !margins ? redactOfferCosts(shown) : shown });
});

const searchSchema = z.object({
  destination: z.string().trim().min(1).max(80),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  party: partySchema.default({ adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] }),
  includeExternal: z.boolean().default(true),
  includeMock: z.boolean().default(false),
  minimumCategory: hotelCategorySchema.optional(),
});

/** Ad-hoc availability search across enabled providers (also stores offers so they can be added to packages). */
optimisationRoutes.post("/hotel-search", requirePermission("hotels:read"), rateLimit({ name: "hotel-search", limit: 120, windowSeconds: 3600, by: "user" }), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, searchSchema);
  if (body.checkOut <= body.checkIn) throw new AppError("validation_failed", "Check-out must be after check-in", { issues: [{ path: "checkOut", message: "Check-out must be after check-in" }] });
  const db = c.get("db");
  const integrations = await loadIntegrations(db, a.organizationId);
  const providers = c.get("deps").buildProviders(c.env, db, a.organizationId, { includeExternal: body.includeExternal && enabledExternalProviders(integrations).length > 0, externalProviders: enabledExternalProviders(integrations), googleHotelsDirect: integrations.googleHotelsDirect, includeMock: body.includeMock && integrations.mockProvider });
  const res = await searchAllProviders(providers, { organizationId: a.organizationId, destination: body.destination, latitude: body.latitude, longitude: body.longitude, checkIn: body.checkIn, checkOut: body.checkOut, party: body.party }, {
    timeoutMs: 20_000, concurrency: 3, retry: { retries: 1, baseDelayMs: 300, maxDelayMs: 2_000, sleep: c.get("deps").sleep },
    onCall: (o) => ops.recordProviderCall(db, { organizationId: a.organizationId, providerKey: o.providerKey, operation: "search", status: o.status === "ok" ? "ok" : o.status === "timeout" ? "timeout" : "error", latencyMs: o.latencyMs, errorCode: o.errorCode }),
  });
  const merged = mergeDiscoveredOffers(res.offers);
  const saved = await persistOffers(pctx(c), a.organizationId, merged.offers);
  const margins = can(c, "margins:view");
  return ok(c, { offers: saved.map((o) => { const shown = stripOfferForList(o, can(c, "agreements:manage")); return margins ? shown : redactOfferCosts(shown); }), providers: res.outcomes, dropped: res.dropped, duplicates: merged.duplicates });
});
