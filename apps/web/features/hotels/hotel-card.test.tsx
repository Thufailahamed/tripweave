// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HotelCard } from "./hotel-card";
import type { Property } from "./types";

const base: Property = {
  id: "hotel_1",
  ownerOrganizationId: null,
  source: "provider",
  name: "127",
  slug: "127",
  description: "",
  country: "LK",
  region: null,
  city: "Galle",
  address: null,
  latitude: null,
  longitude: null,
  category: "standard",
  starClassification: null,
  reviewScore: null,
  reviewSource: null,
  preferredPartner: false,
  amenities: [],
  checkInTime: "14:00",
  checkOutTime: "11:00",
  contact: {},
  status: "active",
  createdAt: "2026-10-28T09:00:00.000Z",
  updatedAt: "2026-10-28T09:00:00.000Z",
  access: "provider",
  coverImageId: null,
};

afterEach(cleanup);

describe("HotelCard", () => {
  it("renders a provider listing with a designed no-photo placeholder", () => {
    render(<HotelCard hotel={base} />);

    expect(screen.getByRole("heading", { name: "127" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "127" })).toHaveAttribute("href", "/hotels/hotel_1");
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("Galle")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("No photo")).toBeInTheDocument();
    expect(screen.getByText("Imported listing")).toBeInTheDocument();
    expect(screen.getByText("No amenities listed")).toBeInTheDocument();
    expect(screen.getByText("View property")).toBeInTheDocument();
  });

  it("shows the cover photograph instead of the placeholder", () => {
    const { container } = render(<HotelCard hotel={{ ...base, name: "Lakeside", coverImageId: "img_1", access: "owner", source: "manual" }} />);

    expect(screen.queryByText("No photo")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/v1/media/img_1");
    expect(screen.getByText("Owned")).toBeInTheDocument();
    expect(screen.queryByText("Imported listing")).not.toBeInTheDocument();
  });

  it("marks preferred properties and shows the star classification", () => {
    render(<HotelCard hotel={{ ...base, preferredPartner: true, starClassification: 4, reviewScore: 8.6, amenities: ["wifi", "parking"] }} />);

    expect(screen.getByText("Preferred")).toBeInTheDocument();
    expect(screen.getByText("4-star")).toBeInTheDocument();
    expect(screen.getByText("8.6")).toBeInTheDocument();
    expect(screen.getByText("wifi")).toBeInTheDocument();
    expect(screen.getByText("parking")).toBeInTheDocument();
  });
});
