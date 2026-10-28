import { describe, expect, it } from "vitest";
import type { PlanningSnapshot } from "@tripweave/planning-contract";
import type { trips } from "@tripweave/database";
import { buildFallbackProgram, buildPlanningQuestions, validatePlanningProgram } from "./planning";

const baseSnapshot: PlanningSnapshot = {
  generatedAt: "2026-10-28T10:00:00.000Z",
  trip: {
    ref: "trip_1",
    id: "trip_1",
    title: "Test trip",
    description: "",
    status: "planning",
    arrivalDate: null,
    departureDate: null,
    party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
    budgetAmountMinor: null,
    budgetCurrency: "USD",
    budgetScope: "accommodation_only",
    preferredHotelCategory: null,
    preferredMealPlan: null,
    specialRequirements: {},
    parseResult: null,
  },
  itinerary: null,
  packages: [],
  offers: [],
  quotes: [],
  questions: [
    { id: "arrival_date", label: "Arrival date", kind: "date", required: true, currentValue: null },
    { id: "adults", label: "Number of adults", kind: "number", required: true, currentValue: 2, min: 1, max: 60 },
  ],
  missingFields: ["Arrival date", "Number of adults"],
  permissions: { canWriteTrips: true, canRunOptimisation: true, canCreateQuotes: true, canSeeMargins: false, canSeeContracts: false },
  sources: { engine: "rules", model: null, warnings: [], parseEngine: "rules", parsedAt: null },
  allowedActions: ["apply_clarification", "open_packages", "open_itinerary", "open_optimise"],
  allowlist: ["PlanningCanvas", "TripRequirementSummary", "ClarificationForm", "DestinationTimeline", "HotelCard", "HotelComparison", "PackageSummary", "PackageComparison", "CostBreakdown", "RouteSummary", "RecommendationExplanation"],
};

const packageSnapshot: PlanningSnapshot = {
  ...baseSnapshot,
  itinerary: {
    ref: "itinerary_1",
    id: "itinerary_1",
    title: "Hill country",
    summary: "",
    status: "confirmed",
    stops: [{ id: "stop_1", sequence: 1, destination: "Kandy", latitude: null, longitude: null, arrivalDate: "2026-12-10", departureDate: "2026-12-12", nights: 2, activities: [] }],
    legs: [],
    issues: [],
    legSource: "estimated",
    warnings: [],
  },
  packages: [
    {
      ref: "package_1",
      id: "package_1",
      jobId: "job_1",
      parentId: null,
      number: 1,
      objective: "best_value",
      manuallyModified: false,
      feasibility: "feasible",
      createdAt: "2026-10-28T09:00:00.000Z",
      verification: {},
      pricing: { currency: "USD", sellingPriceMinor: 45000, totalPayableMinor: 45000, sellingTaxMinor: 0, warnings: [] },
      package: {
        objective: "best_value",
        selections: [
          {
            stopId: "stop_1",
            destination: "Kandy",
            offer: {
              offerId: "offer_1",
              providerKey: "internal",
              externalOfferReference: "x",
              source: "internal",
              supplierId: null,
              supplierName: "Own",
              property: { id: "property_1", name: "Lakeside", destination: "Kandy", latitude: null, longitude: null, category: "boutique", starRating: null, reviewScore: 9.1, amenities: [], ownerOrganizationId: "org_1" },
              roomType: { id: "room_1", name: "Deluxe", maxOccupancy: 2, maxAdults: 2 },
              stayStart: "2026-12-10",
              stayEnd: "2026-12-12",
              nights: 2,
              mealPlan: "BB",
              roomsRequired: 1,
              occupancy: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
              totalAmountMinor: 30000,
              currency: "USD",
              taxAmountMinor: null,
              feeAmountMinor: null,
              taxesIncluded: null,
              cancellation: { refundable: true },
              payment: { type: "credit" },
              retrievedAt: "2026-10-28T09:00:00.000Z",
              expiresAt: null,
              availabilityStatus: "confirmed",
              verificationStatus: "company_managed",
              isMock: false,
            },
            coverImageId: null,
          },
        ],
        currency: "USD",
        budgetDifferenceMinor: null,
        withinBudget: null,
        objectiveScore: 80,
        score: 80,
        breakdown: { budgetFit: 80, quality: 80, location: 80, amenities: 80, cancellation: 80, preference: 80, value: 80 },
        travel: { legs: [], totalDriveMinutes: null, anyEstimated: false, anyUnavailable: false },
        assumptions: [],
        unverified: [],
        explanation: ["A well-located boutique stay."],
      },
    },
  ],
  offers: [
    {
      ref: "offer_1",
      offerId: "offer_1",
      packageIds: ["package_1"],
      stopId: "stop_1",
      destination: "Kandy",
      coverImageId: null,
      offer: {
        offerId: "offer_1",
        providerKey: "internal",
        externalOfferReference: "x",
        source: "internal",
        supplierId: null,
        supplierName: "Own",
        property: { id: "property_1", name: "Lakeside", destination: "Kandy", latitude: null, longitude: null, category: "boutique", starRating: null, reviewScore: 9.1, amenities: [], ownerOrganizationId: "org_1" },
        roomType: { id: "room_1", name: "Deluxe", maxOccupancy: 2, maxAdults: 2 },
        stayStart: "2026-12-10",
        stayEnd: "2026-12-12",
        nights: 2,
        mealPlan: "BB",
        roomsRequired: 1,
        occupancy: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
        totalAmountMinor: 30000,
        currency: "USD",
        taxAmountMinor: null,
        feeAmountMinor: null,
        taxesIncluded: null,
        cancellation: { refundable: true },
        payment: { type: "credit" },
        retrievedAt: "2026-10-28T09:00:00.000Z",
        expiresAt: null,
        availabilityStatus: "confirmed",
        verificationStatus: "company_managed",
        isMock: false,
      },
    },
  ],
  quotes: [{ ref: "quote_1", id: "quote_1", quoteNumber: "Q-1", status: "draft", currentVersion: 1, sellingPriceMinor: 45000, currency: "USD" }],
  allowedActions: ["apply_clarification", "open_packages", "open_itinerary", "open_optimise", "open_quote"],
};

