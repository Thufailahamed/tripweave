import { beforeEach, describe, expect, it } from "vitest";
import { inventory, identity, ops, quotes, trips } from "./index";
import { createTestDb, applyMigrations, TestD1, migrationsDir } from "./testing";
import { readdirSync } from "node:fs";

let db: TestD1;
let orgA: string;
let orgB: string;
let userA: string;
let userB: string;

async function mkOrg(name: string, type: "tour_operator" | "hotel_management") {
  return identity.createOrganizationWithOwner(db, {
    name, slug: await identity.uniqueSlug(db, name), type, country: "LK", currency: "USD", timezone: "Asia/Colombo",
    owner: { email: `${name.toLowerCase().replace(/\W/g, "")}@example.com`, displayName: `${name} Owner`, passwordHash: "x" },
  });
}

beforeEach(async () => {
  db = createTestDb();
  const a = await mkOrg("Island Tours", "tour_operator");
  const b = await mkOrg("Hill Hotels", "hotel_management");
  orgA = a.organizationId; userA = a.userId; orgB = b.organizationId; userB = b.userId;
});

describe("migrations", () => {
  it("apply cleanly in order and create every table", () => {
    const fresh = new TestD1();
    expect(applyMigrations(fresh)).toHaveLength(readdirSync(migrationsDir()).filter((f) => f.endsWith(".sql")).length);
    const tables = fresh.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => String(r.name));
    for (const t of ["organizations", "users", "properties", "rate_plans", "supplier_offers", "optimisation_jobs", "candidate_combinations", "quotes", "quote_versions", "quote_shares"]) expect(tables).toContain(t);
  });
  it("enforces foreign keys", async () => {
    await expect(inventory.createRoomType(db, "missing-property", { name: "X", maximumAdults: 2, maximumOccupancy: 2 })).rejects.toThrow(/FOREIGN KEY/i);
  });
  it("rejects undefined binds like D1 and more than 100 params", async () => {
    expect(() => db.prepare("SELECT ?").bind(undefined)).toThrow(/undefined/);
    expect(() => db.prepare("SELECT 1").bind(...Array(101).fill(1))).toThrow(/too many/i);
  });
});

