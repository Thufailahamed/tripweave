import { describe, expect, it } from "vitest";
import { pendingStops } from "../src/services/optimisation";

describe("optimisation fetch checkpoint", () => {
  it("resumes at the first unfinished stop", () => {
    const stops = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(pendingStops(stops, ["a"])).toEqual([{ id: "b" }, { id: "c" }]);
    expect(pendingStops(stops, undefined)).toEqual(stops);
    expect(pendingStops(stops, ["a", "b", "c"])).toEqual([]);
  });
});
