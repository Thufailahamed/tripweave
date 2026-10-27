import { Hono } from "hono";
import { z } from "zod";
import {
  AppError,
  ROLES,
  currencySchema,
  isoDateSchema,
  paginationSchema,
  passwordSchema,
  slugSchema,
} from "@tripweave/shared";
import { admin as adminRepo, execute, identity, ops, trips } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { hashPassword, randomToken, sha256Hex } from "../lib/crypto";
import { ok, paged, parseBody, parsePatch, parseQuery, requireParam, type AppContext } from "../lib/http";
import { API_VERSION } from "../lib/version";
import { getAuth, requireAuth, requirePlatformAdmin } from "../middleware/auth";
import { dailyMaintenance, hourlyMaintenance } from "../services/maintenance";
import { dispatchJob } from "../services/optimisation";
import { sendEmail } from "../services/email";
import { clearPlatformSettingsCache } from "../services/platform";

/** Platform-staff area. Tenant business content is only reachable through an explicit, time-boxed, audited grant. */
export const adminRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
adminRoutes.use("*", requireAuth, requirePlatformAdmin);

async function adminAudit(
  c: AppContext,
  action: string,
  opts: { organizationId?: string | null; resourceType?: string; resourceId?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  await ops.writeAudit(c.get("db"), {
    organizationId: opts.organizationId ?? null,
    actorUserId: getAuth(c).userId,
    action: `admin.${action}`,
    resourceType: opts.resourceType ?? "platform",
    resourceId: opts.resourceId ?? opts.organizationId ?? null,
    metadata: opts.metadata,
    requestId: c.get("requestId"),
  });
}

async function restrictAuditMetadata<T extends { organizationId: string | null; action: string; metadata: Record<string, unknown> }>(
  c: AppContext,
  rows: T[],
): Promise<(T & { metadataRestricted?: boolean })[]> {
  const granted = new Set(await adminRepo.activeGrantOrganizationIds(c.get("db"), getAuth(c).userId, c.get("deps").now().toISOString()));
  return rows.map((row) => {
    const visible = row.organizationId === null || row.action.startsWith("admin.") || granted.has(row.organizationId);
    return visible ? row : { ...row, metadata: {}, metadataRestricted: true };
  });
}

async function sendResetEmail(c: AppContext, user: { id: string; email: string }): Promise<void> {  const token = randomToken(32);
  await identity.createResetToken(c.get("db"), user.id, await sha256Hex(token), new Date(c.get("deps").now().getTime() + 3_600_000).toISOString());
  await sendEmail(c.env, c.get("db"), c.get("deps"), {
    organizationId: null,
    to: user.email,
    subject: "Reset your TripWeave password",
    body: `An administrator started a password reset for your account. Use this link within one hour to choose a new password:\n${c.env.APP_BASE_URL}/reset-password?token=${token}\n\nIf you did not expect this, contact your administrator.`,
  });
}

function systemInfo(c: AppContext) {
  return {
    apiVersion: API_VERSION,
    environment: c.env.ENVIRONMENT,
    appBaseUrl: c.env.APP_BASE_URL,
    bindings: {
      database: true,
      media: !!c.env.MEDIA,
      kv: !!c.env.CACHE,
      queue: !!c.env.JOBS,
      workflow: !!c.env.OPTIMISATION_WORKFLOW,
      workersAi: !!c.env.AI,
    },
    integrations: {
      emailProvider: c.env.EMAIL_PROVIDER ?? "outbox",
      emailFrom: c.env.EMAIL_FROM_ADDRESS ?? null,
      emailConfigured: c.env.EMAIL_PROVIDER === "resend" && !!c.env.EMAIL_PROVIDER_API_KEY && !!c.env.EMAIL_FROM_ADDRESS,
      routingProvider: c.env.ROUTING_PROVIDER ?? "estimate",
      routingConfigured: c.env.ROUTING_PROVIDER !== "google" || !!c.env.GOOGLE_MAPS_API_KEY,
      externalProviderAllowList: c.env.HOTEL_EXTERNAL_PROVIDER ?? "none",
      hotelbedsConfigured: !!(c.env.HOTELBEDS_API_KEY && c.env.HOTELBEDS_SECRET),
      amadeusConfigured: !!(c.env.AMADEUS_CLIENT_ID && c.env.AMADEUS_CLIENT_SECRET),
      googleHotelsConfigured: !!c.env.SERPAPI_API_KEY,
      openStreetMapEnabled: c.env.HOTEL_DISCOVERY === "true",
      mockProviderAllowed: c.env.ENABLE_MOCK_PROVIDER === "true",
      externalLlmConfigured: !!(c.env.LLM_API_KEY && c.env.LLM_BASE_URL),
      mfaConfigured: !!c.env.MFA_ENCRYPTION_KEY,
      turnstileConfigured: !!c.env.TURNSTILE_SECRET_KEY,
    },
  };
}

/* ======================= overview ======================= */

adminRoutes.get("/overview", async (c) => {
  const db = c.get("db");
  const now = c.get("deps").now();
  const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [totals, growth, activity, jobs, quotes, types, recentOrganizations, recentAuditRaw, attention, attentionTotal, health, email, settings, plans] = await Promise.all([
    adminRepo.overviewTotals(db, now.toISOString()),
    adminRepo.growthSince(db, since30),
    adminRepo.activitySeries(db, 14, now),
    adminRepo.jobsByStatus(db),
    adminRepo.quotesByStatus(db),
    adminRepo.organizationsByTypeStatus(db),
    adminRepo.recentOrganizations(db, 6),
    adminRepo.recentAudit(db, 10),
    adminRepo.jobsNeedingAttentionPlatform(db, since7, 5),
    adminRepo.countJobsNeedingAttention(db, since7),
    ops.providerHealth(db, null, since7),
    adminRepo.emailStats(db),
    adminRepo.getPlatformSettings(db),
    adminRepo.subscriptionPlanDistribution(db),
  ]);
  const recentAudit = await restrictAuditMetadata(c, recentAuditRaw);

  const alerts: { tone: "info" | "success" | "warning" | "danger"; title: string; body: string; href?: string }[] = [];
  if (settings.maintenanceMode) alerts.push({ tone: "warning", title: "Maintenance mode is on", body: "All tenant and public API endpoints are blocked for everyone except platform staff.", href: "/admin/settings" });
  if (!settings.signupsEnabled) alerts.push({ tone: "info", title: "Registrations are closed", body: "New organisations cannot register until you re-enable sign-ups.", href: "/admin/settings" });
  if (email.failed > 0) alerts.push({ tone: "danger", title: `${email.failed} email${email.failed === 1 ? "" : "s"} failed`, body: "Review the outbox and resend after fixing the delivery configuration.", href: "/admin/communications" });
  if (attentionTotal > 0) alerts.push({ tone: "warning", title: `${attentionTotal} optimisation job${attentionTotal === 1 ? "" : "s"} need attention`, body: "Failed or infeasible jobs from the last seven days.", href: "/admin/jobs?status=failed" });
  for (const p of health) if (p.calls > 0 && p.errors / p.calls >= 0.3) alerts.push({ tone: "warning", title: `${p.providerKey} is unhealthy`, body: `${p.errors} of ${p.calls} calls failed in the last seven days.`, href: "/admin/providers" });

  return ok(c, {
    totals,
    growth,
    activity,
    jobsByStatus: jobs,
    quotesByStatus: quotes,
    organizationsByTypeStatus: types,
    recentOrganizations,
    recentAudit,
    attention,
    attentionTotal,
    providerHealth: health,
    email,
    plans,
    settings: { signupsEnabled: settings.signupsEnabled, maintenanceMode: settings.maintenanceMode, supportEmail: settings.supportEmail },
    system: systemInfo(c),
    alerts,
    generatedAt: now.toISOString(),
  });
});

/** Kept for backwards compatibility with the first admin screen. */
adminRoutes.get("/metrics", async (c) => {
  const db = c.get("db");
  const now = c.get("deps").now();
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [orgs, jobs, health, pendingEmails] = await Promise.all([
    db.prepare("SELECT organization_type AS type, status, COUNT(*) AS n FROM organizations GROUP BY organization_type, status").all(),
    db.prepare("SELECT status, COUNT(*) AS n, AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL THEN (julianday(completed_at) - julianday(started_at)) * 86400000 END) AS avg_ms FROM optimisation_jobs WHERE created_at >= ? GROUP BY status").bind(since).all(),
    ops.providerHealth(db, null, since),
    db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status = 'pending'").first<{ n: number }>(),
  ]);
  return ok(c, { organizations: orgs.results, jobsLast7d: jobs.results, providerHealthPlatformWide: health, pendingEmails: pendingEmails?.n ?? 0 });
});

adminRoutes.get("/search", async (c) => {
  const { q } = parseQuery(c, z.object({ q: z.string().trim().min(2).max(120) }));
  return ok(c, await adminRepo.globalSearch(c.get("db"), q));
});

/* ======================= organisations ======================= */

adminRoutes.get("/organizations", async (c) => {
  const q = parseQuery(c, paginationSchema.extend({ status: z.string().max(20).optional(), type: z.enum(["tour_operator", "hotel_management"]).optional() }));
  const r = await adminRepo.listOrganizations(c.get("db"), { q: q.q, status: q.status, type: q.type, page: q.page, pageSize: q.pageSize });
  return paged(c, r);
});

const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  organizationType: z.enum(["tour_operator", "hotel_management"]),
  country: z.string().trim().length(2).toUpperCase().default("LK"),
  defaultCurrency: currencySchema.default("USD"),
  timezone: z.string().max(64).default("Asia/Colombo"),
  ownerEmail: z.email().max(254),
  ownerDisplayName: z.string().trim().min(1).max(120),
  ownerPassword: passwordSchema.optional(),
});

