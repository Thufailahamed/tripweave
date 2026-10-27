import { describe, expect, it } from "vitest";
import { buildLegs, buildStops, findPlace, findPlacesInText, reorderStops, suggestOvernightPlan, validateItinerary } from "./index";

describe("suggestOvernightPlan", () => {
  it("asks for confirmation when destinations exceed nights", () => {
    const s = suggestOvernightPlan(["Sigiriya", "Kandy", "Nuwara Eliya", "Ella"], 3);
    expect(s.needsConfirmation).toBe(true);
    expect(s.plan.map((p) => p.destination)).toEqual(["Kandy", "Nuwara Eliya", "Ella"]);
    expect(s.dayVisitOnly).toEqual(["Sigiriya"]);
    expect(s.question).toMatch(/Sigiriya/);
  });
  it("distributes spare nights", () => {
    const s = suggestOvernightPlan(["Kandy", "Ella"], 5);
    expect(s.plan.reduce((a, b) => a + b.nights, 0)).toBe(5);
  });
});

describe("stops and validation", () => {
  const plan = [
    { destination: "Sigiriya", nights: 1 },
    { destination: "Kandy", nights: 1 },
    { destination: "Nuwara Eliya", nights: 1 },
    { destination: "Ella", nights: 1 },
  ];
  it("builds contiguous stops with coordinates", () => {
    const stops = buildStops(plan, "2026-12-10");
    expect(stops[0]!.arrivalDate).toBe("2026-12-10");
    expect(stops[3]!.departureDate).toBe("2026-12-14");
    expect(stops.every((s) => s.latitude !== null)).toBe(true);
  });
  it("labels computed legs as estimates", () => {
    const stops = buildStops(plan, "2026-12-10");
    const legs = buildLegs(stops);
    expect(legs).toHaveLength(3);
    expect(legs.every((l) => l.source === "estimated")).toBe(true);
  });
  it("detects date gaps, mismatches and detours", () => {
    const stops = buildStops(plan, "2026-12-10");
    stops[2] = { ...stops[2]!, arrivalDate: "2026-12-13", departureDate: "2026-12-14" };
    const issues = validateItinerary(stops, buildLegs(stops), { tripArrival: "2026-12-10", tripDeparture: "2026-12-14" });
    expect(issues.some((i) => i.code === "date_gap")).toBe(true);
    const messy = buildStops(
      [
        { destination: "Colombo", nights: 1 },
        { destination: "Ella", nights: 1 },
        { destination: "Negombo", nights: 1 },
        { destination: "Nuwara Eliya", nights: 1 },
      ],
      "2026-12-10",
    );
    expect(validateItinerary(messy, buildLegs(messy)).some((i) => i.code === "excessive_detour")).toBe(true);
  });
  it("flags missing coordinates instead of inventing route data", () => {
    const stops = buildStops([{ destination: "Atlantis", nights: 1 }, { destination: "Kandy", nights: 1 }], "2026-12-10");
    const legs = buildLegs(stops);
    expect(legs[0]!.source).toBe("unavailable");
    const issues = validateItinerary(stops, legs);
    expect(issues.some((i) => i.code === "missing_coordinates")).toBe(true);
    expect(issues.some((i) => i.code === "route_unavailable")).toBe(true);
  });
  it("reorders preserving nights and recomputes dates", () => {
    const stops = buildStops(plan, "2026-12-10");
    const re = reorderStops(stops, [stops[3]!.id, stops[0]!.id, stops[1]!.id, stops[2]!.id], "2026-12-10");
    expect(re[0]!.destination).toBe("Ella");
    expect(re[1]!.arrivalDate).toBe("2026-12-11");
  });
});

describe("gazetteer", () => {
  it("finds places in text in order", () => {
    expect(findPlacesInText("We want Kandy then Ella and Sigiriya").map((p) => p.name)).toEqual(["Kandy", "Ella", "Sigiriya"]);
    expect(findPlace("nuwaraeliya")?.name).toBe("Nuwara Eliya");
    expect(findPlacesInText("Kandy, Ella and the south coast").map((p) => p.name)).toEqual(["Kandy", "Ella", "Galle"]);
    expect(findPlace("southern coast")?.name).toBe("Galle");
  });
});
