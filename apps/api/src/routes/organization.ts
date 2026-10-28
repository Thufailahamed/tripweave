import { Hono } from "hono";
import { z } from "zod";
import {
  AppError, brandingSchema, inviteMemberSchema, paginationSchema, pricingConfigSchema, updateMemberSchema, updateOrganizationSchema, isSupportedCurrency,
  type FxSnapshot,
} from "@tripweave/shared";
import { identity, inventory, ops, quotes, trips } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { hashPassword } from "../lib/crypto";
import { ok, paged, parseBody, parseQuery, requireParam } from "../lib/http";
import { audit, getTenant, requirePermission, requireTenant } from "../middleware/auth";
import { DEFAULT_INTEGRATIONS, integrationSchema } from "../services/settings";

export const orgRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
orgRoutes.use("*", requireTenant);

orgRoutes.get("/organization", async (c) => {
  const a = getTenant(c);
  const db = c.get("db");
  const org = await identity.getOrganization(db, a.organizationId);
  const sub = await identity.getSubscription(db, a.organizationId);
  const seats = await identity.countActiveMembers(db, a.organizationId);
  return ok(c, { ...org, subscription: sub ? { plan: sub.plan, status: sub.status, seatLimit: Number(sub.seat_limit), monthlyOptimisationLimit: Number(sub.monthly_optimisation_limit), seatsUsed: seats, optimisationsThisMonth: await trips.countJobsThisMonth(db, a.organizationId) } : null });
});

orgRoutes.patch("/organization", requirePermission("org:manage"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, updateOrganizationSchema);
  const db = c.get("db");
  const current = await identity.getOrganization(db, a.organizationId);
  await identity.updateOrganization(db, a.organizationId, { ...body, branding: body.branding ? { ...(current?.branding ?? {}), ...body.branding } : undefined });
  await audit(c, "organization.updated", "organization", a.organizationId, { fields: Object.keys(body) });
  return ok(c, await identity.getOrganization(db, a.organizationId));
});

/* ---------- team ---------- */

orgRoutes.get("/organization/members", async (c) => ok(c, await identity.listOrganizationMembers(c.get("db"), getTenant(c).organizationId)));

orgRoutes.post("/organization/members", requirePermission("team:manage"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, inviteMemberSchema);
  const db = c.get("db");
  const sub = await identity.getSubscription(db, a.organizationId);
  if (sub && (await identity.countActiveMembers(db, a.organizationId)) >= Number(sub.seat_limit)) throw new AppError("precondition_failed", "Seat limit reached for this subscription");
  if (body.role === "admin" && a.role !== "owner") throw new AppError("forbidden", "Only the owner can grant the admin role");
  const email = body.email.toLowerCase();
  let user = await identity.findUserByEmail(db, email);
  let userId: string;
  if (user) {
    if (await identity.getMembership(db, a.organizationId, user.id)) throw new AppError("conflict", "This person is already a member of the organisation");
    userId = user.id;
  } else userId = await identity.createUser(db, { email, displayName: body.displayName, passwordHash: await hashPassword(body.temporaryPassword, c.get("deps").pbkdf2Iterations) });
  const id = await identity.addMembership(db, a.organizationId, userId, body.role);
  await audit(c, "member.added", "membership", id, { role: body.role, existingUser: !!user });
  user = await identity.findUserById(db, userId);
  return ok(c, { id, userId, email, role: body.role }, 201);
});

orgRoutes.patch("/organization/members/:id", requirePermission("team:manage"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const body = await parseBody(c, updateMemberSchema);
  const members = await identity.listOrganizationMembers(c.get("db"), a.organizationId);
  const target = members.find((m) => m.id === id);
  if (!target) throw new AppError("not_found", "Member not found");
  if (target.role === "owner") throw new AppError("forbidden", "The owner's role cannot be changed");
  if (target.userId === a.userId) throw new AppError("forbidden", "You cannot change your own role or status");
  if (a.role !== "owner" && (body.role === "admin" || target.role === "admin")) throw new AppError("forbidden", "Only the owner can grant, change or remove the admin role");
  await identity.updateMembership(c.get("db"), a.organizationId, id, body);
  if (body.status === "suspended") await identity.revokeUserSessions(c.get("db"), target.userId);
  await audit(c, "member.updated", "membership", id, body);
  return ok(c, { id, ...body });
});

