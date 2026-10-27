import type { HotelCategory, MealPlan } from "@tripweave/shared";
import {
  batch, bool, chunk, clock, escapeLike, execute, newId, nowIso, num, numOrNull, paginate, parseJson, query, queryIn, queryOne, str, strOrNull, stmt, toJson,
  type Db, type Page, type Row,
} from "../db";

/* ======================= properties ======================= */

export interface PropertyRecord {
  id: string;
  ownerOrganizationId: string | null;
  source: string;
  name: string;
  slug: string;
  description: string;
  country: string;
  region: string | null;
  city: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: HotelCategory;
  starClassification: number | null;
  reviewScore: number | null;
  reviewSource: string | null;
  preferredPartner: boolean;
  amenities: string[];
  checkInTime: string;
  checkOutTime: string;
  contact: Record<string, string>;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** Relationship of the requesting organisation to this property. */
  access?: "owner" | "shared" | "provider";
}

export const mapProperty = (r: Row): PropertyRecord => ({
  id: str(r.id),
  ownerOrganizationId: strOrNull(r.owner_organization_id),
  source: str(r.source),
  name: str(r.name),
  slug: str(r.slug),
  description: str(r.description),
  country: str(r.country),
  region: strOrNull(r.region),
  city: str(r.city),
  address: strOrNull(r.address),
  latitude: numOrNull(r.latitude),
  longitude: numOrNull(r.longitude),
  category: str(r.category) as HotelCategory,
  starClassification: numOrNull(r.star_classification),
  reviewScore: numOrNull(r.review_score),
  reviewSource: strOrNull(r.review_source),
  preferredPartner: bool(r.preferred_partner),
  amenities: parseJson<string[]>(r.amenities_json, []),
  checkInTime: str(r.check_in_time),
  checkOutTime: str(r.check_out_time),
  contact: parseJson(r.contact_information, {}),
  status: str(r.status),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

/** SQL predicate (with 2 bound params: orgId, today) selecting properties a tenant may see. */
const VISIBLE_PROPERTY = `(
  p.owner_organization_id = ?1 OR p.owner_organization_id IS NULL OR EXISTS (
    SELECT 1 FROM partner_access pa
     WHERE pa.receiving_organization_id = ?1 AND pa.status = 'active' AND pa.valid_from <= ?2 AND pa.valid_until >= ?2
       AND ((pa.resource_type = 'property' AND pa.resource_id = p.id)
         OR (pa.resource_type = 'rate_plan' AND pa.resource_id IN (SELECT id FROM rate_plans rp WHERE rp.property_id = p.id)))
  )
)`;

const today = () => nowIso().slice(0, 10);

function accessOf(orgId: string, p: PropertyRecord): "owner" | "shared" | "provider" {
  if (p.ownerOrganizationId === orgId) return "owner";
  return p.ownerOrganizationId === null ? "provider" : "shared";
}

export async function slugForProperty(db: Db, orgId: string | null, name: string): Promise<string> {
  const root = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "property";
  let slug = root;
  for (let i = 2; ; i++) {
    const hit = await queryOne(db, "SELECT 1 AS x FROM properties WHERE COALESCE(owner_organization_id,'provider') = ? AND slug = ?", [orgId ?? "provider", slug]);
    if (!hit) return slug;
    slug = `${root}-${i}`;
  }
}

export interface PropertyInput {
  name: string;
  description?: string;
  country?: string;
  region?: string | null;
  city: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category?: HotelCategory;
  starClassification?: number | null;
  reviewScore?: number | null;
  reviewSource?: string | null;
  amenities?: string[];
  checkInTime?: string;
  checkOutTime?: string;
  contact?: Record<string, unknown>;
  status?: string;
  preferredPartner?: boolean;
  source?: "manual" | "provider" | "seed" | "mock";
}

export async function createProperty(db: Db, ownerOrgId: string | null, i: PropertyInput): Promise<string> {
  const id = newId();
  const ts = nowIso();
  const slug = await slugForProperty(db, ownerOrgId, i.name);
  await execute(
    db,
    `INSERT INTO properties (id,owner_organization_id,source,name,slug,description,country,region,city,address,latitude,longitude,category,star_classification,review_score,review_source,preferred_partner,amenities_json,check_in_time,check_out_time,contact_information,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, ownerOrgId, i.source ?? "manual", i.name, slug, i.description ?? "", i.country ?? "LK", i.region ?? null, i.city, i.address ?? null, i.latitude ?? null, i.longitude ?? null, i.category ?? "standard", i.starClassification ?? null, i.reviewScore ?? null, i.reviewSource ?? (i.reviewScore != null ? "organisation_supplied" : null), i.preferredPartner ? 1 : 0, toJson(i.amenities ?? []), i.checkInTime ?? "14:00", i.checkOutTime ?? "11:00", toJson(i.contact ?? {}), i.status ?? "active", ts, ts],
  );
  return id;
}

export async function getVisibleProperty(db: Db, orgId: string, id: string): Promise<PropertyRecord | null> {
  const r = await queryOne(db, `SELECT p.* FROM properties p WHERE p.id = ?3 AND ${VISIBLE_PROPERTY}`, [orgId, today(), id]);
  if (!r) return null;
  const p = mapProperty(r);
  return { ...p, access: accessOf(orgId, p) };
}

export async function getOwnedProperty(db: Db, orgId: string, id: string): Promise<PropertyRecord | null> {
  const r = await queryOne(db, "SELECT * FROM properties WHERE id = ? AND owner_organization_id = ?", [id, orgId]);
  return r ? { ...mapProperty(r), access: "owner" } : null;
}

export interface PropertyFilters {
  q?: string;
  city?: string;
  category?: string;
  amenity?: string;
  status?: string;
  scope?: "own" | "all";
  page: number;
  pageSize: number;
  sort?: string;
  order?: "asc" | "desc";
}

/** Every property the organisation owns, read page by page (used by import/export, which must not stop at the first page). */
export async function listAllOwnedProperties(db: Db, orgId: string, cap = 5_000): Promise<PropertyRecord[]> {
  const out: PropertyRecord[] = [];
  for (let page = 1; out.length < cap; page++) {
    const batch = await listProperties(db, orgId, { page, pageSize: 100, scope: "own" });
    out.push(...batch.items);
    if (batch.items.length < 100 || out.length >= batch.total) break;
  }
  return out.slice(0, cap);
}

export async function listProperties(db: Db, orgId: string, f: PropertyFilters): Promise<Page<PropertyRecord>> {
  const where: string[] = [f.scope === "own" ? "p.owner_organization_id = ?1" : VISIBLE_PROPERTY];
  // "own" references only ?1; binding an unused ?2 would be rejected by D1, so it is added only when the visibility predicate needs it.
  const params: unknown[] = f.scope === "own" ? [orgId] : [orgId, today()];
  where.push("p.source != 'mock'");
  // ?1 (org) and ?2 (today) are shared; filters allocate numbered parameters from ?3.
  const bind = (value: unknown): string => {
    params.push(value);
    return `?${params.length}`;
  };
  if (f.q) {
    const like = bind(`%${escapeLike(f.q)}%`);
    where.push(`(p.name LIKE ${like} ESCAPE '\\' OR p.city LIKE ${like} ESCAPE '\\')`);
  }
  if (f.city) where.push(`LOWER(p.city) = LOWER(${bind(f.city)})`);
  if (f.category) where.push(`p.category = ${bind(f.category)}`);
  if (f.status) where.push(`p.status = ${bind(f.status)}`);
  if (f.amenity) where.push(`EXISTS (SELECT 1 FROM json_each(p.amenities_json) j WHERE LOWER(j.value) = LOWER(${bind(f.amenity)}))`);
  const sortable: Record<string, string> = { name: "p.name", city: "p.city", category: "p.category", updated: "p.updated_at", review: "p.review_score" };
  const orderCol = sortable[f.sort ?? "name"] ?? "p.name";
  const page = await paginate(db, {
    select: "p.*",
    from: "properties p",
    where: where.join(" AND "),
    params,
    orderBy: `${orderCol} ${f.order === "desc" ? "DESC" : "ASC"}, p.id`,
    page: f.page,
    pageSize: f.pageSize,
    map: (r) => mapProperty(r),
  });
  return { ...page, items: page.items.map((p) => ({ ...p, access: accessOf(orgId, p) })) };
}

export async function updateProperty(db: Db, orgId: string, id: string, patch: Partial<PropertyInput>): Promise<boolean> {
  const map: Record<string, [string, (v: unknown) => unknown]> = {
    name: ["name", (v) => v], description: ["description", (v) => v], country: ["country", (v) => v], region: ["region", (v) => v],
    city: ["city", (v) => v], address: ["address", (v) => v], latitude: ["latitude", (v) => v], longitude: ["longitude", (v) => v],
    category: ["category", (v) => v], starClassification: ["star_classification", (v) => v], reviewScore: ["review_score", (v) => v],
    amenities: ["amenities_json", toJson], checkInTime: ["check_in_time", (v) => v], checkOutTime: ["check_out_time", (v) => v],
    contact: ["contact_information", toJson], status: ["status", (v) => v], preferredPartner: ["preferred_partner", (v) => (v ? 1 : 0)],
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const m = map[k];
    if (!m || v === undefined) continue;
    sets.push(`${m[0]} = ?`);
    params.push(m[1](v));
  }
  if (patch.reviewScore !== undefined) {
    sets.push("review_source = ?");
    params.push(patch.reviewScore === null ? null : "organisation_supplied");
  }
  if (sets.length === 0) return true;
  return (await execute(db, `UPDATE properties SET ${sets.join(", ")}, updated_at = ? WHERE id = ? AND owner_organization_id = ?`, [...params, nowIso(), id, orgId])) > 0;
}

/** Upserts an externally-sourced (provider) property; the property is shared content, not tenant data. */
export async function upsertProviderProperty(db: Db, providerKey: string, external: { id: string; name: string; city: string; country?: string; latitude?: number | null; longitude?: number | null; category?: HotelCategory | null; starRating?: number | null; amenities?: string[]; reviewScore?: number | null }): Promise<string> {
  const mapped = await queryOne<{ internal_property_id: string }>(db, "SELECT internal_property_id FROM provider_property_mappings WHERE provider_key = ? AND external_property_id = ?", [providerKey, external.id]);
  if (mapped) return mapped.internal_property_id;
  const id = await createProperty(db, null, {
    name: external.name, city: external.city, country: external.country ?? "LK", latitude: external.latitude ?? null, longitude: external.longitude ?? null,
    category: external.category ?? "standard", starClassification: external.starRating ?? null, reviewScore: external.reviewScore ?? null,
    reviewSource: external.reviewScore != null ? providerKey : null, amenities: external.amenities ?? [], source: "provider",
  });
  await execute(db, "INSERT INTO provider_property_mappings (id,provider_key,external_property_id,internal_property_id,mapping_confidence,verification_status,updated_at) VALUES (?,?,?,?,1,'auto',?)", [newId(), providerKey, external.id, id, nowIso()]);
  return id;
}

/* ---------- images ---------- */

export interface ImageRecord { id: string; propertyId: string; r2ObjectKey: string | null; sourceUrl: string | null; contentType: string | null; altText: string; displayOrder: number; imageSource: string; createdAt: string }
const mapImage = (r: Row): ImageRecord => ({ id: str(r.id), propertyId: str(r.property_id), r2ObjectKey: strOrNull(r.r2_object_key), sourceUrl: strOrNull(r.permitted_source_url), contentType: strOrNull(r.content_type), altText: str(r.alt_text), displayOrder: num(r.display_order), imageSource: str(r.image_source), createdAt: str(r.created_at) });

export async function addImage(db: Db, propertyId: string, i: { r2ObjectKey?: string; sourceUrl?: string; contentType?: string; altText?: string; imageSource?: string; usageRights?: Record<string, unknown> }): Promise<string> {
  const id = newId();
  const next = await queryOne<{ n: number }>(db, "SELECT COALESCE(MAX(display_order),-1)+1 AS n FROM property_images WHERE property_id = ?", [propertyId]);
  await execute(db, "INSERT INTO property_images (id,property_id,r2_object_key,permitted_source_url,content_type,alt_text,display_order,image_source,usage_rights_metadata,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [id, propertyId, i.r2ObjectKey ?? null, i.sourceUrl ?? null, i.contentType ?? null, i.altText ?? "", next?.n ?? 0, i.imageSource ?? "upload", toJson(i.usageRights ?? {}), nowIso()]);
  return id;
}
export async function listImages(db: Db, propertyId: string): Promise<ImageRecord[]> {
  return (await query(db, "SELECT * FROM property_images WHERE property_id = ? ORDER BY display_order", [propertyId])).map(mapImage);
}
/** Applies a new display order. The ids must be exactly the property's current images (no more, no fewer). */
export async function reorderImages(db: Db, propertyId: string, orderedIds: string[]): Promise<boolean> {
  const current = (await query<{ id: string }>(db, "SELECT id FROM property_images WHERE property_id = ?", [propertyId])).map((r) => str(r.id));
  if (orderedIds.length !== current.length || new Set(orderedIds).size !== orderedIds.length || !orderedIds.every((id) => current.includes(id))) return false;
  await batch(db, orderedIds.map((id, i) => stmt(db, "UPDATE property_images SET display_order = ? WHERE id = ? AND property_id = ?", [i, id, propertyId])));
  return true;
}
export async function getImage(db: Db, id: string): Promise<ImageRecord | null> {
  const r = await queryOne(db, "SELECT * FROM property_images WHERE id = ?", [id]);
  return r ? mapImage(r) : null;
}
export async function deleteImage(db: Db, propertyId: string, id: string): Promise<ImageRecord | null> {
  const img = await queryOne(db, "SELECT * FROM property_images WHERE id = ? AND property_id = ?", [id, propertyId]);
  if (!img) return null;
  await execute(db, "DELETE FROM property_images WHERE id = ?", [id]);
  return mapImage(img);
}
export async function firstImagesFor(db: Db, propertyIds: string[]): Promise<Map<string, string>> {
  const rows = await queryIn(db, "SELECT property_id, id FROM property_images WHERE property_id IN ({IN}) AND display_order = (SELECT MIN(display_order) FROM property_images x WHERE x.property_id = property_images.property_id)", propertyIds);
  return new Map(rows.map((r) => [str(r.property_id), str(r.id)]));
}

/* ======================= room types ======================= */

export interface RoomTypeRecord { id: string; propertyId: string; name: string; description: string; bedConfiguration: string[]; maximumAdults: number; maximumChildren: number; maximumOccupancy: number; amenities: string[]; status: string }
const mapRoom = (r: Row): RoomTypeRecord => ({ id: str(r.id), propertyId: str(r.property_id), name: str(r.name), description: str(r.description), bedConfiguration: parseJson(r.bed_configuration_json, []), maximumAdults: num(r.maximum_adults), maximumChildren: num(r.maximum_children), maximumOccupancy: num(r.maximum_occupancy), amenities: parseJson(r.amenities_json, []), status: str(r.status) });

export async function createRoomType(db: Db, propertyId: string, i: { name: string; description?: string; bedConfiguration?: string[]; maximumAdults: number; maximumChildren?: number; maximumOccupancy: number; amenities?: string[]; status?: string }): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(db, "INSERT INTO room_types (id,property_id,name,description,bed_configuration_json,maximum_adults,maximum_children,maximum_occupancy,amenities_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [id, propertyId, i.name, i.description ?? "", toJson(i.bedConfiguration ?? []), i.maximumAdults, i.maximumChildren ?? 0, i.maximumOccupancy, toJson(i.amenities ?? []), i.status ?? "active", ts, ts]);
  return id;
}
export async function listRoomTypes(db: Db, propertyId: string): Promise<RoomTypeRecord[]> {
  return (await query(db, "SELECT * FROM room_types WHERE property_id = ? ORDER BY name", [propertyId])).map(mapRoom);
}
export async function getRoomType(db: Db, propertyId: string, id: string): Promise<RoomTypeRecord | null> {
  const r = await queryOne(db, "SELECT * FROM room_types WHERE id = ? AND property_id = ?", [id, propertyId]);
  return r ? mapRoom(r) : null;
}
export async function updateRoomType(db: Db, propertyId: string, id: string, i: Partial<{ name: string; description: string; bedConfiguration: string[]; maximumAdults: number; maximumChildren: number; maximumOccupancy: number; amenities: string[]; status: string }>): Promise<boolean> {
  const cols: [string, unknown][] = [["name", i.name], ["description", i.description], ["bed_configuration_json", i.bedConfiguration && toJson(i.bedConfiguration)], ["maximum_adults", i.maximumAdults], ["maximum_children", i.maximumChildren], ["maximum_occupancy", i.maximumOccupancy], ["amenities_json", i.amenities && toJson(i.amenities)], ["status", i.status]];
  const set = cols.filter(([, v]) => v !== undefined);
  if (set.length === 0) return true;
  return (await execute(db, `UPDATE room_types SET ${set.map(([c]) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND property_id = ?`, [...set.map(([, v]) => v), nowIso(), id, propertyId])) > 0;
}
export async function deleteRoomType(db: Db, propertyId: string, id: string): Promise<boolean> {
  return (await execute(db, "DELETE FROM room_types WHERE id = ? AND property_id = ?", [id, propertyId])) > 0;
}

/* ======================= suppliers & agreements ======================= */

export interface SupplierRecord { id: string; organizationId: string | null; name: string; providerKey: string; supplierType: string; status: string; configurationReference: string | null }
const mapSupplier = (r: Row): SupplierRecord => ({ id: str(r.id), organizationId: strOrNull(r.organization_id), name: str(r.name), providerKey: str(r.provider_key), supplierType: str(r.supplier_type), status: str(r.status), configurationReference: strOrNull(r.configuration_reference) });

export async function createSupplier(db: Db, orgId: string, i: { name: string; providerKey: string; supplierType?: string; status?: string; configurationReference?: string }): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(db, "INSERT INTO suppliers (id,organization_id,name,provider_key,supplier_type,status,configuration_reference,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", [id, orgId, i.name, i.providerKey, i.supplierType ?? "direct_hotel", i.status ?? "active", i.configurationReference ?? null, ts, ts]);
  return id;
}
export async function listSuppliers(db: Db, orgId: string): Promise<SupplierRecord[]> {
  return (await query(db, "SELECT * FROM suppliers WHERE organization_id = ? OR organization_id IS NULL ORDER BY name", [orgId])).map(mapSupplier);
}
export async function getSupplier(db: Db, orgId: string, id: string): Promise<SupplierRecord | null> {
  const r = await queryOne(db, "SELECT * FROM suppliers WHERE id = ? AND (organization_id = ? OR organization_id IS NULL)", [id, orgId]);
  return r ? mapSupplier(r) : null;
}
export async function updateSupplier(db: Db, orgId: string, id: string, i: Partial<{ name: string; supplierType: string; status: string; configurationReference: string }>): Promise<boolean> {
  const cols: [string, unknown][] = [["name", i.name], ["supplier_type", i.supplierType], ["status", i.status], ["configuration_reference", i.configurationReference]];
  const set = cols.filter(([, v]) => v !== undefined);
  if (set.length === 0) return true;
  return (await execute(db, `UPDATE suppliers SET ${set.map(([c]) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ?`, [...set.map(([, v]) => v), nowIso(), id, orgId])) > 0;
}

export interface AgreementRecord { id: string; organizationId: string; supplierId: string; supplierName?: string; contractReference: string; agreementType: string; currency: string; commissionBp: number; effectiveFrom: string; effectiveTo: string; termsReference: string | null; status: string }
const mapAgreement = (r: Row): AgreementRecord => ({ id: str(r.id), organizationId: str(r.organization_id), supplierId: str(r.supplier_id), supplierName: r.supplier_name == null ? undefined : str(r.supplier_name), contractReference: str(r.contract_reference), agreementType: str(r.agreement_type), currency: str(r.currency), commissionBp: num(r.commission_bp), effectiveFrom: str(r.effective_from), effectiveTo: str(r.effective_to), termsReference: strOrNull(r.terms_reference), status: str(r.status) });

export async function createAgreement(db: Db, orgId: string, i: { supplierId: string; contractReference: string; agreementType?: string; currency: string; commissionBp?: number; effectiveFrom: string; effectiveTo: string; termsReference?: string; status?: string }): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(db, "INSERT INTO supplier_agreements (id,organization_id,supplier_id,contract_reference,agreement_type,currency,commission_bp,effective_from,effective_to,terms_reference,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, orgId, i.supplierId, i.contractReference, i.agreementType ?? "net_rate", i.currency, i.commissionBp ?? 0, i.effectiveFrom, i.effectiveTo, i.termsReference ?? null, i.status ?? "active", ts, ts]);
  return id;
}
export async function listAgreements(db: Db, orgId: string): Promise<AgreementRecord[]> {
  return (await query(db, "SELECT a.*, s.name AS supplier_name FROM supplier_agreements a JOIN suppliers s ON s.id = a.supplier_id WHERE a.organization_id = ? ORDER BY a.effective_to", [orgId])).map(mapAgreement);
}
export async function getAgreement(db: Db, orgId: string, id: string): Promise<AgreementRecord | null> {
  const r = await queryOne(db, "SELECT a.*, s.name AS supplier_name FROM supplier_agreements a JOIN suppliers s ON s.id = a.supplier_id WHERE a.id = ? AND a.organization_id = ?", [id, orgId]);
  return r ? mapAgreement(r) : null;
}
export async function updateAgreement(db: Db, orgId: string, id: string, i: Partial<{ contractReference: string; agreementType: string; currency: string; commissionBp: number; effectiveFrom: string; effectiveTo: string; termsReference: string; status: string }>): Promise<boolean> {
  const cols: [string, unknown][] = [["contract_reference", i.contractReference], ["agreement_type", i.agreementType], ["currency", i.currency], ["commission_bp", i.commissionBp], ["effective_from", i.effectiveFrom], ["effective_to", i.effectiveTo], ["terms_reference", i.termsReference], ["status", i.status]];
  const set = cols.filter(([, v]) => v !== undefined);
  if (set.length === 0) return true;
  return (await execute(db, `UPDATE supplier_agreements SET ${set.map(([c]) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ?`, [...set.map(([, v]) => v), nowIso(), id, orgId])) > 0;
}
/** Agreements ending within `days` days; used for expiry warnings. */
export async function expiringAgreements(db: Db, orgId: string, days: number): Promise<AgreementRecord[]> {
  const until = new Date(clock().getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return (await query(db, "SELECT a.*, s.name AS supplier_name FROM supplier_agreements a JOIN suppliers s ON s.id = a.supplier_id WHERE a.organization_id = ? AND a.status = 'active' AND a.effective_to <= ? ORDER BY a.effective_to", [orgId, until])).map(mapAgreement);
}

/* ======================= partner access ======================= */

export interface PartnerAccessRecord { id: string; sourceOrganizationId: string; receivingOrganizationId: string; resourceType: string; resourceId: string; permittedRateScope: string; validFrom: string; validUntil: string; status: string; receivingOrganizationName?: string; sourceOrganizationName?: string; resourceName?: string }
const mapAccess = (r: Row): PartnerAccessRecord => ({ id: str(r.id), sourceOrganizationId: str(r.source_organization_id), receivingOrganizationId: str(r.receiving_organization_id), resourceType: str(r.resource_type), resourceId: str(r.resource_id), permittedRateScope: str(r.permitted_rate_scope), validFrom: str(r.valid_from), validUntil: str(r.valid_until), status: str(r.status), receivingOrganizationName: r.receiving_name == null ? undefined : str(r.receiving_name), sourceOrganizationName: r.source_name == null ? undefined : str(r.source_name), resourceName: r.resource_name == null ? undefined : str(r.resource_name) });

export async function grantPartnerAccess(db: Db, sourceOrgId: string, i: { receivingOrganizationId: string; resourceType: "property" | "rate_plan"; resourceId: string; permittedRateScope?: string; validFrom: string; validUntil: string }): Promise<string> {
  const id = newId();
  await execute(
    db,
    `INSERT INTO partner_access (id,source_organization_id,receiving_organization_id,resource_type,resource_id,permitted_rate_scope,valid_from,valid_until,status,created_at)
     VALUES (?,?,?,?,?,?,?,?,'active',?)
     ON CONFLICT(source_organization_id,receiving_organization_id,resource_type,resource_id)
     DO UPDATE SET permitted_rate_scope=excluded.permitted_rate_scope, valid_from=excluded.valid_from, valid_until=excluded.valid_until, status='active'`,
    [id, sourceOrgId, i.receivingOrganizationId, i.resourceType, i.resourceId, i.permittedRateScope ?? "net_rates", i.validFrom, i.validUntil, nowIso()],
  );
  return id;
}
export async function listGrantedAccess(db: Db, sourceOrgId: string): Promise<PartnerAccessRecord[]> {
  return (await query(db, `SELECT pa.*, o.name AS receiving_name, CASE pa.resource_type WHEN 'property' THEN (SELECT name FROM properties WHERE id = pa.resource_id) ELSE (SELECT name FROM rate_plans WHERE id = pa.resource_id) END AS resource_name FROM partner_access pa JOIN organizations o ON o.id = pa.receiving_organization_id WHERE pa.source_organization_id = ? ORDER BY pa.created_at DESC, pa.rowid DESC`, [sourceOrgId])).map(mapAccess);
}
export async function listReceivedAccess(db: Db, receivingOrgId: string): Promise<PartnerAccessRecord[]> {
  return (await query(db, `SELECT pa.*, o.name AS source_name, CASE pa.resource_type WHEN 'property' THEN (SELECT name FROM properties WHERE id = pa.resource_id) ELSE (SELECT name FROM rate_plans WHERE id = pa.resource_id) END AS resource_name FROM partner_access pa JOIN organizations o ON o.id = pa.source_organization_id WHERE pa.receiving_organization_id = ? AND pa.status = 'active' ORDER BY pa.created_at DESC, pa.rowid DESC`, [receivingOrgId])).map(mapAccess);
}
export async function revokePartnerAccess(db: Db, sourceOrgId: string, id: string): Promise<boolean> {
  return (await execute(db, "UPDATE partner_access SET status = 'revoked' WHERE id = ? AND source_organization_id = ?", [id, sourceOrgId])) > 0;
}

/* ======================= rate plans & rules ======================= */

export interface RatePlanRecord {
  id: string; organizationId: string; propertyId: string; roomTypeId: string; supplierId: string | null; supplierAgreementId: string | null;
  name: string; mealPlan: MealPlan; rateType: string; currency: string; pricingBasis: "per_room_per_night" | "per_person_per_night";
  cancellationPolicy: { refundable?: boolean; freeCancellationDaysBeforeArrival?: number; penaltyDescription?: string };
  paymentTerms: { type?: string; description?: string };
  effectiveFrom: string; effectiveTo: string; minimumNights: number; maximumNights: number | null; status: string;
  updatedAt: string; shared?: boolean; roomTypeName?: string; propertyName?: string;
}
export const mapPlan = (r: Row): RatePlanRecord => ({
  id: str(r.id), organizationId: str(r.organization_id), propertyId: str(r.property_id), roomTypeId: str(r.room_type_id), supplierId: strOrNull(r.supplier_id), supplierAgreementId: strOrNull(r.supplier_agreement_id),
  name: str(r.name), mealPlan: str(r.meal_plan) as MealPlan, rateType: str(r.rate_type), currency: str(r.currency), pricingBasis: str(r.pricing_basis) as RatePlanRecord["pricingBasis"],
  cancellationPolicy: parseJson(r.cancellation_policy_json, {}), paymentTerms: parseJson(r.payment_terms_json, {}),
  effectiveFrom: str(r.effective_from), effectiveTo: str(r.effective_to), minimumNights: num(r.minimum_nights), maximumNights: numOrNull(r.maximum_nights), status: str(r.status), updatedAt: str(r.updated_at),
  roomTypeName: r.room_type_name == null ? undefined : str(r.room_type_name), propertyName: r.property_name == null ? undefined : str(r.property_name),
});

export async function createRatePlan(db: Db, orgId: string, propertyId: string, i: { roomTypeId: string; supplierId?: string | null; supplierAgreementId?: string | null; name: string; mealPlan: string; rateType?: string; currency: string; pricingBasis?: string; cancellationPolicy?: unknown; paymentTerms?: unknown; effectiveFrom: string; effectiveTo: string; minimumNights?: number; maximumNights?: number | null; status?: string }): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(db, `INSERT INTO rate_plans (id,organization_id,property_id,room_type_id,supplier_id,supplier_agreement_id,name,meal_plan,rate_type,currency,pricing_basis,cancellation_policy_json,payment_terms_json,effective_from,effective_to,minimum_nights,maximum_nights,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, orgId, propertyId, i.roomTypeId, i.supplierId ?? null, i.supplierAgreementId ?? null, i.name, i.mealPlan, i.rateType ?? "contract", i.currency, i.pricingBasis ?? "per_room_per_night", toJson(i.cancellationPolicy ?? {}), toJson(i.paymentTerms ?? {}), i.effectiveFrom, i.effectiveTo, i.minimumNights ?? 1, i.maximumNights ?? null, i.status ?? "active", ts, ts]);
  await execute(db, "INSERT INTO rate_change_history (id,organization_id,rate_plan_id,change_type,after_json,created_at) VALUES (?,?,?,?,?,?)", [newId(), orgId, id, "plan_created", toJson(i), ts]);
  return id;
}
export async function getOwnedRatePlan(db: Db, orgId: string, id: string): Promise<RatePlanRecord | null> {
  const r = await queryOne(db, "SELECT * FROM rate_plans WHERE id = ? AND organization_id = ?", [id, orgId]);
  return r ? mapPlan(r) : null;
}
export async function updateRatePlan(db: Db, orgId: string, id: string, i: Partial<{ name: string; mealPlan: string; rateType: string; currency: string; pricingBasis: string; cancellationPolicy: unknown; paymentTerms: unknown; effectiveFrom: string; effectiveTo: string; minimumNights: number; maximumNights: number | null; status: string; supplierId: string | null; supplierAgreementId: string | null }>, userId: string | null): Promise<boolean> {
  const cols: [string, unknown][] = [["name", i.name], ["meal_plan", i.mealPlan], ["rate_type", i.rateType], ["currency", i.currency], ["pricing_basis", i.pricingBasis], ["cancellation_policy_json", i.cancellationPolicy === undefined ? undefined : toJson(i.cancellationPolicy)], ["payment_terms_json", i.paymentTerms === undefined ? undefined : toJson(i.paymentTerms)], ["effective_from", i.effectiveFrom], ["effective_to", i.effectiveTo], ["minimum_nights", i.minimumNights], ["maximum_nights", i.maximumNights], ["status", i.status], ["supplier_id", i.supplierId], ["supplier_agreement_id", i.supplierAgreementId]];
  const set = cols.filter(([, v]) => v !== undefined);
  if (set.length === 0) return true;
  const before = await getOwnedRatePlan(db, orgId, id);
  const n = await execute(db, `UPDATE rate_plans SET ${set.map(([c]) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ?`, [...set.map(([, v]) => v), nowIso(), id, orgId]);
  if (n > 0) await execute(db, "INSERT INTO rate_change_history (id,organization_id,rate_plan_id,change_type,before_json,after_json,changed_by,created_at) VALUES (?,?,?,?,?,?,?,?)", [newId(), orgId, id, "plan_updated", toJson(before), toJson(i), userId, nowIso()]);
  return n > 0;
}

/** Rate plans for a property that the requesting organisation may see (own + shared). Contract details never leak. */
export async function listVisibleRatePlans(db: Db, orgId: string, propertyId: string): Promise<(RatePlanRecord & { scope: string })[]> {
  const rows = await query(
    db,
    `SELECT rp.*, rt.name AS room_type_name,
            CASE WHEN rp.organization_id = ?1 THEN 'owner'
                 ELSE COALESCE((SELECT pa.permitted_rate_scope FROM partner_access pa WHERE pa.receiving_organization_id = ?1 AND pa.status='active' AND pa.valid_from <= ?2 AND pa.valid_until >= ?2 AND ((pa.resource_type='property' AND pa.resource_id = rp.property_id AND pa.source_organization_id = rp.organization_id) OR (pa.resource_type='rate_plan' AND pa.resource_id = rp.id)) ORDER BY pa.permitted_rate_scope LIMIT 1), 'none') END AS access_scope
       FROM rate_plans rp JOIN room_types rt ON rt.id = rp.room_type_id
      WHERE rp.property_id = ?3 ORDER BY rt.name, rp.name`,
    [orgId, today(), propertyId],
  );
  return rows.filter((r) => str(r.access_scope) !== "none").map((r) => ({ ...mapPlan(r), scope: str(r.access_scope), shared: str(r.access_scope) !== "owner" }));
}

export interface RateRuleRecord {
  id: string; ratePlanId: string; applicableStartDate: string; applicableEndDate: string; amountMinor: number; currency: string; priority: number; label: string | null;
  occupancyConditions: { minAdults?: number; maxAdults?: number };
  taxTreatment: { included: boolean; taxBp: number; serviceChargeBp: number };
  extraPersonRules: { baseAdults: number; extraAdultMinor: number; extraChildMinor: number; childFreeUnderAge: number };
  blackoutDates: string[]; updatedAt: string;
}
export const mapRule = (r: Row): RateRuleRecord => ({
  id: str(r.id), ratePlanId: str(r.rate_plan_id), applicableStartDate: str(r.applicable_start_date), applicableEndDate: str(r.applicable_end_date), amountMinor: num(r.amount_minor_units), currency: str(r.currency), priority: num(r.priority), label: strOrNull(r.label),
  occupancyConditions: parseJson(r.occupancy_conditions_json, {}),
  taxTreatment: { included: false, taxBp: 0, serviceChargeBp: 0, ...parseJson<Partial<RateRuleRecord["taxTreatment"]>>(r.tax_treatment_json, {}) },
  extraPersonRules: { baseAdults: 2, extraAdultMinor: 0, extraChildMinor: 0, childFreeUnderAge: 0, ...parseJson<Partial<RateRuleRecord["extraPersonRules"]>>(r.extra_person_rules_json, {}) },
  blackoutDates: parseJson(r.blackout_conditions_json, []), updatedAt: str(r.updated_at),
});

export async function listRules(db: Db, ratePlanId: string): Promise<RateRuleRecord[]> {
  return (await query(db, "SELECT * FROM rate_rules WHERE rate_plan_id = ? ORDER BY applicable_start_date, priority DESC", [ratePlanId])).map(mapRule);
}
export async function createRule(db: Db, orgId: string, plan: RatePlanRecord, i: { applicableStartDate: string; applicableEndDate: string; amountMinor: number; priority?: number; label?: string; occupancyConditions?: unknown; taxTreatment?: unknown; extraPersonRules?: unknown; blackoutDates?: string[] }, userId: string | null): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await batch(db, [
    stmt(db, `INSERT INTO rate_rules (id,rate_plan_id,applicable_start_date,applicable_end_date,amount_minor_units,currency,priority,label,occupancy_conditions_json,tax_treatment_json,extra_person_rules_json,blackout_conditions_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, plan.id, i.applicableStartDate, i.applicableEndDate, i.amountMinor, plan.currency, i.priority ?? 0, i.label ?? null, toJson(i.occupancyConditions ?? {}), toJson(i.taxTreatment ?? {}), toJson(i.extraPersonRules ?? {}), toJson(i.blackoutDates ?? []), ts, ts]),
    stmt(db, "INSERT INTO rate_change_history (id,organization_id,rate_plan_id,rate_rule_id,change_type,after_json,changed_by,created_at) VALUES (?,?,?,?,?,?,?,?)", [newId(), orgId, plan.id, id, "rule_created", toJson(i), userId, ts]),
  ]);
  return id;
}
export async function updateRule(db: Db, orgId: string, plan: RatePlanRecord, ruleId: string, i: Partial<{ applicableStartDate: string; applicableEndDate: string; amountMinor: number; priority: number; label: string; occupancyConditions: unknown; taxTreatment: unknown; extraPersonRules: unknown; blackoutDates: string[] }>, userId: string | null): Promise<boolean> {
  const before = await queryOne(db, "SELECT * FROM rate_rules WHERE id = ? AND rate_plan_id = ?", [ruleId, plan.id]);
  if (!before) return false;
  const cols: [string, unknown][] = [["applicable_start_date", i.applicableStartDate], ["applicable_end_date", i.applicableEndDate], ["amount_minor_units", i.amountMinor], ["priority", i.priority], ["label", i.label], ["occupancy_conditions_json", i.occupancyConditions === undefined ? undefined : toJson(i.occupancyConditions)], ["tax_treatment_json", i.taxTreatment === undefined ? undefined : toJson(i.taxTreatment)], ["extra_person_rules_json", i.extraPersonRules === undefined ? undefined : toJson(i.extraPersonRules)], ["blackout_conditions_json", i.blackoutDates === undefined ? undefined : toJson(i.blackoutDates)]];
  const set = cols.filter(([, v]) => v !== undefined);
  if (set.length === 0) return true;
  const ts = nowIso();
  await batch(db, [
    stmt(db, `UPDATE rate_rules SET ${set.map(([c]) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND rate_plan_id = ?`, [...set.map(([, v]) => v), ts, ruleId, plan.id]),
    stmt(db, "INSERT INTO rate_change_history (id,organization_id,rate_plan_id,rate_rule_id,change_type,before_json,after_json,changed_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)", [newId(), orgId, plan.id, ruleId, "rule_updated", toJson(mapRule(before)), toJson(i), userId, ts]),
  ]);
  return true;
}
export async function deleteRule(db: Db, orgId: string, plan: RatePlanRecord, ruleId: string, userId: string | null): Promise<boolean> {
  const before = await queryOne(db, "SELECT * FROM rate_rules WHERE id = ? AND rate_plan_id = ?", [ruleId, plan.id]);
  if (!before) return false;
  await batch(db, [
    stmt(db, "DELETE FROM rate_rules WHERE id = ?", [ruleId]),
    stmt(db, "INSERT INTO rate_change_history (id,organization_id,rate_plan_id,rate_rule_id,change_type,before_json,changed_by,created_at) VALUES (?,?,?,?,?,?,?,?)", [newId(), orgId, plan.id, ruleId, "rule_deleted", toJson(mapRule(before)), userId, nowIso()]),
  ]);
  return true;
}
export async function rateHistory(db: Db, orgId: string, ratePlanId: string, limit = 50): Promise<Row[]> {
  return query(db, "SELECT h.*, u.display_name AS changed_by_name FROM rate_change_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.organization_id = ? AND h.rate_plan_id = ? ORDER BY h.created_at DESC, h.rowid DESC LIMIT ?", [orgId, ratePlanId, limit]);
}
/** Active plans of the organisation whose contract ends within `days` (or already ended). */
export async function expiringRatePlans(db: Db, orgId: string, days: number): Promise<RatePlanRecord[]> {
  const until = new Date(clock().getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return (await query(db, "SELECT rp.*, p.name AS property_name, rt.name AS room_type_name FROM rate_plans rp JOIN properties p ON p.id = rp.property_id JOIN room_types rt ON rt.id = rp.room_type_id WHERE rp.organization_id = ? AND rp.status = 'active' AND rp.effective_to <= ? ORDER BY rp.effective_to LIMIT 100", [orgId, until])).map(mapPlan);
}

/* ======================= inventory ======================= */

export async function upsertInventory(db: Db, roomTypeId: string, entries: { date: string; availableQuantity: number | null }[], source = "manual"): Promise<void> {
  const ts = nowIso();
  for (const part of chunk(entries, 50)) {
    await batch(db, part.map((e) => stmt(db, `INSERT INTO room_inventory (id,room_type_id,inventory_date,available_quantity,inventory_source,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(room_type_id,inventory_date) DO UPDATE SET available_quantity=excluded.available_quantity, inventory_source=excluded.inventory_source, updated_at=excluded.updated_at`, [newId(), roomTypeId, e.date, e.availableQuantity, source, ts])));
  }
}
export async function listInventory(db: Db, roomTypeId: string, from: string, to: string): Promise<{ date: string; availableQuantity: number | null }[]> {
  return (await query(db, "SELECT inventory_date, available_quantity FROM room_inventory WHERE room_type_id = ? AND inventory_date >= ? AND inventory_date <= ? ORDER BY inventory_date", [roomTypeId, from, to])).map((r) => ({ date: str(r.inventory_date), availableQuantity: numOrNull(r.available_quantity) }));
}

/* ======================= internal inventory for search ======================= */

export interface InternalInventory {
  properties: PropertyRecord[];
  roomTypes: Map<string, RoomTypeRecord[]>;
  plans: Map<string, (RatePlanRecord & { scope: string })[]>;
  rules: Map<string, RateRuleRecord[]>;
  inventory: Map<string, Map<string, number | null>>;
  agreements: Map<string, AgreementRecord>;
  /** Supplier name by id for provenance. */
  suppliers: Map<string, SupplierRecord>;
}

/** Loads everything the internal provider needs for one destination in a bounded number of queries. */
export async function loadInternalInventory(db: Db, orgId: string, q: { destination: string; checkIn: string; checkOut: string }): Promise<InternalInventory> {
  const props = await query(db, `SELECT p.* FROM properties p WHERE ${VISIBLE_PROPERTY} AND p.status = 'active' AND (LOWER(p.city) = LOWER(?3) OR LOWER(COALESCE(p.region,'')) = LOWER(?3)) ORDER BY p.name LIMIT 200`, [orgId, today(), q.destination]);
  const properties = props.map((r) => ({ ...mapProperty(r), access: undefined }));
  const propertyIds = properties.map((p) => p.id);
  const roomRows = await queryIn(db, "SELECT * FROM room_types WHERE status = 'active' AND property_id IN ({IN})", propertyIds);
  const roomTypes = new Map<string, RoomTypeRecord[]>();
  for (const r of roomRows.map(mapRoom)) roomTypes.set(r.propertyId, [...(roomTypes.get(r.propertyId) ?? []), r]);

  const planRows = await queryIn(
    db,
    `SELECT rp.*,
            CASE WHEN rp.organization_id = ?1 THEN 'owner'
                 ELSE COALESCE((SELECT pa.permitted_rate_scope FROM partner_access pa WHERE pa.receiving_organization_id = ?1 AND pa.status='active' AND pa.valid_from <= ?2 AND pa.valid_until >= ?2 AND ((pa.resource_type='property' AND pa.resource_id = rp.property_id AND pa.source_organization_id = rp.organization_id) OR (pa.resource_type='rate_plan' AND pa.resource_id = rp.id)) ORDER BY pa.permitted_rate_scope LIMIT 1), 'none') END AS access_scope
       FROM rate_plans rp WHERE rp.status = 'active' AND rp.effective_from <= ? AND rp.effective_to >= ? AND rp.property_id IN ({IN})`,
    propertyIds,
    [orgId, today(), q.checkOut, q.checkIn],
  );
  const plans = new Map<string, (RatePlanRecord & { scope: string })[]>();
  for (const r of planRows) {
    const scope = str(r.access_scope);
    if (scope === "none") continue;
    const p = { ...mapPlan(r), scope };
    plans.set(p.propertyId, [...(plans.get(p.propertyId) ?? []), p]);
  }
  const planIds = [...plans.values()].flat().map((p) => p.id);
  const ruleRows = await queryIn(db, "SELECT * FROM rate_rules WHERE applicable_start_date <= ? AND applicable_end_date >= ? AND rate_plan_id IN ({IN})", planIds, [q.checkOut, q.checkIn]);
  const rules = new Map<string, RateRuleRecord[]>();
  for (const r of ruleRows.map(mapRule)) rules.set(r.ratePlanId, [...(rules.get(r.ratePlanId) ?? []), r]);

  const roomTypeIds = [...roomTypes.values()].flat().map((r) => r.id);
  const invRows = await queryIn(db, "SELECT room_type_id, inventory_date, available_quantity FROM room_inventory WHERE inventory_date >= ? AND inventory_date < ? AND room_type_id IN ({IN})", roomTypeIds, [q.checkIn, q.checkOut]);
  const inventory = new Map<string, Map<string, number | null>>();
  for (const r of invRows) {
    const m = inventory.get(str(r.room_type_id)) ?? new Map<string, number | null>();
    m.set(str(r.inventory_date), numOrNull(r.available_quantity));
    inventory.set(str(r.room_type_id), m);
  }
  const agreementIds = [...new Set([...plans.values()].flat().filter((p) => p.scope === "owner" && p.supplierAgreementId).map((p) => p.supplierAgreementId!))];
  const agRows = await queryIn(db, "SELECT a.*, s.name AS supplier_name FROM supplier_agreements a JOIN suppliers s ON s.id = a.supplier_id WHERE a.organization_id = ? AND a.id IN ({IN}) ", agreementIds, [orgId]);
  const agreements = new Map(agRows.map((r) => [str(r.id), mapAgreement(r)]));
  const supplierIds = [...new Set([...plans.values()].flat().map((p) => p.supplierId).filter((x): x is string => !!x))];
  const supRows = await queryIn(db, "SELECT * FROM suppliers WHERE id IN ({IN})", supplierIds);
  return { properties, roomTypes, plans, rules, inventory, agreements, suppliers: new Map(supRows.map((r) => [str(r.id), mapSupplier(r)])) };
}

/* ======================= supplier offers ======================= */

export async function saveOffers(db: Db, orgId: string, offers: { id: string; providerKey: string; externalRef: string; propertyId: string; roomTypeId: string | null; roomTypeName: string; stayStart: string; stayEnd: string; occupancy: unknown; mealPlan: string; totalMinor: number; currency: string; taxMinor: number | null; feeMinor: number | null; cancellation: unknown; payment: unknown; retrievedAt: string; expiresAt: string | null; availability: string; verification: string; isMock: boolean; offerJson: unknown; metadata?: unknown }[]): Promise<void> {
  for (const part of chunk(offers, 25)) {
    await batch(db, part.map((o) => stmt(db, `INSERT INTO supplier_offers (id,organization_id,provider_key,external_offer_reference,property_id,room_type_id,room_type_name,stay_start_date,stay_end_date,occupancy_json,meal_plan,total_amount_minor_units,currency,tax_amount_minor_units,fee_amount_minor_units,cancellation_terms_json,payment_terms_json,retrieved_at,expires_at,availability_status,verification_status,is_mock,offer_json,safe_provider_metadata_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(organization_id,provider_key,external_offer_reference) DO UPDATE SET total_amount_minor_units=excluded.total_amount_minor_units, retrieved_at=excluded.retrieved_at, expires_at=excluded.expires_at, availability_status=excluded.availability_status, verification_status=excluded.verification_status, offer_json=excluded.offer_json`,
      [o.id, orgId, o.providerKey, o.externalRef, o.propertyId, o.roomTypeId, o.roomTypeName, o.stayStart, o.stayEnd, toJson(o.occupancy), o.mealPlan, o.totalMinor, o.currency, o.taxMinor, o.feeMinor, toJson(o.cancellation), toJson(o.payment), o.retrievedAt, o.expiresAt, o.availability, o.verification, o.isMock ? 1 : 0, toJson(o.offerJson), toJson(o.metadata ?? {})])));
  }
}
export async function getOfferJson<T>(db: Db, orgId: string, offerId: string): Promise<T | null> {
  const r = await queryOne<{ offer_json: string }>(db, "SELECT offer_json FROM supplier_offers WHERE organization_id = ? AND (id = ? OR external_offer_reference = ?)", [orgId, offerId, offerId]);
  return r ? parseJson<T | null>(r.offer_json, null) : null;
}
export async function updateOfferVerification(db: Db, orgId: string, offerId: string, offer: unknown, verification: string, availability: string, totalMinor: number, expiresAt: string | null): Promise<void> {
  await execute(db, "UPDATE supplier_offers SET offer_json = ?, verification_status = ?, availability_status = ?, total_amount_minor_units = ?, expires_at = ?, retrieved_at = ? WHERE organization_id = ? AND id = ?", [toJson(offer), verification, availability, totalMinor, expiresAt, nowIso(), orgId, offerId]);
}

/** Mock-provider properties are private to the organisation that ran the search (never shared catalogue content). */
export async function upsertMockProperty(db: Db, orgId: string, external: { name: string; city: string; latitude?: number | null; longitude?: number | null; category?: HotelCategory | null; starRating?: number | null; amenities?: string[]; reviewScore?: number | null }): Promise<string> {
  const hit = await queryOne<{ id: string }>(db, "SELECT id FROM properties WHERE owner_organization_id = ? AND source = 'mock' AND name = ?", [orgId, external.name]);
  if (hit) return hit.id;
  return createProperty(db, orgId, {
    name: external.name, city: external.city, latitude: external.latitude ?? null, longitude: external.longitude ?? null, category: external.category ?? "standard",
    starClassification: external.starRating ?? null, reviewScore: external.reviewScore ?? null, reviewSource: external.reviewScore != null ? "mock_illustrative" : null,
    amenities: external.amenities ?? [], source: "mock", status: "inactive",
  });
}

export async function getOffersByIds<T>(db: Db, orgId: string, ids: string[]): Promise<Map<string, T>> {
  const rows = await queryIn<{ id: string; offer_json: string }>(db, "SELECT id, offer_json FROM supplier_offers WHERE organization_id = ? AND id IN ({IN})", ids, [orgId]);
  return new Map(rows.map((r) => [str(r.id), parseJson<T>(r.offer_json, null as T)]));
}