adminRoutes.post("/organizations", async (c) => {
  const body = await parseBody(c, createOrganizationSchema);
  const db = c.get("db");
  const slug = body.slug ?? (await identity.uniqueSlug(db, body.name));
  if (body.slug && !(await identity.slugAvailable(db, slug))) throw new AppError("conflict", "That slug is already in use");
  const ownerEmail = body.ownerEmail.toLowerCase();
  const settings = await adminRepo.getPlatformSettings(db);
  const existing = await identity.findUserByEmail(db, ownerEmail);
  let organizationId: string;
  let ownerId: string;
  if (existing) {
    if (existing.status !== "active") throw new AppError("precondition_failed", "The owner account must be active");
    organizationId = await adminRepo.createOrganizationWithOwnerUserId(db, {
      name: body.name,
      slug,
      type: body.organizationType,
      country: body.country,
      currency: body.defaultCurrency,
      timezone: body.timezone,
      ownerUserId: existing.id,
      seatLimit: settings.defaultSeatLimit,
      monthlyOptimisationLimit: settings.defaultOptimisationLimit,
    });
    ownerId = existing.id;
  } else {
    const created = await identity.createOrganizationWithOwner(db, {
      name: body.name,
      slug,
      type: body.organizationType,
      country: body.country,
      currency: body.defaultCurrency,
      timezone: body.timezone,
      owner: { email: ownerEmail, displayName: body.ownerDisplayName, passwordHash: await hashPassword(body.ownerPassword ?? randomToken(32), c.get("deps").pbkdf2Iterations) },
    });
    organizationId = created.organizationId;
    ownerId = created.userId;
    await identity.updateSubscription(db, organizationId, { seatLimit: settings.defaultSeatLimit, monthlyOptimisationLimit: settings.defaultOptimisationLimit });
    if (!body.ownerPassword) {
      const owner = await identity.findUserById(db, ownerId);
      if (owner) await sendResetEmail(c, owner);
    }
  }
  await adminAudit(c, "organization_created", { organizationId, resourceType: "organization", resourceId: organizationId, metadata: { ownerEmail, ownerId, type: body.organizationType } });
  return ok(c, await identity.getOrganization(db, organizationId), 201);
});

