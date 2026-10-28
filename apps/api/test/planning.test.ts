import { describe, expect, it } from "vitest";
import type { LlmClient } from "@tripweave/ai";
import type { PlanningSnapshot } from "@tripweave/planning-contract";
import { validatePlanningProgram } from "../src/services/planning";
import { Harness, PASSWORD, seedHillCountry } from "./harness";

interface SseEvent {
  event: string;
  data: any;
}

function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  let event = "message";
  let data: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    else if (line === "") {
      if (data.length > 0) events.push({ event, data: JSON.parse(data.join("\n")) });
      event = "message";
      data = [];
    }
  }
  if (data.length > 0) events.push({ event, data: JSON.parse(data.join("\n")) });
  return events;
}

function mustEvent(events: SseEvent[], name: string): SseEvent {
  const event = events.find((candidate) => candidate.event === name);
  if (!event) throw new Error(`Missing SSE event: ${name}`);
  return event;
}

function streamClient(program: () => string): LlmClient {
  return {
    engine: "external_llm",
    model: "fake-planning-model",
    extract: async () => ({}),
    async *stream() {
      yield program();
    },
  };
}

/** Each generation pops the next scripted reply and records the prompt it was given. */
function queuedClient(replies: string[], prompts: string[]): LlmClient {
  return {
    engine: "external_llm",
    model: "fake-planning-model",
    extract: async () => ({}),
    async *stream(args) {
      prompts.push(args.user);
      yield replies.shift() ?? "";
    },
  };
}

async function createTrip(c: Awaited<ReturnType<Harness["register"]>>, extra: Record<string, unknown> = {}) {
  return c.ok<any>("POST", "/trips", {
    title: "Planning test trip",
    party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
    budgetCurrency: "USD",
    ...extra,
  });
}

