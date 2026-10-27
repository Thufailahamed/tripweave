import { Hono } from "hono";
import { z } from "zod";
import {
  AppError, inventoryUpsertSchema, paginationSchema, partnerAccessSchema, propertySchema, ratePlanSchema, ratePlanUpdateSchema, rateRuleSchema, rateRuleUpdateSchema, roomTypeSchema, supplierAgreementSchema, supplierAgreementUpdateSchema, supplierSchema,
  isoDateSchema, hotelCategorySchema, toMinorUnits, rateImportRowSchema, MEAL_PLANS,
} from "@tripweave/shared";
import { identity, inventory, ops, trips } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { parseXlsx } from "../lib/xlsx";
import { csvEscape, ok, paged, parseBody, parseCsv, parsePatch, parseQuery, requireParam, type AppContext } from "../lib/http";
import { audit, can, getTenant, requirePermission, requireTenant } from "../middleware/auth";

export const hotelRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
hotelRoutes.use("*", requireTenant);

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function ownedProperty(c: AppContext, id: string) {
  const p = await inventory.getOwnedProperty(c.get("db"), getTenant(c).organizationId, id);
  if (!p) {
    // Distinguish "not yours" from "doesn't exist" only as far as visibility allows.
    const visible = await inventory.getVisibleProperty(c.get("db"), getTenant(c).organizationId, id);
    if (visible) throw new AppError("forbidden", "This property belongs to another organisation and is read-only for you");
    throw new AppError("not_found", "Property not found");
  }
  return p;
}

/* ======================= properties ======================= */

const listQuery = paginationSchema.extend({
  city: z.string().max(80).optional(), category: hotelCategorySchema.optional(), amenity: z.string().max(60).optional(),
  status: z.enum(["active", "inactive", "draft"]).optional(), scope: z.enum(["own", "all"]).default("all"),
});

hotelRoutes.get("/hotels", requirePermission("hotels:read"), async (c) => {
  const a = getTenant(c);
  const q = parseQuery(c, listQuery);
  const page = await inventory.listProperties(c.get("db"), a.organizationId, q);
  const images = await inventory.firstImagesFor(c.get("db"), page.items.map((p) => p.id));
  return paged(c, { ...page, items: page.items.map((p) => ({ ...p, coverImageId: images.get(p.id) ?? null })) });
});

hotelRoutes.post("/hotels", requirePermission("hotels:write"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, propertySchema);
  const id = await inventory.createProperty(c.get("db"), a.organizationId, body);
  await audit(c, "property.created", "property", id, { name: body.name });
  return ok(c, await inventory.getOwnedProperty(c.get("db"), a.organizationId, id), 201);
});

hotelRoutes.get("/hotels/:id", requirePermission("hotels:read"), async (c) => {
  const a = getTenant(c);
  const db = c.get("db");
  const property = await inventory.getVisibleProperty(db, a.organizationId, requireParam(c, "id"));
  if (!property) throw new AppError("not_found", "Property not found");
  const [images, rooms] = await Promise.all([inventory.listImages(db, property.id), inventory.listRoomTypes(db, property.id)]);
  const plans = can(c, "rates:read") ? await inventory.listVisibleRatePlans(db, a.organizationId, property.id) : [];
  const ratePlans = plans.map((p) => (p.shared ? { ...p, supplierId: null, supplierAgreementId: null } : p));
  return ok(c, { property, images, rooms, ratePlans, canEdit: property.access === "owner" });
});

hotelRoutes.patch("/hotels/:id", requirePermission("hotels:write"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  await ownedProperty(c, id);
  const patch = await parsePatch(c, propertySchema);
  await inventory.updateProperty(c.get("db"), a.organizationId, id, patch);
  await audit(c, "property.updated", "property", id, { fields: Object.keys(patch) });
  return ok(c, await inventory.getOwnedProperty(c.get("db"), a.organizationId, id));
});

/* ---------- images ---------- */