adminRoutes.get("/organizations/:id", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  const org = await identity.getOrganization(db, id);
  if (!org) throw new AppError("not_found", "Organisation not found");
  const [subscription, usage, members, grants, adminActions, supportAccessActive] = await Promise.all([
    identity.getSubscription(db, id),
    adminRepo.organizationUsage(db, id),
    adminRepo.listMembers(db, id),
    adminRepo.listAccessGrants(db, { organizationId: id, page: 1, pageSize: 10 }),
    adminRepo.listAudit(db, { organizationId: id, action: "admin.", page: 1, pageSize: 8 }),
    identity.hasActiveAccessGrant(db, getAuth(c).userId, id),
  ]);
  await adminAudit(c, "organization_viewed", { organizationId: id, resourceType: "organization", resourceId: id });
  return ok(c, {
    organization: org,
    subscription: subscription
      ? {
          plan: String(subscription.plan),
          status: String(subscription.status),
          seatLimit: Number(subscription.seat_limit),
          monthlyOptimisationLimit: Number(subscription.monthly_optimisation_limit),
          currentPeriodEnd: subscription.current_period_end == null ? null : String(subscription.current_period_end),
        }
      : null,
    counts: { trips: usage.trips, quotes: usage.quotes, properties: usage.properties, jobs: usage.jobs },
    usage,
    members,
    accessGrants: grants.items,
    adminActions: adminActions.items,
    supportAccessActive,
  });
});

const orgProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: slugSchema.optional(),
  organizationType: z.enum(["tour_operator", "hotel_management"]).optional(),
  defaultCurrency: currencySchema.optional(),
  timezone: z.string().max(64).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
});

adminRoutes.patch("/organizations/:id", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  const body = await parsePatch(c, orgProfileSchema);
  const org = await identity.getOrganization(db, id);
  if (!org) throw new AppError("not_found", "Organisation not found");
  if (body.slug && body.slug !== org.slug && !(await identity.slugAvailable(db, body.slug))) throw new AppError("conflict", "That slug is already in use");
  if (Object.keys(body).length === 0) throw new AppError("bad_request", "No changes supplied");
  await adminRepo.updateOrganizationProfile(db, id, body);
  await adminAudit(c, "organization_updated", { organizationId: id, resourceType: "organization", resourceId: id, metadata: { fields: Object.keys(body) } });
  return ok(c, await identity.getOrganization(db, id));
});

adminRoutes.patch("/organizations/:id/status", async (c) => {
  const id = requireParam(c, "id");
  const { status, reason } = await parseBody(c, z.object({ status: z.enum(["active", "suspended", "closed"]), reason: z.string().trim().min(3).max(300) }));
  const db = c.get("db");
  if (!(await identity.setOrganizationStatus(db, id, status))) throw new AppError("not_found", "Organisation not found");
  if (status !== "active") {
    await execute(db, "UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL AND user_id IN (SELECT user_id FROM organization_memberships WHERE organization_id = ?)", [c.get("deps").now().toISOString(), id]);
  }
  await adminAudit(c, "status_changed", { organizationId: id, resourceType: "organization", resourceId: id, metadata: { status, reason } });
  return ok(c, { id, status });
});

const subscriptionSchema = z.object({
  plan: z.string().trim().min(1).max(40).optional(),
  status: z.enum(["active", "past_due", "cancelled"]).optional(),
  seatLimit: z.number().int().min(1).max(10_000).optional(),
  monthlyOptimisationLimit: z.number().int().min(0).max(1_000_000).optional(),
});

adminRoutes.put("/organizations/:id/subscription", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  if (!(await identity.getOrganization(db, id))) throw new AppError("not_found", "Organisation not found");
  const body = await parseBody(c, subscriptionSchema);
  await adminRepo.setSubscription(db, id, body);
  await adminAudit(c, "subscription_updated", { organizationId: id, resourceType: "organization", resourceId: id, metadata: body });
  const sub = await identity.getSubscription(db, id);
  return ok(c, sub ? { plan: String(sub.plan), status: String(sub.status), seatLimit: Number(sub.seat_limit), monthlyOptimisationLimit: Number(sub.monthly_optimisation_limit), currentPeriodEnd: sub.current_period_end == null ? null : String(sub.current_period_end) } : null);
});

adminRoutes.get("/organizations/:id/members", async (c) => {
  const id = requireParam(c, "id");
  if (!(await identity.getOrganization(c.get("db"), id))) throw new AppError("not_found", "Organisation not found");
  return ok(c, await adminRepo.listMembers(c.get("db"), id));
});

const adminInviteSchema = z.object({
  email: z.email().max(254),
  displayName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(ROLES),
  temporaryPassword: passwordSchema.optional(),
});

