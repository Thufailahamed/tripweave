import { describe, expect, it } from "vitest";
import type { LlmClient } from "@tripweave/ai";
import type { PackageShowcaseSnapshot } from "@tripweave/planning-contract";
import { validatePackageShowcaseProgram } from "../src/services/package-showcase";
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

/** Each generation pops the next scripted reply and records the prompt it was given. */
function queuedClient(replies: string[], prompts: string[]): LlmClient {
  return {
    engine: "external_llm",
    model: "fake-presentation-model",
    extract: async () => ({}),
    async *stream(args) {
      prompts.push(args.user);
      yield replies.shift() ?? "";
    },
  };
}

/** The server numbers packages pkg_1, pkg_2 … in listing order, so tests can reference pkg_1 directly. */
const VALID_PRESENTATION = `root = PackageShowcase("Your hill country packages", [opening, card, live, next], "The first option is the strongest pick for this budget.")
opening = Lead("The first option balances the budget with the best stays for these stops.")
card = PackageCard("pkg_1", "lead")
live = LivePriceStatus("pkg_1")
next = NextSteps()`;

async function optimisedTrip(h: Harness, label: string, email: string) {
  const owner = await h.register(label, "tour_operator", email);
  await seedHillCountry(owner);
  await owner.ok("PUT", "/organization/integrations", { externalProviders: { hotelbeds: false } });
  const trip = await owner.ok<any>("POST", "/trips", {
    title: "Hill country",
    party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
    budgetCurrency: "USD",
    budgetAmountMinor: 90_000,
    arrivalDate: "2026-12-10",
    departureDate: "2026-12-12",
  });
  await owner.ok("PUT", `/trips/${trip.id}/itinerary`, {
    confirm: true,
    stops: [
      { destination: "Kandy", arrivalDate: "2026-12-10", departureDate: "2026-12-11" },
      { destination: "Ella", arrivalDate: "2026-12-11", departureDate: "2026-12-12" },
    ],
  });
  await owner.ok("POST", `/trips/${trip.id}/optimisations`, { constraints: { includeExternalProviders: false } });
  await h.settle();
  return { owner, trip };
}

