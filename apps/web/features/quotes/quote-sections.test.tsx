// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MarginPanel } from "./quote-pricing";
import { TermsCard } from "./quote-itinerary";
import type { VersionDetail } from "./types";

afterEach(cleanup);

const marginVersion = {
  pricing: {
    currency: "USD",
    totalCostMinor: 99_600,
    paymentFeeMinor: 0,
    grossProfitMinor: 24_900,
    grossMarginBp: 2_000,
    markupBp: 2_500,
    categoryTotals: { accommodation: { costMinor: 99_600, sellingMinor: 124_500 } },
  },
  totalCostMinor: 99_600,
  grossProfitMinor: 24_900,
  grossMarginBp: 2_000,
  fx: { source: "single-currency", asOf: "2026-10-28", pivot: "USD" },
} as unknown as VersionDetail;

const termsVersion = {
  terms: {
    inclusions: ["4 nights at Richmond House", "Daily breakfast"],
    exclusions: ["International flights"],
    clientNotes: "We will confirm the rooms once you approve.",
    terms: "Prices are quoted in USD and are subject to availability.",
  },
  internalNotes: "Do not share the supplier net rate.",
} as unknown as VersionDetail;

describe("MarginPanel", () => {
  it("leads with a margin gauge, profit tiles and a cost-versus-selling visual", () => {
    render(<MarginPanel version={marginVersion} currency="USD" />);

    expect(screen.getByRole("img", { name: "Gross margin 20.0%" })).toBeInTheDocument();
    expect(screen.getByText("Cost vs selling")).toBeInTheDocument();
    expect(screen.getByText("Gross profit")).toBeInTheDocument();
    expect(screen.getByText("$249.00")).toBeInTheDocument();
    expect(screen.getByText("Accommodation")).toBeInTheDocument();
  });
});

describe("TermsCard", () => {
  it("separates inclusions, exclusions, client notes and internal-only notes", () => {
    render(<TermsCard version={termsVersion} />);

    expect(screen.getByText("2 inclusions")).toBeInTheDocument();
    expect(screen.getByText("1 exclusion")).toBeInTheDocument();
    expect(screen.getByText("4 nights at Richmond House")).toBeInTheDocument();
    expect(screen.getByText("International flights")).toBeInTheDocument();
    expect(screen.getByText("We will confirm the rooms once you approve.")).toBeInTheDocument();
    expect(screen.getByText("Internal only")).toBeInTheDocument();
  });

  it("reveals the full terms only when asked", () => {
    render(<TermsCard version={termsVersion} />);

    expect(screen.queryByText("Prices are quoted in USD and are subject to availability.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show full terms/i }));
    expect(screen.getByText("Prices are quoted in USD and are subject to availability.")).toBeInTheDocument();
  });
});