adminRoutes.post("/organizations/:id/members", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  const body = await parseBody(c, adminInviteSchema);
  if (!(await identity.getOrganization(db, id))) throw new AppError("not_found", "Organisation not found");
  const sub = await identity.getSubscription(db, id);
  if (sub && (await identity.countActiveMembers(db, id)) >= Number(sub.seat_limit)) {
    throw new AppError("precondition_failed", "Seat limit reached. Raise the seat limit before adding another member.");
  }
  const email = body.email.toLowerCase();
  let user = await identity.findUserByEmail(db, email);
  let userId: string;
  const wasExistingUser = !!user;
  const temporaryPassword = body.temporaryPassword;
  if (user) {
    if (!["active", "invited", "suspended"].includes(user.status)) throw new AppError("conflict", "That account cannot be added");
    userId = user.id;
  } else {
    if (!body.displayName) throw new AppError("validation_failed", "displayName: required for a new user", { issues: [{ path: "displayName", message: "Required for a new user" }] });
    userId = await identity.createUser(db, {
      email,
      displayName: body.displayName,
      passwordHash: await hashPassword(temporaryPassword ?? randomToken(32), c.get("deps").pbkdf2Iterations),
    });
    user = await identity.findUserById(db, userId);
  }
  const existing = await identity.getMembership(db, id, userId);
  if (userId === getAuth(c).userId) throw new AppError("forbidden", "Platform admins cannot add their own account to a tenant. Use a time-boxed support grant instead.");
  let membershipId: string;
  if (existing) {
    if (existing.status !== "removed") throw new AppError("conflict", "This person is already a member of the organisation");
    membershipId = existing.id;
    await adminRepo.updateMembership(db, id, membershipId, { role: body.role, status: "active" });
  } else {
    membershipId = await adminRepo.addMembership(db, id, userId, body.role);
  }
  if (!temporaryPassword && user) await sendResetEmail(c, user);
  if (wasExistingUser && temporaryPassword) {
    await identity.setPassword(db, userId, await hashPassword(temporaryPassword, c.get("deps").pbkdf2Iterations));
    await identity.revokeUserSessions(db, userId);
  }
  await adminAudit(c, "member_added", { organizationId: id, resourceType: "membership", resourceId: membershipId, metadata: { role: body.role, userId, existingUser: wasExistingUser } });
  return ok(c, { id: membershipId, userId, email, role: body.role, existingUser: wasExistingUser }, 201);
});

const adminMemberPatchSchema = z.object({ role: z.enum(ROLES).optional(), status: z.enum(["active", "suspended", "removed"]).optional() });

adminRoutes.patch("/organizations/:id/members/:membershipId", async (c) => {
  const id = requireParam(c, "id");
  const membershipId = requireParam(c, "membershipId");
  const db = c.get("db");
  const body = await parseBody(c, adminMemberPatchSchema);
  const target = await adminRepo.getMembership(db, id, membershipId);
  if (!target) throw new AppError("not_found", "Member not found");
  const losesOwner = target.role === "owner" && ((body.role !== undefined && body.role !== "owner") || (body.status !== undefined && body.status !== "active"));
  if (losesOwner && (await adminRepo.countActiveOwners(db, id)) <= 1) throw new AppError("precondition_failed", "This is the organisation's last active owner. Add another owner first.");
  await adminRepo.updateMembership(db, id, membershipId, body);
  if (body.status === "suspended" || body.status === "removed") await identity.revokeUserSessions(db, target.userId);
  await adminAudit(c, "member_updated", { organizationId: id, resourceType: "membership", resourceId: membershipId, metadata: { ...body, userId: target.userId } });
  return ok(c, { id: membershipId, ...body });
});

adminRoutes.delete("/organizations/:id/members/:membershipId", async (c) => {
  const id = requireParam(c, "id");
  const membershipId = requireParam(c, "membershipId");
  const db = c.get("db");
  const target = await adminRepo.getMembership(db, id, membershipId);
  if (!target) throw new AppError("not_found", "Member not found");
  if (target.role === "owner" && (await adminRepo.countActiveOwners(db, id)) <= 1) throw new AppError("precondition_failed", "This is the organisation's last active owner. Add another owner first.");
  await adminRepo.updateMembership(db, id, membershipId, { status: "removed" });
  await identity.revokeUserSessions(db, target.userId);
  await adminAudit(c, "member_removed", { organizationId: id, resourceType: "membership", resourceId: membershipId, metadata: { userId: target.userId, role: target.role } });
  return ok(c, { removed: true });
});

/* ======================= support access ======================= */

adminRoutes.post("/organizations/:id/access-grants", async (c) => {
  const id = requireParam(c, "id");
  const body = await parseBody(c, z.object({ reason: z.string().trim().min(10).max(500), minutes: z.number().int().min(5).max(240).default(30) }));
  if (!(await identity.getOrganization(c.get("db"), id))) throw new AppError("not_found", "Organisation not found");
  const expiresAt = new Date(c.get("deps").now().getTime() + body.minutes * 60_000).toISOString();
  const grantId = await identity.createAccessGrant(c.get("db"), { platformUserId: getAuth(c).userId, organizationId: id, reason: body.reason, expiresAt });
  await adminAudit(c, "access_granted", { organizationId: id, resourceType: "organization", resourceId: id, metadata: { reason: body.reason, minutes: body.minutes, grantId } });
  return ok(c, { grantId, expiresAt }, 201);
});

adminRoutes.get("/organizations/:id/access-grants", async (c) => {
  const id = requireParam(c, "id");
  const q = parseQuery(c, paginationSchema);
  if (!(await identity.getOrganization(c.get("db"), id))) throw new AppError("not_found", "Organisation not found");
  return paged(c, await adminRepo.listAccessGrants(c.get("db"), { organizationId: id, page: q.page, pageSize: q.pageSize }, c.get("deps").now().toISOString()));
});

async function requireGrant(c: AppContext, organizationId: string): Promise<void> {
  if (!(await identity.hasActiveAccessGrant(c.get("db"), getAuth(c).userId, organizationId))) {
    throw new AppError("forbidden", "Request a time-boxed access grant with a reason before viewing tenant data");
  }
}