hotelRoutes.post("/hotels/:id/images", requirePermission("hotels:write"), async (c) => {
  const id = requireParam(c, "id");
  await ownedProperty(c, id);
  const db = c.get("db");
  const ct = c.req.header("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await parseBody(c, z.object({ sourceUrl: z.string().url().max(500).refine((u) => u.startsWith("https://"), "Use an https URL"), altText: z.string().max(200).default(""), usageRights: z.record(z.string(), z.unknown()).default({}) }));
    const imageId = await inventory.addImage(db, id, { sourceUrl: body.sourceUrl, altText: body.altText, imageSource: "external_url", usageRights: body.usageRights });
    await audit(c, "property.image_added", "property", id, { imageId, kind: "url" });
    return ok(c, { id: imageId }, 201);
  }
  if (!c.env.MEDIA) throw new AppError("precondition_failed", "Image storage (R2) is not configured in this environment");
  const form = await c.req.formData();
  const field = form.get("file") as unknown;
  if (!field || typeof field === "string") throw new AppError("bad_request", "Attach the image as form field 'file'");
  const file = field as File;
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new AppError("validation_failed", "Only JPEG, PNG or WebP images are allowed");
  if (file.size > MAX_IMAGE_BYTES) throw new AppError("validation_failed", "Images must be 5 MB or smaller");
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Verify magic bytes so a mislabelled file cannot be stored as an image.
  const magicOk = (file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) || (file.type === "image/png" && bytes[0] === 0x89 && bytes[1] === 0x50) || (file.type === "image/webp" && bytes[8] === 0x57 && bytes[9] === 0x45);
  if (!magicOk) throw new AppError("validation_failed", "The file content does not match its image type");
  const key = `images/${getTenant(c).organizationId}/${id}/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type } });
  const altText = String(form.get("altText") ?? "").slice(0, 200);
  const imageId = await inventory.addImage(db, id, { r2ObjectKey: key, contentType: file.type, altText, imageSource: "upload", usageRights: { uploadedBy: getTenant(c).userId } });
  await audit(c, "property.image_added", "property", id, { imageId, kind: "upload", bytes: bytes.length });
  return ok(c, { id: imageId }, 201);
});

/** Sets the display order; the first image becomes the catalogue cover. Send every image id exactly once. */
hotelRoutes.put("/hotels/:id/images/order", requirePermission("hotels:write"), async (c) => {
  const id = requireParam(c, "id");
  await ownedProperty(c, id);
  const body = await parseBody(c, z.object({ imageIds: z.array(z.string().min(1)).min(1).max(200) }));
  if (!(await inventory.reorderImages(c.get("db"), id, body.imageIds))) throw new AppError("validation_failed", "imageIds must list every image of this property exactly once");
  await audit(c, "property.images_reordered", "property", id, { count: body.imageIds.length });
  return ok(c, { imageIds: body.imageIds });
});

hotelRoutes.delete("/hotels/:id/images/:imageId", requirePermission("hotels:write"), async (c) => {
  const id = requireParam(c, "id");
  await ownedProperty(c, id);
  const img = await inventory.deleteImage(c.get("db"), id, requireParam(c, "imageId"));
  if (!img) throw new AppError("not_found", "Image not found");
  if (img.r2ObjectKey && c.env.MEDIA) await c.env.MEDIA.delete(img.r2ObjectKey);
  await audit(c, "property.image_removed", "property", id, { imageId: img.id });
  return ok(c, { deleted: true });
});

/** Serves an image only when the caller's organisation may see the property. */
hotelRoutes.get("/media/:imageId", requirePermission("hotels:read"), async (c) => {
  const a = getTenant(c);
  const img = await inventory.getImage(c.get("db"), requireParam(c, "imageId"));
  if (!img || !(await inventory.getVisibleProperty(c.get("db"), a.organizationId, img.propertyId))) throw new AppError("not_found", "Image not found");
  if (img.sourceUrl) return c.redirect(img.sourceUrl, 302);
  if (!img.r2ObjectKey || !c.env.MEDIA) throw new AppError("not_found", "Image not found");
  const obj = await c.env.MEDIA.get(img.r2ObjectKey);
  if (!obj) throw new AppError("not_found", "Image not found");
  return new Response(obj.body, { headers: { "content-type": img.contentType ?? "application/octet-stream", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
});

/* ======================= room types ======================= */

hotelRoutes.get("/hotels/:id/rooms", requirePermission("hotels:read"), async (c) => {
  const property = await inventory.getVisibleProperty(c.get("db"), getTenant(c).organizationId, requireParam(c, "id"));
  if (!property) throw new AppError("not_found", "Property not found");
  return ok(c, await inventory.listRoomTypes(c.get("db"), property.id));
});
hotelRoutes.post("/hotels/:id/rooms", requirePermission("hotels:write"), async (c) => {
  const id = requireParam(c, "id");
  await ownedProperty(c, id);
  const body = await parseBody(c, roomTypeSchema.refine((r) => r.maximumOccupancy >= r.maximumAdults, { message: "Maximum occupancy must be at least the maximum adults", path: ["maximumOccupancy"] }));
  const roomId = await inventory.createRoomType(c.get("db"), id, body);
  await audit(c, "room_type.created", "room_type", roomId, { propertyId: id });
  return ok(c, await inventory.getRoomType(c.get("db"), id, roomId), 201);
});
hotelRoutes.patch("/hotels/:id/rooms/:roomId", requirePermission("hotels:write"), async (c) => {
  const id = requireParam(c, "id");
  await ownedProperty(c, id);
  const roomId = requireParam(c, "roomId");
  const patch = await parsePatch(c, roomTypeSchema);
  if (!(await inventory.updateRoomType(c.get("db"), id, roomId, patch))) throw new AppError("not_found", "Room type not found");
  await audit(c, "room_type.updated", "room_type", roomId, { fields: Object.keys(patch) });
  return ok(c, await inventory.getRoomType(c.get("db"), id, roomId));
});
hotelRoutes.delete("/hotels/:id/rooms/:roomId", requirePermission("hotels:write"), async (c) => {
  const id = requireParam(c, "id");
  await ownedProperty(c, id);
  const roomId = requireParam(c, "roomId");
  if (!(await inventory.deleteRoomType(c.get("db"), id, roomId))) throw new AppError("not_found", "Room type not found");
  await audit(c, "room_type.deleted", "room_type", roomId);
  return ok(c, { deleted: true });
});

/* ======================= rate plans & rules ======================= */

async function ownedPlan(c: AppContext, planId: string) {
  const plan = await inventory.getOwnedRatePlan(c.get("db"), getTenant(c).organizationId, planId);
  if (!plan) throw new AppError("not_found", "Rate plan not found");
  return plan;
}

hotelRoutes.get("/hotels/:id/rates", requirePermission("rates:read"), async (c) => {
  const a = getTenant(c);
  const property = await inventory.getVisibleProperty(c.get("db"), a.organizationId, requireParam(c, "id"));
  if (!property) throw new AppError("not_found", "Property not found");
  const plans = await inventory.listVisibleRatePlans(c.get("db"), a.organizationId, property.id);
  // Shared plans never expose contract linkage; with "indicative_only" scope the net amounts are withheld too.
  const withRules = await Promise.all(plans.map(async (p) => ({ ...(p.shared ? { ...p, supplierId: null, supplierAgreementId: null } : p), rules: p.shared && p.scope === "indicative_only" ? [] : await inventory.listRules(c.get("db"), p.id) })));
  return ok(c, withRules);
});

hotelRoutes.post("/hotels/:id/rates", requirePermission("rates:write"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  await ownedProperty(c, id);
  const body = await parseBody(c, ratePlanSchema);
  const db = c.get("db");
  if (!(await inventory.getRoomType(db, id, body.roomTypeId))) throw new AppError("validation_failed", "Room type does not belong to this property", { issues: [{ path: "roomTypeId", message: "Unknown room type" }] });
  if (body.supplierId && !(await inventory.getSupplier(db, a.organizationId, body.supplierId))) throw new AppError("validation_failed", "Unknown supplier", { issues: [{ path: "supplierId", message: "Unknown supplier" }] });
  if (body.supplierAgreementId) {
    const ag = await inventory.getAgreement(db, a.organizationId, body.supplierAgreementId);
    if (!ag) throw new AppError("validation_failed", "Unknown supplier agreement", { issues: [{ path: "supplierAgreementId", message: "Unknown agreement" }] });
    if (ag.currency !== body.currency) throw new AppError("validation_failed", `The agreement is in ${ag.currency}; the rate plan must use the same currency`, { issues: [{ path: "currency", message: "Currency differs from the agreement" }] });
    if (body.effectiveFrom < ag.effectiveFrom || body.effectiveTo > ag.effectiveTo) throw new AppError("validation_failed", `Rate dates must fall within the agreement period (${ag.effectiveFrom} to ${ag.effectiveTo})`, { issues: [{ path: "effectiveTo", message: "Outside agreement validity" }] });
  }
  const planId = await inventory.createRatePlan(db, a.organizationId, id, body);
  await audit(c, "rate_plan.created", "rate_plan", planId, { propertyId: id });
  return ok(c, await inventory.getOwnedRatePlan(db, a.organizationId, planId), 201);
});

hotelRoutes.patch("/rate-plans/:planId", requirePermission("rates:write"), async (c) => {
  const a = getTenant(c);
  const plan = await ownedPlan(c, requireParam(c, "planId"));
  const patch = await parsePatch(c, ratePlanUpdateSchema);
  const from = patch.effectiveFrom ?? plan.effectiveFrom;
  const to = patch.effectiveTo ?? plan.effectiveTo;
  if (to < from) throw new AppError("validation_failed", "effectiveTo must be on or after effectiveFrom", { issues: [{ path: "effectiveTo", message: "Must be on or after effectiveFrom" }] });
  await inventory.updateRatePlan(c.get("db"), a.organizationId, plan.id, patch, a.userId);
  await audit(c, "rate_plan.updated", "rate_plan", plan.id, { fields: Object.keys(patch) });
  return ok(c, await inventory.getOwnedRatePlan(c.get("db"), a.organizationId, plan.id));
});

hotelRoutes.get("/rate-plans/:planId/rules", requirePermission("rates:read"), async (c) => {
  const plan = await ownedPlan(c, requireParam(c, "planId"));
  const rules = await inventory.listRules(c.get("db"), plan.id);
  // Report overlapping rules that share a priority: precedence then falls back to narrower span / newer update.
  const overlaps: { a: string; b: string }[] = [];
  for (let i = 0; i < rules.length; i++)
    for (let j = i + 1; j < rules.length; j++) {
      const x = rules[i]!;
      const y = rules[j]!;
      if (x.priority === y.priority && x.applicableStartDate <= y.applicableEndDate && y.applicableStartDate <= x.applicableEndDate) overlaps.push({ a: x.id, b: y.id });
    }
  return ok(c, { plan, rules, overlaps });
});

hotelRoutes.post("/rate-plans/:planId/rules", requirePermission("rates:write"), async (c) => {
  const a = getTenant(c);
  const plan = await ownedPlan(c, requireParam(c, "planId"));
  const body = await parseBody(c, rateRuleSchema);
  if (body.applicableStartDate < plan.effectiveFrom || body.applicableEndDate > plan.effectiveTo) throw new AppError("validation_failed", `Rule dates must fall within the rate plan period (${plan.effectiveFrom} to ${plan.effectiveTo})`, { issues: [{ path: "applicableEndDate", message: "Outside plan validity" }] });
  const id = await inventory.createRule(c.get("db"), a.organizationId, plan, body, a.userId);
  await audit(c, "rate_rule.created", "rate_rule", id, { ratePlanId: plan.id, amountMinor: body.amountMinor });
  return ok(c, { id }, 201);
});

hotelRoutes.patch("/rate-plans/:planId/rules/:ruleId", requirePermission("rates:write"), async (c) => {
  const a = getTenant(c);
  const plan = await ownedPlan(c, requireParam(c, "planId"));
  const ruleId = requireParam(c, "ruleId");
  const patch = await parsePatch(c, rateRuleUpdateSchema);
  if ((patch.applicableStartDate ?? "") && (patch.applicableStartDate as string) < plan.effectiveFrom) throw new AppError("validation_failed", `Rule dates must fall within the rate plan period (${plan.effectiveFrom} to ${plan.effectiveTo})`);
  if ((patch.applicableEndDate ?? "") && (patch.applicableEndDate as string) > plan.effectiveTo) throw new AppError("validation_failed", `Rule dates must fall within the rate plan period (${plan.effectiveFrom} to ${plan.effectiveTo})`);
  if (!(await inventory.updateRule(c.get("db"), a.organizationId, plan, ruleId, patch, a.userId))) throw new AppError("not_found", "Rate rule not found");
  await audit(c, "rate_rule.updated", "rate_rule", ruleId, { fields: Object.keys(patch) });
  return ok(c, { id: ruleId });
});

hotelRoutes.delete("/rate-plans/:planId/rules/:ruleId", requirePermission("rates:write"), async (c) => {
  const a = getTenant(c);
  const plan = await ownedPlan(c, requireParam(c, "planId"));
  if (!(await inventory.deleteRule(c.get("db"), a.organizationId, plan, requireParam(c, "ruleId"), a.userId))) throw new AppError("not_found", "Rate rule not found");
  await audit(c, "rate_rule.deleted", "rate_rule", requireParam(c, "ruleId"), { ratePlanId: plan.id });
  return ok(c, { deleted: true });
});

hotelRoutes.get("/rate-plans/:planId/history", requirePermission("rates:read"), async (c) => {
  const plan = await ownedPlan(c, requireParam(c, "planId"));
  return ok(c, await inventory.rateHistory(c.get("db"), getTenant(c).organizationId, plan.id));
});

hotelRoutes.get("/rates/expiring", requirePermission("rates:read"), async (c) => {
  const { days } = parseQuery(c, z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }));
  return ok(c, await inventory.expiringRatePlans(c.get("db"), getTenant(c).organizationId, days));
});

/* ======================= inventory ======================= */

hotelRoutes.get("/hotels/:id/rooms/:roomId/inventory", requirePermission("hotels:read"), async (c) => {
  const property = await inventory.getVisibleProperty(c.get("db"), getTenant(c).organizationId, requireParam(c, "id"));
  if (!property) throw new AppError("not_found", "Property not found");
  const roomId = requireParam(c, "roomId");
  if (!(await inventory.getRoomType(c.get("db"), property.id, roomId))) throw new AppError("not_found", "Room type not found");
  const q = parseQuery(c, z.object({ from: isoDateSchema, to: isoDateSchema }));
  return ok(c, await inventory.listInventory(c.get("db"), roomId, q.from, q.to));
});
hotelRoutes.put("/hotels/:id/inventory", requirePermission("inventory:write"), async (c) => {
  const id = requireParam(c, "id");
  await ownedProperty(c, id);
  const body = await parseBody(c, inventoryUpsertSchema);
  if (!(await inventory.getRoomType(c.get("db"), id, body.roomTypeId))) throw new AppError("validation_failed", "Room type does not belong to this property");
  await inventory.upsertInventory(c.get("db"), body.roomTypeId, body.entries);
  await audit(c, "inventory.updated", "room_type", body.roomTypeId, { entries: body.entries.length });
  return ok(c, { updated: body.entries.length });
});

/* ======================= suppliers & agreements ======================= */

hotelRoutes.get("/suppliers", requirePermission("rates:read"), async (c) => ok(c, await inventory.listSuppliers(c.get("db"), getTenant(c).organizationId)));
hotelRoutes.post("/suppliers", requirePermission("suppliers:manage"), async (c) => {
  const a = getTenant(c);
  const id = await inventory.createSupplier(c.get("db"), a.organizationId, await parseBody(c, supplierSchema));
  await audit(c, "supplier.created", "supplier", id);
  return ok(c, await inventory.getSupplier(c.get("db"), a.organizationId, id), 201);
});
hotelRoutes.patch("/suppliers/:id", requirePermission("suppliers:manage"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const patch = await parsePatch(c, supplierSchema);
  if (!(await inventory.updateSupplier(c.get("db"), a.organizationId, id, patch))) throw new AppError("not_found", "Supplier not found");
  await audit(c, "supplier.updated", "supplier", id, { fields: Object.keys(patch) });
  return ok(c, await inventory.getSupplier(c.get("db"), a.organizationId, id));
});

hotelRoutes.get("/agreements", requirePermission("agreements:manage"), async (c) => ok(c, await inventory.listAgreements(c.get("db"), getTenant(c).organizationId)));
hotelRoutes.post("/agreements", requirePermission("agreements:manage"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, supplierAgreementSchema);
  if (!(await inventory.getSupplier(c.get("db"), a.organizationId, body.supplierId))) throw new AppError("validation_failed", "Unknown supplier", { issues: [{ path: "supplierId", message: "Unknown supplier" }] });
  const id = await inventory.createAgreement(c.get("db"), a.organizationId, body);
  await audit(c, "agreement.created", "agreement", id, { contractReference: body.contractReference });
  return ok(c, await inventory.getAgreement(c.get("db"), a.organizationId, id), 201);
});
hotelRoutes.patch("/agreements/:id", requirePermission("agreements:manage"), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const patch = await parsePatch(c, supplierAgreementUpdateSchema);
  if (!(await inventory.updateAgreement(c.get("db"), a.organizationId, id, patch))) throw new AppError("not_found", "Agreement not found");
  await audit(c, "agreement.updated", "agreement", id, { fields: Object.keys(patch) });
  return ok(c, await inventory.getAgreement(c.get("db"), a.organizationId, id));
});

/* ======================= partner sharing & enquiries ======================= */

hotelRoutes.get("/partners/shared", requirePermission("partners:manage"), async (c) => ok(c, await inventory.listGrantedAccess(c.get("db"), getTenant(c).organizationId)));
hotelRoutes.get("/partners/received", requirePermission("hotels:read"), async (c) => ok(c, await inventory.listReceivedAccess(c.get("db"), getTenant(c).organizationId)));
hotelRoutes.post("/partners/shared", requirePermission("partners:manage"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, partnerAccessSchema);
  const db = c.get("db");
  if (body.receivingOrganizationId === a.organizationId) throw new AppError("validation_failed", "You cannot share with your own organisation");
  const receiver = await identity.getOrganization(db, body.receivingOrganizationId);
  if (!receiver || receiver.status !== "active") throw new AppError("not_found", "Receiving organisation not found");
  if (body.resourceType === "property") await ownedProperty(c, body.resourceId);
  else await ownedPlan(c, body.resourceId);
  const id = await inventory.grantPartnerAccess(db, a.organizationId, body);
  await audit(c, "partner_access.granted", "partner_access", id, { receiver: body.receivingOrganizationId, resourceType: body.resourceType, resourceId: body.resourceId, scope: body.permittedRateScope });
  return ok(c, { id }, 201);
});
hotelRoutes.delete("/partners/shared/:id", requirePermission("partners:manage"), async (c) => {
  const id = requireParam(c, "id");
  if (!(await inventory.revokePartnerAccess(c.get("db"), getTenant(c).organizationId, id))) throw new AppError("not_found", "Share not found");
  await audit(c, "partner_access.revoked", "partner_access", id);
  return ok(c, { revoked: true });
});

const enquirySchema = z.object({ toOrganizationId: z.string().min(1).max(64), propertyId: z.string().max(64).nullable().optional(), subject: z.string().trim().min(3).max(200), message: z.string().max(4000).default(""), stayStart: isoDateSchema.nullable().optional(), stayEnd: isoDateSchema.nullable().optional(), guests: z.number().int().min(1).max(200).nullable().optional() });
hotelRoutes.post("/enquiries", requirePermission("trips:write"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, enquirySchema);
  const db = c.get("db");
  const target = await identity.getOrganization(db, body.toOrganizationId);
  if (!target || target.status !== "active" || target.id === a.organizationId) throw new AppError("not_found", "Recipient organisation not found");
  // Enquiries are only possible toward organisations that have shared something with you.
  const received = await inventory.listReceivedAccess(db, a.organizationId);
  if (!received.some((r) => r.sourceOrganizationId === target.id)) throw new AppError("forbidden", "You can only send enquiries to partners that have shared inventory with you");
  const id = await trips.createEnquiry(db, a.organizationId, a.userId, body);
  await ops.addNotification(db, { organizationId: target.id, kind: "partner_enquiry", title: `New enquiry: ${body.subject}`, body: body.message.slice(0, 200), link: "/hotel-workspace/enquiries" });
  await audit(c, "enquiry.created", "enquiry", id, { to: target.id });
  return ok(c, { id }, 201);
});
hotelRoutes.get("/enquiries", requirePermission("trips:read"), async (c) => {
  const { direction } = parseQuery(c, z.object({ direction: z.enum(["received", "sent"]).default("received") }));
  return ok(c, await trips.listEnquiries(c.get("db"), getTenant(c).organizationId, direction));
});
hotelRoutes.post("/enquiries/:id/respond", requirePermission("partners:manage"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, z.object({ response: z.string().trim().min(1).max(4000), close: z.boolean().default(false) }));
  if (!(await trips.respondEnquiry(c.get("db"), a.organizationId, requireParam(c, "id"), body.response, body.close ? "closed" : "responded"))) throw new AppError("not_found", "Enquiry not found");
  await audit(c, "enquiry.responded", "enquiry", requireParam(c, "id"));
  return ok(c, { responded: true });
});

/* ======================= import / export ======================= */

const importSchema = z.object({
  csv: z.string().min(10).max(1_000_000).optional(),
  /** Base64 of an .xlsx workbook (first sheet, same columns as the CSV). */
  xlsxBase64: z.string().min(20).max(1_400_000).optional(),
  commit: z.boolean().default(false),
}).refine((b) => !!b.csv !== !!b.xlsxBase64, "Send exactly one of csv or xlsxBase64");

function base64ToBytes(b64: string): Uint8Array {
  try {
    return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  } catch {
    throw new AppError("validation_failed", "xlsxBase64 is not valid base64");
  }
}

/**
 * CSV or XLSX rate import. Columns: property,roomType,ratePlan,mealPlan,currency,startDate,endDate,amount,taxBp,serviceChargeBp,taxIncluded.
 * Defaults to a dry run; with commit=true every valid row is applied and errors are reported per row.
 */
hotelRoutes.post("/imports/rates", requirePermission("imports:run"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, importSchema);
  const db = c.get("db");
  const rows = body.xlsxBase64 ? parseXlsx(base64ToBytes(body.xlsxBase64)) : parseCsv(body.csv!);
  const header = rows.shift()?.map((h) => h.trim());
  const required = ["property", "roomType", "ratePlan", "mealPlan", "currency", "startDate", "endDate", "amount"];
  if (!header || required.some((r) => !header.includes(r))) throw new AppError("validation_failed", `CSV header must include: ${required.join(", ")}`);
  if (rows.length > 2000) throw new AppError("validation_failed", "Import at most 2,000 rows at a time");
  const props = await inventory.listAllOwnedProperties(db, a.organizationId);
  const errors: { row: number; message: string }[] = [];
  let valid = 0;
  const created = { ratePlans: 0, rules: 0 };
  const planCache = new Map<string, Awaited<ReturnType<typeof inventory.getOwnedRatePlan>>>();
  for (const [i, cells] of rows.entries()) {
    const line = i + 2;
    const rec = Object.fromEntries(header.map((h, idx) => [h, cells[idx]?.trim() ?? ""]));
    const parsed = rateImportRowSchema.safeParse({ ...rec, taxBp: rec.taxBp || 0, serviceChargeBp: rec.serviceChargeBp || 0, taxIncluded: /^(true|1|yes)$/i.test(rec.taxIncluded ?? "") });
    if (!parsed.success) {
      errors.push({ row: line, message: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
      continue;
    }
    const r = parsed.data;
    if (r.endDate < r.startDate) { errors.push({ row: line, message: "endDate is before startDate" }); continue; }
    const prop = props.find((p) => p.name.toLowerCase() === r.property.toLowerCase());
    if (!prop) { errors.push({ row: line, message: `Unknown property "${r.property}" (create it first)` }); continue; }
    const room = (await inventory.listRoomTypes(db, prop.id)).find((x) => x.name.toLowerCase() === r.roomType.toLowerCase());
    if (!room) { errors.push({ row: line, message: `Unknown room type "${r.roomType}" for ${prop.name}` }); continue; }
    if (!MEAL_PLANS.includes(r.mealPlan)) { errors.push({ row: line, message: "Invalid meal plan" }); continue; }
    valid++;
    if (!body.commit) continue;
    const key = `${prop.id}|${room.id}|${r.ratePlan.toLowerCase()}|${r.mealPlan}|${r.currency}`;
    let plan = planCache.get(key);
    if (!plan) {
      const existing = (await inventory.listVisibleRatePlans(db, a.organizationId, prop.id)).find((p) => p.organizationId === a.organizationId && p.roomTypeId === room.id && p.name.toLowerCase() === r.ratePlan.toLowerCase() && p.mealPlan === r.mealPlan && p.currency === r.currency);
      if (existing) plan = existing;
      else {
        const planId = await inventory.createRatePlan(db, a.organizationId, prop.id, { roomTypeId: room.id, name: r.ratePlan, mealPlan: r.mealPlan, currency: r.currency, effectiveFrom: r.startDate, effectiveTo: r.endDate, cancellationPolicy: { refundable: true, freeCancellationDaysBeforeArrival: 7 }, paymentTerms: { type: "credit" } });
        plan = await inventory.getOwnedRatePlan(db, a.organizationId, planId);
        created.ratePlans++;
      }
      planCache.set(key, plan);
    }
    if (!plan) continue;
    if (r.startDate < plan.effectiveFrom || r.endDate > plan.effectiveTo) {
      await inventory.updateRatePlan(db, a.organizationId, plan.id, { effectiveFrom: r.startDate < plan.effectiveFrom ? r.startDate : plan.effectiveFrom, effectiveTo: r.endDate > plan.effectiveTo ? r.endDate : plan.effectiveTo }, a.userId);
      plan = (await inventory.getOwnedRatePlan(db, a.organizationId, plan.id))!;
      planCache.set(key, plan);
    }
    await inventory.createRule(db, a.organizationId, plan, { applicableStartDate: r.startDate, applicableEndDate: r.endDate, amountMinor: toMinorUnits(r.amount, r.currency), taxTreatment: { included: r.taxIncluded, taxBp: r.taxBp, serviceChargeBp: r.serviceChargeBp }, label: "import" }, a.userId);
    created.rules++;
  }
  if (body.commit) await audit(c, "rates.imported", "rate_plan", null, { rows: rows.length, valid, ...created });
  return ok(c, { dryRun: !body.commit, totalRows: rows.length, validRows: valid, errors, created });
});

hotelRoutes.get("/exports/rates.csv", requirePermission("rates:read"), async (c) => {
  const a = getTenant(c);
  const db = c.get("db");
  const props = await inventory.listAllOwnedProperties(db, a.organizationId);
  const lines = ["property,roomType,ratePlan,mealPlan,currency,startDate,endDate,amount,taxBp,serviceChargeBp,taxIncluded"];
  for (const p of props) {
    const rooms = await inventory.listRoomTypes(db, p.id);
    for (const plan of (await inventory.listVisibleRatePlans(db, a.organizationId, p.id)).filter((x) => !x.shared)) {
      const room = rooms.find((r) => r.id === plan.roomTypeId);
      for (const rule of await inventory.listRules(db, plan.id))
        lines.push([p.name, room?.name, plan.name, plan.mealPlan, plan.currency, rule.applicableStartDate, rule.applicableEndDate, (rule.amountMinor / 100).toFixed(2), rule.taxTreatment.taxBp, rule.taxTreatment.serviceChargeBp, rule.taxTreatment.included].map(csvEscape).join(","));
    }
  }
  await audit(c, "rates.exported", "rate_plan", null, { rows: lines.length - 1 });
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="rates.csv"', "cache-control": "no-store" } });
});

hotelRoutes.get("/exports/hotels.csv", requirePermission("hotels:read"), async (c) => {
  const a = getTenant(c);
  const props = await inventory.listAllOwnedProperties(c.get("db"), a.organizationId);
  const lines = ["name,city,region,country,category,starClassification,reviewScore,status,amenities"];
  for (const p of props) lines.push([p.name, p.city, p.region, p.country, p.category, p.starClassification, p.reviewScore, p.status, p.amenities.join("|")].map(csvEscape).join(","));
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="hotels.csv"', "cache-control": "no-store" } });
});
