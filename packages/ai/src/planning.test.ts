import { describe, expect, it, vi } from "vitest";
import type { PlanningSnapshot } from "@tripweave/planning-contract";
import { ExternalLlmClient, WorkersAiClient, sseData } from "./clients";
import type { LlmClient } from "./parse";
import { PLANNING_TEMPERATURE, buildPlanningContext, buildPlanningPrompt, planningStarters, requestNeedsMap, streamPlanningProgram } from "./planning";

const snapshot: PlanningSnapshot = {
  generatedAt: "2026-10-28T10:00:00.000Z",
  trip: {
    ref: "trip_abc123",
    id: "trip_abc123",
    title: "Hill country family trip",
    description: "untrusted enquiry text that must not enter the prompt",
    status: "planning",
    arrivalDate: "2026-12-10",
    departureDate: "2026-12-14",
    party: { adults: 2, children: 1, childAges: [8], rooms: [{ adults: 2, children: 1, childAges: [8] }] },
    budgetAmountMinor: 45000,
    budgetCurrency: "USD",
    budgetScope: "accommodation_only",
    preferredHotelCategory: "boutique",
    preferredMealPlan: "BB",
    specialRequirements: { requiredAmenities: ["wifi"], preferredAmenities: ["pool"], accessibility: [], maxLegDurationMinutes: 180, requiredMealPlans: [], requireFreeCancellation: false, other: "" },
    parseResult: null,
  },
  itinerary: null,
  packages: [],
  offers: [],
  quotes: [],
  questions: [
    { id: "arrival_date", label: "Arrival date", kind: "date", required: true, currentValue: null },
    { id: "adults", label: "Number of adults", kind: "number", required: true, currentValue: 2, min: 1, max: 60 },
  ],
  missingFields: ["arrival_date"],
  permissions: { canWriteTrips: true, canRunOptimisation: true, canCreateQuotes: true, canSeeMargins: false, canSeeContracts: false },
  sources: { engine: "rules", model: null, warnings: [], parseEngine: "rules", parsedAt: null },
  allowedActions: ["apply_clarification", "open_packages", "open_itinerary", "open_optimise", "open_quote"],
  allowlist: ["PlanningCanvas", "TripRequirementSummary", "ClarificationForm", "DestinationTimeline", "HotelCard", "HotelComparison", "PackageSummary", "PackageComparison", "CostBreakdown", "RouteSummary", "RecommendationExplanation"],
};

const request = { message: "What is still missing?", history: [{ role: "user" as const, content: "We are a family." }] };

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

