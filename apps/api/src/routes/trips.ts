import { Hono } from "hono";
import { z } from "zod";
import {
  AppError, isoDateSchema, itineraryInputSchema, paginationSchema, parseTripSchema, tripRequestSchema, tripRequestUpdateSchema, toMinorUnits, nightsBetween,
  type MealPlan, type ParsedTrip, type PartyConfiguration, type RoomAllocation,
} from "@tripweave/shared";
import { ops, quotes, trips } from "@tripweave/database";
import { GAZETTEER, buildStops, hasBlockingIssues, normaliseStop, reorderStops, suggestOvernightPlan, validateItinerary, findPlace } from "@tripweave/itinerary-engine";
import { parseTripRequest } from "@tripweave/ai";
import type { Env, Vars } from "../env";
import { ok, paged, parseBody, parsePatch, parseQuery, requireParam, type AppContext } from "../lib/http";
import { audit, getTenant, rateLimit, requirePermission, requireTenant } from "../middleware/auth";
import { computeStopLegs } from "../services/routing";
import { loadIntegrations } from "../services/settings";
import { allocateRooms } from "../services/party";

export const tripRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
tripRoutes.use("*", requireTenant);

async function ensureCustomer(c: AppContext, customerId: string | null | undefined) {
  if (!customerId) return;
  if (!(await trips.getCustomer(c.get("db"), getTenant(c).organizationId, customerId))) throw new AppError("validation_failed", "Customer not found in this organisation", { issues: [{ path: "customerId", message: "Unknown customer" }] });
}
async function mustGetTrip(c: AppContext, id: string) {
  const t = await trips.getTrip(c.get("db"), getTenant(c).organizationId, id);
  if (!t) throw new AppError("not_found", "Trip not found");
  return t;
}

const listQuery = paginationSchema.extend({ status: z.string().max(30).optional(), customerId: z.string().max(64).optional(), from: isoDateSchema.optional(), to: isoDateSchema.optional() });

tripRoutes.get("/trips", requirePermission("trips:read"), async (c) => {
  const q = parseQuery(c, listQuery);
  return paged(c, await trips.listTrips(c.get("db"), getTenant(c).organizationId, { ...q, order: q.order }));
});

tripRoutes.post("/trips", requirePermission("trips:write"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, tripRequestSchema);
  await ensureCustomer(c, body.customerId);
  const id = await trips.createTrip(c.get("db"), a.organizationId, a.userId, body);
  await audit(c, "trip.created", "trip", id);
  return ok(c, await trips.getTrip(c.get("db"), a.organizationId, id), 201);
});

tripRoutes.get("/trips/:id", requirePermission("trips:read"), async (c) => {
  const a = getTenant(c);
  const trip = await mustGetTrip(c, requireParam(c, "id"));
  const [itinerary, job, history, quotesPage] = await Promise.all([
    trips.getLatestItinerary(c.get("db"), a.organizationId, trip.id),
    trips.latestJobForTrip(c.get("db"), a.organizationId, trip.id),
    trips.tripStatusHistory(c.get("db"), trip.id),
    a.permissions.has("quotes:read") ? quotes.listQuotes(c.get("db"), a.organizationId, { tripId: trip.id, page: 1, pageSize: 20 }) : Promise.resolve({ items: [] }),
  ]);
  return ok(c, { trip, itinerary, latestJob: job && { id: job.id, status: job.status, progress: job.progress, stage: job.stage, createdAt: job.createdAt, errorSummary: job.errorSummary }, statusHistory: history, quotes: quotesPage.items.map((q) => ({ id: q.id, quoteNumber: q.quoteNumber, status: q.status, currentVersion: q.currentVersion, sellingPriceMinor: q.sellingPriceMinor, currency: q.currency })) });
});