orgRoutes.delete("/organization/members/:id", requirePermission("team:manage"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const target = (await identity.listOrganizationMembers(c.get("db"), a.organizationId)).find((m) => m.id === id);
  if (!target) throw new AppError("not_found", "Member not found");
  if (target.role === "owner" || target.userId === a.userId || (target.role === "admin" && a.role !== "owner")) throw new AppError("forbidden", "This member cannot be removed");
  await identity.updateMembership(c.get("db"), a.organizationId, id, { status: "removed" });
  await audit(c, "member.removed", "membership", id);
  return ok(c, { removed: true });
});

/* ---------- commercial settings ---------- */

orgRoutes.get("/organization/pricing", requirePermission("settings:pricing"), async (c) =>
  ok(c, await ops.getSetting(c.get("db"), getTenant(c).organizationId, "pricing", pricingConfigSchema.parse({}))),
);
orgRoutes.put("/organization/pricing", requirePermission("settings:pricing"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, pricingConfigSchema);
  await ops.setSetting(c.get("db"), a.organizationId, "pricing", body, a.userId);
  await audit(c, "settings.pricing_updated", "organization", a.organizationId, { mode: body.mode, targetMarginBp: body.targetMarginBp });
  return ok(c, body);
});

const fxSchema = z.object({
  pivot: z.enum(["USD", "EUR", "GBP", "LKR"]).default("USD"),
  rates: z.record(z.string(), z.string().regex(/^\d+(\.\d{1,8})?$/, "Use a positive decimal rate")).refine((r) => Object.keys(r).every(isSupportedCurrency), "Unsupported currency code").refine((r) => Object.values(r).every((v) => Number(v) > 0), "Rates must be positive"),
  source: z.string().max(80).default("manual"),
});
orgRoutes.get("/organization/fx", async (c) => ok(c, await ops.latestFxSnapshot(c.get("db"), getTenant(c).organizationId)));
orgRoutes.put("/organization/fx", requirePermission("settings:pricing"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, fxSchema);
  const snapshot: FxSnapshot = { pivot: body.pivot, rates: body.rates, source: body.source, asOf: c.get("deps").now().toISOString() };
  await ops.saveFxSnapshot(c.get("db"), a.organizationId, snapshot);
  await audit(c, "settings.fx_updated", "organization", a.organizationId, { pivot: body.pivot, currencies: Object.keys(body.rates) });
  return ok(c, snapshot);
});

/** Currencies a reader may view prices in. Viewing only: quotations still use the pricing FX snapshot. */
export const DISPLAY_CURRENCIES = ["USD", "EUR", "GBP", "LKR", "INR", "AUD", "CAD", "CHF", "JPY", "CNY", "SGD", "AED"] as const;
const DISPLAY_FX_TTL_SECONDS = 6 * 3_600;

/**
 * Market rates for showing prices in another currency (1 USD = rate). Taken from open.er-api.com, which
 * updates daily, and cached for six hours. When it is unreachable the organisation's pricing snapshot
 * is used, so the switcher still works with the currencies that snapshot covers.
 */
