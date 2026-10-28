import { Hono } from "hono";
import { AppError, customerSchema, paginationSchema } from "@tripweave/shared";
import { trips } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { ok, paged, parseBody, parsePatch, parseQuery, requireParam } from "../lib/http";
import { audit, getTenant, requireBusiness, requirePermission } from "../middleware/auth";

export const customerRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
customerRoutes.use("*", requireBusiness);

customerRoutes.get("/", requirePermission("customers:read"), async (c) => paged(c, await trips.listCustomers(c.get("db"), getTenant(c).organizationId, parseQuery(c, paginationSchema))));

customerRoutes.post("/", requirePermission("customers:write"), async (c) => {
  const a = getTenant(c);
  const id = await trips.createCustomer(c.get("db"), a.organizationId, await parseBody(c, customerSchema));
  await audit(c, "customer.created", "customer", id);
  return ok(c, await trips.getCustomer(c.get("db"), a.organizationId, id), 201);
});

customerRoutes.get("/:id", requirePermission("customers:read"), async (c) => {
  const r = await trips.getCustomer(c.get("db"), getTenant(c).organizationId, requireParam(c, "id"));
  if (!r) throw new AppError("not_found", "Customer not found");
  return ok(c, r);
});

customerRoutes.patch("/:id", requirePermission("customers:write"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const patch = await parsePatch(c, customerSchema);
  if (!(await trips.updateCustomer(c.get("db"), a.organizationId, id, patch))) throw new AppError("not_found", "Customer not found");
  await audit(c, "customer.updated", "customer", id, { fields: Object.keys(patch) });
  return ok(c, await trips.getCustomer(c.get("db"), a.organizationId, id));
});

customerRoutes.delete("/:id", requirePermission("customers:write"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  if (!(await trips.deleteCustomer(c.get("db"), a.organizationId, id))) throw new AppError("not_found", "Customer not found");
  await audit(c, "customer.deleted", "customer", id);
  return ok(c, { deleted: true });
});
