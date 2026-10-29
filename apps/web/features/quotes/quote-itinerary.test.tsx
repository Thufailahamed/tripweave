// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HotelsCard } from "./quote-itinerary";
import type { VersionDetail } from "./types";

const stay = (name: string, imageUrl: string | null) => ({
  destination: "Kandy",
  imageUrl,
  offer: {
    property: { name, category: "boutique" },
    roomType: { name: "Deluxe Double Room with Balcony" },
    mealPlan: "BB",
    stayStart: "2027-03-05",
    stayEnd: "2027-03-09",
    nights: 4,
    cancellation: { refundable: true, freeCancellationUntil: "2027-02-28" },
  },
});

afterEach(cleanup);

describe("HotelsCard", () => {
  it("leads with the best available stay photograph and falls back to a designed placeholder", () => {
    const version = {
      package: {
        selections: [
          stay("Richmond House Kandy", "https://lh3.googleusercontent.com/richmond.jpg"),
          stay("Ravana Range Ella", "/api/v1/media/img_1"),
          stay("de MODA Boutiques Hotel", null),
        ],
      },
    } as unknown as VersionDetail;

    const { container } = render(<HotelsCard version={version} />);

    expect(screen.getByRole("heading", { name: "Where you'll stay" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Richmond House Kandy" })).toHaveAttribute("src", "https://lh3.googleusercontent.com/richmond.jpg");
    expect(screen.getByRole("img", { name: "Ravana Range Ella" })).toHaveAttribute("src", "/api/v1/media/img_1");
    expect(screen.getByRole("img", { name: "de MODA Boutiques Hotel (no photo)" })).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });
});