describe("tenant isolation in repositories", () => {
  it("customers and trips are only visible to their organisation", async () => {
    const c = await trips.createCustomer(db, orgA, { name: "Jane" });
    expect(await trips.getCustomer(db, orgA, c)).not.toBeNull();
    expect(await trips.getCustomer(db, orgB, c)).toBeNull();
    const t = await trips.createTrip(db, orgA, userA, { title: "Sri Lanka", party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] } });
    expect(await trips.getTrip(db, orgB, t)).toBeNull();
    expect((await trips.listTrips(db, orgB, { page: 1, pageSize: 10 })).total).toBe(0);
    expect(await trips.updateTrip(db, orgB, userB, t, { title: "hijack" })).toBe(false);
  });

  it("private properties/rates are hidden until explicitly shared, and sharing is scoped", async () => {
    const p1 = await inventory.createProperty(db, orgB, { name: "Hill Club", city: "Nuwara Eliya" });
    const p2 = await inventory.createProperty(db, orgB, { name: "Tea Lodge", city: "Nuwara Eliya" });
    expect(await inventory.getVisibleProperty(db, orgA, p1)).toBeNull();
    expect((await inventory.listProperties(db, orgA, { page: 1, pageSize: 10 })).total).toBe(0);

    const room = await inventory.createRoomType(db, p1, { name: "Deluxe", maximumAdults: 2, maximumOccupancy: 3 });
    const plan = await inventory.createRatePlan(db, orgB, p1, { roomTypeId: room, name: "BB", mealPlan: "BB", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" });
    await inventory.grantPartnerAccess(db, orgB, { receivingOrganizationId: orgA, resourceType: "property", resourceId: p1, validFrom: "2020-01-01", validUntil: "2099-01-01" });

    expect((await inventory.getVisibleProperty(db, orgA, p1))?.access).toBe("shared");
    expect(await inventory.getVisibleProperty(db, orgA, p2)).toBeNull(); // sharing one property must not expose the other
    const plans = await inventory.listVisibleRatePlans(db, orgA, p1);
    expect(plans.map((p) => p.id)).toEqual([plan]);
    expect(plans[0]!.shared).toBe(true);
    expect(await inventory.getOwnedRatePlan(db, orgA, plan)).toBeNull(); // cannot manage someone else's plan
    expect(await inventory.updateProperty(db, orgA, p1, { name: "hijack" })).toBe(false);

    // revoked or expired grants stop working
    const grants = await inventory.listGrantedAccess(db, orgB);
    await inventory.revokePartnerAccess(db, orgB, grants[0]!.id);
    expect(await inventory.getVisibleProperty(db, orgA, p1)).toBeNull();
    await inventory.grantPartnerAccess(db, orgB, { receivingOrganizationId: orgA, resourceType: "property", resourceId: p1, validFrom: "2020-01-01", validUntil: "2021-01-01" });
    expect(await inventory.getVisibleProperty(db, orgA, p1)).toBeNull();
  });

  it("a shared rate plan exposes only that plan's property, not supplier agreements", async () => {
    const p = await inventory.createProperty(db, orgB, { name: "Ella Gap", city: "Ella" });
    const room = await inventory.createRoomType(db, p, { name: "Std", maximumAdults: 2, maximumOccupancy: 2 });
    const planShared = await inventory.createRatePlan(db, orgB, p, { roomTypeId: room, name: "Shared", mealPlan: "BB", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" });
    const planPrivate = await inventory.createRatePlan(db, orgB, p, { roomTypeId: room, name: "Private", mealPlan: "HB", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" });
    await inventory.grantPartnerAccess(db, orgB, { receivingOrganizationId: orgA, resourceType: "rate_plan", resourceId: planShared, validFrom: "2020-01-01", validUntil: "2099-01-01" });
    const ids = (await inventory.listVisibleRatePlans(db, orgA, p)).map((x) => x.id);
    expect(ids).toContain(planShared);
    expect(ids).not.toContain(planPrivate);
  });

  it("agreements and suppliers are org-scoped", async () => {
    const s = await inventory.createSupplier(db, orgB, { name: "Hill Direct", providerKey: "direct" });
    const ag = await inventory.createAgreement(db, orgB, { supplierId: s, contractReference: "C-1", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" });
    expect(await inventory.getAgreement(db, orgA, ag)).toBeNull();
    expect(await inventory.getSupplier(db, orgA, s)).toBeNull();
    expect(await inventory.listAgreements(db, orgA)).toHaveLength(0);
  });
});

describe("property search & internal inventory loading", () => {
  it("filters, paginates and escapes LIKE wildcards", async () => {
    for (let i = 0; i < 7; i++) await inventory.createProperty(db, orgA, { name: `Hotel ${i}`, city: i % 2 ? "Kandy" : "Ella", amenities: i === 0 ? ["pool"] : [] });
    await inventory.createProperty(db, orgA, { name: "100% Pure", city: "Galle" });
    const page = await inventory.listProperties(db, orgA, { page: 1, pageSize: 3 });
    expect(page.total).toBe(8);
    expect(page.items).toHaveLength(3);
    expect((await inventory.listProperties(db, orgA, { page: 1, pageSize: 10, city: "kandy" })).total).toBe(3);
    expect((await inventory.listProperties(db, orgA, { page: 1, pageSize: 10, amenity: "POOL" })).total).toBe(1);
    expect((await inventory.listProperties(db, orgA, { page: 1, pageSize: 10, q: "%" })).total).toBe(1);
  });

  it("loads inventory for a destination, chunking IN lists beyond D1's parameter limit", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 150; i++) ids.push(await inventory.createProperty(db, orgA, { name: `Bulk ${i}`, city: "Kandy" }));
    const room = await inventory.createRoomType(db, ids[0]!, { name: "Std", maximumAdults: 2, maximumOccupancy: 2 });
    const inv = await inventory.loadInternalInventory(db, orgA, { destination: "Kandy", checkIn: "2026-12-10", checkOut: "2026-12-12" });
    expect(inv.properties.length).toBe(150);
    expect(inv.roomTypes.get(ids[0]!)?.[0]?.id).toBe(room);
  });
});

describe("rules, history and inventory", () => {
  it("records rate change history and tracks rule edits", async () => {
    const p = await inventory.createProperty(db, orgB, { name: "H", city: "Kandy" });
    const room = await inventory.createRoomType(db, p, { name: "R", maximumAdults: 2, maximumOccupancy: 2 });
    const planId = await inventory.createRatePlan(db, orgB, p, { roomTypeId: room, name: "P", mealPlan: "BB", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" });
    const plan = (await inventory.getOwnedRatePlan(db, orgB, planId))!;
    const rule = await inventory.createRule(db, orgB, plan, { applicableStartDate: "2026-01-01", applicableEndDate: "2026-06-30", amountMinor: 10_000 }, userB);
    await inventory.updateRule(db, orgB, plan, rule, { amountMinor: 11_000 }, userB);
    await inventory.deleteRule(db, orgB, plan, rule, userB);
    const history = await inventory.rateHistory(db, orgB, planId);
    expect(history.map((h) => h.change_type)).toEqual(expect.arrayContaining(["plan_created", "rule_created", "rule_updated", "rule_deleted"]));
    expect(await inventory.rateHistory(db, orgA, planId)).toHaveLength(0);
  });

  it("upserts inventory idempotently", async () => {
    const p = await inventory.createProperty(db, orgB, { name: "H", city: "Kandy" });
    const room = await inventory.createRoomType(db, p, { name: "R", maximumAdults: 2, maximumOccupancy: 2 });
    await inventory.upsertInventory(db, room, [{ date: "2026-12-10", availableQuantity: 3 }, { date: "2026-12-11", availableQuantity: null }]);
    await inventory.upsertInventory(db, room, [{ date: "2026-12-10", availableQuantity: 1 }]);
    const rows = await inventory.listInventory(db, room, "2026-12-01", "2026-12-31");
    expect(rows).toEqual([{ date: "2026-12-10", availableQuantity: 1 }, { date: "2026-12-11", availableQuantity: null }]);
  });
});

describe("optimisation jobs", () => {
  it("claims a queued job exactly once (duplicate queue messages are harmless)", async () => {
    const t = await trips.createTrip(db, orgA, userA, { title: "T", party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] } });
    const it = await trips.saveItinerary(db, t, { status: "confirmed", stops: [{ id: "x", sequence: 1, destination: "Kandy", latitude: 7.29, longitude: 80.63, arrivalDate: "2026-12-10", departureDate: "2026-12-11", nights: 1, activities: [] }] });
    const job = await trips.createJob(db, orgA, userA, { tripRequestId: t, itineraryId: it.id, algorithmVersion: "v1", request: {}, constraints: {}, scoring: {}, fx: null });
    expect(await trips.claimJob(db, job)).toBe(true);
    expect(await trips.claimJob(db, job)).toBe(false);
    await trips.finishJob(db, job, { status: "succeeded", summary: { ok: true } });
    expect((await trips.getJob(db, orgA, job))?.status).toBe("succeeded");
    expect(await trips.getJob(db, orgB, job)).toBeNull();
  });

  it("saving an itinerary supersedes the previous version", async () => {
    const t = await trips.createTrip(db, orgA, userA, { title: "T", party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] } });
    const stop = { id: "x", sequence: 1, destination: "Kandy", latitude: null, longitude: null, arrivalDate: "2026-12-10", departureDate: "2026-12-11", nights: 1, activities: [] };
    await trips.saveItinerary(db, t, { status: "draft", stops: [stop] });
    const v2 = await trips.saveItinerary(db, t, { status: "confirmed", stops: [stop, { ...stop, destination: "Ella", arrivalDate: "2026-12-11", departureDate: "2026-12-12" }] });
    const latest = await trips.getLatestItinerary(db, orgA, t);
    expect(latest?.id).toBe(v2.id);
    expect(latest?.version).toBe(2);
    expect(latest?.stops).toHaveLength(2);
    expect(await trips.getLatestItinerary(db, orgB, t)).toBeNull();
  });
});

describe("quotes", () => {
  async function seedQuote() {
    const t = await trips.createTrip(db, orgA, userA, { title: "T", party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] } });
    const version = { itinerarySnapshot: {}, pricingSnapshot: { approval: { reasons: [] } }, packageSnapshot: {}, totalCostMinor: 80_000, sellingPriceMinor: 100_000, grossProfitMinor: 20_000, grossMarginBp: 2_000, fxSnapshot: {}, termsSnapshot: {}, approvalRequired: false, createdBy: userA, items: [{ category: "accommodation", description: "Hotel", quantity: 1, unitCostMinor: 80_000, totalCostMinor: 80_000, unitSellingMinor: 100_000, totalSellingMinor: 100_000, currency: "USD", optional: false }] };
    const q = await quotes.createQuote(db, orgA, userA, { tripRequestId: t, customerId: null, currency: "USD", validUntil: "2026-12-31", packageId: null, version });
    return { q, version };
  }

  it("creates numbered quotes with an immutable version history and optimistic concurrency", async () => {
    const { q, version } = await seedQuote();
    expect(q.quoteNumber).toMatch(/^Q-\d{4}-0001$/);
    const v2 = await quotes.addQuoteVersion(db, orgA, q.id, 1, { ...version, sellingPriceMinor: 110_000 }, {});
    expect(v2).toBe(2);
    await expect(quotes.addQuoteVersion(db, orgA, q.id, 1, version, {})).rejects.toThrow(/modified by someone else/);
    const v1 = await quotes.getVersion(db, q.id, 1);
    expect(v1?.sellingPriceMinor).toBe(100_000); // earlier version is untouched
    expect((await quotes.getQuote(db, orgA, q.id))?.currentVersion).toBe(2);
    expect(await quotes.getQuote(db, orgB, q.id)).toBeNull();
    await expect(quotes.addQuoteVersion(db, orgB, q.id, 2, version, {})).rejects.toThrow();
  });

  it("share tokens resolve only while active", async () => {
    const { q } = await seedQuote();
    await quotes.createShare(db, q.id, 1, "hash-1", new Date(Date.now() + 86_400_000).toISOString(), userA);
    await quotes.createShare(db, q.id, 1, "hash-2", new Date(Date.now() - 1000).toISOString(), userA);
    expect(await quotes.findActiveShare(db, "hash-1")).not.toBeNull();
    expect(await quotes.findActiveShare(db, "hash-2")).toBeNull();
    expect(await quotes.findActiveShare(db, "unknown")).toBeNull();
    const [first] = await quotes.listShares(db, q.id);
    await quotes.revokeAllShares(db, q.id);
    expect(await quotes.findActiveShare(db, "hash-1")).toBeNull();
    expect(first).toBeDefined();
  });

  it("status changes are compare-and-set and audited in history", async () => {
    const { q } = await seedQuote();
    expect(await quotes.setQuoteStatus(db, orgA, q.id, "draft", "ready_for_review", userA)).toBe(true);
    expect(await quotes.setQuoteStatus(db, orgA, q.id, "draft", "sent", userA)).toBe(false);
    expect((await quotes.quoteStatusHistory(db, q.id)).map((h) => h.to_status)).toEqual(["draft", "ready_for_review"]);
  });
});

