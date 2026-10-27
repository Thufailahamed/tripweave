import { AppError, type QuoteStatus } from "@tripweave/shared";
import { batch, clock, escapeLike, execute, newId, nowIso, num, paginate, parseJson, query, queryOne, str, strOrNull, stmt, toJson, type Db, type Page, type Row } from "../db";

export interface QuoteRecord {
  id: string; organizationId: string; tripRequestId: string; customerId: string | null; customerName?: string | null; tripTitle?: string;
  quoteNumber: string; status: QuoteStatus; currency: string; validUntil: string | null; selectedPackageId: string | null;
  currentVersion: number; createdBy: string | null; createdAt: string; updatedAt: string;
  sellingPriceMinor?: number; totalCostMinor?: number; grossMarginBp?: number;
}
const mapQuote = (r: Row): QuoteRecord => ({
  id: str(r.id), organizationId: str(r.organization_id), tripRequestId: str(r.trip_request_id), customerId: strOrNull(r.customer_id), customerName: r.customer_name == null ? null : str(r.customer_name),
  tripTitle: r.trip_title == null ? undefined : str(r.trip_title), quoteNumber: str(r.quote_number), status: str(r.status) as QuoteStatus, currency: str(r.currency), validUntil: strOrNull(r.valid_until),
  selectedPackageId: strOrNull(r.selected_package_id), currentVersion: num(r.current_version), createdBy: strOrNull(r.created_by), createdAt: str(r.created_at), updatedAt: str(r.updated_at),
  sellingPriceMinor: r.selling_price == null ? undefined : num(r.selling_price), totalCostMinor: r.total_cost == null ? undefined : num(r.total_cost), grossMarginBp: r.margin_bp == null ? undefined : num(r.margin_bp),
});

export interface LineItemInput { category: string; description: string; quantity: number; unitCostMinor: number; totalCostMinor: number; unitSellingMinor: number; totalSellingMinor: number; currency: string; optional: boolean; tax?: unknown; source?: unknown }
export interface VersionInput {
  itinerarySnapshot: unknown; pricingSnapshot: unknown; packageSnapshot: unknown; totalCostMinor: number; sellingPriceMinor: number; grossProfitMinor: number; grossMarginBp: number;
  fxSnapshot: unknown; termsSnapshot: unknown; internalNotes?: string | null; approvalRequired: boolean; createdBy: string | null; items: LineItemInput[];
}

export async function nextQuoteNumber(db: Db, orgId: string): Promise<string> {
  const year = clock().getUTCFullYear();
  const r = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM quotes WHERE organization_id = ? AND quote_number LIKE ?", [orgId, `Q-${year}-%`]);
  return `Q-${year}-${String((r?.n ?? 0) + 1).padStart(4, "0")}`;
}

