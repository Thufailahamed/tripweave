import { describe, expect, it } from "vitest";
import { Harness, PASSWORD, type Client } from "./harness";

async function platformAdmin(h: Harness, email = "ops@platform.example"): Promise<Client> {
  const c = await h.register("Platform Ops", "tour_operator", email);
  await h.db.prepare("UPDATE users SET platform_role = 'platform_admin' WHERE email = ?").bind(email).run();
  return c;
}

describe("platform administration", () => {
  it("requires the platform-admin role for every admin route", async () => {
    const h = new Harness();
    const tenant = await h.register("Tenant Co", "tour_operator");
    expect((await tenant.get("/admin/overview")).status).toBe(403);
    const admin = await platformAdmin(h);
    expect((await admin.get("/admin/overview")).status).toBe(200);
    expect((await admin.get("/admin/settings")).status).toBe(200);
  });

  it("enforces platform settings: sign-ups, maintenance mode and public config", async () => {
    const h = new Harness();
    const tenant = await h.register("Existing Co", "tour_operator");
    const admin = await platformAdmin(h);
    const settings = {
      signupsEnabled: false,
      maintenanceMode: false,
      supportEmail: "help@tripweave.example",
      defaultSeatLimit: 8,
      defaultOptimisationLimit: 300,
      announcementBannerEnabled: true,
    };
    expect((await admin.put("/admin/settings", settings)).status).toBe(200);
    expect((await h.client().post("/auth/register", { email: "new@x.example", password: PASSWORD, displayName: "New", organizationName: "New Co", organizationType: "tour_operator", country: "LK", defaultCurrency: "USD" })).status).toBe(403);
    expect((await admin.put("/admin/settings", { ...settings, maintenanceMode: true })).status).toBe(200);
    const blocked = await tenant.get("/trips");
    expect(blocked.status).toBe(503);
    expect(blocked.body.error.code).toBe("maintenance");
    expect((await admin.get("/admin/overview")).status).toBe(200);
    const pub = await h.client().get("/public/platform");
    expect(pub.status).toBe(200);
    expect(pub.body.data.maintenanceMode).toBe(true);
    expect(pub.body.data.supportEmail).toBe("help@tripweave.example");
    // Turn everything back on.
    expect((await admin.put("/admin/settings", { ...settings, signupsEnabled: true, maintenanceMode: false })).status).toBe(200);
    expect((await tenant.get("/trips")).status).toBe(200);
  });

  it("creates and manages organisations, protecting the last owner", async () => {
    const h = new Harness();
    const tenant = await h.register("Owner Co", "tour_operator", "owner@example.com");
    const orgId = (await tenant.ok("GET", "/organization")).id;
    const admin = await platformAdmin(h);
    const created = await admin.post("/admin/organizations", {
      name: "Managed Co",
      organizationType: "hotel_management",
      country: "LK",
      defaultCurrency: "USD",
      timezone: "Asia/Colombo",
      ownerEmail: "owner@example.com",
      ownerDisplayName: "Owner Co Owner",
    });
    expect(created.status).toBe(201);
    const managedId = created.body.data.id as string;
    const detail = await admin.ok<any>("GET", `/admin/organizations/${managedId}`);
    expect(detail.organization.name).toBe("Managed Co");
    expect(detail.members[0].role).toBe("owner");
    expect(detail.usage.members).toBe(1);
    const profile = await admin.patch(`/admin/organizations/${managedId}`, { name: "Managed Co Renamed", defaultCurrency: "EUR" });
    expect(profile.status).toBe(200);
    const add = await admin.post(`/admin/organizations/${managedId}/members`, { email: "newmember@example.com", displayName: "New Member", role: "manager", temporaryPassword: PASSWORD });
    expect(add.status).toBe(201);
    expect((await admin.post(`/admin/organizations/${managedId}/members`, { email: "newmember@example.com", role: "staff" })).status).toBe(409);
    const after = await admin.ok<any>("GET", `/admin/organizations/${managedId}`);
    const owner = after.members.find((m: any) => m.role === "owner");
    expect((await admin.patch(`/admin/organizations/${managedId}/members/${owner.id}`, { role: "admin" })).status).toBe(412);
    expect((await admin.patch(`/admin/organizations/${managedId}/members/${owner.id}`, { status: "suspended" })).status).toBe(412);
    const suspended = await admin.patch(`/admin/organizations/${managedId}/status`, { status: "suspended", reason: "Compliance review" });
    expect(suspended.status).toBe(200);
    expect((await admin.get(`/admin/organizations/${managedId}`)).body.data.organization.status).toBe("suspended");
    expect(orgId).toBeTruthy();
  });

  it("manages users: create, suspend, force sign-out, reset, platform role and self-protection", async () => {
    const h = new Harness();
    const tenant = await h.register("Member Co", "tour_operator", "member@example.com");
    const userId = (await tenant.ok<any>("GET", "/auth/me")).user.id as string;
    const admin = await platformAdmin(h);
    const list = await admin.ok<any>("GET", "/admin/users?q=member");
    expect(list.some((u: any) => u.id === userId)).toBe(true);
    expect((await admin.post(`/admin/users/${userId}/force-logout`)).status).toBe(200);
    expect((await tenant.get("/trips")).status).toBe(401);
    expect((await admin.post(`/admin/users/${userId}/unlock`)).status).toBe(200);
    expect((await admin.post(`/admin/users/${userId}/send-password-reset`)).status).toBe(200);
    expect((await admin.post(`/admin/users/${userId}/verify-email`)).status).toBe(200);
    expect((await admin.patch(`/admin/users/${userId}`, { status: "suspended" })).status).toBe(200);
    expect((await admin.patch(`/admin/users/${userId}`, { status: "active" })).status).toBe(200);
    const adminId = (await admin.ok<any>("GET", "/auth/me")).user.id as string;
    expect((await admin.patch(`/admin/users/${adminId}`, { platformRole: null })).status).toBe(403);
    expect((await admin.patch(`/admin/users/${adminId}`, { status: "suspended" })).status).toBe(403);
    expect((await admin.del(`/admin/users/${adminId}`)).status).toBe(403);
    const created = await admin.post("/admin/users", { email: "created@example.com", displayName: "Created User", platformRole: "platform_admin" });
    expect(created.status).toBe(201);
    const createdId = created.body.data.id as string;
    const createdClient = h.client();
    expect((await createdClient.post("/auth/login", { email: "created@example.com", password: "wrong-password" })).status).toBe(401);
    expect((await admin.patch(`/admin/users/${createdId}`, { displayName: "Created Renamed" })).status).toBe(200);
    expect((await admin.del(`/admin/users/${createdId}`)).status).toBe(200);
  });

  it("cancels and retries optimisation jobs as new jobs", async () => {
    const h = new Harness({}, { JOBS: { send: async () => {} } as never });
    const tenant = await h.register("Job Co", "tour_operator");
    const orgId = (await tenant.ok<any>("GET", "/organization")).id as string;
    const trip = await tenant.ok<any>("POST", "/trips", { title: "Retry trip" });
    const itineraryId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const ts = new Date().toISOString();
    await h.db.prepare("INSERT INTO itineraries (id,trip_request_id,version,title,summary,origin,arrival_information_json,departure_information_json,status,created_at,updated_at) VALUES (?,?,1,'','',NULL,'{}','{}','confirmed',?,?)").bind(itineraryId, trip.id, ts, ts).run();
    await h.db.prepare("INSERT INTO optimisation_jobs (id,organization_id,trip_request_id,itinerary_id,status,algorithm_version,request_json,constraints_snapshot_json,scoring_configuration_json,created_by,created_at) VALUES (?,?,?,?, 'queued','test','{}','{}','{}',NULL,?)").bind(jobId, orgId, trip.id, itineraryId, ts).run();
    const admin = await platformAdmin(h);
    const jobList = await admin.ok<any>("GET", "/admin/jobs?q=Retry");
    expect(jobList.some((j: any) => j.id === jobId)).toBe(true);
    expect((await admin.post(`/admin/jobs/${jobId}/cancel`)).status).toBe(200);
    const retry = await admin.post(`/admin/jobs/${jobId}/retry`);
    expect(retry.status).toBe(202);
    expect(retry.body.data.previousJobId).toBe(jobId);
    expect(retry.body.data.jobId).not.toBe(jobId);
    const newJob = await h.db.prepare("SELECT status FROM optimisation_jobs WHERE id = ?").bind(retry.body.data.jobId).first<{ status: string }>();
    expect(newJob?.status).toBe("queued");
    expect((await admin.post(`/admin/jobs/${jobId}/retry`)).status).toBe(202);
  });

  it("requires a support grant for tenant data and supports immediate revocation", async () => {
    const h = new Harness();
    const tenant = await h.register("Private Co", "tour_operator");
    await tenant.ok("POST", "/trips", { title: "Sensitive trip" });
    await tenant.ok("POST", "/hotels", { name: "Sensitive Property", city: "Kandy", category: "comfort" });
    const orgId = (await tenant.ok<any>("GET", "/organization")).id as string;
    const admin = await platformAdmin(h);
    expect((await admin.get(`/admin/organizations/${orgId}/support/summary`)).status).toBe(403);
    const redacted = await admin.ok<any>("GET", "/admin/audit?action=property.created");
    const redactedEvent = redacted.find((e: any) => e.organizationId === orgId);
    expect(redactedEvent.metadataRestricted).toBe(true);
    expect(redactedEvent.metadata.name).toBeUndefined();
    const grant = await admin.post(`/admin/organizations/${orgId}/access-grants`, { reason: "Support ticket investigation", minutes: 15 });
    expect(grant.status).toBe(201);
    const summary = await admin.ok<any>("GET", `/admin/organizations/${orgId}/support/summary`);
    expect(summary.trips[0].title).toBe("Sensitive trip");
    const visible = await admin.ok<any>("GET", "/admin/audit?action=property.created");
    const visibleEvent = visible.find((e: any) => e.organizationId === orgId);
    expect(visibleEvent.metadataRestricted).toBeUndefined();
    expect(visibleEvent.metadata.name).toBe("Sensitive Property");
    expect((await admin.del(`/admin/access-grants/${grant.body.data.grantId}`)).status).toBe(200);
    expect((await admin.get(`/admin/organizations/${orgId}/support/summary`)).status).toBe(403);
    const grants = await admin.ok<any>("GET", "/admin/access-grants?active=true");
    expect(grants.some((g: any) => g.id === grant.body.data.grantId)).toBe(false);
  });

  it("manages announcements and exposes only the active one publicly", async () => {
    const h = new Harness();
    const admin = await platformAdmin(h);
    const created = await admin.post("/admin/announcements", { title: "Scheduled maintenance", body: "Tonight at 22:00 UTC.", tone: "warning", status: "active", startsAt: null, endsAt: null });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    const pub = await h.client().get("/public/platform");
    expect(pub.body.data.announcement.title).toBe("Scheduled maintenance");
    expect(pub.body.data.announcement.tone).toBe("warning");
    expect((await admin.patch(`/admin/announcements/${id}`, { status: "archived" })).status).toBe(200);
    expect((await h.client().get("/public/platform")).body.data.announcement).toBeNull();
    expect((await admin.del(`/admin/announcements/${id}`)).status).toBe(200);
  });

  it("lists and resends outbox email, and records admin actions in the audit log", async () => {
    const h = new Harness();
    await h.register("Mail Co", "tour_operator", "mail@example.com");
    const admin = await platformAdmin(h);
    const emails = await admin.ok<any>("GET", "/admin/emails?q=mail@example.com");
    expect(emails.length).toBeGreaterThan(0);
    const emailId = emails[0].id as string;
    const stats = await admin.ok<any>("GET", "/admin/emails/stats");
    expect(stats.pending).toBeGreaterThan(0);
    const resent = await admin.post(`/admin/emails/${emailId}/resend`);
    expect(resent.status).toBe(200);
    expect(resent.body.data.id).not.toBe(emailId);
    const audit = await admin.ok<any>("GET", "/admin/audit?action=admin.");
    expect(audit.some((e: any) => e.action === "admin.email_resent")).toBe(true);
    const overview = await admin.ok<any>("GET", "/admin/overview");
    expect(overview.totals.organizations).toBeGreaterThan(0);
    expect(overview.totals.users).toBeGreaterThan(0);
    expect((await admin.ok<any>("GET", "/admin/search?q=Mail")).organizations.length).toBeGreaterThan(0);
  });
});