describe("planning API", () => {
  it("returns an authoritative snapshot and a readable deterministic fallback when AI is unavailable", async () => {
    const h = new Harness();
    const owner = await h.register("Planning Fallback", "tour_operator");
    const trip = await createTrip(owner, { arrivalDate: "2026-12-10", departureDate: "2026-12-14", budgetAmountMinor: 45_000 });
    const context = await owner.ok<any>("GET", `/trips/${trip.id}/planning`);
    expect(context.snapshot.trip.id).toBe(trip.id);
    expect(context.engineAvailable).toBe(false);
    expect(context.allowlist).toContain("PlanningCanvas");
    expect(context.starters.length).toBeGreaterThan(0);

    const res = await owner.post(`/trips/${trip.id}/planning`, { message: "Show me the trip." });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("cache-control")).toMatch(/no-store|no-cache/);
    const events = parseSse(res.text);
    const meta = mustEvent(events, "meta");
    expect(meta.data.snapshot.trip.id).toBe(trip.id);
    expect(meta.data.engineAvailable).toBe(false);
    const done = mustEvent(events, "done");
    expect(done.data.usedFallback).toBe(true);
    expect(done.data.reason).toBe("unavailable");
    expect(validatePlanningProgram(done.data.program, meta.data.snapshot as PlanningSnapshot)).toEqual({ ok: true });
    expect(done.data.program).toContain("TripRequirementSummary");
  });

  it("uses a valid generated program and never lets the model supply prices", async () => {
    let generated = "";
    const h = new Harness({ buildLlm: () => streamClient(() => generated) });
    const owner = await h.register("Planning Stream", "tour_operator");
    const trip = await createTrip(owner, { arrivalDate: "2026-12-10", departureDate: "2026-12-14", budgetAmountMinor: 45_000 });
    generated = `root = PlanningCanvas("Trip requirements", [summary], "Values come from the server.")\nsummary = TripRequirementSummary(${JSON.stringify(trip.id)})`;
    const res = await owner.post(`/trips/${trip.id}/planning`, { message: "What do we know?" });
    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    const meta = mustEvent(events, "meta");
    const done = mustEvent(events, "done");
    expect(meta?.data.engineAvailable).toBe(true);
    expect(done?.data.usedFallback).toBe(false);
    expect(done?.data.program).toBe(generated);
    expect(events.filter((event) => event.event === "delta").map((event) => event.data.text).join("")).toBe(generated);
    expect(validatePlanningProgram(done.data.program, meta.data.snapshot as PlanningSnapshot)).toEqual({ ok: true });
  });

  it("falls back when the model invents a component or references an unknown entity", async () => {
    let generated = "";
    const h = new Harness({ buildLlm: () => streamClient(() => generated) });
    const owner = await h.register("Planning Invalid", "tour_operator");
    const trip = await createTrip(owner, { arrivalDate: "2026-12-10", departureDate: "2026-12-14" });
    generated = `root = PlanningCanvas("Bad", [evil])\nevil = Evil("x")`;
    const res = await owner.post(`/trips/${trip.id}/planning`, { message: "Show me everything." });
    const events = parseSse(res.text);
    const meta = mustEvent(events, "meta");
    const done = mustEvent(events, "done");
    expect(done?.data.usedFallback).toBe(true);
    expect(done.data.reason).toBe("invalid");
    expect(done.data.warnings[0]).toMatch(/validation/i);
    expect(validatePlanningProgram(done.data.program, meta.data.snapshot as PlanningSnapshot)).toEqual({ ok: true });
  });

  it("repairs an invalid reply once: the draft is reset and the corrected program streams in its place", async () => {
    const replies: string[] = [];
    const prompts: string[] = [];
    const h = new Harness({ buildLlm: () => queuedClient(replies, prompts) });
    const owner = await h.register("Planning Repair", "tour_operator");
    const trip = await createTrip(owner, { arrivalDate: "2026-12-10", departureDate: "2026-12-14" });
    const corrected = `root = PlanningCanvas("Trip requirements", [summary], "Values come from the server.")\nsummary = TripRequirementSummary(${JSON.stringify(trip.id)})`;
    replies.push(`root = PlanningCanvas("Bad", [evil])\nevil = Evil("x")`, corrected);
    const res = await owner.post(`/trips/${trip.id}/planning`, { message: "What do we know?" });
    const events = parseSse(res.text);
    expect(events.map((event) => event.event)).toEqual(["meta", "delta", "reset", "delta", "done"]);
    const done = mustEvent(events, "done");
    expect(done.data).toMatchObject({ usedFallback: false, attempts: 2, program: corrected });
    expect(prompts[0]).not.toContain("repairNote");
    expect(JSON.parse(prompts[1]!).repairNote.problems[0]).toMatch(/Evil|unknown/i);
  });

  it("falls back to the standard view after a second invalid reply", async () => {
    const replies: string[] = [];
    const prompts: string[] = [];
    const h = new Harness({ buildLlm: () => queuedClient(replies, prompts) });
    const owner = await h.register("Planning Repair Twice", "tour_operator");
    const trip = await createTrip(owner, { arrivalDate: "2026-12-10", departureDate: "2026-12-14" });
    replies.push(`root = PlanningCanvas("Bad", [evil])\nevil = Evil("x")`, `root = PlanningCanvas("Bad", [evil])\nevil = Evil("y")`);
    const res = await owner.post(`/trips/${trip.id}/planning`, { message: "Show me everything." });
    const events = parseSse(res.text);
    expect(events.map((event) => event.event)).toEqual(["meta", "delta", "reset", "delta", "done"]);
    const meta = mustEvent(events, "meta");
    const done = mustEvent(events, "done");
    expect(done.data).toMatchObject({ usedFallback: true, reason: "invalid", attempts: 2 });
    expect(validatePlanningProgram(done.data.program, meta.data.snapshot as PlanningSnapshot)).toEqual({ ok: true });
  });

  it("requires a map when the question is about where places are, and repairs a reply that omits it", async () => {
    const replies: string[] = [];
    const prompts: string[] = [];
    const h = new Harness({ buildLlm: () => queuedClient(replies, prompts) });
    const owner = await h.register("Planning Map Required", "tour_operator");
    const trip = await createTrip(owner, { arrivalDate: "2026-12-10", departureDate: "2026-12-14" });
    const withoutMap = `root = PlanningCanvas("Stays", [lead], "Ideas.")\nlead = Lead("Ella is a hill town.")`;
    const withMap = `root = PlanningCanvas("Stays", [lead, map], "Ideas.")\nlead = Lead("Ella is a hill town.")\nmap = PlaceMap("Ella area", ["Ella, Sri Lanka", "Nuwara Eliya, Sri Lanka"])`;
    replies.push(withoutMap, withMap);
    const res = await owner.post(`/trips/${trip.id}/planning`, { message: "Where are the best hotels near Ella?" });
    const events = parseSse(res.text);
    expect(events.map((event) => event.event)).toEqual(["meta", "delta", "reset", "delta", "done"]);
    expect(mustEvent(events, "done").data).toMatchObject({ usedFallback: false, attempts: 2, program: withMap });
    expect(JSON.parse(prompts[1]!).repairNote.problems[0]).toMatch(/PlaceMap/);
  });

  it("does not force a map on questions without location intent", async () => {
    const replies: string[] = [];
    const prompts: string[] = [];
    const h = new Harness({ buildLlm: () => queuedClient(replies, prompts) });
    const owner = await h.register("Planning No Map", "tour_operator");
    const trip = await createTrip(owner, { arrivalDate: "2026-12-10", departureDate: "2026-12-14" });
    const packing = `root = PlanningCanvas("Packing", [list], "Ideas.")\nlist = TipList("Pack", ["Light layers"])`;
    replies.push(packing);
    const res = await owner.post(`/trips/${trip.id}/planning`, { message: "What should we pack?" });
    const done = mustEvent(parseSse(res.text), "done");
    expect(done.data).toMatchObject({ usedFallback: false, attempts: 1, program: packing });
    expect(prompts).toHaveLength(1);
  });

  it("serves place lookups to signed-in users and rejects bad batches", async () => {
    const wiki = { calls: 0 };
    const h = new Harness({
      buildLlm: () => queuedClient([], []),
      fetch: (async () => {
        wiki.calls += 1;
        return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
      }) as unknown as typeof globalThis.fetch,
    });
    const owner = await h.register("Planning Places Route", "tour_operator");
    const res = await owner.post("/planning/places", { names: ["Atlantis, Sri Lanka"] });
    expect(res.status).toBe(200);
    expect(res.body.data.places).toEqual({ "Atlantis, Sri Lanka": null });
    expect((await owner.post("/planning/places", { names: [] })).status).toBe(422);
    expect(wiki.calls).toBe(1);
  });

  it("builds packages from real backend data and redacts margins for a read-only user", async () => {
    const h = new Harness();
    const owner = await h.register("Planning Packages", "tour_operator", "packages@example.com");
    await seedHillCountry(owner);
    await owner.ok("PUT", "/organization/integrations", { externalProviders: { hotelbeds: false }, aiEngine: "rules" });
    const trip = await createTrip(owner, { arrivalDate: "2026-12-10", departureDate: "2026-12-12", budgetAmountMinor: 90_000 });
    await owner.ok("PUT", `/trips/${trip.id}/itinerary`, {
      confirm: true,
      stops: [
        { destination: "Kandy", arrivalDate: "2026-12-10", departureDate: "2026-12-11" },
        { destination: "Ella", arrivalDate: "2026-12-11", departureDate: "2026-12-12" },
      ],
    });
    await owner.ok("POST", `/trips/${trip.id}/optimisations`, { constraints: { includeExternalProviders: false } });
    await h.settle();
    const ownerContext = await owner.ok<any>("GET", `/trips/${trip.id}/planning`);
    expect(ownerContext.snapshot.packages.length).toBeGreaterThan(0);
    expect(ownerContext.snapshot.offers.length).toBeGreaterThan(0);
    expect(ownerContext.snapshot.permissions.canSeeMargins).toBe(true);
    expect(ownerContext.snapshot.packages[0].package.totalCostMinor).toBeDefined();
    expect(ownerContext.snapshot.offers[0].offer.totalAmountMinor).toBeDefined();

    expect((await owner.post("/organization/members", { email: "reader@example.com", displayName: "Reader", role: "read_only", temporaryPassword: PASSWORD })).status).toBe(201);
    const reader = h.client();
    expect((await reader.post("/auth/login", { email: "reader@example.com", password: PASSWORD })).status).toBe(200);
    const readerContext = await reader.ok<any>("GET", `/trips/${trip.id}/planning`);
    expect(readerContext.snapshot.permissions.canWriteTrips).toBe(false);
    expect(readerContext.snapshot.permissions.canSeeMargins).toBe(false);
    expect(readerContext.snapshot.packages[0].package.totalCostMinor).toBeUndefined();
    expect(readerContext.snapshot.packages[0].package.selections[0].costMinor).toBeUndefined();
    expect(readerContext.snapshot.offers[0].offer.totalAmountMinor).toBeUndefined();
    expect(readerContext.snapshot.offers[0].offer.supplierName).toBeUndefined();
    expect((await reader.post(`/trips/${trip.id}/planning/clarifications`, { answers: [{ questionId: "arrival_date", value: "2026-12-10" }] })).status).toBe(403);
  });

  it("applies structured clarification answers deterministically and keeps the questions current", async () => {
    const h = new Harness();
    const owner = await h.register("Planning Clarify", "tour_operator");
    const trip = await createTrip(owner);
    const first = await owner.post(`/trips/${trip.id}/planning/clarifications`, {
      answers: [
        { questionId: "arrival_date", value: "2026-12-10" },
        { questionId: "departure_date", value: "2026-12-14" },
        { questionId: "budget_amount", value: 4500 },
      ],
    });
    expect(first.status).toBe(200);
    expect(first.body.data.applied).toEqual(["arrival_date", "departure_date", "budget_amount"]);
    expect(first.body.data.snapshot.trip.arrivalDate).toBe("2026-12-10");
    expect(first.body.data.snapshot.trip.budgetAmountMinor).toBe(450_000);
    expect(first.body.data.snapshot.questions.map((q: any) => q.id)).not.toContain("arrival_date");

    const stale = await owner.post(`/trips/${trip.id}/planning/clarifications`, { answers: [{ questionId: "arrival_date", value: "2026-12-11" }] });
    expect(stale.status).toBe(422);
    const invalid = await owner.post(`/trips/${trip.id}/planning/clarifications`, { answers: [{ questionId: "budget_amount", value: 12.5 }] });
    expect(invalid.status).toBe(422);
    const unknown = await owner.post(`/trips/${trip.id}/planning/clarifications`, { answers: [{ questionId: "nope", value: "x" }] });
    expect(unknown.status).toBe(422);
  });

  it("does not let another organisation read or clarify the trip", async () => {
    const h = new Harness();
    const owner = await h.register("Planning Tenant A", "tour_operator");
    const other = await h.register("Planning Tenant B", "tour_operator");
    const trip = await createTrip(owner);
    expect((await other.get(`/trips/${trip.id}/planning`)).status).toBe(404);
    expect((await other.post(`/trips/${trip.id}/planning`, { message: "Show me the trip." })).status).toBe(404);
    expect((await other.post(`/trips/${trip.id}/planning/clarifications`, { answers: [{ questionId: "arrival_date", value: "2026-12-10" }] })).status).toBe(404);
  });

  it("requires authentication", async () => {
    const h = new Harness();
    const tripId = "trip_any";
    const res = await h.client().get(`/trips/${tripId}/planning`);
    expect(res.status).toBe(401);
  });
});