adminRoutes.get("/organizations/:id/support/trips", async (c) => {
  const id = requireParam(c, "id");
  await requireGrant(c, id);
  await adminAudit(c, "tenant_data_viewed", { organizationId: id, resourceType: "organization", resourceId: id, metadata: { resource: "trips" } });
  const page = await trips.listTrips(c.get("db"), id, { page: 1, pageSize: 25 });
  return ok(c, page.items.map((t) => ({ id: t.id, title: t.title, status: t.status, arrivalDate: t.arrivalDate, updatedAt: t.updatedAt })));
});

adminRoutes.get("/organizations/:id/support/audit", async (c) => {
  const id = requireParam(c, "id");
  await requireGrant(c, id);
  await adminAudit(c, "tenant_data_viewed", { organizationId: id, resourceType: "organization", resourceId: id, metadata: { resource: "audit" } });
  return ok(c, (await ops.listAudit(c.get("db"), id, { page: 1, pageSize: 50 })).items);
});

adminRoutes.get("/organizations/:id/support/summary", async (c) => {
  const id = requireParam(c, "id");
  await requireGrant(c, id);
  await adminAudit(c, "tenant_data_viewed", { organizationId: id, resourceType: "organization", resourceId: id, metadata: { resource: "summary" } });
  return ok(c, await adminRepo.supportSummary(c.get("db"), id));
});

adminRoutes.get("/access-grants", async (c) => {
  const q = parseQuery(c, paginationSchema.extend({ active: z.enum(["true", "false"]).optional() }));
  return paged(c, await adminRepo.listAccessGrants(c.get("db"), { activeOnly: q.active === "true", page: q.page, pageSize: q.pageSize }, c.get("deps").now().toISOString()));
});

adminRoutes.delete("/access-grants/:id", async (c) => {
  const id = requireParam(c, "id");
  const grant = await adminRepo.getAccessGrant(c.get("db"), id);
  if (!grant) throw new AppError("not_found", "Access grant not found");
  if (!(await adminRepo.revokeAccessGrant(c.get("db"), id))) throw new AppError("conflict", "This grant is already revoked");
  await adminAudit(c, "access_grant_revoked", { organizationId: grant.organizationId, resourceType: "organization", resourceId: grant.organizationId, metadata: { grantId: id, platformUserId: grant.platformUserId } });
  return ok(c, { revoked: true });
});

/* ======================= users ======================= */

adminRoutes.get("/users", async (c) => {
  const q = parseQuery(
    c,
    paginationSchema.extend({
      status: z.enum(["active", "suspended", "invited"]).optional(),
      platformAdmin: z.enum(["true", "false"]).optional(),
      organizationId: z.string().max(80).optional(),
    }),
  );
  return paged(
    c,
    await adminRepo.listUsers(c.get("db"), {
      q: q.q,
      status: q.status,
      platformAdmin: q.platformAdmin === undefined ? undefined : q.platformAdmin === "true",
      organizationId: q.organizationId,
      page: q.page,
      pageSize: q.pageSize,
    }),
  );
});

const createUserSchema = z
  .object({
    email: z.email().max(254),
    displayName: z.string().trim().min(1).max(120),
    password: passwordSchema.optional(),
    platformRole: z.enum(["platform_admin"]).nullable().optional(),
    organizationId: z.string().min(1).max(80).optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((v) => !v.organizationId || !!v.role, { message: "role is required when adding the user to an organisation", path: ["role"] });

adminRoutes.post("/users", async (c) => {
  const body = await parseBody(c, createUserSchema);
  const db = c.get("db");
  const email = body.email.toLowerCase();
  if (await identity.findUserByEmail(db, email)) throw new AppError("conflict", "An account with this email already exists");
  if (body.organizationId && !(await identity.getOrganization(db, body.organizationId))) throw new AppError("not_found", "Organisation not found");
  if (body.organizationId) {
    const sub = await identity.getSubscription(db, body.organizationId);
    if (sub && (await identity.countActiveMembers(db, body.organizationId)) >= Number(sub.seat_limit)) throw new AppError("precondition_failed", "Seat limit reached for that organisation");
  }
  const userId = await identity.createUser(db, {
    email,
    displayName: body.displayName,
    passwordHash: await hashPassword(body.password ?? randomToken(32), c.get("deps").pbkdf2Iterations),
  });
  if (body.platformRole) await adminRepo.updateUser(db, userId, { platformRole: body.platformRole });
  if (body.organizationId) {
    await adminRepo.addMembership(db, body.organizationId, userId, body.role ?? "staff");
  }
  const user = await identity.findUserById(db, userId);
  if (user && !body.password) await sendResetEmail(c, user);
  await adminAudit(c, "user_created", { organizationId: body.organizationId ?? null, resourceType: "user", resourceId: userId, metadata: { email, platformRole: body.platformRole ?? null, organizationId: body.organizationId ?? null, role: body.role ?? null } });
  return ok(c, await adminRepo.getUserDetail(db, userId), 201);
});

adminRoutes.get("/users/:id", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  const user = await adminRepo.getUserDetail(db, id);
  if (!user) throw new AppError("not_found", "User not found");
  const [memberships, sessions, auditPage, ownedOrganizations] = await Promise.all([
    adminRepo.listUserMemberships(db, id),
    adminRepo.listUserSessions(db, id),
    adminRepo.listAudit(db, { actorUserId: id, page: 1, pageSize: 30 }),
    adminRepo.soleOwnedOrganizations(db, id),
  ]);
  return ok(c, { user, memberships, sessions, audit: await restrictAuditMetadata(c, auditPage.items), ownedOrganizations });
});

const adminUserPatchSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  email: z.email().max(254).optional(),
  status: z.enum(["active", "suspended", "invited"]).optional(),
  platformRole: z.enum(["platform_admin"]).nullable().optional(),
  emailVerified: z.boolean().optional(),
});

