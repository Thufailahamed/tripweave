// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Renderer } from "@openuidev/react-lang";
import { money } from "@/lib/utils";
import { PackageShowcaseProvider } from "./context";
import { getPackageShowcaseRenderLibrary } from "./library";
import { KANDY_OFFER, PKG_1, PKG_2, makeShowcaseSnapshot } from "./testing";

function renderProgram(program: string, options: { snapshot?: ReturnType<typeof makeShowcaseSnapshot>; pending?: string | null; onAction?: (event: unknown) => void } = {}) {
  const onAction = options.onAction ?? vi.fn();
  const view = render(
    <PackageShowcaseProvider snapshot={options.snapshot ?? makeShowcaseSnapshot()} pending={options.pending ?? null}>
      <Renderer library={getPackageShowcaseRenderLibrary()} response={program} onAction={onAction} publishObservability={false} />
    </PackageShowcaseProvider>,
  );
  return { ...view, onAction };
}

const PKG_1_TOTAL = money(36_000, "USD");

describe("package showcase components", () => {
  afterEach(cleanup);

  it("renders a package card with the server selling price, budget position and hotels from the snapshot", () => {
    renderProgram(`root = PackageShowcase("Your hill country packages", [card], "Two options.")\ncard = PackageCard("pkg_1", "lead")`);
    expect(screen.getByText(PKG_1_TOTAL)).toBeInTheDocument();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByText(`${money(14_000, "USD")} under budget`)).toBeInTheDocument();
    const hotels = screen.getByRole("list", { name: "Hotels in this package" });
    expect(within(hotels).getByText("Lakeside Heritage Kandy")).toBeInTheDocument();
    expect(within(hotels).getByText("Hill Terrace Ella")).toBeInTheDocument();
    expect(within(hotels).getAllByText(/Bed & breakfast/)).toHaveLength(2);
  });

  it("ignores any price the model writes around a card, because the card renders the server value", () => {
    renderProgram(`root = PackageShowcase("Your packages", [card], "Two options.")\ncard = PackageCard("pkg_1")`);
    expect(screen.queryByText(/USD 1\.00/)).toBeNull();
    expect(screen.getByText(PKG_1_TOTAL)).toBeInTheDocument();
  });

  it("shows a missing-package notice for a ref the snapshot does not contain", () => {
    renderProgram(`root = PackageShowcase("Your packages", [card], "Two options.")\ncard = PackageCard("pkg_9")`);
    expect(screen.getByRole("status")).toHaveTextContent(/not in the latest optimisation run/);
  });

  it("compares packages with a total, per-night and per-traveller switch that recalculates from server prices", async () => {
    const user = userEvent.setup();
    renderProgram(`root = PackageShowcase("Compare", [cmp], "Side by side.")\ncmp = PackageCompare(["pkg_1", "pkg_2"], "Side by side")`);
    const table = screen.getByRole("table");
    // pkg_1: 36,000 over 3 nights and 2 travellers.
    expect(within(table).getByText(PKG_1_TOTAL)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Per night" }));
    expect(within(table).getByText(money(12_000, "USD"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Per traveller" }));
    expect(within(table).getByText(money(18_000, "USD"))).toBeInTheDocument();
  });

  it("marks the lowest-priced package and sorts by the chosen order", async () => {
    const user = userEvent.setup();
    renderProgram(`root = PackageShowcase("Compare", [cmp], "Side by side.")\ncmp = PackageCompare(["pkg_1", "pkg_2"])`);
    expect(within(screen.getByRole("table")).getByText("Lowest price")).toBeInTheDocument();
    const headers = () => screen.getAllByRole("columnheader").map((th) => th.textContent ?? "");
    expect(headers()[1]).toMatch(/Best Value/);
    await user.selectOptions(screen.getByRole("combobox"), "score");
    expect(headers()[1]).toMatch(/Comfort Journey/);
  });

  it("reports the live check state from the server verification, not from text", () => {
    renderProgram(`root = PackageShowcase("Live", [live], "Status.")\nlive = LivePriceStatus("pkg_1")`);
    expect(screen.getByText(/Live checked until/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Re-check live prices/ })).toBeInTheDocument();
  });

  it("reports an indicative package as not yet live checked", () => {
    renderProgram(`root = PackageShowcase("Live", [live], "Status.")\nlive = LivePriceStatus("pkg_2")`);
    expect(screen.getByText("Not live checked yet")).toBeInTheDocument();
  });

  it("disables quotation creation for an external rate that has not been checked, and explains why", () => {
    renderProgram(`root = PackageShowcase("Cards", [card], "Status.")\ncard = PackageCard("pkg_2")`);
    expect(screen.getByRole("button", { name: "Create quotation" })).toBeDisabled();
    expect(screen.getByText(/Live rates must be checked before a quotation can be created/)).toBeInTheDocument();
  });

  it("sends the fixed validate action with the package ref when a live check is requested", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderProgram(`root = PackageShowcase("Live", [live], "Status.")\nlive = LivePriceStatus("pkg_2")`, { onAction });
    await user.click(screen.getByRole("button", { name: /Re-check live prices/ }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction.mock.calls[0]![0]).toMatchObject({ type: "validate_package", params: { packageId: "pkg_2" } });
  });

  it("offers only the next steps the server permits", () => {
    const snapshot = makeShowcaseSnapshot({ allowedActions: ["open_itinerary"] });
    renderProgram(`root = PackageShowcase("Next", [next], "Steps.")\nnext = NextSteps()`, { snapshot });
    expect(screen.getByRole("button", { name: /Review itinerary/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run the optimisation again/ })).toBeNull();
  });

  it("shows a budget meter that can switch between total and per-traveller amounts", async () => {
    const user = userEvent.setup();
    renderProgram(`root = PackageShowcase("Budget", [budget], "Position.")\nbudget = BudgetFit("pkg_1")`);
    expect(screen.getByText(`${money(14_000, "USD")} under budget`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Per traveller" }));
    expect(screen.getByText(`${money(7_000, "USD")} per traveller under budget`)).toBeInTheDocument();
  });

  it("itemises the price with tax and total payable from the server, and gives no margin lines to a reader without margins:view", () => {
    renderProgram(`root = PackageShowcase("Price", [price], "Breakdown.")\nprice = PriceBreakdown("pkg_1")`);
    expect(screen.getByText("Selling price")).toBeInTheDocument();
    expect(screen.getByText("Total payable")).toBeInTheDocument();
    expect(screen.queryByText("Gross margin")).toBeNull();
    expect(screen.queryByText("Supplier cost")).toBeNull();
  });

  it("shows a hotel stay with its dates, room, meal plan and cancellation from the offer", () => {
    renderProgram(`root = PackageShowcase("Stay", [stay], "Detail.")\nstay = HotelStay("offer_1", "pkg_1")`);
    expect(screen.getByRole("heading", { name: KANDY_OFFER.property.name })).toBeInTheDocument();
    expect(screen.getByText(/Deluxe Double/)).toBeInTheDocument();
    expect(screen.getByText(/Free cancellation until/)).toBeInTheDocument();
  });

  it("refuses a hotel that is not part of the package it is paired with", () => {
    renderProgram(`root = PackageShowcase("Stay", [stay], "Detail.")\nstay = HotelStay("offer_3", "pkg_1")`);
    expect(screen.getByRole("status")).toHaveTextContent(/not in the latest optimisation run|in that package/);
  });

  it("explains a package with the server's reasons and flags unverified items", () => {
    renderProgram(`root = PackageShowcase("Why", [why], "Reasons.")\nwhy = PackageInsight("pkg_2")`);
    expect(screen.getByText("Within the trip budget.")).toBeInTheDocument();
    expect(screen.getByText("Rates for the Ella hotel have not been checked.")).toBeInTheDocument();
  });

  it("renders the note tone from the model and its text as plain content", () => {
    renderProgram(`root = PackageShowcase("Notes", [note], "Tips.")\nnote = Note("caution", "Check live rates first", "Re-check before quoting.")`);
    expect(screen.getByText("Check live rates first")).toBeInTheDocument();
    expect(screen.getByText("Re-check before quoting.")).toBeInTheDocument();
  });
});