describe("planning prompt", () => {
  it("uses the allowlist and authoritative context without exposing raw enquiry text", () => {
    const { system, user } = buildPlanningPrompt(snapshot, request);
    expect(system).toContain("PlanningCanvas");
    expect(system).toContain("ClarificationForm");
    expect(system).not.toMatch(/\bQuery\(/);
    expect(system).not.toMatch(/\bMutation\(/);
    expect(system).not.toMatch(/\bOpenUrl\b/);
    const parsed = JSON.parse(user) as { context: Record<string, unknown>; userRequest: string; conversationHistory: unknown[] };
    expect(parsed.userRequest).toBe("What is still missing?");
    expect(parsed.conversationHistory).toHaveLength(1);
    expect(JSON.stringify(parsed.context)).toContain("trip_abc123");
    expect(user).not.toContain("untrusted enquiry text");
  });

  it("builds a small context projection with short refs and questions", () => {
    const refSnapshot = { ...snapshot, trip: { ...snapshot.trip, ref: "trip" } };
    const context = buildPlanningContext(refSnapshot);
    expect(context.trip.id).toBe("trip");
    expect(JSON.stringify(context)).not.toContain(snapshot.trip.id);
    expect(context.questions).toHaveLength(2);
    expect(context.allowlist).toHaveLength(11);
  });

  it("offers starters that match the available data", () => {
    expect(planningStarters(snapshot).map((s) => s.label)).toContain("What is still missing?");
    expect(planningStarters(snapshot).map((s) => s.label)).not.toContain("Compare the packages");
  });
});

describe("general travel planning", () => {
  it("offers the travel-guide blocks and adds a repair note only when a reply needs repairing", () => {
    const first = buildPlanningPrompt(snapshot, { message: "Where should we go in Sri Lanka in December?" });
    expect(first.system).toContain("PlaceGallery");
    expect(first.system).toContain("FollowUps");
    expect(first.user).not.toContain("repairNote");
    const repaired = buildPlanningPrompt(snapshot, { message: "Where?", repair: { previousReply: 'root = Evil("x")', problems: ["unknown component: Evil"] } });
    expect(JSON.parse(repaired.user).repairNote).toEqual({ previousReply: 'root = Evil("x")', problems: ["unknown component: Evil"] });
  });

  it("samples planning replies at the composition temperature rather than repeating one program", async () => {
    const temperatures: unknown[] = [];
    const client: LlmClient = {
      engine: "external_llm",
      model: "fake",
      extract: async () => ({}),
      async *stream(args) {
        temperatures.push(args.temperature);
        yield "root = PlanningCanvas";
      },
    };
    await streamPlanningProgram(client, snapshot, { message: "Pack for the hills" }, () => undefined, new AbortController().signal);
    expect(temperatures).toEqual([PLANNING_TEMPERATURE]);
    expect(PLANNING_TEMPERATURE).toBeGreaterThan(0);
  });

  it("keeps general starters available when the saved trip has no itinerary or packages", () => {
    expect(planningStarters(snapshot).map((starter) => starter.label)).toEqual(expect.arrayContaining(["Things to see and do", "What should we pack?"]));
    expect(planningStarters(snapshot).length).toBeLessThanOrEqual(6);
  });
});

describe("map requirement", () => {
  it("recognises questions about where places are, routes and distances", () => {
    for (const message of ["Where should we stay near Ella?", "Show me on a map", "How far is Kandy from Galle?", "Route from Kandy to Ella", "What is between Colombo and Galle?", "How do I get from Ella to Kandy?"]) {
      expect(requestNeedsMap(message), message).toBe(true);
    }
    for (const message of ["What should we pack?", "Plan a relaxed day", "Suggest a tea estate experience"]) {
      expect(requestNeedsMap(message), message).toBe(false);
    }
  });

  it("offers a map starter for the planner's welcome screen", () => {
    expect(planningStarters(snapshot).map((starter) => starter.label)).toContain("Map the places to see");
  });
});

describe("streamPlanningProgram", () => {
  const client = (impl: Pick<LlmClient, "stream" | "generate">): LlmClient => ({ engine: "workers_ai", model: "test-model", extract: async () => ({}), ...impl });

  it("concatenates provider chunks and reports each one", async () => {
    const chunks: string[] = [];
    const c = client({
      async *stream() {
        yield "root = PlanningCanvas(";
        yield '"Trip"';
        yield ", [])";
      },
    });
    const r = await streamPlanningProgram(c, snapshot, request, (chunk) => chunks.push(chunk), new AbortController().signal);
    expect(chunks).toEqual(["root = PlanningCanvas(", '"Trip"', ", [])"]);
    expect(r.text).toBe('root = PlanningCanvas("Trip", [])');
    expect(r.engine).toBe("workers_ai");
  });

  it("uses a non-streaming completion when streaming is unavailable", async () => {
    const c = client({ generate: async () => 'root = PlanningCanvas("Trip", [])' });
    const r = await streamPlanningProgram(c, snapshot, request, () => undefined, new AbortController().signal);
    expect(r.text).toContain("PlanningCanvas");
  });

  it("retains the partial program when a stream fails", async () => {
    const c = client({
      async *stream() {
        yield "root = PlanningCanvas(";
        throw new Error("provider reset");
      },
    });
    await expect(streamPlanningProgram(c, snapshot, request, () => undefined, new AbortController().signal)).rejects.toMatchObject({
      name: "PlanningGenerationError",
      partial: "root = PlanningCanvas(",
    });
    await expect(streamPlanningProgram(null, snapshot, request, () => undefined, new AbortController().signal)).rejects.toBeDefined();
  });
});

describe("SSE parsing", () => {
  it("reassembles data frames split across chunks", async () => {
    let first = true;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (first) {
          controller.enqueue(new TextEncoder().encode('data: {"response":"one"}\n\ndata: {"res'));
          first = false;
        } else {
          controller.enqueue(new TextEncoder().encode('ponse":"two"}\n\ndata: [DONE]\n\n'));
          controller.close();
        }
      },
    });
    const out: string[] = [];
    for await (const data of sseData(stream, new AbortController().signal)) out.push(data);
    expect(out).toEqual(['{"response":"one"}', '{"response":"two"}', "[DONE]"]);
  });

  it("parses Workers AI and OpenAI-compatible streams", async () => {
    const workers = new WorkersAiClient({ run: async () => streamOf('data: {"response":"hello "}\n\ndata: {"response":"world"}\n\ndata: [DONE]\n\n') });
    const workersOut: string[] = [];
    for await (const chunk of workers.stream({ system: "s", user: "u", signal: new AbortController().signal })) workersOut.push(chunk);
    expect(workersOut.join("")).toBe("hello world");

    const fetch = vi.fn(async () => new Response(streamOf('data: {"choices":[{"delta":{"content":"hello "}}]}\n\ndata: {"choices":[{"delta":{"content":"world"}}]}\n\ndata: [DONE]\n\n'), { status: 200 }));
    const external = new ExternalLlmClient({ apiKey: "k", model: "m", baseUrl: "https://example.test/v1", fetch: fetch as unknown as typeof globalThis.fetch });
    const externalOut: string[] = [];
    for await (const chunk of external.stream({ system: "s", user: "u", signal: new AbortController().signal })) externalOut.push(chunk);
    expect(externalOut.join("")).toBe("hello world");
  });

  it("aborts a stalled stream", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({});
    const iterator = sseData(stream, controller.signal);
    const next = iterator.next();
    controller.abort();
    await expect(next).rejects.toMatchObject({ name: "AbortError" });
  });
});
