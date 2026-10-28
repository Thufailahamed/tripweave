// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { money } from "@/lib/utils";
import { PackageStoryPanel } from "./panel";
import { PKG_1, PKG_2, makeShowcaseSnapshot } from "./testing";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const snapshot = makeShowcaseSnapshot();

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

const storyProgram = `root = PackageShowcase("Your hill country packages", [card, next], "Two options.")
card = PackageCard("pkg_1", "lead")
next = NextSteps()`;

function renderPanel(onFocusPackage = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PackageStoryPanel tripId="trip_1" jobId="job_1" onFocusPackage={onFocusPackage} />
    </QueryClientProvider>,
  );
  return { onFocusPackage };
}

describe("PackageStoryPanel", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("streams the composed presentation and renders every value from the snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST" && url.includes("/packages/presentation")) {
          return sseResponse([
            { event: "meta", data: { snapshot, engineAvailable: true } },
            { event: "delta", data: { text: storyProgram.slice(0, 40) } },
            { event: "delta", data: { text: storyProgram.slice(40) } },
            { event: "done", data: done(storyProgram) },
          ]);
        }
        return jsonResponse({ data: null }, 404);
      }),
    );
    renderPanel();
    expect(await screen.findByText(money(PKG_1.pricing!.sellingPriceMinor, "USD"))).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The packages, explained" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show in packages" })).toBeInTheDocument();
  });

  it("explains a fallback presentation with the server's warning", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST" && url.includes("/packages/presentation")) {
          return sseResponse([
            { event: "meta", data: { snapshot, engineAvailable: false } },
            { event: "done", data: done(storyProgram, { usedFallback: true, reason: "unavailable", warnings: ["AI composition is not configured, so a standard presentation is shown."] }) },
          ]);
        }
        return jsonResponse({ data: null }, 404);
      }),
    );
    renderPanel();
    expect(await screen.findByText(/AI composition is not configured/)).toBeInTheDocument();
    expect(await screen.findByText(money(PKG_1.pricing!.sellingPriceMinor, "USD"))).toBeInTheDocument();
  });

  it("reports a stream that closes before the presentation is finished, rather than showing a partial one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST" && url.includes("/packages/presentation")) {
          // The stream ends after one delta and never sends `done`, as a dropped connection would.
          return sseResponse([
            { event: "meta", data: { snapshot, engineAvailable: true } },
            { event: "delta", data: { text: "root = PackageShowcase(" } },
          ]);
        }
        return jsonResponse({ data: null }, 404);
      }),
    );
    renderPanel();
    expect(await screen.findByText(/connection closed before the package story finished/)).toBeInTheDocument();
  });

  it("opens a package in the standard list when its Show in packages button is pressed", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST" && url.includes("/packages/presentation")) {
          return sseResponse([{ event: "meta", data: { snapshot, engineAvailable: true } }, { event: "done", data: done(storyProgram) }]);
        }
        return jsonResponse({ data: null }, 404);
      }),
    );
    const { onFocusPackage } = renderPanel();
    await user.click(await screen.findByRole("button", { name: "Show in packages" }));
    expect(onFocusPackage).toHaveBeenCalledWith("pkg_1-id");
  });

  it("creates a quotation for a live package through the existing quotation API and opens it", async () => {
    const user = userEvent.setup();
    const calls: { url: string; method: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (method === "POST" && url.includes("/packages/presentation")) {
          return sseResponse([{ event: "meta", data: { snapshot, engineAvailable: true } }, { event: "done", data: done(storyProgram) }]);
        }
        if (method === "POST" && url.endsWith("/quotes")) return jsonResponse({ data: { id: "quote_1" } }, 201);
        return jsonResponse({ data: null }, 404);
      }),
    );
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Create quotation" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/quotes/quote_1"));
    const quoteCall = calls.find((call) => call.url.endsWith("/quotes"));
    expect(quoteCall?.body).toEqual({ tripRequestId: "trip_1", packageId: "pkg_1-id" });
  });

  it("re-checks live prices and then refreshes the snapshot, so the status reflects the new check", async () => {
    const user = userEvent.setup();
    const refreshed = makeShowcaseSnapshot({ packages: [PKG_1, { ...PKG_2, verification: { ...PKG_2.verification, allVerified: true, validUntil: "2999-01-01T00:00:00.000Z", checkedAt: "2026-10-28T09:00:00.000Z" } }] });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push(`${method} ${url}`);
        if (method === "POST" && url.includes("/packages/presentation")) {
          return sseResponse([
            { event: "meta", data: { snapshot, engineAvailable: true } },
            { event: "done", data: done(`root = PackageShowcase("Live", [live], "Status.")\nlive = LivePriceStatus("pkg_2")`) },
          ]);
        }
        if (method === "POST" && url.endsWith("/packages/pkg_2-id/validate")) {
          return jsonResponse({ data: { package: null, verification: { allVerified: true }, changed: false } });
        }
        if (method === "GET" && url.includes("/packages/presentation")) return jsonResponse({ data: { snapshot: refreshed } });
        return jsonResponse({ data: null }, 404);
      }),
    );
    renderPanel();
    await user.click(await screen.findByRole("button", { name: /Re-check live prices/ }));
    await waitFor(() => expect(screen.getByText(/Live checked until/)).toBeInTheDocument());
    expect(calls.some((call) => call === "POST /api/v1/packages/pkg_2-id/validate")).toBe(true);
    expect(calls.some((call) => call.startsWith("GET /api/v1/trips/trip_1/packages/presentation"))).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Live prices checked");
    expect(within(screen.getByLabelText("Live price status")).getByText(/Live checked until/)).toBeInTheDocument();
  });
});
