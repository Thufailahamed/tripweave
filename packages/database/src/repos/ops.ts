import type { FxSnapshot } from "@tripweave/shared";
import { clock, execute, newId, nowIso, parseJson, paginate, query, queryOne, str, strOrNull, toJson, num, type Db, type Page, type Row } from "../db";

/* ---------- audit ---------- */

const FORBIDDEN_KEYS = /pass(word)?|secret|token|authorization|api[_-]?key|cookie/i;

/** Strips anything that looks like a credential before it is written to the audit log. */
export function sanitiseMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? sanitiseMetadata(v as Record<string, unknown>) : v;
  }
  return out;
}

export interface AuditInput {
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

export async function writeAudit(db: Db, e: AuditInput): Promise<void> {
  await execute(db, `INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,safe_metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)`, [
    newId(), e.organizationId, e.actorUserId, e.action, e.resourceType, e.resourceId ?? null, toJson(sanitiseMetadata(e.metadata)), e.requestId ?? null, nowIso(),
  ]);
}

export interface AuditRow {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  requestId: string | null;
  createdAt: string;
}

export function listAudit(db: Db, organizationId: string | null, opts: { page: number; pageSize: number; resourceType?: string; action?: string }): Promise<Page<AuditRow>> {
  const where: string[] = [organizationId === null ? "a.organization_id IS NULL" : "a.organization_id = ?"];
  const params: unknown[] = organizationId === null ? [] : [organizationId];
  if (opts.resourceType) (where.push("a.resource_type = ?"), params.push(opts.resourceType));
  if (opts.action) (where.push("a.action LIKE ?"), params.push(`${opts.action}%`));
  return paginate(db, {
    select: "a.*, u.display_name AS actor_name",
    from: "audit_events a LEFT JOIN users u ON u.id = a.actor_user_id",
    where: where.join(" AND "),
    params,
    orderBy: "a.created_at DESC, a.id DESC",
    page: opts.page,
    pageSize: opts.pageSize,
    map: (r) => ({
      id: str(r.id),
      organizationId: strOrNull(r.organization_id),
      actorUserId: strOrNull(r.actor_user_id),
      actorName: strOrNull(r.actor_name),
      action: str(r.action),
      resourceType: str(r.resource_type),
      resourceId: strOrNull(r.resource_id),
      metadata: parseJson(r.safe_metadata_json, {}),
      requestId: strOrNull(r.request_id),
      createdAt: str(r.created_at),
    }),
  });
}

/* ---------- rate limiting ---------- */

/** Fixed-window counter. Returns whether the call is allowed and remaining quota. */
export async function hitRateLimit(db: Db, key: string, limit: number, windowSeconds: number, nowMs = clock().getTime()): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const windowStart = Math.floor(nowMs / 1000 / windowSeconds) * windowSeconds;
  await execute(db, `INSERT INTO rate_limit_buckets (bucket_key, window_start, count) VALUES (?,?,1) ON CONFLICT(bucket_key, window_start) DO UPDATE SET count = count + 1`, [key, windowStart]);
  const row = await queryOne<{ count: number }>(db, "SELECT count FROM rate_limit_buckets WHERE bucket_key = ? AND window_start = ?", [key, windowStart]);
  const count = row?.count ?? 1;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: windowStart + windowSeconds - Math.floor(nowMs / 1000) };
}
export async function purgeRateLimits(db: Db, olderThanSeconds = 86_400): Promise<number> {
  return execute(db, "DELETE FROM rate_limit_buckets WHERE window_start < ?", [Math.floor(clock().getTime() / 1000) - olderThanSeconds]);
}

/* ---------- idempotency ---------- */

