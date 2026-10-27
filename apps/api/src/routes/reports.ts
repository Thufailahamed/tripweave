import { Hono } from "hono";
import { z } from "zod";
import { isoDateSchema } from "@tripweave/shared";
import { ops, quotes } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { ok, parseQuery } from "../lib/http";
import { getTenant, requirePermission, requireTenant } from "../middleware/auth";

export const reportRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
reportRoutes.use("*", requireTenant, requirePermission("reports:read"));

const range = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() });

reportRoutes.get("/reports/quotation-performance", async (c) => {
  const a = getTenant(c);
  const q = parseQuery(c, range);
  const now = c.get("deps").now();
  const from = `${q.from ?? new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`;
  const to = `${q.to ?? new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)}T23:59:59.999Z`;
  const r = await quotes.quotationPerformance(c.get("db"), a.organizationId, from, to);
  return ok(c, { ...r, avgMarginBp: a.permissions.has("margins:view") ? r.avgMarginBp : undefined, range: { from, to } });
});

reportRoutes.get("/reports/supplier-performance", async (c) => {
  const a = getTenant(c);
  const since = new Date(c.get("deps").now().getTime() - 30 * 86_400_000).toISOString();
  return ok(c, { since, suppliers: await quotes.supplierPerformance(c.get("db"), a.organizationId, since), health: await ops.providerHealth(c.get("db"), a.organizationId, since), ai: await ops.aiUsageSummary(c.get("db"), a.organizationId, since) });
});
