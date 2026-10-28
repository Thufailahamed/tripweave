import { describe, expect, it } from "vitest";
import type { TravelerBudgetItem, TravelerPackingItem } from "@tripweave/shared";
import { allocateTravelerRooms, budgetTotals, daysUntil, packingProgress, travelerTripPayload, tripDestination } from "./lib";

const budgetItem = (over: Partial<TravelerBudgetItem>): TravelerBudgetItem => ({
  id: "b1",
  label: "Train",
  category: "transport",
  amountMinor: 1_000,
  currency: "USD",
  isPaid: false,
  sortOrder: 1,
  createdAt: "2026-10-28T00:00:00.000Z",
  updatedAt: "2026-10-28T00:00:00.000Z",
  ...over,
});

const packingItem = (over: Partial<TravelerPackingItem>): TravelerPackingItem => ({
  id: "p1",
  label: "Passport",
  category: "documents",
  isChecked: false,
  sortOrder: 1,
  createdAt: "2026-10-28T00:00:00.000Z",
  updatedAt: "2026-10-28T00:00:00.000Z",
  ...over,
});

describe("tripDestination", () => {
  it("prefers the parsed destination, then the first itinerary stop, then the title", () => {
    expect(tripDestination({ title: "A trip", parseResult: { parsed: { destinations: ["Kandy"] } }, itinerary: { stops: [{ destination: "Ella" }] } })).toBe("Kandy");
    expect(tripDestination({ title: "A trip", parseResult: null, itinerary: { stops: [{ destination: "Ella" }] } })).toBe("Ella");
    expect(tripDestination({ title: "A trip", parseResult: null, itinerary: null })).toBe("A trip");
  });
});

describe("daysUntil", () => {
  it("counts calendar days and returns null for an invalid date", () => {
    expect(daysUntil("2026-11-10", new Date("2026-10-28T15:00:00Z"))).toBe(13);
    expect(daysUntil("2026-10-28", new Date("2026-10-28T23:00:00Z"))).toBe(0);
    expect(daysUntil("2026-10-01", new Date("2026-10-28T00:00:00Z"))).toBe(-27);
    expect(daysUntil("nonsense")).toBeNull();
  });
});

describe("budgetTotals", () => {
  it("sums only the trip currency and reports mixed currencies", () => {
    const items = [budgetItem({ amountMinor: 1_500, isPaid: true }), budgetItem({ id: "b2", amountMinor: 900 }), budgetItem({ id: "b3", amountMinor: 5_000, currency: "EUR" })];
    expect(budgetTotals(items, "USD", 10_000)).toEqual({ totalMinor: 2_400, paidMinor: 1_500, unpaidMinor: 900, remainingMinor: 7_600, mixedCurrency: true });
  });

  it("returns a null remaining when no trip budget is set", () => {
    expect(budgetTotals([budgetItem({ amountMinor: 2_000 })], "USD").remainingMinor).toBeNull();
  });
});

describe("packingProgress", () => {
  it("counts checked items and clamps the percentage", () => {
    const items = [packingItem({ isChecked: true }), packingItem({ id: "p2" }), packingItem({ id: "p3", isChecked: true })];
    expect(packingProgress(items)).toEqual({ checked: 2, total: 3, percent: 67 });
    expect(packingProgress([])).toEqual({ checked: 0, total: 0, percent: 0 });
  });
});

describe("allocateTravelerRooms", () => {
  it("puts two adults in a room and attaches children to the first room", () => {
    expect(allocateTravelerRooms(2, 1, [7])).toEqual([{ adults: 2, children: 1, childAges: [7] }]);
    expect(allocateTravelerRooms(5, 0, [])).toEqual([
      { adults: 2, children: 0, childAges: [] },
      { adults: 2, children: 0, childAges: [] },
      { adults: 1, children: 0, childAges: [] },
    ]);
  });
});

describe("travelerTripPayload", () => {
  it("creates a whole-trip budget, room allocation and readable preferences", () => {
    const payload = travelerTripPayload({
      title: "Hill country",
      idea: "Tea, trains and a little coast.",
      arrivalDate: "2026-12-10",
      departureDate: "2026-12-14",
      adults: 2,
      children: 1,
      childAges: [8],
      budgetMinor: 180_000,
      budgetCurrency: "USD",
      category: "boutique",
      pace: "slow",
      interests: ["tea", "trains"],
    });
    expect(payload.title).toBe("Hill country");
    expect(payload.budgetScope).toBe("all_inclusive_trip");
    expect(payload.party.rooms).toEqual([{ adults: 2, children: 1, childAges: [8] }]);
    expect(payload.specialRequirements?.other).toContain("tea, trains");
    expect(payload.specialRequirements?.other).toContain("Slow and savoured");
    expect(payload.preferredHotelCategory).toBe("boutique");
  });
});
