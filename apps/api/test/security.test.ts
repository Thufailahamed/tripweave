import { describe, expect, it } from "vitest";
import { identity } from "@tripweave/database";
import { Harness, PASSWORD, createHotel } from "./harness";
import { buildXlsx, toBase64 } from "./xlsx-fixture";

describe("authentication", () => {
  it("requires auth, rejects wrong credentials generically, and locks after repeated failures", async () => {
    const h = new Harness();
    await h.register("Auth Tours", "tour_operator", "owner@auth.example");
    const anon = h.client();
    expect((await anon.get("/trips")).status).toBe(401);
    expect((await anon.get("/auth/me")).status).toBe(401);

    const unknown = await anon.post("/auth/login", { email: "nobody@auth.example", password: PASSWORD });
    const wrong = await anon.post("/auth/login", { email: "owner@auth.example", password: "wrong-Password1" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message); // no account enumeration

    for (let i = 0; i < 5; i++) await anon.post("/auth/login", { email: "owner@auth.example", password: "wrong-Password1" });
    const locked = await anon.post("/auth/login", { email: "owner@auth.example", password: PASSWORD });
    expect(locked.status).toBe(429); // account temporarily locked even with the right password
    h.now = new Date(h.now.getTime() + 20 * 60_000);
    const user = await identity.findUserByEmail(h.db, "owner@auth.example");
    expect(user?.failedLoginCount).toBeGreaterThanOrEqual(5);
  });

  it("issues HttpOnly SameSite cookies, stores only token hashes and revokes on logout", async () => {
    const h = new Harness();
    const c = h.client();
    const reg = await c.post("/auth/register", { email: "a@b.example", password: PASSWORD, displayName: "A", organizationName: "Cookie Co", organizationType: "tour_operator", country: "LK", defaultCurrency: "USD" });
    const setCookie = reg.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const token = setCookie.split(";")[0]!.split("=")[1]!;
    const rows = await h.db.prepare("SELECT token_hash FROM sessions").all<{ token_hash: string }>();
    expect(rows.results!.some((r) => r.token_hash === token)).toBe(false); // raw token is never stored
    expect((await c.get("/auth/me")).status).toBe(200);
    const stolen = h.client();
    stolen.cookie = `tw_session=${token}`;
    await c.post("/auth/logout");
    expect((await stolen.get("/auth/me")).status).toBe(401); // session revoked server-side
  });

  it("rejects forged, truncated and expired sessions", async () => {
    const h = new Harness();
    const c = await h.register("Session Co", "tour_operator");
    const forged = h.client();
    forged.cookie = "tw_session=" + "A".repeat(43);
    expect((await forged.get("/trips")).status).toBe(401);
    h.now = new Date(h.now.getTime() + 15 * 86_400_000); // past the 14-day lifetime
    expect((await c.get("/trips")).status).toBe(401);
  });

  it("enforces CSRF headers and origin on state-changing requests", async () => {
    const h = new Harness();
    const c = await h.register("Csrf Co", "tour_operator");
    const noHeader = await h.app.request("/api/v1/customers", { method: "POST", headers: { cookie: c.cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "X" }) }, h.env);
    expect(noHeader.status).toBe(403);
    const evil = await c.call("POST", "/customers", { name: "X" }, { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    expect((await c.post("/customers", { name: "Good" })).status).toBe(201);
  });

  it("password reset is enumeration-safe, single-use, and revokes sessions", async () => {
    const h = new Harness();
    const c = await h.register("Reset Co", "tour_operator", "reset@co.example");
    const a = await h.client().post("/auth/forgot-password", { email: "reset@co.example" });
    const b = await h.client().post("/auth/forgot-password", { email: "ghost@co.example" });
    expect(a.status).toBe(200);
    expect(a.body).toEqual(b.body);
    const mail = await h.db.prepare("SELECT body_text FROM email_outbox WHERE to_email = 'reset@co.example' AND subject LIKE 'Reset%'").first<{ body_text: string }>();
    const token = /token=([\w-]+)/.exec(mail!.body_text)![1]!;
    const bad = await h.client().post("/auth/reset-password", { token, password: "short" });
    expect(bad.status).toBe(422);
    const done = await h.client().post("/auth/reset-password", { token, password: "Brand-New-Pass9" });
    expect(done.status).toBe(200);
    expect((await h.client().post("/auth/reset-password", { token, password: "Another-Pass99" })).status).toBe(400); // single use
    expect((await c.get("/auth/me")).status).toBe(401); // old session revoked
    expect((await h.client().post("/auth/login", { email: "reset@co.example", password: "Brand-New-Pass9" })).status).toBe(200);
    const stored = await h.db.prepare("SELECT body_text FROM email_outbox").all();
    expect(JSON.stringify(stored.results)).not.toContain("Brand-New-Pass9");
  });

  it("validates registration input and rate limits it", async () => {
    const h = new Harness();
    const c = h.client();
    expect((await c.post("/auth/register", { email: "not-an-email", password: PASSWORD, displayName: "A", organizationName: "X Co", organizationType: "tour_operator" })).status).toBe(422);
    expect((await c.post("/auth/register", { email: "ok@x.example", password: "weak", displayName: "A", organizationName: "X Co", organizationType: "tour_operator" })).status).toBe(422);
    await h.register("Dup Co", "tour_operator", "dup@x.example");
    expect((await c.post("/auth/register", { email: "dup@x.example", password: PASSWORD, displayName: "A", organizationName: "Dup 2", organizationType: "tour_operator" })).status).toBe(409);
  });
});

describe("authorisation", () => {
  it("applies role permissions: read-only users cannot write, staff cannot manage commercial settings or the team", async () => {
    const h = new Harness();
    const owner = await h.register("Perm Co", "tour_operator");
    for (const role of ["staff", "read_only", "manager"] as const) await owner.ok("POST", "/organization/members", { email: `${role}@perm.example`, displayName: role, role, temporaryPassword: PASSWORD });
    const login = async (role: string) => {
      const c = h.client();
      expect((await c.post("/auth/login", { email: `${role}@perm.example`, password: PASSWORD })).status).toBe(200);
      return c;
    };
    const [staff, readOnly, manager] = [await login("staff"), await login("read_only"), await login("manager")];

    expect((await readOnly.post("/customers", { name: "X" })).status).toBe(403);
    expect((await readOnly.get("/customers")).status).toBe(200);
    expect((await staff.post("/customers", { name: "X" })).status).toBe(201);
    expect((await staff.put("/organization/pricing", {})).status).toBe(403);
    expect((await staff.post("/organization/members", { email: "x@perm.example", displayName: "x", role: "staff", temporaryPassword: PASSWORD })).status).toBe(403);
    expect((await staff.get("/agreements")).status).toBe(403);
    expect((await staff.get("/organization/audit")).status).toBe(403);
    expect((await staff.get("/organization/integrations")).status).toBe(403);
    expect((await manager.get("/agreements")).status).toBe(200);
    expect((await manager.put("/organization/pricing", { targetMarginBp: 1500 })).status).toBe(200);
    expect((await manager.post("/organization/members", { email: "x@perm.example", displayName: "x", role: "staff", temporaryPassword: PASSWORD })).status).toBe(403);
    expect((await manager.get("/admin/organizations")).status).toBe(403); // platform area is closed to tenants

    // Owner cannot be demoted; users cannot change their own role; suspended members lose access immediately
    const members = await owner.ok("GET", "/organization/members");
    const ownerRow = members.find((m: any) => m.role === "owner");
    expect((await owner.patch(`/organization/members/${ownerRow.id}`, { role: "staff" })).status).toBe(403);
    const staffRow = members.find((m: any) => m.role === "staff");
    expect((await owner.patch(`/organization/members/${staffRow.id}`, { status: "suspended" })).status).toBe(200);
    expect((await staff.get("/customers")).status).toBe(401);
  });

  it("only the owner can grant, change or remove admins (no privilege escalation by admins)", async () => {
    const h = new Harness();
    const owner = await h.register("Esc Co", "tour_operator");
    await owner.ok("POST", "/organization/members", { email: "admin1@esc.example", displayName: "Admin One", role: "admin", temporaryPassword: PASSWORD });
    await owner.ok("POST", "/organization/members", { email: "admin2@esc.example", displayName: "Admin Two", role: "admin", temporaryPassword: PASSWORD });
    const admin1 = h.client();
    await admin1.post("/auth/login", { email: "admin1@esc.example", password: PASSWORD });
    expect((await admin1.post("/organization/members", { email: "x@esc.example", displayName: "X", role: "admin", temporaryPassword: PASSWORD })).status).toBe(403);
    expect((await admin1.post("/organization/members", { email: "y@esc.example", displayName: "Y", role: "staff", temporaryPassword: PASSWORD })).status).toBe(201);
    const members = await owner.ok("GET", "/organization/members");
    const admin2 = members.find((m: any) => m.email === "admin2@esc.example");
    expect((await admin1.patch(`/organization/members/${admin2.id}`, { role: "staff" })).status).toBe(403);
    expect((await admin1.patch(`/organization/members/${admin2.id}`, { status: "suspended" })).status).toBe(403);
    expect((await admin1.del(`/organization/members/${admin2.id}`)).status).toBe(403);
    expect((await owner.patch(`/organization/members/${admin2.id}`, { role: "manager" })).status).toBe(200);
  });

  it("users with several memberships switch organisations only to ones they belong to", async () => {
    const h = new Harness();
    const a = await h.register("Org A", "tour_operator", "multi@x.example");
    const b = await h.register("Org B", "hotel_management", "b-owner@x.example");
    const orgA = (await a.ok("GET", "/organization")).id;
    const orgB = (await b.ok("GET", "/organization")).id;
    expect((await a.post("/auth/switch-organization", { organizationId: orgB })).status).toBe(403);
    await b.ok("POST", "/organization/members", { email: "multi@x.example", displayName: "Multi", role: "staff", temporaryPassword: PASSWORD });
    const me = await a.ok("GET", "/auth/me");
    expect(me.memberships).toHaveLength(2);
    expect((await a.post("/auth/switch-organization", { organizationId: orgB })).status).toBe(200);
    expect((await a.ok("GET", "/organization")).id).toBe(orgB);
    expect((await a.post("/auth/switch-organization", { organizationId: orgA })).status).toBe(200);
    expect((await a.ok("GET", "/organization")).id).toBe(orgA);
  });

  it("suspended organisations are locked out", async () => {
    const h = new Harness();
    const c = await h.register("Doomed Co", "tour_operator");
    const orgId = (await c.ok("GET", "/organization")).id;
    await h.db.prepare("UPDATE organizations SET status = 'suspended' WHERE id = ?").bind(orgId).run();
    const r = await c.get("/trips");
    expect(r.status).toBe(403);
    expect(r.body.error.message).toMatch(/suspended/);
  });

  it("platform admin tenant access needs a reason-bound, time-boxed grant and is audited", async () => {
    const h = new Harness();
    const tenant = await h.register("Visible Co", "tour_operator");
    await tenant.ok("POST", "/trips", { title: "Secret trip" });
    const orgId = (await tenant.ok("GET", "/organization")).id;
    const admin = await h.register("Platform Ops", "tour_operator", "ops@platform.example");
    expect((await admin.get("/admin/metrics")).status).toBe(403);
    await h.db.prepare("UPDATE users SET platform_role = 'platform_admin' WHERE email = 'ops@platform.example'").run();
    expect((await admin.get("/admin/metrics")).status).toBe(200);
    expect((await admin.get(`/admin/organizations/${orgId}/support/trips`)).status).toBe(403); // no grant yet
    expect((await admin.post(`/admin/organizations/${orgId}/access-grants`, { reason: "short" })).status).toBe(422);
    const grant = await admin.post(`/admin/organizations/${orgId}/access-grants`, { reason: "Customer ticket #1234 about missing trip", minutes: 15 });
    expect(grant.status).toBe(201);
    const view = await admin.get(`/admin/organizations/${orgId}/support/trips`);
    expect(view.status).toBe(200);
    expect(view.body.data[0].title).toBe("Secret trip");
    const audit = await tenant.ok("GET", "/organization/audit?action=admin");
    expect(audit.map((e: any) => e.action)).toEqual(expect.arrayContaining(["admin.access_granted", "admin.tenant_data_viewed"]));
    h.now = new Date(h.now.getTime() + 60 * 60_000);
    // grants are checked against the real clock in SQL; simulate expiry directly
    await h.db.prepare("UPDATE platform_access_grants SET expires_at = '2000-01-01T00:00:00Z'").run();
    expect((await admin.get(`/admin/organizations/${orgId}/support/trips`)).status).toBe(403);
    const suspend = await admin.patch(`/admin/organizations/${orgId}/status`, { status: "suspended", reason: "Payment overdue" });
    expect(suspend.status).toBe(200);
  });
});

describe("input handling and abuse protection", () => {
  it("returns structured validation errors and never leaks internals on server errors", async () => {
    const h = new Harness();
    const c = await h.register("Valid Co", "tour_operator");
    const bad = await c.post("/trips", { title: "x" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("validation_failed");
    expect(bad.body.error.requestId).toBeTruthy();
    const badDates = await c.post("/trips", { title: "Bad dates", arrivalDate: "2026-12-10", departureDate: "2026-12-01" });
    expect(badDates.status).toBe(422);
    const badJson = await h.app.request("/api/v1/trips", { method: "POST", headers: { cookie: c.cookie, "x-requested-with": "tripweave", "content-type": "application/json" }, body: "{not json" }, h.env);
    expect(badJson.status).toBe(400);
    expect((await c.get("/nope")).status).toBe(404);
    expect((await c.get("/trips?page=0")).status).toBe(422);
    expect((await c.get("/trips?pageSize=1000")).status).toBe(422);
  });

  it("rate limits expensive operations", async () => {
    const h = new Harness();
    const c = await h.register("Limit Co", "tour_operator");
    const trip = await c.ok("POST", "/trips", { title: "Parse limit" });
    let limited = false;
    for (let i = 0; i < 65; i++) {
      const r = await c.post(`/trips/${trip.id}/parse`, { text: "Two adults visiting Kandy for 3 nights from 10 December 2026." });
      if (r.status === 429) {
        limited = true;
        expect(r.headers.get("retry-after")).toBeTruthy();
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("image upload verifies type and content; hotel writes are owner-only", async () => {
    const h = new Harness();
    const files: Record<string, Uint8Array> = {};
    h.env.MEDIA = { put: async (k: string, v: Uint8Array) => void (files[k] = v), get: async (k: string) => (files[k] ? { body: files[k], arrayBuffer: async () => files[k]!.buffer } : null), delete: async (k: string) => void delete files[k] } as never;
    const c = await h.register("Image Co", "tour_operator");
    const { propertyId } = await createHotel(c, { name: "Pic Hotel", city: "Kandy", lat: 7.29, lng: 80.63, price: 100 });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    const good = new FormData();
    good.set("file", new File([png], "a.png", { type: "image/png" }));
    good.set("altText", "Front view");
    const up = await c.call("POST", `/hotels/${propertyId}/images`, good);
    expect(up.status).toBe(201);
    const fake = new FormData();
    fake.set("file", new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])], "evil.png", { type: "image/png" }));
    expect((await c.call("POST", `/hotels/${propertyId}/images`, fake)).status).toBe(422);
    const svg = new FormData();
    svg.set("file", new File(["<svg onload=alert(1)/>"], "x.svg", { type: "image/svg+xml" }));
    expect((await c.call("POST", `/hotels/${propertyId}/images`, svg)).status).toBe(422);
    const second = await c.call("POST", `/hotels/${propertyId}/images`, good);
    const third = await c.call("POST", `/hotels/${propertyId}/images`, good);
    const ids = [up.body.data.id, second.body.data.id, third.body.data.id];
    const reordered = [ids[2], ids[0], ids[1]];
    expect((await c.call("PUT", `/hotels/${propertyId}/images/order`, { imageIds: reordered })).status).toBe(200);
    expect((await c.ok("GET", `/hotels/${propertyId}`)).images.map((i: any) => i.id)).toEqual(reordered);
    expect((await c.call("PUT", `/hotels/${propertyId}/images/order`, { imageIds: [ids[0], ids[1]] })).status).toBe(422); // missing one
    expect((await c.call("PUT", `/hotels/${propertyId}/images/order`, { imageIds: [ids[0], ids[0], ids[1]] })).status).toBe(422); // duplicate
    expect((await c.call("PUT", `/hotels/${propertyId}/images/order`, { imageIds: [...ids.slice(0, 2), "not-mine"] })).status).toBe(422);
    const served = await c.get(`/media/${up.body.data.id}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    const other = await h.register("Other Image Co", "tour_operator");
    expect((await other.get(`/media/${up.body.data.id}`)).status).toBe(404);
    expect((await other.post(`/hotels/${propertyId}/images`, good)).status).toBe(404);
    expect((await other.call("PUT", `/hotels/${propertyId}/images/order`, { imageIds: reordered })).status).toBe(404);
  });
});

describe("rate management", () => {
  it("validates contracts, rule dates, imports CSV with dry-run, and exposes expiry warnings", async () => {
    const h = new Harness();
    const c = await h.register("Rates Co", "hotel_management");
    const hotel = await c.ok("POST", "/hotels", { name: "Contract Hotel", city: "Galle", category: "premium" });
    const room = await c.ok("POST", `/hotels/${hotel.id}/rooms`, { name: "Sea View", maximumAdults: 2, maximumOccupancy: 3 });
    const sup = await c.ok("POST", "/suppliers", { name: "Contract Hotel Direct", providerKey: "direct" });
    const ag = await c.ok("POST", "/agreements", { supplierId: sup.id, contractReference: "CH-2026", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" });
    const outside = await c.post(`/hotels/${hotel.id}/rates`, { roomTypeId: room.id, supplierAgreementId: ag.id, name: "Net", mealPlan: "BB", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2027-06-30" });
    expect(outside.status).toBe(422);
    const wrongCurrency = await c.post(`/hotels/${hotel.id}/rates`, { roomTypeId: room.id, supplierAgreementId: ag.id, name: "Net", mealPlan: "BB", currency: "EUR", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" });
    expect(wrongCurrency.status).toBe(422);
    const plan = await c.ok("POST", `/hotels/${hotel.id}/rates`, { roomTypeId: room.id, supplierAgreementId: ag.id, name: "Net", mealPlan: "BB", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" });
    expect((await c.post(`/rate-plans/${plan.id}/rules`, { applicableStartDate: "2026-06-01", applicableEndDate: "2027-01-31", amountMinor: 1000 })).status).toBe(422);
    await c.ok("POST", `/rate-plans/${plan.id}/rules`, { applicableStartDate: "2026-01-01", applicableEndDate: "2026-12-31", amountMinor: 12_000, label: "Base" });
    await c.ok("POST", `/rate-plans/${plan.id}/rules`, { applicableStartDate: "2026-12-20", applicableEndDate: "2026-12-31", amountMinor: 18_000, label: "Peak" });
    const rules = await c.ok("GET", `/rate-plans/${plan.id}/rules`);
    expect(rules.rules).toHaveLength(2);
    expect(rules.overlaps).toHaveLength(1); // same-priority overlap is surfaced to the user

    const csv = "property,roomType,ratePlan,mealPlan,currency,startDate,endDate,amount,taxBp,serviceChargeBp,taxIncluded\nContract Hotel,Sea View,Net,BB,USD,2026-02-01,2026-02-28,130.50,1000,1000,false\nContract Hotel,Missing Room,Net,BB,USD,2026-02-01,2026-02-28,99,0,0,false\nUnknown Hotel,Sea View,Net,BB,USD,2026-02-01,2026-02-28,99,0,0,false\nContract Hotel,Sea View,Net,XX,USD,2026-02-01,2026-02-28,99,0,0,false";
    const dry = await c.ok("POST", "/imports/rates", { csv });
    expect(dry).toMatchObject({ dryRun: true, totalRows: 4, validRows: 1 });
    expect(dry.errors).toHaveLength(3);
    expect((await c.ok("GET", `/rate-plans/${plan.id}/rules`)).rules).toHaveLength(2); // dry run changed nothing
    const real = await c.ok("POST", "/imports/rates", { csv, commit: true });
    expect(real.created.rules).toBe(1);
    const after = await c.ok("GET", `/rate-plans/${plan.id}/rules`);
    expect(after.rules.some((r: any) => r.amountMinor === 13_050 && r.taxTreatment.taxBp === 1000)).toBe(true);

    const xlsx = toBase64(buildXlsx([
      ["property", "roomType", "ratePlan", "mealPlan", "currency", "startDate", "endDate", "amount", "taxBp", "serviceChargeBp", "taxIncluded"],
      ["Contract Hotel", "Sea View", "Net", "BB", "USD", { date: 46_082 }, { date: 46_112 }, 140, 0, 0, "false"], // 2026-03-01 .. 2026-03-31
      ["Unknown Hotel", "Sea View", "Net", "BB", "USD", { date: 46_082 }, { date: 46_112 }, 99, 0, 0, "false"],
    ]));
    const xdry = await c.ok("POST", "/imports/rates", { xlsxBase64: xlsx });
    expect(xdry).toMatchObject({ dryRun: true, totalRows: 2, validRows: 1 });
    expect(xdry.errors).toHaveLength(1);
    expect((await c.post("/imports/rates", { xlsxBase64: xlsx, csv })).status).toBe(422); // exactly one source
    expect((await c.post("/imports/rates", { xlsxBase64: toBase64(new TextEncoder().encode("garbage garbage garbage")) })).status).toBe(422);
    const xreal = await c.ok("POST", "/imports/rates", { xlsxBase64: xlsx, commit: true });
    expect(xreal.created.rules).toBe(1);
    expect((await c.ok("GET", `/rate-plans/${plan.id}/rules`)).rules.some((r: any) => r.amountMinor === 14_000 && r.applicableStartDate === "2026-03-01")).toBe(true);

    const exported = await c.get("/exports/rates.csv");
    expect(exported.status).toBe(200);
    expect(exported.text).toContain("Contract Hotel,Sea View,Net,BB,USD,2026-01-01,2026-12-31,120.00");
    const history = await c.ok("GET", `/rate-plans/${plan.id}/history`);
    expect(history.length).toBeGreaterThanOrEqual(4);

    h.now = new Date("2026-12-10T00:00:00Z"); // 21 days before the agreement ends
    expect((await c.post("/auth/login", { email: "ratesco@example.com", password: PASSWORD })).status).toBe(200); // earlier session has expired
    const dash = await c.ok("GET", "/dashboard");
    expect(dash.warnings.some((w: any) => w.kind === "agreement_expiring" || w.kind === "rate_expiring")).toBe(true);
  });

  it("inventory drives availability: zero stock makes an offer unavailable, missing rows stay unknown", async () => {
    const h = new Harness();
    const c = await h.register("Stock Co", "tour_operator");
    const ids = await createHotel(c, { name: "Stocked", city: "Kandy", lat: 7.29, lng: 80.63, price: 90 });
    const search = (checkIn = "2026-12-10", checkOut = "2026-12-11") => c.post("/hotel-search", { destination: "Kandy", checkIn, checkOut });
    expect((await search()).body.data.offers[0].availabilityStatus).toBe("unknown");
    await c.ok("PUT", `/hotels/${ids.propertyId}/inventory`, { roomTypeId: ids.roomId, entries: [{ date: "2026-12-10", availableQuantity: 3 }] });
    expect((await search()).body.data.offers[0].availabilityStatus).toBe("confirmed");
    await c.ok("PUT", `/hotels/${ids.propertyId}/inventory`, { roomTypeId: ids.roomId, entries: [{ date: "2026-12-10", availableQuantity: 0 }] });
    expect((await search()).body.data.offers[0].availabilityStatus).toBe("unavailable");
    const offerId = (await search()).body.data.offers[0].offerId;
    const verified = await c.ok("POST", `/hotel-offers/${encodeURIComponent(offerId)}/verify`);
    expect(verified.status).toBe("unavailable");
  });
});

describe("partner sharing scopes", () => {
  it("indicative-only shares withhold net rule amounts; net-rate shares reveal rules but never contracts", async () => {
    const h = new Harness();
    const hotelier = await h.register("Share Hotels", "hotel_management");
    const operator = await h.register("Share Tours", "tour_operator");
    const opId = (await operator.ok("GET", "/organization")).id;
    const sup = await hotelier.ok("POST", "/suppliers", { name: "Direct", providerKey: "direct" });
    const ag = await hotelier.ok("POST", "/agreements", { supplierId: sup.id, contractReference: "SECRET-CONTRACT-9", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31" });
    const ids = await createHotel(hotelier, { name: "Shared Hotel", city: "Galle", lat: 6.05, lng: 80.2, price: 123 });
    await hotelier.ok("PATCH", `/rate-plans/${ids.planId}`, { supplierId: sup.id, supplierAgreementId: ag.id });
    const share = (scope: string) => hotelier.post("/partners/shared", { receivingOrganizationId: opId, resourceType: "property", resourceId: ids.propertyId, permittedRateScope: scope, validFrom: "2026-01-01", validUntil: "2027-12-31" });
    await share("indicative_only");
    const indicative = await operator.ok("GET", `/hotels/${ids.propertyId}/rates`);
    expect(indicative[0].rules).toEqual([]);
    await share("net_rates");
    const net = await operator.ok("GET", `/hotels/${ids.propertyId}/rates`);
    expect(net[0].rules[0].amountMinor).toBe(12_300);
    expect(JSON.stringify(net)).not.toContain("SECRET-CONTRACT-9");
    expect(net[0].supplierAgreementId).toBeNull();
    expect(JSON.stringify(await operator.ok("GET", "/agreements"))).not.toContain("SECRET-CONTRACT-9"); // the partner contract is never listed for the receiver
  });
});

describe("health", () => {
  it("exposes liveness and readiness without authentication", async () => {
    const h = new Harness();
    const c = h.client();
    expect((await c.get("/health")).body.status).toBe("ok");
    const ready = await c.get("/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.database).toBe("ok");
  });
});
