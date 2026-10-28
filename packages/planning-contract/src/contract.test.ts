import { describe, expect, it } from "vitest";
import {
  PLANNING_ACTIONS,
  PLANNING_COMPONENT_NAMES,
  clarificationSubmissionSchema,
  getPlanningJSONSchema,
  getPlanningLibrary,
  getPlanningLibrarySpec,
  planningActions,
} from "./index";

describe("planning contract", () => {
  it("publishes exactly the reviewed component allowlist", () => {
    expect([...PLANNING_COMPONENT_NAMES]).toEqual([
      "PlanningCanvas",
      "TripHero",
      "TripRequirementSummary",
      "ClarificationForm",
      "DestinationTimeline",
      "TripMap",
      "HotelCard",
      "HotelComparison",
      "PackageSummary",
      "PackageComparison",
      "BudgetMeter",
      "CostBreakdown",
      "RouteSummary",
      "RecommendationExplanation",
      "QuickActions",
      "Lead",
      "PlaceMap",
      "PlaceCard",
      "PlaceGallery",
      "DayPlan",
      "TipList",
      "KeyFacts",
      "Callout",
      "ComparisonTable",
      "FollowUps",
    ]);
    expect(Object.keys(getPlanningJSONSchema().properties ?? {}).sort()).toEqual([...PLANNING_COMPONENT_NAMES].sort());
  });

  it("keeps every component prop free of actions and URLs", () => {
    for (const [name, definition] of Object.entries(getPlanningJSONSchema().$defs ?? {})) {
      const propNames = Object.keys(definition.properties ?? {});
      expect(propNames, name).not.toContain("action");
      expect(propNames, name).not.toContain("url");
      expect(propNames, name).not.toContain("href");
      expect(propNames, name).not.toContain("onClick");
    }
  });

  it("keeps host actions finite and out of the model-facing library", () => {
    expect([...PLANNING_ACTIONS]).toEqual(["apply_clarification", "open_packages", "open_itinerary", "open_optimise", "open_quote"]);
    expect(planningActions.map((action) => action.name)).toEqual([...PLANNING_ACTIONS]);
    const spec = getPlanningLibrarySpec() as { actions?: Record<string, unknown> };
    expect(spec.actions).toBeUndefined();
    const prompt = getPlanningLibrary().prompt({ toolCalls: false, bindings: false, builtinFunctions: false });
    expect(prompt).not.toMatch(/\bQuery\(/);
    expect(prompt).not.toMatch(/\bMutation\(/);
    expect(prompt).not.toMatch(/\bOpenUrl\b/);
    expect(prompt).toContain("PlanningCanvas");
  });

  it("validates clarification submissions and rejects unknown, duplicate or control-character answers", () => {
    expect(clarificationSubmissionSchema.safeParse({ answers: [{ questionId: "adults", value: 2 }] }).success).toBe(true);
    expect(clarificationSubmissionSchema.safeParse({ answers: [{ questionId: "nope", value: 2 }] }).success).toBe(false);
    expect(clarificationSubmissionSchema.safeParse({ answers: [{ questionId: "adults", value: 2 }, { questionId: "adults", value: 3 }] }).success).toBe(false);
    expect(clarificationSubmissionSchema.safeParse({ answers: [{ questionId: "adults", value: "2\u0000" }] }).success).toBe(false);
    expect(clarificationSubmissionSchema.safeParse({ answers: [] }).success).toBe(false);
    expect(clarificationSubmissionSchema.safeParse({ answers: Array.from({ length: 21 }, () => ({ questionId: "adults", value: 2 })) }).success).toBe(false);
  });
});