tripRoutes.patch("/trips/:id", requirePermission("trips:write"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const current = await mustGetTrip(c, id);
  const patch = await parsePatch(c, tripRequestUpdateSchema);
  await ensureCustomer(c, patch.customerId);
  const arrival = patch.arrivalDate !== undefined ? patch.arrivalDate : current.arrivalDate;
  const departure = patch.departureDate !== undefined ? patch.departureDate : current.departureDate;
  if (arrival && departure && departure <= arrival) throw new AppError("validation_failed", "Departure must be after arrival", { issues: [{ path: "departureDate", message: "Departure must be after arrival" }] });
  if (patch.party) {
    const sumAdults = patch.party.rooms.reduce((s, r) => s + r.adults, 0);
    const sumChildren = patch.party.rooms.reduce((s, r) => s + r.children, 0);
    if (sumAdults !== patch.party.adults || sumChildren !== patch.party.children) throw new AppError("validation_failed", "Room allocation must match the number of adults and children", { issues: [{ path: "party.rooms", message: "Room allocation does not match guest totals" }] });
  }
  await trips.updateTrip(c.get("db"), a.organizationId, a.userId, id, patch);
  await audit(c, "trip.updated", "trip", id, { fields: Object.keys(patch) });
  return ok(c, await trips.getTrip(c.get("db"), a.organizationId, id));
});

/* ---------- AI / rule parsing ---------- */

function tripPatchFromParsed(p: ParsedTrip, current: trips.TripRecord): { patch: Partial<trips.TripInput>; assumptions: string[] } {
  const patch: Partial<trips.TripInput> = {};
  const assumptions: string[] = [];
  if (p.arrivalDate) patch.arrivalDate = p.arrivalDate;
  if (p.departureDate) patch.departureDate = p.departureDate;
  if (p.adults !== null) {
    const children = p.children ?? current.party.children;
    const ages = p.childAges.length ? p.childAges : current.party.childAges;
    const { rooms, assumption } = allocateRooms(p.adults, children, ages, p.roomCount);
    if (assumption) assumptions.push(assumption);
    patch.party = { adults: p.adults, children, childAges: ages.length === children ? ages : [], rooms } satisfies PartyConfiguration;
  }
  if (p.budgetAmount !== null && p.budgetCurrency) {
    patch.budgetAmountMinor = toMinorUnits(p.budgetAmount, p.budgetCurrency);
    patch.budgetCurrency = p.budgetCurrency;
    if (p.budgetScope) patch.budgetScope = p.budgetScope;
    else assumptions.push("The budget scope (accommodation only vs whole trip) was not stated; it is currently treated as accommodation only. Please confirm.");
  }
  if (p.preferredHotelCategory) patch.preferredHotelCategory = p.preferredHotelCategory;
  if (p.mealPlans.length) {
    const order: MealPlan[] = ["RO", "BB", "HB", "FB", "AI"];
    patch.preferredMealPlan = [...p.mealPlans].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]!;
  }
  patch.specialRequirements = {
    ...(current.specialRequirements as Record<string, unknown>),
    requiredAmenities: p.requiredAmenities,
    preferredAmenities: p.preferredAmenities,
    accessibility: p.accessibility,
    maxLegDurationMinutes: p.maxLegDurationMinutes,
    requireFreeCancellation: p.cancellationPreference === "free_cancellation",
    other: p.otherRequirements.join("; "),
  };
  return { patch, assumptions };
}

tripRoutes.post("/trips/:id/parse", requirePermission("trips:write"), rateLimit({ name: "parse", limit: 60, windowSeconds: 3600, by: "user" }), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const trip = await mustGetTrip(c, id);
  const body = await parseBody(c, parseTripSchema);
  const db = c.get("db");
  const integrations = await loadIntegrations(db, a.organizationId);
  const llm = integrations.aiEngine === "rules" ? null : c.get("deps").buildLlm(c.env);
  const result = await parseTripRequest(body.text, { llm });
  await ops.recordAiUsage(db, { organizationId: a.organizationId, operation: "parse_trip", engine: result.engine, model: result.model, inputChars: result.inputChars, outputChars: result.outputChars, latencyMs: result.latencyMs, status: result.warnings.some((w) => /unavailable/.test(w)) ? "fallback" : "ok" });

  let applied = false;
  let assumptions: string[] = [];
  let savedItinerary: Awaited<ReturnType<typeof trips.getLatestItinerary>> = null;
  const p = result.parsed;
  const questions = p.clarifyingQuestions;
  const parseResult = { parsed: p, engine: result.engine, model: result.model, warnings: result.warnings, suggestedItinerary: result.suggestedItinerary, parsedAt: c.get("deps").now().toISOString() };
  if (body.apply) {
    const { patch, assumptions: asm } = tripPatchFromParsed(p, trip);
    assumptions = asm;
    await trips.updateTrip(db, a.organizationId, a.userId, id, { ...patch, description: trip.description || body.text, parseResult, status: questions.length ? "needs_clarification" : "planning" });
    applied = true;
    const arrival = p.arrivalDate ?? patch.arrivalDate ?? trip.arrivalDate;
    if (arrival && p.overnightStops.length > 0) {
      // Stays the enquiry states explicitly become a draft itinerary the user still reviews.
      const stops = buildStops(p.overnightStops, arrival);
      const saved = await trips.saveItinerary(db, id, { title: "From enquiry", status: "draft", stops });
      savedItinerary = await trips.getItinerary(db, a.organizationId, saved.id);
    } else if (arrival && result.suggestedItinerary && result.suggestedItinerary.plan.length > 0) {
      const stops = buildStops(result.suggestedItinerary.plan, arrival);
      const saved = await trips.saveItinerary(db, id, { title: "Suggested itinerary (needs confirmation)", summary: result.suggestedItinerary.question, status: "suggested", stops });
      savedItinerary = await trips.getItinerary(db, a.organizationId, saved.id);
    }
  } else {
    await trips.updateTrip(db, a.organizationId, a.userId, id, { parseResult });
  }
  await audit(c, "trip.parsed", "trip", id, { engine: result.engine, applied });
  return ok(c, { parsed: p, engine: result.engine, model: result.model, warnings: result.warnings, questions, suggestedItinerary: result.suggestedItinerary, applied, assumptions, itinerary: savedItinerary, trip: await trips.getTrip(db, a.organizationId, id) });
});