adminRoutes.patch("/users/:id", async (c) => {
  const id = requireParam(c, "id");
  const actor = getAuth(c);
  const db = c.get("db");
  const body = await parsePatch(c, adminUserPatchSchema);
  const target = await identity.findUserById(db, id);
  if (!target) throw new AppError("not_found", "User not found");
  if (id === actor.userId && body.status !== undefined && body.status !== "active") throw new AppError("forbidden", "You cannot suspend your own account");
  if (id === actor.userId && body.platformRole === null) throw new AppError("forbidden", "You cannot remove your own platform-admin role");
  if (Object.keys(body).length === 0) throw new AppError("bad_request", "No changes supplied");
  if (body.email) {
    const other = await identity.findUserByEmail(db, body.email.toLowerCase());
    if (other && other.id !== id) throw new AppError("conflict", "That email address is already in use");
    if (body.email.toLowerCase() !== target.email.toLowerCase() && body.emailVerified === undefined) body.emailVerified = false;
  }
  await adminRepo.updateUser(db, id, body);
  if (body.status === "active") await adminRepo.unlockUser(db, id);
  if (body.status === "suspended" || body.platformRole === null) await identity.revokeUserSessions(db, id);
  await adminAudit(c, "user_updated", { resourceType: "user", resourceId: id, metadata: { fields: Object.keys(body), email: target.email } });
  return ok(c, await adminRepo.getUserDetail(db, id));
});

adminRoutes.delete("/users/:id", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  if (id === getAuth(c).userId) throw new AppError("forbidden", "You cannot delete your own account");
  const target = await identity.findUserById(db, id);
  if (!target) throw new AppError("not_found", "User not found");
  const owned = await adminRepo.soleOwnedOrganizations(db, id);
  if (owned.length > 0) throw new AppError("precondition_failed", `This user is the only active owner of ${owned.map((o) => o.name).join(", ")}. Transfer ownership first.`);
  if (target.platformRole === "platform_admin" && (await adminRepo.countPlatformAdmins(db)) <= 1) throw new AppError("precondition_failed", "The platform needs at least one active administrator");
  const refs = await adminRepo.userReferenceCounts(db, id);
  const referenced = refs.trips + refs.quotes + refs.jobs + refs.documents + refs.grants;
  if (referenced > 0) {
    throw new AppError(
      "precondition_failed",
      `This account is referenced by ${refs.trips} trip(s), ${refs.quotes} quotation(s), ${refs.jobs} job(s), ${refs.documents} document(s) and ${refs.grants} access grant(s). Suspend it instead so history and attribution stay intact.`,
    );
  }
  await adminRepo.deleteUser(db, id);
  await adminAudit(c, "user_deleted", { resourceType: "user", resourceId: id, metadata: { email: target.email } });
  return ok(c, { deleted: true });
});

adminRoutes.post("/users/:id/unlock", async (c) => {
  const id = requireParam(c, "id");
  if (!(await adminRepo.unlockUser(c.get("db"), id))) throw new AppError("not_found", "User not found");
  await adminAudit(c, "user_unlocked", { resourceType: "user", resourceId: id });
  return ok(c, { unlocked: true });
});

adminRoutes.post("/users/:id/force-logout", async (c) => {
  const id = requireParam(c, "id");
  if (!(await identity.findUserById(c.get("db"), id))) throw new AppError("not_found", "User not found");
  await identity.revokeUserSessions(c.get("db"), id);
  await adminAudit(c, "user_sessions_revoked", { resourceType: "user", resourceId: id });
  return ok(c, { revoked: true });
});

adminRoutes.post("/users/:id/send-password-reset", async (c) => {
  const id = requireParam(c, "id");
  const user = await identity.findUserById(c.get("db"), id);
  if (!user) throw new AppError("not_found", "User not found");
  await sendResetEmail(c, user);
  await adminAudit(c, "user_password_reset_sent", { resourceType: "user", resourceId: id, metadata: { email: user.email } });
  return ok(c, { queued: true, email: user.email });
});

adminRoutes.post("/users/:id/verify-email", async (c) => {
  const id = requireParam(c, "id");
  if (!(await identity.findUserById(c.get("db"), id))) throw new AppError("not_found", "User not found");
  await adminRepo.updateUser(c.get("db"), id, { emailVerified: true });
  await adminAudit(c, "user_email_verified", { resourceType: "user", resourceId: id });
  return ok(c, { verified: true });
});

adminRoutes.post("/users/:id/mfa/disable", async (c) => {
  const id = requireParam(c, "id");
  if (!(await identity.findUserById(c.get("db"), id))) throw new AppError("not_found", "User not found");
  await identity.deleteMfa(c.get("db"), id);
  await identity.revokeUserSessions(c.get("db"), id);
  await adminAudit(c, "user_mfa_disabled", { resourceType: "user", resourceId: id });
  return ok(c, { disabled: true });
});

adminRoutes.post("/users/:id/memberships", async (c) => {
  const id = requireParam(c, "id");
  const body = await parseBody(c, z.object({ organizationId: z.string().min(1).max(80), role: z.enum(ROLES) }));
  const db = c.get("db");
  if (id === getAuth(c).userId) throw new AppError("forbidden", "You cannot add your own platform-admin account to a tenant. Use a time-boxed support grant instead.");
  if (!(await identity.findUserById(db, id))) throw new AppError("not_found", "User not found");
  if (!(await identity.getOrganization(db, body.organizationId))) throw new AppError("not_found", "Organisation not found");
  const existing = await identity.getMembership(db, body.organizationId, id);
  if (existing && existing.status !== "removed") throw new AppError("conflict", "This user is already a member of that organisation");
  const sub = await identity.getSubscription(db, body.organizationId);
  if (sub && (await identity.countActiveMembers(db, body.organizationId)) >= Number(sub.seat_limit)) throw new AppError("precondition_failed", "Seat limit reached for that organisation");
  const membershipId = existing ? existing.id : await adminRepo.addMembership(db, body.organizationId, id, body.role);
  if (existing) await adminRepo.updateMembership(db, body.organizationId, membershipId, { role: body.role, status: "active" });
  await adminAudit(c, "user_membership_added", { organizationId: body.organizationId, resourceType: "membership", resourceId: membershipId, metadata: { userId: id, role: body.role } });
  return ok(c, { id: membershipId, organizationId: body.organizationId, role: body.role }, 201);
});