describe("planning validation", () => {
  it("accepts the deterministic fallback with and without packages", () => {
    for (const snapshot of [baseSnapshot, packageSnapshot]) {
      const program = buildFallbackProgram(snapshot);
      expect(validatePlanningProgram(program, snapshot), program).toEqual({ ok: true });
    }
  });

  it("accepts a valid generated program", () => {
    const program = `root = PlanningCanvas("Trip", [summary], "Server data only.")\nsummary = TripRequirementSummary("trip_1")`;
    expect(validatePlanningProgram(program, baseSnapshot)).toEqual({ ok: true });
  });

  it("rejects unknown components, tool calls, unknown IDs, cross-trip IDs and empty canvases", () => {
    expect(validatePlanningProgram(`root = Evil("x")`, baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("Trip", [q])\nq = Query("list_trips", {})`, baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("Trip", [summary])\nsummary = TripRequirementSummary("trip_other")`, baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("Trip", [pkg])\npkg = PackageSummary("package_other")`, packageSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("Trip", [])`, baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("Trip", [hotel])\nhotel = HotelCard("offer_other")`, packageSnapshot)).toMatchObject({ ok: false });
  });

  it("rejects malformed output, control characters and model-written prices or URLs", () => {
    expect(validatePlanningProgram("not a program", baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("Bad\u0000", [summary])\nsummary = TripRequirementSummary("trip_1")`, baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("From $999", [summary])\nsummary = TripRequirementSummary("trip_1")`, baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("Trip", [summary], "See https://evil.example")\nsummary = TripRequirementSummary("trip_1")`, baseSnapshot)).toMatchObject({ ok: false });
  });

  it("accepts general travel guides that do not depend on the saved trip", () => {
    const program = `root = PlanningCanvas("Three days in the hill country", [intro, places, day, tips, facts, note, table, next], "Ideas to adapt, not bookings.")
intro = Lead("Ella suits slow mornings and short walks.")
places = PlaceGallery("Where to go", ["Ella, Sri Lanka", "Nuwara Eliya, Sri Lanka"])
day = DayPlan("Day 1", "Ridge walk", ["Early walk", "Afternoon at a tea estate"])
tips = TipList("Pack", ["Light layers"])
facts = KeyFacts("Quick facts", ["Best season: December to March"])
note = Callout("caution", "Check entry rules", "Confirm with the official travel advice.")
table = ComparisonTable("Regions", ["Hill country", "Coast"], [["Weather", "Cooler", "Warm"]])
next = FollowUps("Keep going", ["Where should I stay in Ella?"])`;
    expect(validatePlanningProgram(program, baseSnapshot)).toEqual({ ok: true });
  });

  it("rejects travel-guide blocks with links, prices, unknown tones, bounds breaches or misaligned table rows", () => {
    const wrap = (block: string) => `root = PlanningCanvas("Guide", [block])\nblock = ${block}`;
    expect(validatePlanningProgram(wrap(`PlaceCard("https://evil.example/photo.jpg")`), baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(wrap(`DayPlan("Day 1", "Walk", ["Taxi costs 40 USD"])`), baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(wrap(`Callout("alarm", "Warning", "Text")`), baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(wrap(`ComparisonTable("Regions", ["A", "B"], [["Weather", "Only one"]])`), baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(wrap(`TipList("Pack", [])`), baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(wrap(`Lead("${"x".repeat(601)}")`), baseSnapshot)).toMatchObject({ ok: false });
  });

  it("checks that TripHero and TripMap only reference the snapshot's trip and itinerary", () => {
    expect(validatePlanningProgram(`root = PlanningCanvas("Trip", [hero])\nhero = TripHero("trip_other")`, baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("Trip", [map])\nmap = TripMap("itinerary_1")`, baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("Trip", [hero])\nhero = TripHero("trip_1")`, baseSnapshot)).toEqual({ ok: true });
  });

  it("accepts short generation refs that differ from database IDs", () => {
    const refSnapshot: PlanningSnapshot = {
      ...packageSnapshot,
      trip: { ...packageSnapshot.trip, ref: "trip" },
      itinerary: packageSnapshot.itinerary ? { ...packageSnapshot.itinerary, ref: "itinerary" } : null,
      packages: packageSnapshot.packages.map((pkg) => ({ ...pkg, ref: "pkg_1" })),
      offers: packageSnapshot.offers.map((offer) => ({ ...offer, ref: "offer_1" })),
      quotes: packageSnapshot.quotes.map((quote) => ({ ...quote, ref: "quote_1" })),
    };
    const program = `root = PlanningCanvas("Packages", [req, timeline, pkg, hotel, route, cost, why])\nreq = TripRequirementSummary("trip")\ntimeline = DestinationTimeline("itinerary")\npkg = PackageSummary("pkg_1")\nhotel = HotelCard("offer_1", "pkg_1")\nroute = RouteSummary("itinerary", "pkg_1")\ncost = CostBreakdown("pkg_1")\nwhy = RecommendationExplanation("pkg_1")`;
    expect(validatePlanningProgram(program, refSnapshot)).toEqual({ ok: true });
    expect(validatePlanningProgram(`root = PlanningCanvas("x", [p])\np = PackageSummary("pkg_2")`, refSnapshot)).toMatchObject({ ok: false });
    expect(buildFallbackProgram(refSnapshot)).toContain('TripRequirementSummary("trip")');
    expect(validatePlanningProgram(buildFallbackProgram(refSnapshot), refSnapshot)).toEqual({ ok: true });
  });

  it("accepts a package comparison only for packages in the snapshot", () => {
    const program = `root = PlanningCanvas("Packages", [pkg, hotel, route, cost, why])\npkg = PackageComparison(["package_1"])\nhotel = HotelCard("offer_1", "package_1")\nroute = RouteSummary(null, "package_1")\ncost = CostBreakdown("package_1")\nwhy = RecommendationExplanation("package_1")`;
    expect(validatePlanningProgram(program, packageSnapshot)).toEqual({ ok: true });
  });
});

describe("planning questions", () => {
  const trip = (overrides: Partial<trips.TripRecord> = {}): trips.TripRecord => ({
    id: "trip_1",
    organizationId: "org_1",
    customerId: null,
    title: "Trip",
    description: "",
    arrivalDate: null,
    departureDate: null,
    party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
    budgetAmountMinor: null,
    budgetCurrency: "USD",
    budgetScope: "accommodation_only",
    preferredHotelCategory: null,
    preferredMealPlan: null,
    specialRequirements: {},
    parseResult: null,
    status: "new",
    createdBy: null,
    createdAt: "2026-10-28T09:00:00.000Z",
    updatedAt: "2026-10-28T09:00:00.000Z",
    ...overrides,
  });

  it("asks for dates and budget when the trip does not have them", () => {
    expect(buildPlanningQuestions(trip(), null).map((q) => q.id)).toEqual(["arrival_date", "departure_date", "budget_amount"]);
  });

  it("derives party and plan questions without trusting model text", () => {
    const result = buildPlanningQuestions(
      trip({
        arrivalDate: "2026-12-10",
        departureDate: "2026-12-12",
        budgetAmountMinor: 45000,
        party: { adults: 2, children: 2, childAges: [8], rooms: [{ adults: 1, children: 1, childAges: [8] }, { adults: 1, children: 1 }] },
        parseResult: {
          parsed: {
            arrivalDate: "2026-12-10",
            departureDate: "2026-12-12",
            nights: 2,
            durationDays: 3,
            destinations: ["Kandy"],
            overnightStops: [],
            activities: [],
            adults: 2,
            children: 2,
            childAges: [8],
            roomCount: null,
            budgetAmount: 450,
            budgetCurrency: "USD",
            budgetScope: null,
            preferredHotelCategory: null,
            mealPlans: [],
            requiredAmenities: [],
            preferredAmenities: [],
            accessibility: [],
            maxLegDurationMinutes: null,
            cancellationPreference: null,
            otherRequirements: [],
            clarifyingQuestions: [],
          },
          suggestedItinerary: { plan: [{ destination: "Kandy", nights: 2 }], dayVisitOnly: [], needsConfirmation: true, question: "Use this plan?" },
        },
      }),
      null,
    );
    expect(result.map((q) => q.id)).toEqual(expect.arrayContaining(["child_ages", "budget_scope", "confirm_suggested_plan"]));
  });
});