/* ---------- itinerary ---------- */

async function itineraryView(c: AppContext, tripId: string) {
  const a = getTenant(c);
  const trip = await mustGetTrip(c, tripId);
  const itinerary = await trips.getLatestItinerary(c.get("db"), a.organizationId, tripId);
  if (!itinerary) return { trip, itinerary: null, legs: [], issues: [], legSource: "none", warnings: [] as string[] };
  const { legs, warnings, source } = await computeStopLegs(c.env, c.get("db"), c.get("deps"), itinerary.stops);
  const issues = validateItinerary(itinerary.stops, legs, { tripArrival: trip.arrivalDate, tripDeparture: trip.departureDate });
  return { trip, itinerary, legs, issues, legSource: source, warnings };
}

tripRoutes.get("/trips/:id/itinerary", requirePermission("trips:read"), async (c) => ok(c, await itineraryView(c, requireParam(c, "id"))));

const putItinerarySchema = itineraryInputSchema.extend({ confirm: z.boolean().default(false) });

const applyDaySchema = z.object({
  stopId: z.string().min(1).max(64),
  activities: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
});

/** Applies a planner-authored day to one stop. Dates and the rest of the route stay untouched. */
tripRoutes.post("/trips/:id/itinerary/activities", requirePermission("trips:write"), rateLimit({ name: "itinerary-activities", limit: 120, windowSeconds: 3600, by: "user" }), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  await mustGetTrip(c, id);
  const body = await parseBody(c, applyDaySchema);
  const itinerary = await trips.getLatestItinerary(c.get("db"), a.organizationId, id);
  if (!itinerary) throw new AppError("not_found", "No itinerary yet");
  const stop = itinerary.stops.find((entry) => entry.id === body.stopId);
  if (!stop) throw new AppError("not_found", "That stop is not part of this itinerary");
  const seen = new Set(stop.activities.map((activity) => activity.trim().toLowerCase()));
  const additions: string[] = [];
  for (const raw of body.activities) {
    const value = raw.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    additions.push(value);
  }
  if (additions.length > 0) {
    const nextStops = itinerary.stops.map((entry) => (entry.id === stop.id ? { ...entry, activities: [...entry.activities, ...additions] } : entry));
    const status = itinerary.status === "confirmed" ? "confirmed" : itinerary.status === "suggested" ? "suggested" : "draft";
    await trips.saveItinerary(c.get("db"), id, {
      title: itinerary.title,
      summary: itinerary.summary,
      origin: itinerary.origin ?? undefined,
      arrivalInformation: itinerary.arrivalInformation,
      departureInformation: itinerary.departureInformation,
      status,
      stops: nextStops,
    });
  }
  await audit(c, "itinerary.activities_applied", "trip", id, { stopId: stop.id, added: additions.length, source: "planner" });
  return ok(c, await itineraryView(c, id));
});