function versionStatements(db: Db, quoteId: string, versionNumber: number, v: VersionInput) {
  const versionId = newId();
  const ts = nowIso();
  return [
    stmt(db, "INSERT INTO quote_versions (id,quote_id,version_number,itinerary_snapshot_json,pricing_snapshot_json,package_snapshot_json,total_cost_minor_units,selling_price_minor_units,gross_profit_minor_units,gross_margin_basis_points,fx_snapshot_json,terms_snapshot_json,internal_notes,approval_required,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [versionId, quoteId, versionNumber, toJson(v.itinerarySnapshot), toJson(v.pricingSnapshot), toJson(v.packageSnapshot), v.totalCostMinor, v.sellingPriceMinor, v.grossProfitMinor, v.grossMarginBp, toJson(v.fxSnapshot), toJson(v.termsSnapshot), v.internalNotes ?? null, v.approvalRequired ? 1 : 0, v.createdBy, ts]),
    ...v.items.map((it, idx) => stmt(db, "INSERT INTO quote_line_items (id,quote_version_id,sort_order,category,description,quantity,unit_cost_minor_units,total_cost_minor_units,unit_selling_price_minor_units,total_selling_price_minor_units,currency,is_optional,tax_details_json,source_reference_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [newId(), versionId, idx, it.category, it.description, it.quantity, it.unitCostMinor, it.totalCostMinor, it.unitSellingMinor, it.totalSellingMinor, it.currency, it.optional ? 1 : 0, toJson(it.tax ?? {}), toJson(it.source ?? {})])),
    ...(v.approvalRequired ? [stmt(db, "INSERT INTO quote_approvals (id,quote_id,version_number,reasons_json,requested_by,created_at) VALUES (?,?,?,?,?,?)", [newId(), quoteId, versionNumber, toJson((v.pricingSnapshot as { approval?: { reasons?: string[] } })?.approval?.reasons ?? []), v.createdBy, ts])] : []),
  ];
}

export async function createQuote(db: Db, orgId: string, userId: string, q: { tripRequestId: string; customerId: string | null; currency: string; validUntil: string | null; packageId: string | null; version: VersionInput }): Promise<{ id: string; quoteNumber: string }> {
  const id = newId();
  const ts = nowIso();
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = await nextQuoteNumber(db, orgId);
    try {
      await batch(db, [
        stmt(db, "INSERT INTO quotes (id,organization_id,trip_request_id,customer_id,quote_number,status,currency,valid_until,selected_package_id,current_version,created_by,created_at,updated_at) VALUES (?,?,?,?,?, 'draft',?,?,?,1,?,?,?)", [id, orgId, q.tripRequestId, q.customerId, number, q.currency, q.validUntil, q.packageId, userId, ts, ts]),
        stmt(db, "INSERT INTO quote_status_history (id,quote_id,from_status,to_status,changed_by,created_at) VALUES (?,?,?,?,?,?)", [newId(), id, null, "draft", userId, ts]),
        ...versionStatements(db, id, 1, q.version),
      ]);
      return { id, quoteNumber: number };
    } catch (e) {
      if (attempt === 4 || !/UNIQUE/i.test(String(e))) throw e;
    }
  }
  throw new AppError("conflict", "Could not allocate a quote number");
}

/** Adds a new immutable version. `expectedVersion` provides optimistic concurrency control. */
export async function addQuoteVersion(db: Db, orgId: string, quoteId: string, expectedVersion: number, v: VersionInput, patch: { validUntil?: string | null; packageId?: string | null }): Promise<number> {
  const next = expectedVersion + 1;
  try {
    const results = await batch(db, [
      stmt(db, "UPDATE quotes SET current_version = ?, updated_at = ?, valid_until = COALESCE(?, valid_until), selected_package_id = COALESCE(?, selected_package_id) WHERE id = ? AND organization_id = ? AND current_version = ?", [next, nowIso(), patch.validUntil ?? null, patch.packageId ?? null, quoteId, orgId, expectedVersion]),
      ...versionStatements(db, quoteId, next, v),
    ]);
    if ((results[0]?.meta?.changes ?? 0) === 0) throw new AppError("conflict", "The quotation was modified by someone else; reload and retry.");
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (/UNIQUE/i.test(String(e))) throw new AppError("conflict", "The quotation was modified by someone else; reload and retry.");
    throw e;
  }
  return next;
}

const QUOTE_SELECT = `q.*, c.name AS customer_name, t.title AS trip_title, v.selling_price_minor_units AS selling_price, v.total_cost_minor_units AS total_cost, v.gross_margin_basis_points AS margin_bp`;
const QUOTE_FROM = `quotes q LEFT JOIN customers c ON c.id = q.customer_id JOIN trip_requests t ON t.id = q.trip_request_id JOIN quote_versions v ON v.quote_id = q.id AND v.version_number = q.current_version`;

export async function getQuote(db: Db, orgId: string, id: string): Promise<QuoteRecord | null> {
  const r = await queryOne(db, `SELECT ${QUOTE_SELECT} FROM ${QUOTE_FROM} WHERE q.id = ? AND q.organization_id = ?`, [id, orgId]);
  return r ? mapQuote(r) : null;
}
export function listQuotes(db: Db, orgId: string, o: { q?: string; status?: string; tripId?: string; page: number; pageSize: number }): Promise<Page<QuoteRecord>> {
  const where = ["q.organization_id = ?"];
  const params: unknown[] = [orgId];
  if (o.status) (where.push("q.status = ?"), params.push(o.status));
  if (o.tripId) (where.push("q.trip_request_id = ?"), params.push(o.tripId));
  if (o.q) (where.push("(q.quote_number LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR t.title LIKE ? ESCAPE '\\')"), params.push(...Array(3).fill(`%${escapeLike(o.q)}%`)));
  return paginate(db, { select: QUOTE_SELECT, from: QUOTE_FROM, where: where.join(" AND "), params, orderBy: "q.updated_at DESC, q.id", page: o.page, pageSize: o.pageSize, map: mapQuote });
}

export interface VersionRecord {
  id: string; quoteId: string; versionNumber: number; itinerary: Record<string, unknown>; pricing: Record<string, unknown>; package: Record<string, unknown>;
  totalCostMinor: number; sellingPriceMinor: number; grossProfitMinor: number; grossMarginBp: number; fx: Record<string, unknown>; terms: Record<string, unknown>;
  internalNotes: string | null; approvalRequired: boolean; approvedBy: string | null; approvedAt: string | null; createdBy: string | null; createdAt: string;
  items: { id: string; category: string; description: string; quantity: number; unitCostMinor: number; totalCostMinor: number; unitSellingMinor: number; totalSellingMinor: number; currency: string; optional: boolean }[];
}
export async function getVersion(db: Db, quoteId: string, versionNumber: number): Promise<VersionRecord | null> {
  const r = await queryOne(db, "SELECT * FROM quote_versions WHERE quote_id = ? AND version_number = ?", [quoteId, versionNumber]);
  if (!r) return null;
  const items = await query(db, "SELECT * FROM quote_line_items WHERE quote_version_id = ? ORDER BY sort_order", [str(r.id)]);
  return {
    id: str(r.id), quoteId: str(r.quote_id), versionNumber: num(r.version_number), itinerary: parseJson(r.itinerary_snapshot_json, {}), pricing: parseJson(r.pricing_snapshot_json, {}), package: parseJson(r.package_snapshot_json, {}),
    totalCostMinor: num(r.total_cost_minor_units), sellingPriceMinor: num(r.selling_price_minor_units), grossProfitMinor: num(r.gross_profit_minor_units), grossMarginBp: num(r.gross_margin_basis_points),
    fx: parseJson(r.fx_snapshot_json, {}), terms: parseJson(r.terms_snapshot_json, {}), internalNotes: strOrNull(r.internal_notes), approvalRequired: num(r.approval_required) === 1, approvedBy: strOrNull(r.approved_by), approvedAt: strOrNull(r.approved_at), createdBy: strOrNull(r.created_by), createdAt: str(r.created_at),
    items: items.map((i) => ({ id: str(i.id), category: str(i.category), description: str(i.description), quantity: num(i.quantity), unitCostMinor: num(i.unit_cost_minor_units), totalCostMinor: num(i.total_cost_minor_units), unitSellingMinor: num(i.unit_selling_price_minor_units), totalSellingMinor: num(i.total_selling_price_minor_units), currency: str(i.currency), optional: num(i.is_optional) === 1 })),
  };
}
export async function listVersionSummaries(db: Db, quoteId: string): Promise<{ versionNumber: number; sellingPriceMinor: number; totalCostMinor: number; grossMarginBp: number; approvalRequired: boolean; approvedAt: string | null; createdAt: string }[]> {
  return (await query(db, "SELECT version_number, selling_price_minor_units, total_cost_minor_units, gross_margin_basis_points, approval_required, approved_at, created_at FROM quote_versions WHERE quote_id = ? ORDER BY version_number DESC", [quoteId])).map((r) => ({ versionNumber: num(r.version_number), sellingPriceMinor: num(r.selling_price_minor_units), totalCostMinor: num(r.total_cost_minor_units), grossMarginBp: num(r.gross_margin_basis_points), approvalRequired: num(r.approval_required) === 1, approvedAt: strOrNull(r.approved_at), createdAt: str(r.created_at) }));
}

export interface BookingConfirmationRecord {
  id: string; organizationId: string; quoteId: string; quoteVersion: number; reference: string;
  status: "confirmed" | "failed"; checkedAt: string; validUntil: string | null; currency: string;
  totalCostMinor: number; checks: unknown[]; createdBy: string | null; createdAt: string;
}
const mapBookingConfirmation = (r: Row): BookingConfirmationRecord => ({
  id: str(r.id), organizationId: str(r.organization_id), quoteId: str(r.quote_id), quoteVersion: num(r.quote_version),
  reference: str(r.reference), status: str(r.status) as "confirmed" | "failed", checkedAt: str(r.checked_at),
  validUntil: strOrNull(r.valid_until), currency: str(r.currency), totalCostMinor: num(r.total_cost_minor_units),
  checks: parseJson(r.checks_json, []), createdBy: strOrNull(r.created_by), createdAt: str(r.created_at),
});
export async function createBookingConfirmation(
  db: Db,
  orgId: string,
  i: { quoteId: string; quoteVersion: number; reference: string; status: "confirmed" | "failed"; checkedAt: string; validUntil: string | null; currency: string; totalCostMinor: number; checks: unknown; createdBy: string | null },
): Promise<BookingConfirmationRecord> {
  const id = newId();
  const createdAt = nowIso();
  await execute(
    db,
    "INSERT INTO booking_confirmations (id,organization_id,quote_id,quote_version,reference,status,checked_at,valid_until,currency,total_cost_minor_units,checks_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, orgId, i.quoteId, i.quoteVersion, i.reference, i.status, i.checkedAt, i.validUntil, i.currency, i.totalCostMinor, toJson(i.checks), i.createdBy, createdAt],
  );
  return { id, organizationId: orgId, quoteId: i.quoteId, quoteVersion: i.quoteVersion, reference: i.reference, status: i.status, checkedAt: i.checkedAt, validUntil: i.validUntil, currency: i.currency, totalCostMinor: i.totalCostMinor, checks: i.checks as unknown[], createdBy: i.createdBy, createdAt };
}
export async function latestBookingConfirmation(db: Db, orgId: string, quoteId: string, version: number): Promise<BookingConfirmationRecord | null> {
  const r = await queryOne(db, "SELECT * FROM booking_confirmations WHERE organization_id = ? AND quote_id = ? AND quote_version = ? ORDER BY created_at DESC LIMIT 1", [orgId, quoteId, version]);
  return r ? mapBookingConfirmation(r) : null;
}

export async function setQuoteStatus(db: Db, orgId: string, quoteId: string, from: QuoteStatus, to: QuoteStatus, userId: string | null, note?: string): Promise<boolean> {
  const results = await batch(db, [
    stmt(db, "UPDATE quotes SET status = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND status = ?", [to, nowIso(), quoteId, orgId, from]),
    stmt(db, "INSERT INTO quote_status_history SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM quotes WHERE id = ? AND status = ?)", [newId(), quoteId, from, to, note ?? null, userId, nowIso(), quoteId, to]),
  ]);
  return (results[0]?.meta?.changes ?? 0) > 0;
}
export async function quoteStatusHistory(db: Db, quoteId: string): Promise<Row[]> {
  return query(db, "SELECT h.*, u.display_name AS changed_by_name FROM quote_status_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.quote_id = ? ORDER BY h.created_at, h.rowid", [quoteId]);
}
/** Expires sent/viewed quotes past their validity date. Returns the ids moved to expired. */
export async function expireOverdueQuotes(db: Db, today: string): Promise<string[]> {
  const rows = await query<{ id: string; organization_id: string; status: string }>(db, "SELECT id, organization_id, status FROM quotes WHERE status IN ('sent','viewed') AND valid_until IS NOT NULL AND valid_until < ? LIMIT 200", [today]);
  for (const r of rows) await setQuoteStatus(db, r.organization_id, r.id, r.status as QuoteStatus, "expired", null, "Validity period elapsed");
  return rows.map((r) => r.id);
}

/* ---------- approvals ---------- */
export async function pendingApproval(db: Db, quoteId: string, versionNumber: number): Promise<Row | null> {
  return queryOne(db, "SELECT * FROM quote_approvals WHERE quote_id = ? AND version_number = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", [quoteId, versionNumber]);
}
export async function decideApproval(db: Db, quoteId: string, versionNumber: number, userId: string, decision: "approved" | "rejected", note?: string): Promise<void> {
  const ts = nowIso();
  await batch(db, [
    stmt(db, "UPDATE quote_approvals SET decided_by = ?, decision = ?, decision_note = ?, decided_at = ? WHERE quote_id = ? AND version_number = ? AND decision IS NULL", [userId, decision, note ?? null, ts, quoteId, versionNumber]),
    ...(decision === "approved" ? [stmt(db, "UPDATE quote_versions SET approved_by = ?, approved_at = ? WHERE quote_id = ? AND version_number = ?", [userId, ts, quoteId, versionNumber])] : []),
  ]);
}
export async function approvalHistory(db: Db, quoteId: string): Promise<Row[]> {
  return query(db, "SELECT a.*, u.display_name AS decided_by_name FROM quote_approvals a LEFT JOIN users u ON u.id = a.decided_by WHERE a.quote_id = ? ORDER BY a.created_at DESC, a.rowid DESC", [quoteId]);
}

/* ---------- shares ---------- */
export interface ShareRecord { id: string; quoteId: string; versionNumber: number; expiresAt: string; revokedAt: string | null; viewCount: number; firstViewedAt: string | null; createdAt: string }
export async function createShare(db: Db, quoteId: string, versionNumber: number, tokenHash: string, expiresAt: string, userId: string | null): Promise<string> {
  const id = newId();
  await execute(db, "INSERT INTO quote_shares (id,quote_id,version_number,token_hash,expires_at,access_policy_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)", [id, quoteId, versionNumber, tokenHash, expiresAt, toJson({ clientView: true }), userId, nowIso()]);
  return id;
}
export async function listShares(db: Db, quoteId: string): Promise<ShareRecord[]> {
  return (await query(db, "SELECT * FROM quote_shares WHERE quote_id = ? ORDER BY created_at DESC, rowid DESC", [quoteId])).map((r) => ({ id: str(r.id), quoteId: str(r.quote_id), versionNumber: num(r.version_number), expiresAt: str(r.expires_at), revokedAt: strOrNull(r.revoked_at), viewCount: num(r.view_count), firstViewedAt: strOrNull(r.first_viewed_at), createdAt: str(r.created_at) }));
}
export async function revokeShare(db: Db, quoteId: string, shareId: string): Promise<boolean> {
  return (await execute(db, "UPDATE quote_shares SET revoked_at = ? WHERE id = ? AND quote_id = ? AND revoked_at IS NULL", [nowIso(), shareId, quoteId])) > 0;
}
export async function revokeAllShares(db: Db, quoteId: string): Promise<void> {
  await execute(db, "UPDATE quote_shares SET revoked_at = ? WHERE quote_id = ? AND revoked_at IS NULL", [nowIso(), quoteId]);
}
/** Resolves a share by token hash; only unrevoked, unexpired shares are returned. */
export async function findActiveShare(db: Db, tokenHash: string): Promise<(ShareRecord & { organizationId: string }) | null> {
  const r = await queryOne(db, "SELECT s.*, q.organization_id FROM quote_shares s JOIN quotes q ON q.id = s.quote_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?", [tokenHash, nowIso()]);
  if (!r) return null;
  return { id: str(r.id), quoteId: str(r.quote_id), versionNumber: num(r.version_number), expiresAt: str(r.expires_at), revokedAt: null, viewCount: num(r.view_count), firstViewedAt: strOrNull(r.first_viewed_at), createdAt: str(r.created_at), organizationId: str(r.organization_id) };
}
export async function recordShareView(db: Db, shareId: string): Promise<boolean> {
  const first = await queryOne<{ first_viewed_at: string | null }>(db, "SELECT first_viewed_at FROM quote_shares WHERE id = ?", [shareId]);
  await execute(db, "UPDATE quote_shares SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, ?) WHERE id = ?", [nowIso(), shareId]);
  return !first?.first_viewed_at;
}

export async function recordAcceptance(db: Db, a: { quoteId: string; versionNumber: number; decision: "accept" | "reject"; name: string; email: string; comment?: string; ipHash?: string | null }): Promise<void> {
  await execute(db, "INSERT INTO quote_acceptances (id,quote_id,version_number,decision,accepted_by_name,accepted_by_email,comment,ip_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)", [newId(), a.quoteId, a.versionNumber, a.decision, a.name, a.email, a.comment ?? null, a.ipHash ?? null, nowIso()]);
}
export async function listAcceptances(db: Db, quoteId: string): Promise<Row[]> {
  return query(db, "SELECT * FROM quote_acceptances WHERE quote_id = ? ORDER BY created_at DESC, rowid DESC", [quoteId]);
}

/* ---------- documents ---------- */
export async function recordDocument(db: Db, d: { organizationId: string; resourceType: string; resourceId: string; versionNumber?: number | null; key: string; contentType: string; size: number; sha256?: string; userId?: string | null }): Promise<string> {
  const id = newId();
  await execute(db, "INSERT INTO documents (id,organization_id,resource_type,resource_id,version_number,r2_object_key,content_type,size_bytes,sha256,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [id, d.organizationId, d.resourceType, d.resourceId, d.versionNumber ?? null, d.key, d.contentType, d.size, d.sha256 ?? null, d.userId ?? null, nowIso()]);
  return id;
}
export async function latestDocument(db: Db, orgId: string, resourceType: string, resourceId: string, versionNumber: number): Promise<Row | null> {
  return queryOne(db, "SELECT * FROM documents WHERE organization_id = ? AND resource_type = ? AND resource_id = ? AND version_number = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", [orgId, resourceType, resourceId, versionNumber]);
}

/* ---------- reports ---------- */
export async function quotationPerformance(db: Db, orgId: string, from: string, to: string): Promise<{ byStatus: Record<string, number>; total: number; sent: number; accepted: number; conversionBp: number; avgMarginBp: number; sellingByCurrency: { currency: string; accepted: number; pipeline: number }[]; monthly: { month: string; created: number; accepted: number }[] }> {
  const rows = await query<{ status: string; n: number }>(db, "SELECT status, COUNT(*) AS n FROM quotes WHERE organization_id = ? AND created_at >= ? AND created_at < ? GROUP BY status", [orgId, from, to]);
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  const total = rows.reduce((s, r) => s + Number(r.n), 0);
  const accepted = byStatus.accepted ?? 0;
  const sent = (byStatus.sent ?? 0) + (byStatus.viewed ?? 0) + accepted + (byStatus.rejected ?? 0) + (byStatus.expired ?? 0);
  const margin = await queryOne<{ m: number | null }>(db, "SELECT AVG(v.gross_margin_basis_points) AS m FROM quotes q JOIN quote_versions v ON v.quote_id = q.id AND v.version_number = q.current_version WHERE q.organization_id = ? AND q.created_at >= ? AND q.created_at < ?", [orgId, from, to]);
  const money = await query(db, "SELECT q.currency AS currency, SUM(CASE WHEN q.status = 'accepted' THEN v.selling_price_minor_units ELSE 0 END) AS accepted, SUM(CASE WHEN q.status IN ('sent','viewed','ready_for_review') THEN v.selling_price_minor_units ELSE 0 END) AS pipeline FROM quotes q JOIN quote_versions v ON v.quote_id = q.id AND v.version_number = q.current_version WHERE q.organization_id = ? AND q.created_at >= ? AND q.created_at < ? GROUP BY q.currency", [orgId, from, to]);
  const monthly = await query(db, "SELECT substr(created_at,1,7) AS month, COUNT(*) AS created, SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END) AS accepted FROM quotes WHERE organization_id = ? AND created_at >= ? AND created_at < ? GROUP BY month ORDER BY month", [orgId, from, to]);
  return {
    byStatus, total, sent, accepted, conversionBp: sent > 0 ? Math.round((accepted * 10_000) / sent) : 0, avgMarginBp: Math.round(Number(margin?.m ?? 0)),
    sellingByCurrency: money.map((r) => ({ currency: str(r.currency), accepted: num(r.accepted), pipeline: num(r.pipeline) })),
    monthly: monthly.map((r) => ({ month: str(r.month), created: num(r.created), accepted: num(r.accepted) })),
  };
}

export async function supplierPerformance(db: Db, orgId: string, sinceIso: string): Promise<{ providerKey: string; offersRetrieved: number; mockOffers: number; avgPriceCheckedShare: number; calls: number; errors: number; avgLatencyMs: number }[]> {
  const offers = await query(db, "SELECT provider_key, COUNT(*) AS n, SUM(is_mock) AS mock, SUM(CASE WHEN verification_status = 'live_checked' THEN 1 ELSE 0 END) AS checked FROM supplier_offers WHERE organization_id = ? AND retrieved_at >= ? GROUP BY provider_key", [orgId, sinceIso]);
  const usage = await query(db, "SELECT provider_key, COUNT(*) AS calls, SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors, AVG(latency_ms) AS lat FROM external_api_usage WHERE organization_id = ? AND created_at >= ? GROUP BY provider_key", [orgId, sinceIso]);
  const keys = new Set([...offers.map((r) => str(r.provider_key)), ...usage.map((r) => str(r.provider_key))]);
  return [...keys].sort().map((k) => {
    const o = offers.find((r) => str(r.provider_key) === k);
    const u = usage.find((r) => str(r.provider_key) === k);
    const n = num(o?.n);
    return { providerKey: k, offersRetrieved: n, mockOffers: num(o?.mock), avgPriceCheckedShare: n > 0 ? Math.round((num(o?.checked) / n) * 100) / 100 : 0, calls: num(u?.calls), errors: num(u?.errors), avgLatencyMs: Math.round(num(u?.lat)) };
  });
}

