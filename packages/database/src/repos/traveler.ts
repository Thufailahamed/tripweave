import type {
  TravelerBudgetCategory,
  TravelerBudgetItem,
  TravelerNote,
  TravelerPackingCategory,
  TravelerPackingItem,
  TravelerShare,
} from "@tripweave/shared";
import { batch, execute, newId, nowIso, query, queryOne, stmt, str, num, type Db, type Row } from "../db";

/* ---------- budget ---------- */

const mapBudget = (r: Row): TravelerBudgetItem => ({
  id: str(r.id),
  label: str(r.label),
  category: str(r.category) as TravelerBudgetCategory,
  amountMinor: num(r.amount_minor_units),
  currency: str(r.currency),
  isPaid: num(r.is_paid) === 1,
  sortOrder: num(r.sort_order),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listBudgetItems(db: Db, organizationId: string, tripId: string): Promise<TravelerBudgetItem[]> {
  const rows = await query(db, "SELECT * FROM trip_budget_items WHERE organization_id = ? AND trip_request_id = ? ORDER BY sort_order, created_at, id", [organizationId, tripId]);
  return rows.map(mapBudget);
}

export async function getBudgetItem(db: Db, organizationId: string, tripId: string, id: string): Promise<TravelerBudgetItem | null> {
  const row = await queryOne(db, "SELECT * FROM trip_budget_items WHERE id = ? AND organization_id = ? AND trip_request_id = ?", [id, organizationId, tripId]);
  return row ? mapBudget(row) : null;
}

export async function createBudgetItem(
  db: Db,
  organizationId: string,
  tripId: string,
  input: { label: string; category: TravelerBudgetCategory; amountMinor: number; currency: string; isPaid?: boolean },
): Promise<TravelerBudgetItem> {
  const id = newId();
  const ts = nowIso();
  const next = await queryOne<{ n: number }>(db, "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM trip_budget_items WHERE organization_id = ? AND trip_request_id = ?", [organizationId, tripId]);
  await execute(
    db,
    "INSERT INTO trip_budget_items (id,organization_id,trip_request_id,label,category,amount_minor_units,currency,is_paid,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [id, organizationId, tripId, input.label, input.category, input.amountMinor, input.currency, input.isPaid ? 1 : 0, next?.n ?? 1, ts, ts],
  );
  return (await getBudgetItem(db, organizationId, tripId, id))!;
}

export async function updateBudgetItem(
  db: Db,
  organizationId: string,
  tripId: string,
  id: string,
  patch: { label?: string; category?: TravelerBudgetCategory; amountMinor?: number; isPaid?: boolean },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.label !== undefined) (sets.push("label = ?"), params.push(patch.label));
  if (patch.category !== undefined) (sets.push("category = ?"), params.push(patch.category));
  if (patch.amountMinor !== undefined) (sets.push("amount_minor_units = ?"), params.push(patch.amountMinor));
  if (patch.isPaid !== undefined) (sets.push("is_paid = ?"), params.push(patch.isPaid ? 1 : 0));
  if (sets.length === 0) return false;
  return (await execute(db, `UPDATE trip_budget_items SET ${sets.join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ? AND trip_request_id = ?`, [...params, nowIso(), id, organizationId, tripId])) > 0;
}

export async function deleteBudgetItem(db: Db, organizationId: string, tripId: string, id: string): Promise<boolean> {
  return (await execute(db, "DELETE FROM trip_budget_items WHERE id = ? AND organization_id = ? AND trip_request_id = ?", [id, organizationId, tripId])) > 0;
}

/* ---------- packing ---------- */

const mapPacking = (r: Row): TravelerPackingItem => ({
  id: str(r.id),
  label: str(r.label),
  category: str(r.category) as TravelerPackingCategory,
  isChecked: num(r.is_checked) === 1,
  sortOrder: num(r.sort_order),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listPackingItems(db: Db, organizationId: string, tripId: string): Promise<TravelerPackingItem[]> {
  const rows = await query(db, "SELECT * FROM trip_packing_items WHERE organization_id = ? AND trip_request_id = ? ORDER BY sort_order, created_at, id", [organizationId, tripId]);
  return rows.map(mapPacking);
}

export async function getPackingItem(db: Db, organizationId: string, tripId: string, id: string): Promise<TravelerPackingItem | null> {
  const row = await queryOne(db, "SELECT * FROM trip_packing_items WHERE id = ? AND organization_id = ? AND trip_request_id = ?", [id, organizationId, tripId]);
  return row ? mapPacking(row) : null;
}

export async function createPackingItem(
  db: Db,
  organizationId: string,
  tripId: string,
  input: { label: string; category: TravelerPackingCategory; isChecked?: boolean },
): Promise<TravelerPackingItem> {
  const id = newId();
  const ts = nowIso();
  const next = await queryOne<{ n: number }>(db, "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM trip_packing_items WHERE organization_id = ? AND trip_request_id = ?", [organizationId, tripId]);
  await execute(
    db,
    "INSERT INTO trip_packing_items (id,organization_id,trip_request_id,label,category,is_checked,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, organizationId, tripId, input.label, input.category, input.isChecked ? 1 : 0, next?.n ?? 1, ts, ts],
  );
  return (await getPackingItem(db, organizationId, tripId, id))!;
}

export async function updatePackingItem(
  db: Db,
  organizationId: string,
  tripId: string,
  id: string,
  patch: { label?: string; category?: TravelerPackingCategory; isChecked?: boolean },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.label !== undefined) (sets.push("label = ?"), params.push(patch.label));
  if (patch.category !== undefined) (sets.push("category = ?"), params.push(patch.category));
  if (patch.isChecked !== undefined) (sets.push("is_checked = ?"), params.push(patch.isChecked ? 1 : 0));
  if (sets.length === 0) return false;
  return (await execute(db, `UPDATE trip_packing_items SET ${sets.join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ? AND trip_request_id = ?`, [...params, nowIso(), id, organizationId, tripId])) > 0;
}

export async function deletePackingItem(db: Db, organizationId: string, tripId: string, id: string): Promise<boolean> {
  return (await execute(db, "DELETE FROM trip_packing_items WHERE id = ? AND organization_id = ? AND trip_request_id = ?", [id, organizationId, tripId])) > 0;
}

/** Adds only labels the trip does not already have (case-insensitive), preserving checked state. */
export async function addPackingItemsIfMissing(
  db: Db,
  organizationId: string,
  tripId: string,
  items: { label: string; category: TravelerPackingCategory }[],
): Promise<number> {
  const existing = await listPackingItems(db, organizationId, tripId);
  const seen = new Set(existing.map((item) => item.label.trim().toLowerCase()));
  const fresh: { label: string; category: TravelerPackingCategory }[] = [];
  for (const item of items) {
    const key = item.label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fresh.push({ label: item.label.trim(), category: item.category });
  }
  if (fresh.length === 0) return 0;
  const ts = nowIso();
  const next = await queryOne<{ n: number }>(db, "SELECT COALESCE(MAX(sort_order), 0) AS n FROM trip_packing_items WHERE organization_id = ? AND trip_request_id = ?", [organizationId, tripId]);
  const start = (next?.n ?? 0) + 1;
  await batch(
    db,
    fresh.map((item, index) =>
      stmt(db, "INSERT INTO trip_packing_items (id,organization_id,trip_request_id,label,category,is_checked,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?,?)", [newId(), organizationId, tripId, item.label, item.category, start + index, ts, ts]),
    ),
  );
  return fresh.length;
}

/* ---------- notes ---------- */

const mapNote = (r: Row): TravelerNote => ({
  id: str(r.id),
  body: str(r.body),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listNotes(db: Db, organizationId: string, tripId: string): Promise<TravelerNote[]> {
  const rows = await query(db, "SELECT * FROM trip_notes WHERE organization_id = ? AND trip_request_id = ? ORDER BY created_at DESC, id DESC", [organizationId, tripId]);
  return rows.map(mapNote);
}

export async function getNote(db: Db, organizationId: string, tripId: string, id: string): Promise<TravelerNote | null> {
  const row = await queryOne(db, "SELECT * FROM trip_notes WHERE id = ? AND organization_id = ? AND trip_request_id = ?", [id, organizationId, tripId]);
  return row ? mapNote(row) : null;
}

export async function createNote(db: Db, organizationId: string, tripId: string, body: string): Promise<TravelerNote> {
  const id = newId();
  const ts = nowIso();
  await execute(db, "INSERT INTO trip_notes (id,organization_id,trip_request_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)", [id, organizationId, tripId, body, ts, ts]);
  return (await getNote(db, organizationId, tripId, id))!;
}

export async function updateNote(db: Db, organizationId: string, tripId: string, id: string, body: string): Promise<boolean> {
  return (await execute(db, "UPDATE trip_notes SET body = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND trip_request_id = ?", [body, nowIso(), id, organizationId, tripId])) > 0;
}

export async function deleteNote(db: Db, organizationId: string, tripId: string, id: string): Promise<boolean> {
  return (await execute(db, "DELETE FROM trip_notes WHERE id = ? AND organization_id = ? AND trip_request_id = ?", [id, organizationId, tripId])) > 0;
}

/* ---------- shares ---------- */

export interface TravelerShareRow extends TravelerShare {
  organizationId: string;
  tripRequestId: string;
  tokenHash: string;
}

const mapShare = (r: Row): TravelerShare => ({
  id: str(r.id),
  expiresAt: str(r.expires_at),
  includeBudget: num(r.include_budget) === 1,
  viewCount: num(r.view_count),
  createdAt: str(r.created_at),
});

const mapShareRow = (r: Row): TravelerShareRow => ({
  ...mapShare(r),
  organizationId: str(r.organization_id),
  tripRequestId: str(r.trip_request_id),
  tokenHash: str(r.token_hash),
});

export async function createShare(
  db: Db,
  input: { organizationId: string; tripRequestId: string; tokenHash: string; expiresAt: string; includeBudget: boolean; createdBy: string },
): Promise<TravelerShare> {
  const id = newId();
  const ts = nowIso();
  await execute(
    db,
    "INSERT INTO trip_shares (id,organization_id,trip_request_id,token_hash,expires_at,include_budget,view_count,created_by,created_at) VALUES (?,?,?,?,?,?,0,?,?)",
    [id, input.organizationId, input.tripRequestId, input.tokenHash, input.expiresAt, input.includeBudget ? 1 : 0, input.createdBy, ts],
  );
  return mapShare((await queryOne(db, "SELECT * FROM trip_shares WHERE id = ?", [id]))!);
}

export async function listActiveShares(db: Db, organizationId: string, tripId: string, now: string): Promise<TravelerShare[]> {
  const rows = await query(
    db,
    "SELECT * FROM trip_shares WHERE organization_id = ? AND trip_request_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC",
    [organizationId, tripId, now],
  );
  return rows.map(mapShare);
}

export async function getActiveShareByTokenHash(db: Db, tokenHash: string, now: string): Promise<TravelerShareRow | null> {
  const row = await queryOne(db, "SELECT * FROM trip_shares WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?", [tokenHash, now]);
  return row ? mapShareRow(row) : null;
}

export async function revokeShare(db: Db, organizationId: string, tripId: string, id: string): Promise<boolean> {
  return (await execute(db, "UPDATE trip_shares SET revoked_at = ? WHERE id = ? AND organization_id = ? AND trip_request_id = ? AND revoked_at IS NULL", [nowIso(), id, organizationId, tripId])) > 0;
}

export async function revokeActiveShares(db: Db, organizationId: string, tripId: string): Promise<void> {
  await execute(db, "UPDATE trip_shares SET revoked_at = ? WHERE organization_id = ? AND trip_request_id = ? AND revoked_at IS NULL", [nowIso(), organizationId, tripId]);
}

export async function recordShareView(db: Db, id: string): Promise<number> {
  await execute(db, "UPDATE trip_shares SET view_count = view_count + 1 WHERE id = ?", [id]);
  return (await queryOne<{ view_count: number }>(db, "SELECT view_count FROM trip_shares WHERE id = ?", [id]))?.view_count ?? 0;
}
