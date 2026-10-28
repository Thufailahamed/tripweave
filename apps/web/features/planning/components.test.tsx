// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Renderer } from "@openuidev/react-lang";
import { getPlanningJSONSchema, getPlanningLibrarySpec } from "@tripweave/planning-contract";
import { PlanningProvider } from "./context";
import { PlanningFallbackView } from "./fallback-view";
import { getPlanningLibrary } from "./library";
import { baseSnapshot, makeRichSnapshot } from "./testing";

function renderProgram(program: string, snapshot = makeRichSnapshot(), onAction = vi.fn(), onError = vi.fn()) {
  const library = getPlanningLibrary();
  const view = render(
    <PlanningProvider snapshot={snapshot}>
      <Renderer library={library} response={program} onAction={onAction} onError={onError} publishObservability={false} />
    </PlanningProvider>,
  );
  return { ...view, onAction, onError };
}

const richProgram = `root = PlanningCanvas("Trip overview", [hero, summary, timeline, hotel, comparison, pkg, packages, meter, costs, why, route, actions], "Every value below comes from the server.")
hero = TripHero("trip_1", "itinerary_1")
summary = TripRequirementSummary("trip_1")
timeline = DestinationTimeline("itinerary_1")
hotel = HotelCard("offer_1", "package_1")
comparison = HotelComparison(["offer_1", "offer_2"])
pkg = PackageSummary("package_1")
packages = PackageComparison(["package_1"])
meter = BudgetMeter("package_1")
costs = CostBreakdown("package_1")
why = RecommendationExplanation("package_1")
route = RouteSummary(null, "package_1")
actions = QuickActions()`;

