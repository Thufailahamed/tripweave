// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Renderer } from "@openuidev/react-lang";
import { PlanningProvider } from "./context";
import { getPlanningLibrary } from "./library";
import { fetchPlaceImage } from "./place-image";
import { makeRichSnapshot } from "./testing";

/** Wikipedia's search response for any place name; the thumbnail host decides whether an image is shown. */
function stubWikipedia(thumbnail: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const title = new URL(String(input)).searchParams.get("gsrsearch") ?? "Place";
      const page = {
        title,
        fullurl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        extract: `${title} is a hill-country town.`,
        ...(thumbnail ? { thumbnail: { source: thumbnail } } : {}),
      };
      return new Response(JSON.stringify({ query: { pages: [page] } }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

function renderProgram(program: string, onAction = vi.fn()) {
  render(
    <PlanningProvider snapshot={makeRichSnapshot()}>
      <Renderer library={getPlanningLibrary()} response={program} onAction={onAction} publishObservability={false} />
    </PlanningProvider>,
  );
  return onAction;
}

const guide = `root = PlanningCanvas("Three days", [intro, places, day, tips, facts, note, table, next], "Ideas to adapt.")
intro = Lead("Ella suits slow mornings and short walks.")
places = PlaceGallery("Where to go", ["Ella, Sri Lanka", "Kandy, Sri Lanka"])
day = DayPlan("Day 1", "Ridge walk", ["Early walk", "Tea estate visit"])
tips = TipList("Pack", ["Light layers", "Sun cream"])
facts = KeyFacts("Quick facts", ["Best season: December to March", "Getting around: Trains climb into the hills"])
note = Callout("caution", "Check entry rules", "Use your government's official advice.")
table = ComparisonTable("Regions", ["Hill country", "Coast"], [["Weather", "Cool", "Warm"]])
next = FollowUps("Keep going", ["Where should I stay in Ella?"])`;

describe("travel-guide blocks", () => {
  beforeEach(() => stubWikipedia("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Ella.jpg"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders a complete travel guide with interactive places, days, checklists and follow-ups", async () => {
    const onAction = renderProgram(guide);
    expect(await screen.findByText("Ella suits slow mornings and short walks.")).toBeInTheDocument();

    const kandy = screen.getByRole("button", { name: /Kandy, Sri Lanka/ });
    expect(kandy).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(kandy);
    expect(kandy).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByText("Kandy, Sri Lanka is a hill-country town.")).toBeInTheDocument());

    const day = screen.getByText("Ridge walk").closest("article") as HTMLElement;
    fireEvent.click(within(day).getByRole("button", { name: /Early walk/ }));
    expect(within(day).getByRole("button", { name: /Early walk/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(day).getByText("1 of 2 ticked off")).toBeInTheDocument();

    const lightLayers = screen.getByRole("checkbox", { name: "Light layers" });
    fireEvent.click(lightLayers);
    expect(lightLayers).toBeChecked();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    expect(screen.getByText("Best season")).toBeInTheDocument();
    expect(screen.getByText("December to March")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Check entry rules");
    expect(screen.getByRole("columnheader", { name: "Coast" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Cool" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Where should I stay in Ella?" }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "continue_conversation", humanFriendlyMessage: "Where should I stay in Ella?" }));
  });

  it("sends each place and day back to the assistant as a follow-up question", async () => {
    const onAction = renderProgram(`root = PlanningCanvas("Places", [card, day], "Ideas.")
card = PlaceCard("Ella, Sri Lanka", "Walks and tea estates.")
day = DayPlan("Day 2", "Slow morning", ["Breakfast on the terrace"])`);
    await waitFor(() => expect(screen.getByRole("link", { name: "Read on Wikipedia" })).toHaveAttribute("href", expect.stringContaining("Ella")));
    fireEvent.click(screen.getByRole("button", { name: "Ask about this place" }));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ humanFriendlyMessage: expect.stringContaining("Tell me about Ella, Sri Lanka") }));
    fireEvent.click(screen.getByRole("button", { name: "Adjust this day" }));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ humanFriendlyMessage: expect.stringContaining("Rework Day 2 (Slow morning)") }));
  });

  it("uses a generated postcard when the place has no free photograph", async () => {
    stubWikipedia(null);
    renderProgram(`root = PlanningCanvas("Places", [card], "Ideas.")
card = PlaceCard("Batticaloa, Sri Lanka", "A lagoon town on the east coast.")`);
    expect(await screen.findByRole("img", { name: "Batticaloa, Sri Lanka illustration" })).toBeInTheDocument();
  });
});

describe("place photographs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts only Wikimedia-hosted images and never a third-party host", async () => {
    stubWikipedia("https://tracker.example/pixel.jpg");
    await expect(fetchPlaceImage("Nuwara Eliya, Sri Lanka")).resolves.toMatchObject({ src: null, title: "Nuwara Eliya, Sri Lanka" });
  });

  it("does not cache a network failure, so a later view can retry", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPlaceImage("Trincomalee, Sri Lanka")).resolves.toBeNull();
    stubWikipedia("https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Trinco.jpg");
    await expect(fetchPlaceImage("Trincomalee, Sri Lanka")).resolves.toMatchObject({ src: expect.stringContaining("upload.wikimedia.org") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
