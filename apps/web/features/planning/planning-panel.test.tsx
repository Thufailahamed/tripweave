// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlanningPanel } from "./planning-panel";
import { makeRichSnapshot } from "./testing";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const snapshot = makeRichSnapshot();
const context = {
  snapshot,
  starters: [{ label: "Summarise the trip", prompt: "Summarise the current trip requirements." }],
  allowlist: snapshot.allowlist,
  engineAvailable: true,
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function sseResponse(frames: { event: string; data: unknown }[]): Response {
  const body = frames.map((frame) => `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function done(program: string, extra: Record<string, unknown> = {}) {
  return { program, engine: "external_llm", model: "fake", usedFallback: false, warnings: [], ...extra };
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanningPanel tripId="trip_1" />
    </QueryClientProvider>,
  );
}

const summaryProgram = `root = PlanningCanvas("Trip overview", [summary], "Every value below comes from the server.")\nsummary = TripRequirementSummary("trip_1")`;

describe("PlanningPanel", () => {
  beforeEach(() => {
    push.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("streams a generated interface and sends the user request to the API", async () => {
    const user = userEvent.setup();
    let postBody: { message: string; history: unknown[] } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "GET") return jsonResponse({ data: context });
        postBody = JSON.parse(String(init?.body ?? "{}"));
        return sseResponse([
          { event: "meta", data: { ...context, fallbackAvailable: true } },
          { event: "delta", data: { text: summaryProgram.slice(0, 40) } },
          { event: "delta", data: { text: summaryProgram.slice(40) } },
          { event: "done", data: done(summaryProgram) },
        ]);
      }),
    );
    renderPanel();
    expect(await screen.findByRole("heading", { name: "What shall we plan next?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Summarise the trip" }));
    expect(await screen.findByText("Trip overview")).toBeInTheDocument();
    expect(await screen.findByText("What we know")).toBeInTheDocument();
    expect(screen.getByText("Summarise the current trip requirements.")).toBeInTheDocument();
    expect(postBody).toMatchObject({ message: "Summarise the current trip requirements.", history: [] });
  });

  it("retries once when the connection drops mid-stream, then explains a second drop", async () => {
    const user = userEvent.setup();
    let posts = 0;
    let dropEveryTime = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "GET") return jsonResponse({ data: context });
        posts += 1;
        if (dropEveryTime || posts === 1) throw new TypeError("network error");
        return sseResponse([
          { event: "meta", data: { ...context, fallbackAvailable: true } },
          { event: "delta", data: { text: summaryProgram } },
          { event: "done", data: done(summaryProgram) },
        ]);
      }),
    );
    renderPanel();
    await screen.findByRole("heading", { name: "What shall we plan next?" });
    await user.click(screen.getByRole("button", { name: "Summarise the trip" }));
    expect(await screen.findByText("Trip overview", {}, { timeout: 4_000 })).toBeInTheDocument();
    expect(posts).toBe(2);

    dropEveryTime = true;
    await user.type(screen.getByLabelText("Message the planning assistant"), "Again{Enter}");
    expect((await screen.findAllByText(/connection to the planner dropped/i, {}, { timeout: 4_000 })).length).toBeGreaterThan(0);
    expect(posts).toBe(4);
  });

  it("switches to the standard view when generation is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "GET") return jsonResponse({ data: context });
        return sseResponse([
          { event: "meta", data: { ...context, fallbackAvailable: true } },
          { event: "done", data: done(summaryProgram, { usedFallback: true, reason: "invalid", warnings: ["Generated interface rejected."] }) },
        ]);
      }),
    );
    renderPanel();
    await screen.findByRole("heading", { name: "What shall we plan next?" });
    await user.click(screen.getByRole("button", { name: "Summarise the trip" }));
    expect(await screen.findByText(/did not pass validation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/best value/i).length).toBeGreaterThan(0);
  });

  it("routes an allowlisted open_packages action to the standard packages page", async () => {
    const user = userEvent.setup();
    const packageProgram = `root = PlanningCanvas("Package", [pkg])\npkg = PackageSummary("package_1")`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "GET") return jsonResponse({ data: context });
        return sseResponse([
          { event: "meta", data: { ...context, fallbackAvailable: true } },
          { event: "done", data: done(packageProgram) },
        ]);
      }),
    );
    renderPanel();
    await screen.findByRole("heading", { name: "What shall we plan next?" });
    await user.click(screen.getByRole("button", { name: "Summarise the trip" }));
    const open = await screen.findByRole("button", { name: /Open packages/i });
    await user.click(open);
    expect(push).toHaveBeenCalledWith("/trips/trip_1/packages");
  });

  it("leaves a readable fallback and retry control when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "GET") return jsonResponse({ data: context });
        return jsonResponse({ error: { code: "error", message: "The planning service is unavailable." } }, 503);
      }),
    );
    renderPanel();
    await screen.findByRole("heading", { name: "What shall we plan next?" });
    await user.click(screen.getByRole("button", { name: "Summarise the trip" }));
    expect(await screen.findByText(/could not be generated or rendered/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/The planning service is unavailable/i).length).toBeGreaterThan(0));
  });

  it("recovers when the stream ends before a validated program is delivered", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "GET") return jsonResponse({ data: context });
        return sseResponse([
          { event: "meta", data: { ...context, fallbackAvailable: true } },
          { event: "delta", data: { text: summaryProgram.slice(0, 40) } },
        ]);
      }),
    );
    renderPanel();
    await screen.findByRole("heading", { name: "What shall we plan next?" });
    await user.click(screen.getByRole("button", { name: "Summarise the trip" }));
    expect(await screen.findByText(/stream ended before the interface was complete/i)).toBeInTheDocument();
    expect(await screen.findByText(/could not be generated or rendered/i)).toBeInTheDocument();
  });

  it("shows a standard view toggle for generated responses", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "GET") return jsonResponse({ data: context });
        return sseResponse([
          { event: "meta", data: { ...context, fallbackAvailable: true } },
          { event: "done", data: done(summaryProgram) },
        ]);
      }),
    );
    renderPanel();
    await screen.findByRole("heading", { name: "What shall we plan next?" });
    await user.click(screen.getByRole("button", { name: "Summarise the trip" }));
    await screen.findByText("Trip overview");
    await user.click(screen.getByRole("button", { name: "Standard view" }));
    expect(await screen.findByRole("button", { name: "Try generated view" })).toBeInTheDocument();
    expect(screen.getByText(/Every value still comes from the API/i)).toBeInTheDocument();
  });
});
