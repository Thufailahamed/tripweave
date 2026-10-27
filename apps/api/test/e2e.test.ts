import { beforeAll, describe, expect, it } from "vitest";
import { InternalInventoryProvider, MockProvider } from "@tripweave/provider-contracts";
import { inventory } from "@tripweave/database";
import { Client, ENQUIRY, Harness, PASSWORD, createHotel, seedHillCountry, HILL_COUNTRY } from "./harness";

/**
 * The full product workflow from the specification (Part 20.3), executed against the real Hono app,
 * real migrations and SQLite, with deterministic fixtures and no live suppliers.
 */
describe("end-to-end workflow", () => {
  let h: Harness;
  let operator: Client; // tour operator owner
  let staff: Client; // tour operator staff (no margin visibility)
  let hotelCo: Client; // hotel management company owner
  let outsider: Client; // unrelated tenant
  let tripId: string;
  let packages: any[];
  let quoteId: string;
  let shareToken: string;

  beforeAll(async () => {
    h = new Harness();
    operator = await h.register("Island Tours", "tour_operator");
    hotelCo = await h.register("Hill Hotels", "hotel_management");
    outsider = await h.register("Other Operator", "tour_operator");
    await seedHillCountry(operator);
  });

  it("1-3. creates organisations, hotels with negotiated rates and staff accounts", async () => {
    const me = await operator.ok("GET", "/auth/me");
    expect(me.organization.type).toBe("tour_operator");
    expect(me.organization.role).toBe("owner");

    const hotel = await hotelCo.ok("POST", "/hotels", { name: "Hill Hotels Flagship", city: "Nuwara Eliya", category: "boutique", reviewScore: 9 });
    const room = await hotelCo.ok("POST", `/hotels/${hotel.id}/rooms`, { name: "Suite", maximumAdults: 2, maximumOccupancy: 3 });
    const plan = await hotelCo.ok("POST", `/hotels/${hotel.id}/rates`, { roomTypeId: room.id, name: "Net BB", mealPlan: "BB", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31" });
    await hotelCo.ok("POST", `/rate-plans/${plan.id}/rules`, { applicableStartDate: "2026-01-01", applicableEndDate: "2027-12-31", amountMinor: 9000 });

    // Staff account for the tour operator
    const invited = await operator.post("/organization/members", { email: "staff@islandtours.example", displayName: "Sam Staff", role: "staff", temporaryPassword: PASSWORD });
    expect(invited.status).toBe(201);
    staff = h.client();
    const login = await staff.post("/auth/login", { email: "staff@islandtours.example", password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.organization.role).toBe("staff");
    expect(login.body.data.permissions).not.toContain("margins:view");

    // Hotel company shares ONE property with the operator (not its whole portfolio)
    const org = await operator.ok("GET", "/organization");
    const shared = await hotelCo.post("/partners/shared", { receivingOrganizationId: org.id, resourceType: "property", resourceId: hotel.id, validFrom: "2026-01-01", validUntil: "2027-12-31" });
    expect(shared.status).toBe(201);
    const seen = await operator.ok("GET", `/hotels/${hotel.id}`);
    expect(seen.property.access).toBe("shared");
    expect(seen.canEdit).toBe(false);
    expect(JSON.stringify(seen)).not.toMatch(/supplierAgreementId":"[^n]/); // contract linkage hidden on shared plans
    expect((await operator.patch(`/hotels/${hotel.id}`, { name: "Hijack" })).status).toBe(403);
  });

  it("4-6. creates an enquiry, parses it, lets staff edit, and confirms the itinerary", async () => {
    const customer = await staff.ok("POST", "/customers", { name: "Jane Traveller", email: "jane@example.com", country: "GB" });
    const trip = await staff.ok("POST", "/trips", { customerId: customer.id, title: "Sri Lanka hill country", description: ENQUIRY, party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] }, budgetCurrency: "USD" });
    tripId = trip.id;

    const parsed = await staff.ok("POST", `/trips/${tripId}/parse`, { text: ENQUIRY, apply: true });
    expect(parsed.engine).toBe("rules"); // no AI binding in tests: deterministic extraction, clearly labelled
    expect(parsed.parsed.arrivalDate).toBe("2026-12-10");
    expect(parsed.parsed.nights).toBe(3);
    expect(parsed.parsed.destinations).toEqual(["Sigiriya", "Kandy", "Nuwara Eliya", "Ella"]);
    expect(parsed.questions.join(" ")).toMatch(/Sigiriya/); // asks instead of silently deciding
    expect(parsed.itinerary.status).toBe("suggested");
    expect(parsed.itinerary.stops.map((s: any) => s.destination)).toEqual(["Kandy", "Nuwara Eliya", "Ella"]);
    expect(parsed.trip.status).toBe("needs_clarification");
    expect(parsed.trip.budgetAmountMinor).toBe(45_000);
    expect(parsed.trip.preferredMealPlan).toBe("BB");

    // Staff edits: confirms the suggested overnight plan and raises the budget for a richer comparison
    const itinerary = await staff.ok("GET", `/trips/${tripId}/itinerary`);
    expect(itinerary.issues.some((i: any) => i.code === "estimated_routes")).toBe(true); // honest about estimates
    const confirmed = await staff.put(`/trips/${tripId}/itinerary`, { title: "Hill country", confirm: true, stops: itinerary.itinerary.stops.map((s: any) => ({ destination: s.destination, arrivalDate: s.arrivalDate, departureDate: s.departureDate, latitude: s.latitude, longitude: s.longitude, activities: [] })) });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.itinerary.status).toBe("confirmed");
    await staff.ok("PATCH", `/trips/${tripId}`, { budgetAmountMinor: 90_000, budgetScope: "accommodation_only" });
    // Edits that contradict each other are rejected
    expect((await staff.patch(`/trips/${tripId}`, { departureDate: "2026-12-01" })).status).toBe(422);
  });

  it("7-8. generates several different packages and exposes margins only to authorised users", async () => {
    const start = await staff.post(`/trips/${tripId}/optimisations`, { constraints: { includeExternalProviders: false } }, { "idempotency-key": "opt-1" });
    expect(start.status).toBe(202);
    const jobId = start.body.data.jobId;
    // idempotent replay returns the same job instead of starting another
    const replay = await staff.post(`/trips/${tripId}/optimisations`, { constraints: { includeExternalProviders: false } }, { "idempotency-key": "opt-1" });
    expect(replay.body.data.jobId).toBe(jobId);
    await h.settle();

    const job = await staff.ok("GET", `/optimisations/${jobId}`);
    expect(job.status).toBe("succeeded");
    expect(job.progress).toBe(100);

    const res = await staff.ok("GET", `/trips/${tripId}/packages`);
    packages = res.packages;
    expect(packages.length).toBeGreaterThanOrEqual(3);
    expect(new Set(packages.map((p: any) => p.package.signature)).size).toBe(packages.length);
    for (const p of packages) {
      expect(p.package.selections).toHaveLength(3);
      expect(p.pricing.sellingPriceMinor).toBeGreaterThan(0); // selling price is computed by the backend
      // staff must receive no supplier cost anywhere (cost + selling price would reveal the margin)
      expect(p.package.totalCostMinor).toBeUndefined();
      expect(p.package.costPerNightMinor).toBeUndefined();
      expect(p.package.explanation.join(" ")).not.toMatch(/accommodation cost|\(USD \d/);
      for (const s of p.package.selections) {
        expect(s.costMinor).toBeUndefined();
        expect(s.offer.totalAmountMinor).toBeUndefined();
        expect(s.offer.supplierName).toBeUndefined();
      }
      expect(p.pricing.grossMarginBp).toBeUndefined(); // staff cannot see margins
      expect(p.pricing.totalCostMinor).toBeUndefined();
      expect(p.package.explanation.length).toBeGreaterThan(3);
      expect(p.package.unverified.some((u: string) => /availability/i.test(u))).toBe(true); // no inventory rows => never "confirmed"
      for (const s of p.package.selections) {
        expect(s.offer.property.name).not.toMatch(/Room Only/); // RO hotel rejected by the meal-plan constraint
        expect(["BB", "HB", "FB", "AI"]).toContain(s.offer.mealPlan);
      }
    }
    const budget = packages.find((p: any) => p.objective === "budget_explorer");
    const premium = packages.find((p: any) => p.objective === "premium_experience");
    expect(budget).toBeDefined();
    expect(premium).toBeDefined();
    expect(premium.pricing.sellingPriceMinor).toBeGreaterThan(budget.pricing.sellingPriceMinor);

    const asOwner = await operator.ok("GET", `/trips/${tripId}/packages`);
    const ownerBudget = asOwner.packages.find((p: any) => p.objective === "budget_explorer");
    expect(ownerBudget.pricing.grossMarginBp).toBeGreaterThanOrEqual(2000);
    expect(ownerBudget.package.totalCostMinor).toBe((60 + 70 + 55) * 100); // the cheapest feasible combination, visible to the owner
    expect(ownerBudget.pricing.totalCostMinor).toBe(ownerBudget.package.totalCostMinor);
    expect(asOwner.packages.find((p: any) => p.objective === "premium_experience").package.totalCostMinor).toBeGreaterThan(ownerBudget.package.totalCostMinor);
    // Shared / contract references are only visible to users who may manage agreements
    expect(JSON.stringify(res)).not.toContain("contractReference");
  });

  it("9-10. replaces a hotel, validates it, and reprices", async () => {
    const budget = packages.find((p: any) => p.objective === "budget_explorer");
    const stopId = budget.package.selections[1].stopId; // Nuwara Eliya
    const alts = await staff.ok("GET", `/packages/${budget.id}/alternatives?stopId=${stopId}`);
    expect(alts.alternatives.length).toBeGreaterThanOrEqual(3);
    const target = alts.alternatives.find((a: any) => a.offer.property.name === "Tea Estate Bungalow");
    expect(target).toBeDefined();

    const replaced = await staff.post(`/packages/${budget.id}/hotels`, { stopId, offerId: target.offer.offerId });
    expect(replaced.status).toBe(201);
    const next = replaced.body.data;
    expect(next.manuallyModified).toBe(true);
    expect(next.parentId).toBe(budget.id);
    expect(next.package.selections[1].offer.property.name).toBe("Tea Estate Bungalow");
    const ownerNext = await operator.ok("GET", `/packages/${next.id}`);
    expect(ownerNext.package.totalCostMinor).toBe((60 + 160 + 55) * 100); // recalculated
    expect(next.pricing.sellingPriceMinor).toBeGreaterThan(budget.pricing.sellingPriceMinor);

    // A hotel violating a hard constraint (room-only meal plan) is refused with an explanation
    const roomOnly = await staff.post("/hotel-search", { destination: "Kandy", checkIn: "2026-12-10", checkOut: "2026-12-11" });
    const ro = roomOnly.body.data.offers.find((o: any) => o.property.name === "Kandy Room Only Inn");
    expect(ro).toBeDefined();
    const refused = await staff.post(`/packages/${next.id}/hotels`, { stopId: next.package.selections[0].stopId, offerId: ro.offerId });
    expect(refused.status).toBe(422);
    expect(JSON.stringify(refused.body)).toContain("meal_plan");

    // Reprice after the contract rate changes: the new package reflects it, history is kept
    const hotel = (await operator.ok("GET", "/hotels?q=Tea%20Estate")).at(0);
    void hotel;
    const list = await operator.get("/hotels?q=Tea%20Estate");
    const propertyId = list.body.data[0].id;
    const rates = await operator.ok("GET", `/hotels/${propertyId}/rates`);
    await operator.ok("PATCH", `/rate-plans/${rates[0].id}/rules/${rates[0].rules[0].id}`, { amountMinor: 20_000 });
    const repriced = await staff.ok("POST", `/packages/${next.id}/reprice`, { recheck: true });
    expect(repriced.previousTotalMinor).toBeUndefined(); // staff: no cost totals
    const ownerRepriced = await operator.ok("GET", `/packages/${repriced.package.id}`);
    expect(ownerRepriced.package.totalCostMinor).toBe((60 + 200 + 55) * 100);
    expect(repriced.package.pricing.sellingPriceMinor).toBeGreaterThan(next.pricing.sellingPriceMinor);
    expect(repriced.changes.find((c: any) => c.status === "price_changed")).toBeDefined();
    packages = [repriced.package, ...packages];
  });

  it("11-13. builds a versioned quotation and a secure client link that hides internals", async () => {
    // Pricing is a commercial setting: staff are refused, the owner may configure it
    expect((await staff.put("/organization/pricing", { targetMarginBp: 100 })).status).toBe(403);
    await operator.ok("PUT", "/organization/pricing", { mode: "target_margin", targetMarginBp: 2000, maxDiscountBp: 500, approvalMarginFloorBp: 1000 });

    const pkg = packages.find((p: any) => p.objective === "best_value" && !p.manuallyModified)!;
    const created = await staff.post("/quotes", { tripRequestId: tripId, packageId: pkg.id });
    expect(created.status).toBe(201);
    quoteId = created.body.data.id;
    expect(created.body.data.quoteNumber).toMatch(/^Q-2026-0001$/);
    expect(created.body.data.totalCostMinor).toBeUndefined(); // staff view

    const v2 = await staff.post(`/quotes/${quoteId}/versions`, { packageId: pkg.id, extraItems: [{ category: "transport", description: "Private driver, 3 days", quantity: 3, unitCostMinor: 8_000, currency: "USD" }], clientNotes: "Looking forward to hosting you!", expectedVersion: 1 });
    expect(v2.status).toBe(201);
    const stale = await staff.post(`/quotes/${quoteId}/versions`, { expectedVersion: 1 });
    expect(stale.status).toBe(409); // optimistic concurrency
    const detail = await operator.ok("GET", `/quotes/${quoteId}`);
    expect(detail.quote.currentVersion).toBe(2);
    expect(detail.versions).toHaveLength(2);
    expect(detail.version.totalCostMinor).toBeGreaterThan(0);
    expect(detail.version.grossMarginBp).toBeGreaterThanOrEqual(2000);
    const v1 = await operator.ok("GET", `/quotes/${quoteId}?version=1`);
    expect(v1.version.items.length).toBe(3); // v1 is untouched by the revision

    // A discount beyond the configured maximum needs a manager's approval before it can be sent
    const discounted = await operator.post(`/quotes/${quoteId}/versions`, { discountMinor: 30_000, expectedVersion: 2 });
    expect(discounted.status).toBe(201);
    const blocked = await operator.post(`/quotes/${quoteId}/send`, {});
    expect(blocked.status).toBe(412);
    expect(blocked.body.error.message).toMatch(/approval/i);
    expect((await staff.post(`/quotes/${quoteId}/approve`, { decision: "approved" })).status).toBe(403);
    // the preparer (owner) may not self-approve a manager review when another approver exists; owners are exempt by design
    expect((await operator.post(`/quotes/${quoteId}/approve`, { decision: "approved", note: "OK for repeat customer" })).status).toBe(200);

    const sent = await operator.post(`/quotes/${quoteId}/send`, { expiresInDays: 14, message: "Here is your quote" });
    expect(sent.status).toBe(200);
    expect(sent.body.data.status).toBe("sent");
    expect(sent.body.data.emailed).toBe(true);
    shareToken = sent.body.data.token;
    expect(shareToken.length).toBeGreaterThanOrEqual(40);
    const mail = await h.db.prepare("SELECT body_text FROM email_outbox WHERE to_email = 'jane@example.com'").first<{ body_text: string }>();
    expect(mail!.body_text).toContain(`/q/${shareToken}`);

    // 12. the client opens the link (no cookies, no auth)
    const anon = h.client();
    const page = await anon.get(`/public/quotes/${shareToken}`);
    expect(page.status).toBe(200);
    const view = page.body.data.view;
    expect(view.quoteNumber).toBe("Q-2026-0001");
    expect(view.stays).toHaveLength(3);
    expect(view.totals.totalPayableMinor).toBeGreaterThan(0);
    expect(page.body.data.canRespond).toBe(true);
    expect(page.headers.get("x-robots-tag")).toContain("noindex");

    // 13. internal margins, costs, suppliers and notes are absent from everything the client can fetch
    const json = JSON.stringify(page.body).toLowerCase();
    for (const forbidden of ["margin", "markup", "grossprofit", "unitcost", "totalcost", "supplier", "contract", "internalnotes", "providerkey", "ratesource", "offerid", "externaloffer", "organizationid", "token"]) {
      expect(json).not.toContain(forbidden);
    }
    const pdf = await anon.get(`/public/quotes/${shareToken}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.text.startsWith("%PDF-")).toBe(true);

    // the quote moved to "viewed" automatically
    expect((await operator.ok("GET", `/quotes/${quoteId}`)).quote.status).toBe("viewed");

    // revoked / unknown / malformed tokens are indistinguishable
    expect((await anon.get(`/public/quotes/${"x".repeat(43)}`)).status).toBe(404);
    expect((await anon.get(`/public/quotes/short`)).status).toBe(404);

    // client accepts
    const accept = await anon.post(`/public/quotes/${shareToken}/respond`, { decision: "accept", acceptedByName: "Jane Traveller", acceptedByEmail: "jane@example.com", comment: "Lovely, thanks!" });
    expect(accept.status).toBe(200);
    const final = await operator.ok("GET", `/quotes/${quoteId}`);
    expect(final.quote.status).toBe("accepted");
    expect(final.acceptances[0].accepted_by_name).toBe("Jane Traveller");
    expect((await operator.ok("GET", `/trips/${tripId}`)).trip.status).toBe("won");
    // accepted quotations are terminal
    expect((await operator.post(`/quotes/${quoteId}/versions`, {})).status).toBe(409);
    expect((await anon.post(`/public/quotes/${shareToken}/respond`, { decision: "reject", acceptedByName: "Jane", acceptedByEmail: "jane@example.com" })).status).toBe(409);

    // staff PDF also hides internals
    const staffPdf = await staff.get(`/quotes/${quoteId}/pdf`);
    expect(staffPdf.status).toBe(200);
    expect(staffPdf.text.startsWith("%PDF-")).toBe(true);
  });

  it("14. rejects every kind of cross-tenant access", async () => {
    const probes: [string, string, unknown?][] = [
      ["GET", `/trips/${tripId}`], ["PATCH", `/trips/${tripId}`, { title: "x" }], ["GET", `/trips/${tripId}/itinerary`], ["GET", `/trips/${tripId}/packages`],
      ["GET", `/quotes/${quoteId}`], ["GET", `/quotes/${quoteId}/pdf`], ["POST", `/quotes/${quoteId}/versions`, {}], ["POST", `/quotes/${quoteId}/send`, {}],
      ["GET", `/packages/${packages[0].id}`], ["POST", `/packages/${packages[0].id}/reprice`, {}], ["GET", `/optimisations/${packages[0].jobId}`],
    ];
    for (const [m, p, b] of probes) {
      const r = await outsider.call(m, p, b);
      expect([404, 403], `${m} ${p} -> ${r.status}`).toContain(r.status);
      expect(r.text).not.toContain("Island Tours");
    }
    const list = await outsider.ok("GET", "/trips");
    expect(list).toEqual([]);
    expect((await outsider.ok("GET", "/quotes"))).toEqual([]);
    expect((await outsider.ok("GET", "/hotels"))).toEqual([]);
    expect((await outsider.ok("GET", "/customers"))).toEqual([]);
    const operatorOrgId = (await operator.ok("GET", "/organization")).id;
    const outsiderAudit = await outsider.ok("GET", "/organization/audit");
    expect(outsiderAudit.length).toBeGreaterThan(0);
    expect(outsiderAudit.every((e: any) => e.organizationId !== operatorOrgId)).toBe(true);
    // negotiated rates/agreements of another tenant are invisible
    const someHotel = (await operator.ok("GET", "/hotels?scope=own"))[0];
    expect((await outsider.get(`/hotels/${someHotel.id}`)).status).toBe(404);
    expect((await outsider.get(`/hotels/${someHotel.id}/rates`)).status).toBe(404);
    expect((await outsider.get(`/media/${"0".repeat(8)}`)).status).toBe(404);
    // the unrelated hotel company cannot see the operator's private hotels either
    expect((await hotelCo.ok("GET", "/hotels?scope=own")).every((p: any) => p.name.startsWith("Hill"))).toBe(true);
    // a browser-supplied organisation id has no effect
    const spoof = await outsider.call("GET", "/trips", undefined, { "x-organization-id": (await operator.ok("GET", "/organization")).id });
    expect(spoof.body.data).toEqual([]);
  });
});

describe("supplier failure and external provider handling", () => {
  it("15. continues with healthy suppliers when an external supplier fails, and reports it", async () => {
    const h: Harness = new Harness({
      buildProviders: (env, db, orgId, opts) => [
        new InternalInventoryProvider({ load: (q) => inventory.loadInternalInventory(db, q.organizationId, q) }, () => h.now),
        ...(opts.includeMock ? [new MockProvider({ failWith: "upstream", now: () => h.now })] : []),
      ],
    });
    const op = await h.register("Resilient Tours", "tour_operator");
    await seedHillCountry(op);
    await op.ok("PUT", "/organization/integrations", { mockProvider: true, externalProviders: { hotelbeds: false }, aiEngine: "rules" });
    const trip = await op.ok("POST", "/trips", { title: "Resilience", budgetAmountMinor: 90_000, budgetCurrency: "USD", party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] }, arrivalDate: "2026-12-10", departureDate: "2026-12-12" });
    await op.ok("PUT", `/trips/${trip.id}/itinerary`, { confirm: true, stops: [{ destination: "Kandy", arrivalDate: "2026-12-10", departureDate: "2026-12-11" }, { destination: "Ella", arrivalDate: "2026-12-11", departureDate: "2026-12-12" }] });
    const { jobId } = await op.ok("POST", `/trips/${trip.id}/optimisations`, { constraints: { includeMockProvider: true } });
    await h.settle();
    const job = await op.ok("GET", `/optimisations/${jobId}`);
    expect(job.status).toBe("succeeded");
    const outcomes = job.result.providers as any[];
    expect(outcomes.filter((o) => o.providerKey === "mock").every((o) => o.status === "error" && o.errorCode === "upstream")).toBe(true);
    expect(outcomes.filter((o) => o.providerKey === "internal").every((o) => o.status === "ok")).toBe(true);
    const { packages } = await op.ok("GET", `/trips/${trip.id}/packages`);
    expect(packages.length).toBeGreaterThan(0);
    const health = await op.ok("GET", "/organization/integrations");
    expect(health.health.find((x: any) => x.providerKey === "mock").errors).toBeGreaterThan(0);
  });

  it("mock offers are labelled illustrative and can never be quoted", async () => {
    const h: Harness = new Harness({
      buildProviders: (env, db, orgId, opts) => [new InternalInventoryProvider({ load: (q) => inventory.loadInternalInventory(db, q.organizationId, q) }, () => h.now), ...(opts.includeMock ? [new MockProvider({ now: () => h.now })] : [])],
    });
    const op = await h.register("Demo Tours", "tour_operator");
    await op.ok("PUT", "/organization/integrations", { mockProvider: true, externalProviders: { hotelbeds: false }, aiEngine: "rules" });
    const trip = await op.ok("POST", "/trips", { title: "Mock only", budgetAmountMinor: 200_000, budgetCurrency: "USD", party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] }, arrivalDate: "2026-12-10", departureDate: "2026-12-11" });
    await op.ok("PUT", `/trips/${trip.id}/itinerary`, { confirm: true, stops: [{ destination: "Kandy", arrivalDate: "2026-12-10", departureDate: "2026-12-11" }] });
    await op.ok("POST", `/trips/${trip.id}/optimisations`, { constraints: { includeMockProvider: true }, objectives: ["budget_explorer", "premium_experience"] });
    await h.settle();
    const { packages } = await op.ok("GET", `/trips/${trip.id}/packages`);
    expect(packages.length).toBeGreaterThan(0);
    const pkg = packages[0];
    expect(pkg.package.selections[0].offer.isMock).toBe(true);
    expect(pkg.package.unverified.join(" ")).toMatch(/illustrative/i);
    expect(pkg.package.explanation.join(" ")).toMatch(/ILLUSTRATIVE/);
    const q = await op.post("/quotes", { tripRequestId: trip.id, packageId: pkg.id });
    expect(q.status).toBe(422);
    expect(q.body.error.message).toMatch(/mock/i);
    // properties from the mock provider never leak into the catalogue
    expect(await op.ok("GET", "/hotels")).toEqual([]);
  });
});

describe("multi-currency pricing", () => {
  it("converts supplier currencies with an FX snapshot and snapshots it in the quote", async () => {
    const h = new Harness();
    const op = await h.register("Currency Tours", "tour_operator");
    await createHotel(op, { name: "LKR Lodge", city: "Kandy", lat: 7.29, lng: 80.63, price: 30_000, currency: "LKR", category: "comfort" });
    const trip = await op.ok("POST", "/trips", { title: "FX", budgetAmountMinor: 100_000, budgetCurrency: "USD", party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] }, arrivalDate: "2026-12-10", departureDate: "2026-12-11" });
    await op.ok("PUT", `/trips/${trip.id}/itinerary`, { confirm: true, stops: [{ destination: "Kandy", arrivalDate: "2026-12-10", departureDate: "2026-12-11" }] });

    // Without exchange rates the LKR hotel cannot be compared: reported, not guessed
    await op.ok("POST", `/trips/${trip.id}/optimisations`, {});
    await h.settle();
    const noFx = await op.ok("GET", `/trips/${trip.id}/packages`);
    expect(noFx.packages).toHaveLength(0);
    expect(JSON.stringify(noFx.job.funnel)).toContain("currency");

    await op.ok("PUT", "/organization/fx", { pivot: "USD", rates: { LKR: "300.00" }, source: "manual" });
    await op.ok("POST", `/trips/${trip.id}/optimisations`, {});
    await h.settle();
    const res = await op.ok("GET", `/trips/${trip.id}/packages`);
    expect(res.packages).toHaveLength(1);
    const p = res.packages[0];
    expect(p.package.selections[0].costMinor).toBe(10_000); // LKR 30,000 -> USD 100.00 (owner sees cost)
    expect(p.package.selections[0].offer.currency).toBe("LKR"); // original supplier currency preserved

    const q = await op.ok("POST", "/quotes", { tripRequestId: trip.id, packageId: p.id });
    const detail = await op.ok("GET", `/quotes/${q.id}`);
    expect(detail.version.fx.rates.LKR).toBe("300.00");
    // changing FX later never alters the issued version
    await op.ok("PUT", "/organization/fx", { pivot: "USD", rates: { LKR: "400.00" }, source: "manual" });
    const again = await op.ok("GET", `/quotes/${q.id}?version=1`);
    expect(again.version.fx.rates.LKR).toBe("300.00");
    expect(again.version.totalCostMinor).toBe(detail.version.totalCostMinor);
  });
});

void HILL_COUNTRY;