describe("ops", () => {
  it("rate limiter blocks after the limit and idempotency keys can be claimed once", async () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) expect((await ops.hitRateLimit(db, "k", 3, 60, now)).allowed).toBe(true);
    expect((await ops.hitRateLimit(db, "k", 3, 60, now)).allowed).toBe(false);
    expect(await ops.claimIdempotency(db, orgA, "idem-1", "h")).toBe(true);
    expect(await ops.claimIdempotency(db, orgA, "idem-1", "h")).toBe(false);
  });

  it("audit metadata never stores secrets", async () => {
    await ops.writeAudit(db, { organizationId: orgA, actorUserId: userA, action: "x", resourceType: "y", metadata: { password: "p", nested: { apiKey: "k", ok: 1 }, token: "t", fine: "yes" } });
    const page = await ops.listAudit(db, orgA, { page: 1, pageSize: 10 });
    expect(page.items[0]!.metadata).toEqual({ nested: { ok: 1 }, fine: "yes" });
    expect((await ops.listAudit(db, orgB, { page: 1, pageSize: 10 })).total).toBe(0);
  });

  it("falls back from org FX to platform FX snapshot", async () => {
    await ops.saveFxSnapshot(db, null, { pivot: "USD", rates: { LKR: "300" }, asOf: "2026-10-01T00:00:00Z", source: "platform" });
    expect((await ops.latestFxSnapshot(db, orgA))?.source).toBe("platform");
    await ops.saveFxSnapshot(db, orgA, { pivot: "USD", rates: { LKR: "310" }, asOf: "2026-10-02T00:00:00Z", source: "org" });
    expect((await ops.latestFxSnapshot(db, orgA))?.rates.LKR).toBe("310");
    expect((await ops.latestFxSnapshot(db, orgB))?.source).toBe("platform");
  });
});