describe("OpenUI planning components", () => {
  afterEach(cleanup);

  it("renders the canonical library with the same spec the server validates", () => {
    expect(getPlanningLibrary().toSpec()).toEqual(getPlanningLibrarySpec());
    expect(getPlanningLibrary().toJSONSchema()).toEqual(getPlanningJSONSchema());
  });

  it("lets the guest step through the route and shows the hotels that stay at each stop", async () => {
    renderProgram(`root = PlanningCanvas("The route", [timeline])\ntimeline = DestinationTimeline("itinerary_1")`);
    const rail = await screen.findByRole("tablist", { name: "Stops in order" });
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Lakeside Heritage Kandy")).toBeInTheDocument();
    expect(within(panel).queryByText("Tea Estate Bungalow")).not.toBeInTheDocument();
    fireEvent.click(within(rail).getByRole("tab", { name: /Nuwara Eliya/ }));
    await waitFor(() => expect(within(screen.getByRole("tabpanel")).getByText("Tea Estate Bungalow")).toBeInTheDocument());
    expect(within(screen.getByRole("tabpanel")).queryByText("Lakeside Heritage Kandy")).not.toBeInTheDocument();
    fireEvent.keyDown(rail, { key: "ArrowLeft" });
    await waitFor(() => expect(within(screen.getByRole("tabpanel")).getByText("Lakeside Heritage Kandy")).toBeInTheDocument());
  });

  it("plots the stops on the map and lets the guest select one to explore", async () => {
    renderProgram(`root = PlanningCanvas("Where", [map])\nmap = TripMap("itinerary_1")`);
    const jump = await screen.findByRole("group", { name: "Jump to a stop on the map" });
    expect(within(jump).getByRole("button", { name: /Kandy/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(jump).getByRole("button", { name: /Nuwara Eliya/ }));
    await waitFor(() => expect(within(jump).getByRole("button", { name: /Nuwara Eliya/ })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("region", { name: "Map of the itinerary stops" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Route line on/ }));
    expect(screen.getByRole("button", { name: /Route line off/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("sorts and filters hotel comparisons without changing the server data", async () => {
    renderProgram(`root = PlanningCanvas("Stays", [comparison])\ncomparison = HotelComparison(["offer_1", "offer_2"])`);
    const controls = await screen.findByRole("group", { name: "Sort and filter hotels" });
    fireEvent.click(within(controls).getByRole("button", { name: "Lowest price" }));
    expect(within(controls).getByRole("button", { name: "Lowest price" })).toHaveAttribute("aria-pressed", "true");
    expect(within(controls).getByText("2 of 2 stays")).toBeInTheDocument();
    fireEvent.click(within(controls).getByRole("button", { name: "Show refundable only" }));
    expect(within(controls).getByRole("button", { name: "Refundable only" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the editorial blocks from the snapshot", async () => {
    renderProgram(richProgram);
    expect(await screen.findByText("Trip overview")).toBeInTheDocument();
    expect(screen.getByText("What we know")).toBeInTheDocument();
    expect(screen.getByText("Hill country")).toBeInTheDocument();
    expect(screen.getAllByText("Lakeside Heritage Kandy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tea Estate Bungalow").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$450.00").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Kandy to Nuwara Eliya")).toBeInTheDocument();
    expect(screen.getByText("Ways to take this trip")).toBeInTheDocument();
    expect(screen.getAllByText("Best Value").length).toBeGreaterThan(0);
    expect(screen.getByText("Why this one")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Itinerary/i }).length).toBeGreaterThan(0);
  });

  it("renders fractional optimiser sub-scores as percentages", async () => {
    const snapshot = makeRichSnapshot();
    snapshot.packages[0]!.package.breakdown = { budgetFit: 0.85, quality: 0.6, location: 0.58, amenities: 0.54, cancellation: 0.3, preference: 0, value: 0.6 };
    renderProgram(`root = PlanningCanvas("Scores", [packages])\npackages = PackageComparison(["package_1"])`, snapshot);
    expect(await screen.findByText("Budget fit")).toBeInTheDocument();
    expect(screen.getAllByText("85").length).toBeGreaterThan(0);
    expect(screen.getAllByText("58").length).toBeGreaterThan(0);
  });

  it("switches the budget between total and per person", async () => {
    const user = userEvent.setup();
    renderProgram(`root = PlanningCanvas("Budget", [meter])\nmeter = BudgetMeter("package_1")`);
    expect((await screen.findAllByText("$450.00")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Per person" }));
    expect((await screen.findAllByText("$150.00")).length).toBeGreaterThan(0);
  });

  it("resolves short generation refs instead of exposing UUIDs to the model", async () => {
    const snapshot = makeRichSnapshot();
    snapshot.trip.ref = "trip";
    if (snapshot.itinerary) snapshot.itinerary.ref = "itinerary";
    snapshot.packages[0]!.ref = "pkg_1";
    snapshot.offers[0]!.ref = "offer_1";
    snapshot.offers[1]!.ref = "offer_2";
    renderProgram(
      `root = PlanningCanvas("Short refs", [hero, requirements, timeline, pkg, hotel, comparison, route])\nhero = TripHero("trip", "itinerary")\nrequirements = TripRequirementSummary("trip")\ntimeline = DestinationTimeline("itinerary")\npkg = PackageSummary("pkg_1")\nhotel = HotelCard("offer_1", "pkg_1")\ncomparison = HotelComparison(["offer_1", "offer_2"])\nroute = RouteSummary("itinerary", "pkg_1")`,
      snapshot,
    );
    expect(await screen.findByText("Short refs")).toBeInTheDocument();
    expect(screen.getAllByText("Lakeside Heritage Kandy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$450.00").length).toBeGreaterThan(0);
  });

  it("shows a recoverable message for an unknown entity instead of crashing", async () => {
    renderProgram(`root = PlanningCanvas("Missing", [hotel])\nhotel = HotelCard("offer_missing")`);
    expect(await screen.findByText("Not available")).toBeInTheDocument();
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
  });

  it("reports malformed or unauthorised generated programs through onError", async () => {
    const onError = vi.fn();
    renderProgram(`root = Evil("x")`, makeRichSnapshot(), vi.fn(), onError);
    await waitFor(() => expect(onError).toHaveBeenCalled());
    const errors = onError.mock.calls.at(-1)?.[0] as { code: string }[];
    expect(errors.some((error) => error.code === "unknown-component" || error.code === "no-root")).toBe(true);
  });

  it("submits structured clarification answers through the allowlisted action", async () => {
    const user = userEvent.setup();
    const { onAction } = renderProgram(`root = PlanningCanvas("Details", [form])\nform = ClarificationForm("Please confirm these details.")`, baseSnapshot);
    expect(await screen.findByLabelText(/Arrival date/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Arrival date/), { target: { value: "2026-12-10" } });
    expect(screen.getByLabelText(/Number of adults/)).toHaveValue(2);
    await user.click(screen.getByRole("button", { name: /Apply answers/i }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    const event = onAction.mock.calls[0]?.[0] as { type: string; params: { answers: { questionId: string; value: unknown }[] } };
    expect(event.type).toBe("apply_clarification");
    expect(event.params.answers).toEqual(expect.arrayContaining([{ questionId: "arrival_date", value: "2026-12-10" }, { questionId: "adults", value: 2 }]));
  });

  it("routes allowlisted next-step actions from QuickActions", async () => {
    const user = userEvent.setup();
    const { onAction } = renderProgram(`root = PlanningCanvas("Next", [actions])\nactions = QuickActions()`);
    await user.click(await screen.findByRole("button", { name: /Packages/i }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "open_packages" }));
  });

  it("opens the hotel comparison table on demand", async () => {
    const user = userEvent.setup();
    renderProgram(`root = PlanningCanvas("Hotels", [comparison])\ncomparison = HotelComparison(["offer_1", "offer_2"])`);
    const summary = await screen.findByText("Compare as a table");
    await user.click(summary);
    const table = screen.getByRole("table", { name: /Comparison of hotel offers/i });
    expect(within(table).getByText("Lakeside Heritage Kandy")).toBeInTheDocument();
  });

  it("renders the normal fallback with the same authoritative data", async () => {
    render(<PlanningFallbackView snapshot={makeRichSnapshot()} reason="unavailable" />);
    expect(await screen.findByText(/AI generation is unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByText(/best value/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Packages/i })[0]).toHaveAttribute("href", "/trips/trip_1/packages");
    expect(screen.getAllByText("Kandy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nuwara Eliya").length).toBeGreaterThan(0);
  });

  it("never renders model-provided HTML as markup", async () => {
    renderProgram(`root = PlanningCanvas("<img src=x onerror=alert(1)>", [summary])\nsummary = TripRequirementSummary("trip_1")`, makeRichSnapshot());
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector("[onerror]")).toBeNull();
  });
});