export interface IdempotencyRecord {
  requestHash: string;
  status: number | null;
  body: string | null;
}
export async function getIdempotency(db: Db, organizationId: string, key: string): Promise<IdempotencyRecord | null> {
  const r = await queryOne(db, "SELECT * FROM idempotency_keys WHERE organization_id = ? AND key = ?", [organizationId, key]);
  return r ? { requestHash: str(r.request_hash), status: r.response_status == null ? null : num(r.response_status), body: strOrNull(r.response_body) } : null;
}
/** Claims a key. Returns false if another request already claimed it. */
export async function claimIdempotency(db: Db, organizationId: string, key: string, requestHash: string): Promise<boolean> {
  return (await execute(db, "INSERT OR IGNORE INTO idempotency_keys (organization_id,key,request_hash,created_at) VALUES (?,?,?,?)", [organizationId, key, requestHash, nowIso()])) > 0;
}
export async function completeIdempotency(db: Db, organizationId: string, key: string, status: number, body: string): Promise<void> {
  await execute(db, "UPDATE idempotency_keys SET response_status = ?, response_body = ? WHERE organization_id = ? AND key = ?", [status, body, organizationId, key]);
}
export async function releaseIdempotency(db: Db, organizationId: string, key: string): Promise<void> {
  await execute(db, "DELETE FROM idempotency_keys WHERE organization_id = ? AND key = ? AND response_status IS NULL", [organizationId, key]);
}

/* ---------- settings ---------- */