orgRoutes.get("/organization/fx/display", async (c) => {
  type DisplayFx = { base: "USD"; rates: Record<string, number>; asOf: string; source: string; live: boolean };
  const kv = c.env.CACHE;
  const cached = kv ? await kv.get<DisplayFx>("fx-display:USD", "json").catch(() => null) : null;
  if (cached) return ok(c, cached);
  try {
    const res = await c.get("deps").fetch("https://open.er-api.com/v6/latest/USD", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    const body = (await res.json()) as { result?: string; rates?: Record<string, unknown>; time_last_update_utc?: string };
    if (res.ok && body.result === "success" && body.rates) {
      const rates: Record<string, number> = {};
      for (const code of DISPLAY_CURRENCIES) {
        const rate = body.rates[code];
        if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) rates[code] = rate;
      }
      const asOf = body.time_last_update_utc ? new Date(body.time_last_update_utc).toISOString() : c.get("deps").now().toISOString();
      const fresh: DisplayFx = { base: "USD", rates, asOf, source: "open.er-api.com", live: true };
      await kv?.put("fx-display:USD", JSON.stringify(fresh), { expirationTtl: DISPLAY_FX_TTL_SECONDS }).catch(() => undefined);
      return ok(c, fresh);
    }
  } catch {
    // Fall through to the organisation's own rates.
  }
  const snapshot = await ops.latestFxSnapshot(c.get("db"), getTenant(c).organizationId);
  const rates: Record<string, number> = { USD: 1 };
  if (snapshot) {
    const usd = snapshot.pivot === "USD" ? 1 : Number(snapshot.rates.USD);
    for (const [code, value] of Object.entries({ ...snapshot.rates, [snapshot.pivot]: "1" })) {
      const perPivot = Number(value);
      if (usd > 0 && perPivot > 0) rates[code] = perPivot / usd;
    }
  }
  return ok(c, { base: "USD", rates, asOf: snapshot?.asOf ?? c.get("deps").now().toISOString(), source: snapshot ? `your pricing rates (${snapshot.source})` : "none", live: false });
});

/* ---------- integrations (non-secret configuration + health) ---------- */

orgRoutes.get("/organization/integrations", requirePermission("settings:integrations"), async (c) => {
  const a = getTenant(c);
  const db = c.get("db");
  const settings = await ops.getSetting(db, a.organizationId, "integrations", DEFAULT_INTEGRATIONS);
  return ok(c, {
    settings,
    platform: {
      hotelbedsConfigured: !!(c.env.HOTELBEDS_API_KEY && c.env.HOTELBEDS_SECRET),
      amadeusConfigured: !!(c.env.AMADEUS_CLIENT_ID && c.env.AMADEUS_CLIENT_SECRET),
      googleHotelsConfigured: !!c.env.SERPAPI_API_KEY,
      openStreetMapAvailable: c.env.HOTEL_DISCOVERY === "true",
      routingProvider: c.env.ROUTING_PROVIDER ?? "estimate",
      routingConfigured: c.env.ROUTING_PROVIDER !== "google" || !!c.env.GOOGLE_MAPS_API_KEY,
      workersAiAvailable: !!c.env.AI,
      externalLlmConfigured: !!(c.env.LLM_API_KEY && c.env.LLM_BASE_URL),
      emailDelivery: c.env.EMAIL_PROVIDER === "resend" && !!c.env.EMAIL_PROVIDER_API_KEY ? "resend" : "outbox_only",
      mockProviderAllowed: c.env.ENABLE_MOCK_PROVIDER === "true",
    },
    health: await ops.providerHealth(db, a.organizationId, new Date(Date.now() - 7 * 86_400_000).toISOString()),
  });
});
orgRoutes.put("/organization/integrations", requirePermission("settings:integrations"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, integrationSchema);
  if (body.mockProvider && c.env.ENABLE_MOCK_PROVIDER !== "true") throw new AppError("precondition_failed", "The mock provider is disabled in this environment");
  await ops.setSetting(c.get("db"), a.organizationId, "integrations", body, a.userId);
  await audit(c, "settings.integrations_updated", "organization", a.organizationId, body);
  return ok(c, body);
});

/* ---------- audit, notifications, partners ---------- */

orgRoutes.get("/organization/audit", requirePermission("audit:read"), async (c) => {
  const q = parseQuery(c, paginationSchema.extend({ resourceType: z.string().max(40).optional(), action: z.string().max(60).optional() }));
  return paged(c, await ops.listAudit(c.get("db"), getTenant(c).organizationId, q));
});

