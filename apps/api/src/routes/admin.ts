import { Hono } from "hono";
import { z } from "zod";
import { AppError, paginationSchema } from "@tripweave/shared";
import { identity, ops, trips } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { ok, paged, parseBody, parseQuery, requireParam } from "../lib/http";
import { getAuth, requirePlatformAdmin, requireAuth } from "../middleware/auth";

/** Platform-staff area. Tenant data is only reachable through an explicit, time-boxed, audited grant. */
export const adminRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
adminRoutes.use("*", requireAuth, requirePlatformAdmin);

async function adminAudit(c: Parameters<typeof getAuth>[0], action: string, organizationId: string | null, metadata?: Record<string, unknown>) {
  await ops.writeAudit(c.get("db"), { organizationId, actorUserId: getAuth(c).userId, action: `admin.${action}`, resourceType: "organization", resourceId: organizationId, metadata, requestId: c.get("requestId") });
}

adminRoutes.get("/organizations", async (c) => {
  const q = parseQuery(c, paginationSchema);
  const r = await identity.listOrganizations(c.get("db"), q);
  return paged(c, { items: r.items, total: r.total, page: q.page, pageSize: q.pageSize });
});

adminRoutes.get("/organizations/:id", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  const org = await identity.getOrganization(db, id);
  if (!org) throw new AppError("not_found", "Organisation not found");
  const counts = await db.prepare("SELECT (SELECT COUNT(*) FROM trip_requests WHERE organization_id = ?1) AS trips, (SELECT COUNT(*) FROM quotes WHERE organization_id = ?1) AS quotes, (SELECT COUNT(*) FROM properties WHERE owner_organization_id = ?1) AS properties, (SELECT COUNT(*) FROM optimisation_jobs WHERE organization_id = ?1) AS jobs").bind(id).first();
  await adminAudit(c, "organization_viewed", id);
  return ok(c, { organization: org, subscription: await identity.getSubscription(db, id), counts });
});

adminRoutes.patch("/organizations/:id/status", async (c) => {
  const id = requireParam(c, "id");
  const { status, reason } = await parseBody(c, z.object({ status: z.enum(["active", "suspended", "closed"]), reason: z.string().trim().min(3).max(300) }));
  if (!(await identity.setOrganizationStatus(c.get("db"), id, status))) throw new AppError("not_found", "Organisation not found");
  await adminAudit(c, "status_changed", id, { status, reason });
  return ok(c, { id, status });
});

adminRoutes.put("/organizations/:id/subscription", async (c) => {
  const id = requireParam(c, "id");
  const body = await parseBody(c, z.object({ plan: z.string().max(40).optional(), status: z.enum(["active", "past_due", "cancelled"]).optional(), seatLimit: z.number().int().min(1).max(10_000).optional(), monthlyOptimisationLimit: z.number().int().min(0).max(1_000_000).optional() }));
  await identity.updateSubscription(c.get("db"), id, body);
  await adminAudit(c, "subscription_updated", id, body);
  return ok(c, await identity.getSubscription(c.get("db"), id));
});

adminRoutes.post("/organizations/:id/access-grants", async (c) => {
  const id = requireParam(c, "id");
  const body = await parseBody(c, z.object({ reason: z.string().trim().min(10).max(500), minutes: z.number().int().min(5).max(240).default(30) }));
  if (!(await identity.getOrganization(c.get("db"), id))) throw new AppError("not_found", "Organisation not found");
  const expiresAt = new Date(c.get("deps").now().getTime() + body.minutes * 60_000).toISOString();
  const grantId = await identity.createAccessGrant(c.get("db"), { platformUserId: getAuth(c).userId, organizationId: id, reason: body.reason, expiresAt });
  await adminAudit(c, "access_granted", id, { reason: body.reason, minutes: body.minutes, grantId });
  return ok(c, { grantId, expiresAt }, 201);
});

/** Support investigation view: requires a live grant; every read is audited. */
adminRoutes.get("/organizations/:id/support/trips", async (c) => {
  const id = requireParam(c, "id");
  if (!(await identity.hasActiveAccessGrant(c.get("db"), getAuth(c).userId, id))) throw new AppError("forbidden", "Request a time-boxed access grant with a reason before viewing tenant data");
  await adminAudit(c, "tenant_data_viewed", id, { resource: "trips" });
  const page = await trips.listTrips(c.get("db"), id, { page: 1, pageSize: 25 });
  return ok(c, page.items.map((t) => ({ id: t.id, title: t.title, status: t.status, arrivalDate: t.arrivalDate, updatedAt: t.updatedAt })));
});
adminRoutes.get("/organizations/:id/support/audit", async (c) => {
  const id = requireParam(c, "id");
  if (!(await identity.hasActiveAccessGrant(c.get("db"), getAuth(c).userId, id))) throw new AppError("forbidden", "Request a time-boxed access grant with a reason before viewing tenant data");
  await adminAudit(c, "tenant_data_viewed", id, { resource: "audit" });
  return ok(c, (await ops.listAudit(c.get("db"), id, { page: 1, pageSize: 50 })).items);
});

adminRoutes.get("/metrics", async (c) => {
  const db = c.get("db");
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [orgs, jobs, health, pendingEmails] = await Promise.all([
    db.prepare("SELECT organization_type AS type, status, COUNT(*) AS n FROM organizations GROUP BY organization_type, status").all(),
    db.prepare("SELECT status, COUNT(*) AS n, AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL THEN (julianday(completed_at) - julianday(started_at)) * 86400000 END) AS avg_ms FROM optimisation_jobs WHERE created_at >= ? GROUP BY status").bind(since).all(),
    ops.providerHealth(db, null, since),
    db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status = 'pending'").first<{ n: number }>(),
  ]);
  return ok(c, { organizations: orgs.results, jobsLast7d: jobs.results, providerHealthPlatformWide: health, pendingEmails: pendingEmails?.n ?? 0 });
});