export async function getSetting<T>(db: Db, organizationId: string, key: string, fallback: T): Promise<T> {
  const r = await queryOne<{ value_json: string }>(db, "SELECT value_json FROM organization_settings WHERE organization_id = ? AND key = ?", [organizationId, key]);
  return r ? parseJson<T>(r.value_json, fallback) : fallback;
}
export async function setSetting(db: Db, organizationId: string, key: string, value: unknown, userId: string | null): Promise<void> {
  await execute(db, `INSERT INTO organization_settings (organization_id,key,value_json,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(organization_id,key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, [organizationId, key, toJson(value), userId, nowIso()]);
}

/* ---------- notifications / email ---------- */

export async function addNotification(db: Db, n: { organizationId: string; userId?: string | null; kind: string; title: string; body?: string; link?: string }): Promise<void> {
  await execute(db, "INSERT INTO notifications (id,organization_id,user_id,kind,title,body,link,created_at) VALUES (?,?,?,?,?,?,?,?)", [newId(), n.organizationId, n.userId ?? null, n.kind, n.title, n.body ?? "", n.link ?? null, nowIso()]);
}
export interface NotificationRow { id: string; kind: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }
export async function listNotifications(db: Db, organizationId: string, userId: string, limit = 30): Promise<{ items: NotificationRow[]; unread: number }> {
  const rows = await query(db, "SELECT * FROM notifications WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL) ORDER BY created_at DESC, rowid DESC LIMIT ?", [organizationId, userId, limit]);
  const unread = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM notifications WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL) AND read_at IS NULL", [organizationId, userId]);
  return {
    items: rows.map((r) => ({ id: str(r.id), kind: str(r.kind), title: str(r.title), body: str(r.body), link: strOrNull(r.link), readAt: strOrNull(r.read_at), createdAt: str(r.created_at) })),
    unread: unread?.n ?? 0,
  };
}
export async function markNotificationsRead(db: Db, organizationId: string, userId: string): Promise<void> {
  await execute(db, "UPDATE notifications SET read_at = ? WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL) AND read_at IS NULL", [nowIso(), organizationId, userId]);
}
export async function enqueueEmail(db: Db, e: { organizationId: string | null; to: string; subject: string; body: string }): Promise<string> {
  const id = newId();
  await execute(db, "INSERT INTO email_outbox (id,organization_id,to_email,subject,body_text,created_at) VALUES (?,?,?,?,?,?)", [id, e.organizationId, e.to, e.subject, e.body, nowIso()]);
  return id;
}
export async function markEmail(db: Db, id: string, status: "sent" | "failed", detail: { messageId?: string; error?: string }): Promise<void> {
  await execute(db, "UPDATE email_outbox SET status = ?, provider_message_id = ?, error = ?, sent_at = ? WHERE id = ?", [status, detail.messageId ?? null, detail.error ?? null, status === "sent" ? nowIso() : null, id]);
}

/* ---------- telemetry ---------- */

export async function recordProviderCall(db: Db, c: { organizationId: string | null; providerKey: string; operation: string; status: "ok" | "error" | "timeout"; latencyMs: number; errorCode?: string }): Promise<void> {
  await execute(db, "INSERT INTO external_api_usage (id,organization_id,provider_key,operation,status,latency_ms,error_code,created_at) VALUES (?,?,?,?,?,?,?,?)", [newId(), c.organizationId, c.providerKey, c.operation, c.status, c.latencyMs, c.errorCode ?? null, nowIso()]);
}
export interface ProviderHealth { providerKey: string; calls: number; errors: number; avgLatencyMs: number; lastCallAt: string | null }
export async function providerHealth(db: Db, organizationId: string | null, sinceIso: string): Promise<ProviderHealth[]> {
  const rows = await query(
    db,
    `SELECT provider_key, COUNT(*) AS calls, SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors, AVG(latency_ms) AS avg_latency, MAX(created_at) AS last_call
       FROM external_api_usage WHERE created_at >= ? ${organizationId ? "AND organization_id = ?" : ""} GROUP BY provider_key ORDER BY provider_key`,
    organizationId ? [sinceIso, organizationId] : [sinceIso],
  );
  return rows.map((r) => ({ providerKey: str(r.provider_key), calls: num(r.calls), errors: num(r.errors), avgLatencyMs: Math.round(num(r.avg_latency)), lastCallAt: strOrNull(r.last_call) }));
}
export async function recordAiUsage(db: Db, u: { organizationId: string; operation: string; engine: string; model?: string | null; inputChars: number; outputChars: number; latencyMs: number; status: string }): Promise<void> {
  await execute(db, "INSERT INTO ai_usage (id,organization_id,operation,engine,model,input_chars,output_chars,latency_ms,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [newId(), u.organizationId, u.operation, u.engine, u.model ?? null, u.inputChars, u.outputChars, u.latencyMs, u.status, nowIso()]);
}
export async function aiUsageSummary(db: Db, organizationId: string, sinceIso: string): Promise<Row[]> {
  return query(db, "SELECT engine, operation, COUNT(*) AS calls, SUM(input_chars) AS input_chars, SUM(output_chars) AS output_chars, AVG(latency_ms) AS avg_latency FROM ai_usage WHERE organization_id = ? AND created_at >= ? GROUP BY engine, operation", [organizationId, sinceIso]);
}

/* ---------- FX ---------- */

export async function saveFxSnapshot(db: Db, organizationId: string | null, fx: FxSnapshot): Promise<string> {
  const id = newId();
  await execute(db, "INSERT INTO exchange_rates (id,organization_id,base_currency,rates_json,source,as_of,created_at) VALUES (?,?,?,?,?,?,?)", [id, organizationId, fx.pivot, toJson(fx.rates), fx.source, fx.asOf, nowIso()]);
  return id;
}
/** Latest organisation-specific snapshot, else the platform-wide one, else null. */
export async function latestFxSnapshot(db: Db, organizationId: string): Promise<FxSnapshot | null> {
  const r = await queryOne(db, "SELECT * FROM exchange_rates WHERE organization_id = ? OR organization_id IS NULL ORDER BY (organization_id IS NULL) ASC, as_of DESC, created_at DESC LIMIT 1", [organizationId]);
  if (!r) return null;
  return { pivot: str(r.base_currency), rates: parseJson(r.rates_json, {}), asOf: str(r.as_of), source: str(r.source) };
}

/* ---------- route cache ---------- */
export async function getCachedRoute(db: Db, key: string): Promise<{ distanceKm: number | null; durationMinutes: number | null } | null> {
  const r = await queryOne(db, "SELECT * FROM route_cache WHERE cache_key = ? AND expires_at > ?", [key, nowIso()]);
  return r ? { distanceKm: r.distance_km == null ? null : num(r.distance_km), durationMinutes: r.duration_minutes == null ? null : num(r.duration_minutes) } : null;
}
export async function putCachedRoute(db: Db, key: string, provider: string, distanceKm: number | null, durationMinutes: number | null, ttlHours: number): Promise<void> {
  const ts = nowIso();
  await execute(db, `INSERT INTO route_cache (cache_key,provider,distance_km,duration_minutes,fetched_at,expires_at) VALUES (?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET distance_km=excluded.distance_km, duration_minutes=excluded.duration_minutes, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at`, [key, provider, distanceKm, durationMinutes, ts, new Date(clock().getTime() + ttlHours * 3_600_000).toISOString()]);
}
