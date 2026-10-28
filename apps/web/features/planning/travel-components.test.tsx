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

describe("route stops and header chips", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const route = `root = PlanningCanvas("Kandy to Ella", [stops], "Locations are estimates.", ["Walking + transit", "Hill country"])
kandy = RouteStop("Kandy, Sri Lanka", "9:00 AM", "60-75 min", "Start at the lake.")
nuwara = RouteStop("Nuwara Eliya, Sri Lanka", "1:30 PM", "3 hours", "Lunch and a tea estate.")
stops = RouteStops("Your route, stop by stop", [kandy, nuwara])`;

  it("renders numbered stops with photographs, times and a visited toggle that keeps its own state", async () => {
    stubPlaces();
    renderProgram(route);
    expect(await screen.findByText("Your route, stop by stop")).toBeInTheDocument();
    expect(screen.getByText("2 stops")).toBeInTheDocument();
    expect(screen.getByText("9:00 AM")).toBeInTheDocument();
    expect(screen.getByText("3 hours")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Mark as visited" })[0]!);
    expect(screen.getByRole("button", { name: "Visited" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: "Mark as visited" })).toHaveLength(1);
  });

  it("sends directions to a stop back to the assistant", async () => {
    stubPlaces();
    const onAction = renderProgram(route);
    fireEvent.click((await screen.findAllByRole("button", { name: /Directions/ }))[1]!);
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ humanFriendlyMessage: expect.stringContaining("How do I get to Nuwara Eliya, Sri Lanka from the previous stop?") }));
  });

  it("shows header chips as a summary list", () => {
    renderProgram(`root = PlanningCanvas("Kandy to Ella", [lead], "Estimates.", ["Walking + transit", "Hill country"])\nlead = Lead("Hello.")`);
    const summary = screen.getByRole("list", { name: "Summary" });
    expect(within(summary).getByText("Walking + transit")).toBeInTheDocument();
    expect(within(summary).getByText("Hill country")).toBeInTheDocument();
  });
});

describe("journal blocks", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const journal = `root = PlanningCanvas("Four days of tea and temples in Kandy", [sights, food, board, when], "Kandy rewards slow mornings.", ["4 days"], "walk early, wander late", "Kandy")
h1 = Highlight("Temple of the Tooth, Kandy", "Lakeside", "The relic temple at dusk.")
h2 = Highlight("Ella, Sri Lanka", "Hill country", "Ridges and tea.")
sights = Highlights("Do not miss", [h1, h2])
food = LocalFlavours("Taste of Kandy", ["Kottu roti", "Hoppers"], "try them hot")
d1 = BoardDay("Day 1", ["Kandy, Sri Lanka", "Nuwara Eliya, Sri Lanka"], "Lake and tea")
board = DayBoard("Four days", [d1], "easy pace")
c1 = Choice("Perahera season", "August", "the great procession", "Plan it for the August festival.")
c2 = Choice("Dry months", "January to April")
when = Choices("When would you like to go?", [c1, c2], "Pick your own dates")`;

  it("highlights the headline and shows the handwritten note", async () => {
    stubPlaces();
    renderProgram(journal);
    const heading = await screen.findByRole("heading", { name: "Four days of tea and temples in Kandy" });
    expect(heading.querySelector("mark")).toHaveTextContent("Kandy");
    expect(screen.getByText("walk early, wander late")).toBeInTheDocument();
  });

  it("opens a postcard's story and plans a visit from it", async () => {
    stubPlaces();
    const onAction = renderProgram(journal);
    const postcard = await screen.findByRole("button", { name: /Temple of the Tooth/ });
    fireEvent.click(postcard);
    expect(postcard).toHaveAttribute("aria-pressed", "true");
    const story = screen.getByRole("region", { name: "About Temple of the Tooth" });
    await waitFor(() => expect(within(story).getByText(/temple of the tooth, kandy is a hill-country town/i)).toBeInTheDocument());
    fireEvent.click(within(story).getByRole("button", { name: "Plan a visit" }));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ humanFriendlyMessage: expect.stringContaining("Plan a visit to Temple of the Tooth, Kandy") }));
  });

  it("saves local flavours and asks where to find them", async () => {
    stubPlaces();
    const onAction = renderProgram(journal);
    fireEvent.click(await screen.findByRole("button", { name: "Save Kottu roti to try" }));
    expect(screen.getByRole("button", { name: "Remove Kottu roti from the list" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Find it/ }));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ humanFriendlyMessage: expect.stringContaining("Where can we try Kottu roti") }));
  });

  it("shows each day's places with times of day and maps the day on request", async () => {
    stubPlaces();
    const onAction = renderProgram(journal);
    expect(await screen.findByText("Morning")).toBeInTheDocument();
    expect(screen.getByText("Afternoon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nuwara Eliya/ }));
    await waitFor(() => expect(screen.getByText("nuwara eliya, sri lanka is a hill-country town.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Map this day/ }));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ humanFriendlyMessage: expect.stringContaining("Show Day 1 on a map") }));
  });

  it("sends the picked choice as the next message and locks the other options", async () => {
    stubPlaces();
    const onAction = renderProgram(journal);
    const perahera = await screen.findByRole("button", { name: /Perahera season/ });
    fireEvent.click(perahera);
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ humanFriendlyMessage: "Plan it for the August festival." }));
    expect(perahera).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Dry months/ })).toBeDisabled();
  });

  it("sends a free-text answer from the custom option", async () => {
    stubPlaces();
    const onAction = renderProgram(journal);
    fireEvent.click(await screen.findByRole("button", { name: /Pick your own dates/ }));
    fireEvent.change(screen.getByLabelText("Pick your own dates"), { target: { value: "the first week of March" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ humanFriendlyMessage: "When would you like to go? the first week of March" }));
  });
});

describe("PlaceMap full screen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens the map full screen, can refit the route, and closes with Escape", async () => {
    stubPlaces();
    renderProgram(`root = PlanningCanvas("Route", [map], "Where.")
map = PlaceMap("Kandy to Ella", ["Kandy, Sri Lanka", "Ella, Sri Lanka"])`);
    await screen.findByText("2 of 2 located");
    fireEvent.click(screen.getByRole("button", { name: /Fit route/ }));
    fireEvent.click(screen.getByRole("button", { name: /Expand map/ }));
    const dialog = screen.getByRole("dialog", { name: "Kandy to Ella (full screen)" });
    expect(within(dialog).getByRole("button", { name: /Close map/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Kandy to Ella (full screen)" })).not.toBeInTheDocument();
  });
});
