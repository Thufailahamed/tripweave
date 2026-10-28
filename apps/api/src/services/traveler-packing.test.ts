import { describe, expect, it } from "vitest";
import { suggestPackingItems } from "./traveler-packing";

describe("suggestPackingItems", () => {
  it("adds activity-aware items without duplicates", () => {
    const items = suggestPackingItems({
      arrivalDate: "2026-12-10",
      departureDate: "2026-12-20",
      destinations: ["Ella", "Mirissa"],
      activities: ["hike to Little Adam's Peak", "beach day", "temple visit"],
    });
    const labels = items.map((i) => i.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("walking shoes");
    expect(labels).toContain("swimwear");
    expect(labels).toContain("modest clothing");
    expect(labels).toContain("laundry bag");
  });

  it("always includes the essentials and omits long-trip extras on a short trip", () => {
    const items = suggestPackingItems({ arrivalDate: "2026-12-10", departureDate: "2026-12-12", destinations: [], activities: [] });
    const labels = items.map((i) => i.label.toLowerCase());
    expect(labels).toContain("passport / id");
    expect(labels).toContain("medication");
    expect(labels).toContain("phone charger");
    expect(labels).toContain("reusable water bottle");
    expect(labels).not.toContain("laundry bag");
  });
});