/* ======================= optimisation jobs ======================= */

adminRoutes.get("/jobs", async (c) => {
  const q = parseQuery(
    c,
    paginationSchema.extend({
      status: z.enum(["queued", "running", "succeeded", "failed", "infeasible", "cancelled"]).optional(),
      organizationId: z.string().max(80).optional(),
    }),
  );
  return paged(c, await adminRepo.listJobs(c.get("db"), { status: q.status, organizationId: q.organizationId, q: q.q, page: q.page, pageSize: q.pageSize }));
});

adminRoutes.get("/jobs/:id", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  const job = await adminRepo.getJobDetail(db, id);
  if (!job) throw new AppError("not_found", "Optimisation job not found");
  const tenantAccess = await identity.hasActiveAccessGrant(db, getAuth(c).userId, job.organizationId);
  if (tenantAccess) await adminAudit(c, "tenant_data_viewed", { organizationId: job.organizationId, resourceType: "optimisation_job", resourceId: id, metadata: { resource: "job_detail" } });
  await adminAudit(c, "job_viewed", { organizationId: job.organizationId, resourceType: "optimisation_job", resourceId: id, metadata: { tenantAccess } });
  return ok(c, {
    ...job,
    tripTitle: tenantAccess ? job.tripTitle : null,
    request: tenantAccess ? job.request : null,
    constraints: tenantAccess ? job.constraints : null,
    scoring: tenantAccess ? job.scoring : null,
    resultSummary: tenantAccess ? job.resultSummary : null,
    fx: tenantAccess ? job.fx : null,
    tenantAccess,
  });
});

adminRoutes.post("/jobs/:id/cancel", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  const job = await adminRepo.getJobDetail(db, id);
  if (!job) throw new AppError("not_found", "Optimisation job not found");
  if (!(await adminRepo.cancelJob(db, id))) throw new AppError("invalid_transition", "Only queued or running jobs can be cancelled");
  await adminAudit(c, "job_cancelled", { organizationId: job.organizationId, resourceType: "optimisation_job", resourceId: id });
  return ok(c, { id, status: "cancelled" });
});

adminRoutes.post("/jobs/:id/retry", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  const job = await adminRepo.getJobDetail(db, id);
  if (!job) throw new AppError("not_found", "Optimisation job not found");
  if (!["failed", "infeasible", "cancelled"].includes(job.status)) throw new AppError("invalid_transition", "Only failed, infeasible or cancelled jobs can be retried");
  const newJobId = await adminRepo.cloneJobForRetry(db, id, getAuth(c).userId);
  if (!newJobId) throw new AppError("conflict", "The job could not be copied");
  await dispatchJob({ env: c.env, db, deps: c.get("deps") }, { type: "optimise", jobId: newJobId, organizationId: job.organizationId });
  await adminAudit(c, "job_retried", { organizationId: job.organizationId, resourceType: "optimisation_job", resourceId: newJobId, metadata: { previousJobId: id } });
  return ok(c, { jobId: newJobId, status: "queued", previousJobId: id }, 202);
});

/* ======================= audit ======================= */

adminRoutes.get("/audit", async (c) => {
  const q = parseQuery(
    c,
    paginationSchema.extend({
      action: z.string().max(80).optional(),
      resourceType: z.string().max(60).optional(),
      organizationId: z.string().max(80).optional(),
      actorUserId: z.string().max(80).optional(),
      from: isoDateSchema.optional(),
      to: isoDateSchema.optional(),
    }),
  );
  const page = await adminRepo.listAudit(c.get("db"), { ...q, page: q.page, pageSize: q.pageSize });
  return paged(c, { ...page, items: await restrictAuditMetadata(c, page.items) });
});

adminRoutes.get("/audit/facets", async (c) => ok(c, await adminRepo.auditFacets(c.get("db"))));

/* ======================= email outbox ======================= */

adminRoutes.get("/emails", async (c) => {
  const q = parseQuery(
    c,
    paginationSchema.extend({ status: z.enum(["pending", "sent", "failed"]).optional(), organizationId: z.string().max(80).optional() }),
  );
  return paged(c, await adminRepo.listEmails(c.get("db"), { status: q.status, q: q.q, organizationId: q.organizationId, page: q.page, pageSize: q.pageSize }));
});

adminRoutes.get("/emails/stats", async (c) => ok(c, await adminRepo.emailStats(c.get("db"))));

adminRoutes.post("/emails/:id/resend", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  const mail = await adminRepo.getEmail(db, id);
  if (!mail) throw new AppError("not_found", "Email not found");
  const sent = await sendEmail(c.env, db, c.get("deps"), { organizationId: mail.organizationId, to: mail.toEmail, subject: mail.subject, body: mail.bodyText });
  await adminAudit(c, "email_resent", { organizationId: mail.organizationId, resourceType: "email", resourceId: sent.id, metadata: { originalId: id, to: mail.toEmail } });
  return ok(c, sent);
});