describe("package showcase API", () => {
  it("streams a validated presentation whose refs resolve against the snapshot sent in meta", async () => {
    let generated = "";
    const h = new Harness({
      buildLlm: () => ({
        engine: "external_llm",
        model: "fake-presentation-model",
        extract: async () => ({}),
        async *stream() {
          yield generated;
        },
      }),
    });
    const { owner, trip } = await optimisedTrip(h, "Showcase Stream", "showcase-stream@example.com");
    generated = VALID_PRESENTATION;
    const res = await owner.post(`/trips/${trip.id}/packages/presentation`, { focus: "two adults, relaxed pace" });
    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    const meta = mustEvent(events, "meta");
    const done = mustEvent(events, "done");
    expect(meta.data.engineAvailable).toBe(true);
    expect(done.data.usedFallback).toBe(false);
    expect(done.data.program).toBe(generated);
    expect(events.filter((event) => event.event === "delta").map((event) => event.data.text).join("")).toBe(generated);
    expect(validatePackageShowcaseProgram(done.data.program, meta.data.snapshot as PackageShowcaseSnapshot)).toEqual({ ok: true });
  });

  it("uses the deterministic presentation when no AI provider is configured, and it still validates", async () => {
    const h = new Harness();
    const { owner, trip } = await optimisedTrip(h, "Showcase Rules", "showcase-rules@example.com");
    const res = await owner.post(`/trips/${trip.id}/packages/presentation`, {});
    const events = parseSse(res.text);
    const meta = mustEvent(events, "meta");
    const done = mustEvent(events, "done");
    expect(meta.data.engineAvailable).toBe(false);
    expect(done.data.usedFallback).toBe(true);
    expect(done.data.reason).toBe("unavailable");
    expect(validatePackageShowcaseProgram(done.data.program, meta.data.snapshot as PackageShowcaseSnapshot)).toEqual({ ok: true });
  });

  it("repairs an invalid presentation once: the draft resets and the corrected program replaces it", async () => {
    const replies = ['root = PackageShowcase("x", [evil])\nevil = Evil("y")', VALID_PRESENTATION];
    const prompts: string[] = [];
    const h = new Harness({ buildLlm: () => queuedClient(replies, prompts) });
    const { owner, trip } = await optimisedTrip(h, "Showcase Repair", "showcase-repair@example.com");
    const res = await owner.post(`/trips/${trip.id}/packages/presentation`, {});
    const events = parseSse(res.text);
    expect(events.filter((event) => event.event === "reset")).toHaveLength(1);
    const done = mustEvent(events, "done");
    expect(done.data.usedFallback).toBe(false);
    expect(done.data.attempts).toBe(2);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("repairNote");
  });

  it("falls back to the standard presentation after a second invalid reply", async () => {
    const replies = ['root = PackageShowcase("x", [card])\ncard = PackageCard("pkg_99")', 'root = PackageShowcase("x", [card])\ncard = PackageCard("pkg_98")'];
    const h = new Harness({ buildLlm: () => queuedClient(replies, []) });
    const { owner, trip } = await optimisedTrip(h, "Showcase Fallback", "showcase-fallback@example.com");
    const res = await owner.post(`/trips/${trip.id}/packages/presentation`, {});
    const events = parseSse(res.text);
    const meta = mustEvent(events, "meta");
    const done = mustEvent(events, "done");
    expect(done.data.usedFallback).toBe(true);
    expect(done.data.reason).toBe("invalid");
    expect(done.data.validationErrors.join(" ")).toMatch(/unknown package/);
    expect(validatePackageShowcaseProgram(done.data.program, meta.data.snapshot as PackageShowcaseSnapshot)).toEqual({ ok: true });
  });

  it("hides margins and quotation actions from a read-only reader", async () => {
    const h = new Harness();
    const { owner, trip } = await optimisedTrip(h, "Showcase Reader", "showcase-owner@example.com");
    expect((await owner.post("/organization/members", { email: "showcase-reader@example.com", displayName: "Reader", role: "read_only", temporaryPassword: PASSWORD })).status).toBe(201);
    const reader = h.client();
    expect((await reader.post("/auth/login", { email: "showcase-reader@example.com", password: PASSWORD })).status).toBe(200);
    const res = await reader.post(`/trips/${trip.id}/packages/presentation`, {});
    const snapshot = mustEvent(parseSse(res.text), "meta").data.snapshot as PackageShowcaseSnapshot;
    expect(snapshot.permissions.canSeeMargins).toBe(false);
    expect(snapshot.permissions.canCreateQuotes).toBe(false);
    expect(snapshot.allowedActions).not.toContain("create_quote");
    expect(snapshot.allowedActions).not.toContain("validate_package");
    expect(snapshot.packages[0]!.package.totalCostMinor).toBeUndefined();
    expect(snapshot.packages[0]!.package.selections[0]!.costMinor).toBeUndefined();
    expect(snapshot.offers[0]!.offer.totalAmountMinor).toBeUndefined();
  });

  it("does not present another organisation's trip", async () => {
    const h = new Harness();
    const { trip } = await optimisedTrip(h, "Showcase Owner", "showcase-owner-2@example.com");
    const outsider = await h.register("Showcase Outsider", "tour_operator", "showcase-outsider@example.com");
    const denied = await outsider.post(`/trips/${trip.id}/packages/presentation`, {});
    expect(denied.status).toBe(404);
  });

  it("refuses a trip whose optimisation produced no packages", async () => {
    const h = new Harness();
    const empty = await h.register("Showcase Empty", "tour_operator", "showcase-empty@example.com");
    const trip = await empty.ok<any>("POST", "/trips", {
      title: "No packages yet",
      party: { adults: 1, children: 0, childAges: [], rooms: [{ adults: 1, children: 0 }] },
      budgetCurrency: "USD",
    });
    const res = await empty.post(`/trips/${trip.id}/packages/presentation`, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("returns the current snapshot without generating, so a refresh after a price check costs no model call", async () => {
    const prompts: string[] = [];
    const h = new Harness({ buildLlm: () => queuedClient([VALID_PRESENTATION], prompts) });
    const { owner, trip } = await optimisedTrip(h, "Showcase Refresh", "showcase-refresh@example.com");
    const refreshed = await owner.ok<any>("GET", `/trips/${trip.id}/packages/presentation`);
    expect(refreshed.snapshot.trip.id).toBe(trip.id);
    expect(refreshed.snapshot.packages[0].ref).toBe("pkg_1");
    expect(refreshed.snapshot.offers.length).toBeGreaterThan(0);
    expect(prompts).toHaveLength(0);
  });

  it("requires authentication", async () => {
    const h = new Harness();
    const { trip } = await optimisedTrip(h, "Showcase Auth", "showcase-auth@example.com");
    const anonymous = h.client();
    expect((await anonymous.post(`/trips/${trip.id}/packages/presentation`, {})).status).toBe(401);
  });
});