tripRoutes.put("/trips/:id/itinerary", requirePermission("trips:write"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const trip = await mustGetTrip(c, id);
  const body = await parseBody(c, putItinerarySchema);
  const stops = body.stops.map((s, i) => normaliseStop({ ...s, activities: s.activities ?? [], latitude: s.latitude ?? null, longitude: s.longitude ?? null }, i + 1));
  const { legs } = await computeStopLegs(c.env, c.get("db"), c.get("deps"), stops);
  const issues = validateItinerary(stops, legs, { tripArrival: trip.arrivalDate, tripDeparture: trip.departureDate });
  if (body.confirm && hasBlockingIssues(issues)) throw new AppError("unprocessable", `The itinerary cannot be confirmed: ${issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ")}`, { issues });
  const first = stops[0]!;
  const last = stops.at(-1)!;
  const patch: Partial<trips.TripInput> = {};
  if (!trip.arrivalDate) patch.arrivalDate = first.arrivalDate;
  if (!trip.departureDate) patch.departureDate = last.departureDate;
  if (Object.keys(patch).length) await trips.updateTrip(c.get("db"), a.organizationId, a.userId, id, patch);
  await trips.saveItinerary(c.get("db"), id, { title: body.title, summary: body.summary, origin: body.origin, arrivalInformation: body.arrivalInformation, departureInformation: body.departureInformation, status: body.confirm ? "confirmed" : "draft", stops });
  if (body.confirm && ["new", "needs_clarification"].includes(trip.status)) await trips.setTripStatus(c.get("db"), a.organizationId, id, "planning", a.userId);
  await audit(c, body.confirm ? "itinerary.confirmed" : "itinerary.saved", "trip", id, { stops: stops.length });
  return ok(c, await itineraryView(c, id));
});

tripRoutes.post("/trips/:id/itinerary/reorder", requirePermission("trips:write"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const { orderedIds } = await parseBody(c, z.object({ orderedIds: z.array(z.string().max(64)).min(1).max(20) }));
  const it = await trips.getLatestItinerary(c.get("db"), a.organizationId, id);
  if (!it) throw new AppError("not_found", "No itinerary yet");
  if (orderedIds.length !== it.stops.length || new Set(orderedIds).size !== it.stops.length || !orderedIds.every((x) => it.stops.some((s) => s.id === x))) throw new AppError("validation_failed", "orderedIds must list every stop exactly once");
  const reordered = reorderStops(it.stops, orderedIds, it.stops.sort((x, y) => x.sequence - y.sequence)[0]!.arrivalDate);
  await trips.saveItinerary(c.get("db"), id, { title: it.title, summary: it.summary, origin: it.origin ?? undefined, arrivalInformation: it.arrivalInformation, departureInformation: it.departureInformation, status: "draft", stops: reordered });
  await audit(c, "itinerary.reordered", "trip", id);
  return ok(c, await itineraryView(c, id));
});

tripRoutes.post("/trips/:id/itinerary/suggest", requirePermission("trips:write"), async (c) => {
  const trip = await mustGetTrip(c, requireParam(c, "id"));
  const body = await parseBody(c, z.object({ destinations: z.array(z.string().min(1).max(80)).min(1).max(12), nights: z.number().int().min(1).max(60).optional(), arrivalDate: isoDateSchema.optional() }));
  const arrival = body.arrivalDate ?? trip.arrivalDate;
  const nights = body.nights ?? (arrival && trip.departureDate ? nightsBetween(arrival, trip.departureDate) : null);
  if (!nights) throw new AppError("validation_failed", "Provide the number of nights or the trip dates");
  const suggestion = suggestOvernightPlan(body.destinations, nights);
  const stops = arrival ? buildStops(suggestion.plan, arrival) : [];
  return ok(c, { suggestion, stops, confirmed: false });
});

tripRoutes.get("/places/search", requirePermission("trips:read"), async (c) => {
  const { q } = parseQuery(c, z.object({ q: z.string().trim().min(1).max(60) }));
  const lower = q.toLowerCase();
  const matches = GAZETTEER.filter((p) => p.name.toLowerCase().includes(lower) || p.aliases.some((x) => x.includes(lower))).slice(0, 8);
  const exact = findPlace(q);
  return ok(c, (exact && !matches.includes(exact) ? [exact, ...matches] : matches).map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude, country: p.country })));
});