orgRoutes.get("/notifications", async (c) => {
  const a = getTenant(c);
  return ok(c, await ops.listNotifications(c.get("db"), a.organizationId, a.userId));
});
orgRoutes.post("/notifications/read", async (c) => {
  const a = getTenant(c);
  await ops.markNotificationsRead(c.get("db"), a.organizationId, a.userId);
  return ok(c, { read: true });
});

orgRoutes.get("/organizations/lookup", requirePermission("partners:manage"), async (c) => {
  const { slug } = parseQuery(c, z.object({ slug: z.string().min(2).max(60) }));
  const found = await c.get("db").prepare("SELECT id, name, organization_type FROM organizations WHERE slug = ? AND status = 'active' AND account_kind = 'business'").bind(slug.toLowerCase()).first<{ id: string; name: string; organization_type: string }>();
  if (!found) throw new AppError("not_found", "No organisation with that slug");
  return ok(c, { id: found.id, name: found.name, type: found.organization_type });
});

/* ---------- dashboard ---------- */

orgRoutes.get("/dashboard", async (c) => {
  const a = getTenant(c);
  const db = c.get("db");
  const [counts, expiringAgreements, expiringPlans, health, jobs, audit] = await Promise.all([
    trips.dashboardCounts(db, a.organizationId),
    a.permissions.has("agreements:manage") ? inventory.expiringAgreements(db, a.organizationId, 30) : Promise.resolve([]),
    a.permissions.has("rates:read") ? inventory.expiringRatePlans(db, a.organizationId, 30) : Promise.resolve([]),
    ops.providerHealth(db, a.organizationId, new Date(Date.now() - 24 * 3_600_000).toISOString()),
    trips.jobsNeedingAttention(db, a.organizationId),
    a.permissions.has("audit:read") ? ops.listAudit(db, a.organizationId, { page: 1, pageSize: 8 }) : Promise.resolve({ items: [] }),
  ]);
  const q = counts.quotes;
  const sent = (q.sent ?? 0) + (q.viewed ?? 0) + (q.accepted ?? 0) + (q.rejected ?? 0) + (q.expired ?? 0);
  const fx = await ops.latestFxSnapshot(db, a.organizationId);
  const warnings: { kind: string; message: string; link?: string }[] = [];
  for (const ag of expiringAgreements) warnings.push({ kind: "agreement_expiring", message: `Agreement ${ag.contractReference} (${ag.supplierName}) ends ${ag.effectiveTo}`, link: "/hotels/agreements" });
  for (const p of expiringPlans.slice(0, 5)) warnings.push({ kind: "rate_expiring", message: `${p.propertyName}: ${p.name} rate plan ends ${p.effectiveTo}`, link: `/hotels/${p.propertyId}` });
  for (const h of health) if (h.calls > 0 && h.errors / h.calls >= 0.3) warnings.push({ kind: "provider_unhealthy", message: `${h.providerKey}: ${h.errors} of ${h.calls} calls failed in the last 24h`, link: "/settings/integrations" });
  if (!fx) warnings.push({ kind: "fx_missing", message: "No exchange-rate snapshot is configured; multi-currency quotations will fail.", link: "/settings/pricing" });
  return ok(c, {
    totals: { enquiries: Object.values(counts.trips).reduce((s, n) => s + n, 0), quotesInProgress: (q.draft ?? 0) + (q.preparing ?? 0) + (q.ready_for_review ?? 0), quotesSent: (q.sent ?? 0) + (q.viewed ?? 0), accepted: q.accepted ?? 0, rejected: q.rejected ?? 0, conversionBp: sent > 0 ? Math.round(((q.accepted ?? 0) * 10_000) / sent) : 0 },
    tripsByStatus: counts.trips,
    quotesByStatus: q,
    upcomingTrips: counts.upcoming.map((t) => ({ id: t.id, title: t.title, arrivalDate: t.arrivalDate, customerName: t.customerName, status: t.status })),
    recentActivity: audit.items,
    warnings,
    jobsNeedingAttention: jobs.map((j) => ({ id: j.id, tripRequestId: j.tripRequestId, status: j.status, errorSummary: j.errorSummary, createdAt: j.createdAt })),
  });
});

export { brandingSchema };
