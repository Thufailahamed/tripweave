// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Renderer } from "@openuidev/react-lang";
import { PlanningProvider } from "./context";
import { getPlanningLibrary } from "./library";
import { lookupPlace } from "./place-image";
import { makeRichSnapshot } from "./testing";

/** Coordinates the API would return for these well-known places. */
const COORDINATES: Record<string, [number, number]> = {
  "kandy, sri lanka": [7.2906, 80.6337],
  "ella, sri lanka": [6.8667, 81.0466],
  "nuwara eliya, sri lanka": [6.9497, 80.7891],
};

interface PlaceFixtureOptions {
  imageUrl?: string | null;
}

/** Stubs the API's batched place lookup. Unknown places have no coordinates. */
function stubPlaces(options: PlaceFixtureOptions = {}) {
  const requests: string[][] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("/planning/places")) throw new Error(`unexpected request ${url}`);
    const { names } = JSON.parse(String(init?.body)) as { names: string[] };
    requests.push(names);
    const places = Object.fromEntries(
      names.map((name) => {
        const [latitude, longitude] = COORDINATES[name] ?? [null, null];
        return [
          name,
          {
            name,
            articleTitle: name.replace(/\b\w/g, (letter) => letter.toUpperCase()),
            articleUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/\b\w/g, (letter) => letter.toUpperCase()))}`,
            extract: `${name} is a hill-country town.`,
            imageUrl: options.imageUrl === undefined ? "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test.jpg" : options.imageUrl,
            latitude,
            longitude,
          },
        ];
      }),
    );
    return new Response(JSON.stringify({ data: { places } }), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests };
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
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders a complete travel guide with interactive places, days, checklists and follow-ups", async () => {
    stubPlaces();
    const onAction = renderProgram(guide);
    expect(await screen.findByText("Ella suits slow mornings and short walks.")).toBeInTheDocument();

    const kandy = screen.getByRole("button", { name: /Kandy, Sri Lanka/ });
    expect(kandy).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(kandy);
    expect(kandy).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByText("kandy, sri lanka is a hill-country town.")).toBeInTheDocument());

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
    stubPlaces();
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
    stubPlaces({ imageUrl: null });
    renderProgram(`root = PlanningCanvas("Places", [card], "Ideas.")
card = PlaceCard("Batticaloa, Sri Lanka", "A lagoon town on the east coast.")`);
    expect(await screen.findByRole("img", { name: "Batticaloa, Sri Lanka illustration" })).toBeInTheDocument();
  });
});

describe("place lookups in the browser", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("coalesces lookups requested together into one API request", async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
    const { requests } = stubPlaces();
    await Promise.all([lookupPlace("Hambantota, Sri Lanka"), lookupPlace("Mirissa, Sri Lanka"), lookupPlace("Tissamaharama, Sri Lanka")]);
    expect(requests).toEqual([["Hambantota, Sri Lanka", "Mirissa, Sri Lanka", "Tissamaharama, Sri Lanka"]]);
  });

  it("does not cache a failed lookup, so a later view retries it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    await expect(lookupPlace("Trincomalee, Sri Lanka")).resolves.toBeNull();
    const { fetchMock } = stubPlaces();
    await expect(lookupPlace("Trincomalee, Sri Lanka")).resolves.toMatchObject({ name: "Trincomalee, Sri Lanka" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("PlaceMap", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const mapProgram = `root = PlanningCanvas("Route", [map], "Where things are.")
map = PlaceMap("Kandy to Ella", ["Kandy, Sri Lanka", "Nuwara Eliya, Sri Lanka", "Ella, Sri Lanka", "Atlantis, Sri Lanka"])`;

  it("plots every located place and lists the ones it cannot locate", async () => {
    stubPlaces();
    renderProgram(mapProgram);
    expect(await screen.findByText("3 of 4 located")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Map of the places" })).toBeInTheDocument();
    const jump = screen.getByRole("group", { name: "Jump to a place on the map" });
    expect(within(jump).getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText("Not on the map: Atlantis, Sri Lanka")).toBeInTheDocument();
  });

  it("selects a place from the chips and offers to explain it or plan the next leg", async () => {
    stubPlaces();
    const onAction = renderProgram(mapProgram);
    const jump = await screen.findByRole("group", { name: "Jump to a place on the map" });
    const ella = within(jump).getByRole("button", { name: /Ella, Sri Lanka/ });
    fireEvent.click(ella);
    expect(ella).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByText("ella, sri lanka is a hill-country town.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Route to next stop/ }));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ humanFriendlyMessage: expect.stringContaining("How do I get from Ella, Sri Lanka to Kandy, Sri Lanka?") }));
    fireEvent.click(screen.getByRole("button", { name: "Ask about this place" }));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ humanFriendlyMessage: expect.stringContaining("Tell me about Ella, Sri Lanka") }));
  });

  it("explains honestly when no place can be located", async () => {
    stubPlaces();
    renderProgram(`root = PlanningCanvas("Route", [map], "Where.")
map = PlaceMap("Unknown", ["Atlantis, Sri Lanka", "Lemuria, Sri Lanka"])`);
    expect(await screen.findByText(/None of these places could be located/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Map of the places" })).not.toBeInTheDocument();
  });
});
