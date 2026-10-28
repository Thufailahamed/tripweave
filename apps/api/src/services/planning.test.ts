import { describe, expect, it } from "vitest";
import type { PlanningSnapshot } from "@tripweave/planning-contract";
import type { trips } from "@tripweave/database";
import { PLANNING_EXAMPLES } from "@tripweave/ai";
import { buildFallbackProgram, buildPlanningQuestions, normalisePlanningProgram, validatePlanningProgram } from "./planning";

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

  it("accepts PlaceMap with two to twelve places and enforces a map when the question requires one", () => {
    const map = `root = PlanningCanvas("Route", [map])\nmap = PlaceMap("Area", ["Ella, Sri Lanka", "Kandy, Sri Lanka"])`;
    expect(validatePlanningProgram(map, baseSnapshot)).toEqual({ ok: true });
    expect(validatePlanningProgram(`root = PlanningCanvas("Route", [map])\nmap = PlaceMap("Area", ["Ella, Sri Lanka"])`, baseSnapshot)).toMatchObject({ ok: false });
    expect(validatePlanningProgram(`root = PlanningCanvas("Route", [map])\nmap = PlaceMap("Area", ["Ella, https://evil.example", "Kandy"])`, baseSnapshot)).toMatchObject({ ok: false });
    const lead = `root = PlanningCanvas("Route", [lead])\nlead = Lead("Ella is a hill town.")`;
    expect(validatePlanningProgram(lead, baseSnapshot)).toEqual({ ok: true });
    expect(validatePlanningProgram(lead, baseSnapshot, { requireMap: true })).toMatchObject({ ok: false, errors: [expect.stringMatching(/PlaceMap/)] });
    expect(validatePlanningProgram(map, baseSnapshot, { requireMap: true })).toEqual({ ok: true });
  });

  it("accepts route stops made of RouteStop blocks and header chips as the fourth argument", () => {
    const route = `root = PlanningCanvas("Route", [stops], "Estimates.", ["Walking", "Hill country"])
kandy = RouteStop("Kandy, Sri Lanka", "9:00 AM", "60 min", "Start at the lake.")
ella = RouteStop("Ella, Sri Lanka")
stops = RouteStops("Your route", [kandy, ella])`;
    expect(validatePlanningProgram(route, baseSnapshot)).toEqual({ ok: true });
  });

  it("accepts a route note and tolerates an extra argument the parser drops", () => {
    const withNote = `root = PlanningCanvas("Route", [stops])\nkandy = RouteStop("Kandy, Sri Lanka")\nella = RouteStop("Ella, Sri Lanka")\nstops = RouteStops("Kandy to Ella", [kandy, ella], "Through the tea country")`;
    expect(validatePlanningProgram(withNote, baseSnapshot)).toEqual({ ok: true });
    const extra = `root = PlanningCanvas("Tips", [tips])\ntips = TipList("Pack", ["Layers"], "an argument TipList does not take")`;
    expect(validatePlanningProgram(extra, baseSnapshot)).toEqual({ ok: true });
    const extraWithUrl = `root = PlanningCanvas("Tips", [tips])\ntips = TipList("Pack", ["Layers"], "https://evil.example")`;
    expect(validatePlanningProgram(extraWithUrl, baseSnapshot)).toEqual({ ok: true });
  });

  it("rejects route stops that hold other blocks, URL-bearing stops and more than five chips", () => {
    const withLead = `root = PlanningCanvas("Route", [stops])\nkandy = RouteStop("Kandy, Sri Lanka")\nlead = Lead("Hello.")\nstops = RouteStops("Your route", [kandy, lead])`;
    expect(validatePlanningProgram(withLead, baseSnapshot)).toMatchObject({ ok: false });
    const withUrl = `root = PlanningCanvas("Route", [stops])\nkandy = RouteStop("https://evil.example/kandy")\nella = RouteStop("Ella, Sri Lanka")\nstops = RouteStops("Your route", [kandy, ella])`;
    expect(validatePlanningProgram(withUrl, baseSnapshot)).toMatchObject({ ok: false });
    const manyChips = `root = PlanningCanvas("Route", [lead], "Estimates.", ["a", "b", "c", "d", "e", "f"])\nlead = Lead("Hello.")`;
    expect(validatePlanningProgram(manyChips, baseSnapshot)).toMatchObject({ ok: false });
  });

  it("accepts every travel example the prompt teaches", () => {
    const travelExamples = PLANNING_EXAMPLES.filter((example) => !example.includes("_FROM_CONTEXT"));
    expect(travelExamples.length).toBeGreaterThanOrEqual(4);
    for (const example of travelExamples) expect(validatePlanningProgram(example, baseSnapshot), example.slice(0, 60)).toEqual({ ok: true });
  });

  it("accepts photo boards and choices with a handwritten note and highlight on the canvas", () => {
    const program = `root = PlanningCanvas("Four days in Kandy", [sights, board, food, when], "Slow days by the lake.", ["4 days"], "walk early, wander late", "Kandy")
sights = Highlights("Do not miss", [h1, h2])
h1 = Highlight("Temple of the Tooth, Kandy", "Lakeside", "The relic temple at dusk.")
h2 = Highlight("Royal Botanic Gardens, Peradeniya")
board = DayBoard("Four days", [d1], "easy pace")
d1 = BoardDay("Day 1", ["Kandy Lake, Sri Lanka", "Temple of the Tooth, Kandy"], "Lake and temple")
food = LocalFlavours("Taste of Kandy", ["Kottu roti", "Hoppers"])
when = Choices("When would you like to go?", [c1, c2], "Pick your own dates")
c1 = Choice("Perahera season", "August", "the great procession", "Plan it for the August festival.")
c2 = Choice("Dry months", "January to April")`;
    expect(validatePlanningProgram(program, baseSnapshot)).toEqual({ ok: true });
  });

  it("rejects photo boards that hold the wrong child blocks and choices with prices", () => {
    const wrongChild = `root = PlanningCanvas("Sights", [sights])
h1 = Highlight("Kandy, Sri Lanka")
lead = Lead("Hello.")
sights = Highlights("Do not miss", [h1, lead])`;
    expect(validatePlanningProgram(wrongChild, baseSnapshot)).toMatchObject({ ok: false });
    const dayInChoices = `root = PlanningCanvas("When", [when])
d1 = BoardDay("Day 1", ["Kandy, Sri Lanka"])
c1 = Choice("Soon")
when = Choices("When?", [c1, d1])`;
    expect(validatePlanningProgram(dayInChoices, baseSnapshot)).toMatchObject({ ok: false });
    const priced = `root = PlanningCanvas("When", [when])
c1 = Choice("Cheap", "$200 a night")
c2 = Choice("Luxury")
when = Choices("Which style?", [c1, c2])`;
    expect(validatePlanningProgram(priced, baseSnapshot)).toMatchObject({ ok: false });
  });

  it("includes the saved itinerary on the map in the fallback when an itinerary exists", () => {
    const fallback = buildFallbackProgram(packageSnapshot);
    expect(fallback).toContain("TripMap(");
    expect(validatePlanningProgram(fallback, packageSnapshot)).toEqual({ ok: true });
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

describe("planning program normalisation", () => {
  // A real reply from a small model: a good page whose canvas call left out the blocks list.
  const slipped = `root = PlanningCanvas("Sun, sand and surf in Sri Lanka", "Ten days of coastal bliss.", ["10 days", "December", "Beachside"], "warm waves, salty air", "Sri Lanka")
requirements = TripRequirementSummary("trip_1")
sights = Highlights("Coastal must-sees", [s1, s2])
s1 = Highlight("Mirissa, Sri Lanka", "South Coast", "Whale watching and golden beaches.")
s2 = Highlight("Bentota, Sri Lanka", "South-West Coast", "Water sports and riverside calm.")
next = FollowUps("What's next?", ["Which coast is best in December?"])

# The requirements block shows what we know.`;

  it("rebuilds a canvas call that dropped its blocks list, keeping every other argument in order", () => {
    expect(validatePlanningProgram(slipped, baseSnapshot)).toMatchObject({ ok: false });
    const fixed = normalisePlanningProgram(slipped);
    expect(fixed.split("\n")[0]).toBe(`root = PlanningCanvas("Sun, sand and surf in Sri Lanka", [requirements, sights, next], "Ten days of coastal bliss.", ["10 days", "December", "Beachside"], "warm waves, salty air", "Sri Lanka")`);
    expect(fixed).toContain(`s1 = Highlight("Mirissa, Sri Lanka"`);
    expect(validatePlanningProgram(fixed, baseSnapshot)).toEqual({ ok: true });
  });

  it("moves a misplaced blocks list into second place and adds defined blocks the model forgot to list", () => {
    const misplaced = `root = PlanningCanvas("Trip", "Server data only.", [summary])\nsummary = TripRequirementSummary("trip_1")\nnext = FollowUps("Next", ["Show the route"])`;
    expect(normalisePlanningProgram(misplaced).split("\n")[0]).toBe(`root = PlanningCanvas("Trip", [summary, next], "Server data only.")`);
    const forgotten = `root = PlanningCanvas("Trip", [summary])\nsummary = TripRequirementSummary("trip_1")\nnext = FollowUps("Next", ["Show the route"])`;
    expect(normalisePlanningProgram(forgotten).split("\n")[0]).toBe(`root = PlanningCanvas("Trip", [summary, next])`);
  });

  it("closes a list the model closed with a parenthesis, and closes brackets left open", () => {
    const slip = `root = PlanningCanvas("Coasts", [table])\ntable = ComparisonTable("South-west vs east", ["South-west", "East"], [["Weather", "Dry", "Monsoon"], ["Best for", "Surfing", "Quiet retreats (off-season)")])`;
    expect(validatePlanningProgram(slip, baseSnapshot)).toMatchObject({ ok: false });
    const fixed = normalisePlanningProgram(slip);
    expect(fixed).toContain(`["Best for", "Surfing", "Quiet retreats (off-season)"]])`);
    expect(validatePlanningProgram(fixed, baseSnapshot)).toEqual({ ok: true });
    expect(normalisePlanningProgram(`root = PlanningCanvas("Trip", [summary]\nsummary = TripRequirementSummary("trip_1"`)).toBe(`root = PlanningCanvas("Trip", [summary])\nsummary = TripRequirementSummary("trip_1")`);
  });

  it("leaves well-formed, rootless and child-only programs alone", () => {
    const valid = `root = PlanningCanvas("Trip", [summary], "Server data only.")\nsummary = TripRequirementSummary("trip_1")`;
    expect(normalisePlanningProgram(valid)).toBe(valid);
    expect(normalisePlanningProgram(`summary = TripRequirementSummary("trip_1")`)).toBe(`summary = TripRequirementSummary("trip_1")`);
    const loose = `root = PlanningCanvas("Trip", "Only a stray highlight.")\ns1 = Highlight("Ella, Sri Lanka", "Hill country", "Tea.")`;
    expect(normalisePlanningProgram(loose)).toBe(loose);
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