/* ======================= announcements ======================= */

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().max(4000).default(""),
  tone: z.enum(["info", "success", "warning", "danger"]).default("info"),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  startsAt: z.string().trim().max(40).refine((v) => !Number.isNaN(Date.parse(v)), "Use a valid date/time").nullable().optional(),
  endsAt: z.string().trim().max(40).refine((v) => !Number.isNaN(Date.parse(v)), "Use a valid date/time").nullable().optional(),
});

function checkAnnouncementWindow(startsAt: string | null | undefined, endsAt: string | null | undefined): void {
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new AppError("validation_failed", "endsAt: the end must be after the start", { issues: [{ path: "endsAt", message: "The end must be after the start" }] });
  }
}

adminRoutes.get("/announcements", async (c) => {
  const q = parseQuery(c, paginationSchema.extend({ status: z.enum(["draft", "active", "archived"]).optional() }));
  return paged(c, await adminRepo.listAnnouncements(c.get("db"), { status: q.status, page: q.page, pageSize: q.pageSize }));
});

adminRoutes.post("/announcements", async (c) => {
  const body = await parseBody(c, announcementSchema);
  checkAnnouncementWindow(body.startsAt, body.endsAt);
  const id = await adminRepo.createAnnouncement(c.get("db"), { ...body, startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null, createdBy: getAuth(c).userId });
  await adminAudit(c, "announcement_created", { resourceType: "announcement", resourceId: id, metadata: { title: body.title, status: body.status, tone: body.tone } });
  return ok(c, await adminRepo.getAnnouncement(c.get("db"), id), 201);
});

adminRoutes.patch("/announcements/:id", async (c) => {
  const id = requireParam(c, "id");
  const db = c.get("db");
  const existing = await adminRepo.getAnnouncement(db, id);
  if (!existing) throw new AppError("not_found", "Announcement not found");
  const body = await parsePatch(c, announcementSchema);
  if (Object.keys(body).length === 0) throw new AppError("bad_request", "No changes supplied");
  checkAnnouncementWindow(body.startsAt !== undefined ? body.startsAt : existing.startsAt, body.endsAt !== undefined ? body.endsAt : existing.endsAt);
  await adminRepo.updateAnnouncement(db, id, body);
  await adminAudit(c, "announcement_updated", { resourceType: "announcement", resourceId: id, metadata: { fields: Object.keys(body) } });
  return ok(c, await adminRepo.getAnnouncement(db, id));
});

adminRoutes.delete("/announcements/:id", async (c) => {
  const id = requireParam(c, "id");
  const existing = await adminRepo.getAnnouncement(c.get("db"), id);
  if (!existing) throw new AppError("not_found", "Announcement not found");
  await adminRepo.deleteAnnouncement(c.get("db"), id);
  await adminAudit(c, "announcement_deleted", { resourceType: "announcement", resourceId: id, metadata: { title: existing.title } });
  return ok(c, { deleted: true });
});

/* ======================= providers & usage ======================= */

adminRoutes.get("/providers", async (c) => {
  const db = c.get("db");
  const now = c.get("deps").now();
  const since24 = new Date(now.getTime() - 86_400_000).toISOString();
  const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const since14 = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [health24, health7, usage, ai, sync, email] = await Promise.all([
    ops.providerHealth(db, null, since24),
    ops.providerHealth(db, null, since7),
    adminRepo.providerUsageSeries(db, since14),
    adminRepo.aiUsagePlatform(db, since30),
    adminRepo.listSyncJobs(db, 1, 25),
    adminRepo.emailStats(db),
  ]);
  return ok(c, { health24, health7, usage, ai, syncJobs: sync.items, syncJobsTotal: sync.total, email, system: systemInfo(c) });
});

/* ======================= settings & system ======================= */

adminRoutes.get("/settings", async (c) => {
  const db = c.get("db");
  const [settings, platformAdmins, tableCounts, email] = await Promise.all([
    adminRepo.getPlatformSettings(db),
    adminRepo.listPlatformAdmins(db),
    adminRepo.tableCounts(db),
    adminRepo.emailStats(db),
  ]);
  return ok(c, { settings, platformAdmins, tableCounts, email, system: systemInfo(c) });
});

const platformSettingsSchema = z.object({
  signupsEnabled: z.boolean(),
  maintenanceMode: z.boolean(),
  supportEmail: z.union([z.literal(""), z.email().max(254)]),
  defaultSeatLimit: z.number().int().min(1).max(10_000),
  defaultOptimisationLimit: z.number().int().min(0).max(1_000_000),
  announcementBannerEnabled: z.boolean(),
});

adminRoutes.put("/settings", async (c) => {
  const body = await parseBody(c, platformSettingsSchema);
  const db = c.get("db");
  const settings = await adminRepo.setPlatformSettings(db, body, getAuth(c).userId, c.get("deps").now().toISOString());
  clearPlatformSettingsCache(db);
  await adminAudit(c, "settings_updated", {
    metadata: {
      signupsEnabled: body.signupsEnabled,
      maintenanceMode: body.maintenanceMode,
      supportEmail: body.supportEmail,
      defaultSeatLimit: body.defaultSeatLimit,
      defaultOptimisationLimit: body.defaultOptimisationLimit,
      announcementBannerEnabled: body.announcementBannerEnabled,
    },
  });
  return ok(c, settings);
});

adminRoutes.post("/system/maintenance/hourly", async (c) => {
  const result = await hourlyMaintenance(c.env, c.get("deps").now());
  await adminAudit(c, "maintenance_hourly_run", { metadata: result });
  return ok(c, result);
});

adminRoutes.post("/system/maintenance/daily", async (c) => {
  const result = await dailyMaintenance(c.env, c.get("deps").now());
  await adminAudit(c, "maintenance_daily_run", { metadata: result });
  return ok(c, result);
});
