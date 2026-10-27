import {
  batch,
  execute,
  escapeLike,
  newId,
  nowIso,
  num,
  paginate,
  parseJson,
  query,
  queryOne,
  stmt,
  str,
  strOrNull,
  toJson,
  type Db,
  type Page,
  type Row,
} from "../db";

/* ======================= platform settings ======================= */

export interface PlatformSettings {
  signupsEnabled: boolean;
  maintenanceMode: boolean;
  supportEmail: string;
  defaultSeatLimit: number;
  defaultOptimisationLimit: number;
  announcementBannerEnabled: boolean;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  signupsEnabled: true,
  maintenanceMode: false,
  supportEmail: "",
  defaultSeatLimit: 5,
  defaultOptimisationLimit: 200,
  announcementBannerEnabled: true,
};

const SETTINGS_KEY = "platform";

export async function getPlatformSettings(db: Db): Promise<PlatformSettings> {
  const row = await queryOne<{ value_json: string }>(db, "SELECT value_json FROM platform_settings WHERE key = ?", [SETTINGS_KEY]);
  const stored = row ? parseJson<Partial<PlatformSettings>>(row.value_json, {}) : {};
  return { ...DEFAULT_PLATFORM_SETTINGS, ...stored };
}

export async function setPlatformSettings(db: Db, patch: Partial<PlatformSettings>, userId: string, now = nowIso()): Promise<PlatformSettings> {
  const next = { ...(await getPlatformSettings(db)), ...patch };
  await execute(
    db,
    `INSERT INTO platform_settings (key,value_json,updated_by,updated_at) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [SETTINGS_KEY, toJson(next), userId, now],
  );
  return next;
}

/* ======================= announcements ======================= */

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  tone: "info" | "success" | "warning" | "danger";
  status: "draft" | "active" | "archived";
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

const mapAnnouncement = (r: Row): AnnouncementRow => ({
  id: str(r.id),
  title: str(r.title),
  body: str(r.body),
  tone: (str(r.tone) || "info") as AnnouncementRow["tone"],
  status: (str(r.status) || "draft") as AnnouncementRow["status"],
  startsAt: strOrNull(r.starts_at),
  endsAt: strOrNull(r.ends_at),
  createdBy: strOrNull(r.created_by),
  createdByName: strOrNull(r.created_by_name),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listAnnouncements(db: Db, opts: { status?: string; page: number; pageSize: number }): Promise<Page<AnnouncementRow>> {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.status) (where.push("a.status = ?"), params.push(opts.status));
  return paginate(db, {
    select: "a.*, u.display_name AS created_by_name",
    from: "platform_announcements a LEFT JOIN users u ON u.id = a.created_by",
    where: where.join(" AND "),
    params,
    orderBy: "a.created_at DESC, a.id DESC",
    page: opts.page,
    pageSize: opts.pageSize,
    map: mapAnnouncement,
  });
}

export async function getAnnouncement(db: Db, id: string): Promise<AnnouncementRow | null> {
  const r = await queryOne(db, "SELECT a.*, u.display_name AS created_by_name FROM platform_announcements a LEFT JOIN users u ON u.id = a.created_by WHERE a.id = ?", [id]);
  return r ? mapAnnouncement(r) : null;
}

/** The single most recent live announcement, respecting its publication window. */
export async function getActiveAnnouncement(db: Db, now = nowIso()): Promise<AnnouncementRow | null> {
  const r = await queryOne(
    db,
    `SELECT a.*, u.display_name AS created_by_name FROM platform_announcements a LEFT JOIN users u ON u.id = a.created_by
      WHERE a.status = 'active' AND (a.starts_at IS NULL OR a.starts_at <= ?) AND (a.ends_at IS NULL OR a.ends_at > ?)
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1`,
    [now, now],
  );
  return r ? mapAnnouncement(r) : null;
}

export async function createAnnouncement(
  db: Db,
  a: { title: string; body: string; tone: AnnouncementRow["tone"]; status: AnnouncementRow["status"]; startsAt: string | null; endsAt: string | null; createdBy: string },
): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(
    db,
    "INSERT INTO platform_announcements (id,title,body,tone,status,starts_at,ends_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id, a.title, a.body, a.tone, a.status, a.startsAt, a.endsAt, a.createdBy, ts, ts],
  );
  return id;
}

export async function updateAnnouncement(
  db: Db,
  id: string,
  patch: { title?: string; body?: string; tone?: AnnouncementRow["tone"]; status?: AnnouncementRow["status"]; startsAt?: string | null; endsAt?: string | null },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.title !== undefined) (sets.push("title = ?"), params.push(patch.title));
  if (patch.body !== undefined) (sets.push("body = ?"), params.push(patch.body));
  if (patch.tone !== undefined) (sets.push("tone = ?"), params.push(patch.tone));
  if (patch.status !== undefined) (sets.push("status = ?"), params.push(patch.status));
  if (patch.startsAt !== undefined) (sets.push("starts_at = ?"), params.push(patch.startsAt));
  if (patch.endsAt !== undefined) (sets.push("ends_at = ?"), params.push(patch.endsAt));
  if (sets.length === 0) return false;
  return (await execute(db, `UPDATE platform_announcements SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...params, nowIso(), id])) > 0;
}

export async function deleteAnnouncement(db: Db, id: string): Promise<boolean> {
  return (await execute(db, "DELETE FROM platform_announcements WHERE id = ?", [id])) > 0;
}

/* ======================= overview ======================= */

export interface OverviewTotals {
  organizations: number;
  activeOrganizations: number;
  pendingOrganizations: number;
  suspendedOrganizations: number;
  users: number;
  activeUsers: number;
  platformAdmins: number;
  trips: number;
  quotes: number;
  properties: number;
  customers: number;
  jobs: number;
  pendingEmails: number;
  failedEmails: number;
  documents: number;
  announcements: number;
  activeGrants: number;
}

export async function overviewTotals(db: Db, now = nowIso()): Promise<OverviewTotals> {
  const r = await queryOne<Record<string, unknown>>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM organizations) AS organizations,
       (SELECT COUNT(*) FROM organizations WHERE status = 'active') AS active_organizations,
       (SELECT COUNT(*) FROM organizations WHERE status = 'pending') AS pending_organizations,
       (SELECT COUNT(*) FROM organizations WHERE status = 'suspended') AS suspended_organizations,
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM users WHERE status = 'active') AS active_users,
       (SELECT COUNT(*) FROM users WHERE platform_role = 'platform_admin') AS platform_admins,
       (SELECT COUNT(*) FROM trip_requests) AS trips,
       (SELECT COUNT(*) FROM quotes) AS quotes,
       (SELECT COUNT(*) FROM properties) AS properties,
       (SELECT COUNT(*) FROM customers) AS customers,
       (SELECT COUNT(*) FROM optimisation_jobs) AS jobs,
       (SELECT COUNT(*) FROM email_outbox WHERE status = 'pending') AS pending_emails,
       (SELECT COUNT(*) FROM email_outbox WHERE status = 'failed') AS failed_emails,
       (SELECT COUNT(*) FROM documents) AS documents,
       (SELECT COUNT(*) FROM platform_announcements WHERE status = 'active') AS announcements,
       (SELECT COUNT(*) FROM platform_access_grants WHERE revoked_at IS NULL AND expires_at > ?) AS active_grants`,
    [now],
  );
  return {
    organizations: num(r?.organizations),
    activeOrganizations: num(r?.active_organizations),
    pendingOrganizations: num(r?.pending_organizations),
    suspendedOrganizations: num(r?.suspended_organizations),
    users: num(r?.users),
    activeUsers: num(r?.active_users),
    platformAdmins: num(r?.platform_admins),
    trips: num(r?.trips),
    quotes: num(r?.quotes),
    properties: num(r?.properties),
    customers: num(r?.customers),
    jobs: num(r?.jobs),
    pendingEmails: num(r?.pending_emails),
    failedEmails: num(r?.failed_emails),
    documents: num(r?.documents),
    announcements: num(r?.announcements),
    activeGrants: num(r?.active_grants),
  };
}

export async function growthSince(db: Db, sinceIso: string): Promise<{ organizations: number; users: number; trips: number; quotes: number; jobs: number }> {
  const r = await queryOne<Record<string, unknown>>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM organizations WHERE created_at >= ?) AS organizations,
       (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS users,
       (SELECT COUNT(*) FROM trip_requests WHERE created_at >= ?) AS trips,
       (SELECT COUNT(*) FROM quotes WHERE created_at >= ?) AS quotes,
       (SELECT COUNT(*) FROM optimisation_jobs WHERE created_at >= ?) AS jobs`,
    [sinceIso, sinceIso, sinceIso, sinceIso, sinceIso],
  );
  return { organizations: num(r?.organizations), users: num(r?.users), trips: num(r?.trips), quotes: num(r?.quotes), jobs: num(r?.jobs) };
}

export interface ActivityPoint {
  date: string;
  organizations: number;
  users: number;
  trips: number;
  quotes: number;
  jobs: number;
  auditEvents: number;
}

/** Daily counts for the dashboard chart, including zero days. */
export async function activitySeries(db: Db, days = 14, now = new Date()): Promise<ActivityPoint[]> {
  const start = new Date(now.getTime() - (days - 1) * 86_400_000);
  const startDay = start.toISOString().slice(0, 10);
  const sinceIso = `${startDay}T00:00:00.000Z`;
  const tables = ["organizations", "users", "trip_requests", "quotes", "optimisation_jobs", "audit_events"] as const;
  const series = new Map<string, ActivityPoint>();
  for (let i = 0; i < days; i++) {
    const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    series.set(date, { date, organizations: 0, users: 0, trips: 0, quotes: 0, jobs: 0, auditEvents: 0 });
  }
  const keys: Record<(typeof tables)[number], keyof Omit<ActivityPoint, "date">> = {
    organizations: "organizations",
    users: "users",
    trip_requests: "trips",
    quotes: "quotes",
    optimisation_jobs: "jobs",
    audit_events: "auditEvents",
  };
  for (const table of tables) {
    const rows = await query<{ d: string; n: number }>(db, `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM ${table} WHERE created_at >= ? GROUP BY d`, [sinceIso]);
    for (const row of rows) {
      const point = series.get(str(row.d));
      if (point) point[keys[table]] = num(row.n);
    }
  }
  return [...series.values()];
}

export async function jobsByStatus(db: Db): Promise<{ status: string; n: number }[]> {
  return (await query<{ status: string; n: number }>(db, "SELECT status, COUNT(*) AS n FROM optimisation_jobs GROUP BY status ORDER BY status")).map((r) => ({ status: str(r.status), n: num(r.n) }));
}

export async function quotesByStatus(db: Db): Promise<{ status: string; n: number }[]> {
  return (await query<{ status: string; n: number }>(db, "SELECT status, COUNT(*) AS n FROM quotes GROUP BY status ORDER BY status")).map((r) => ({ status: str(r.status), n: num(r.n) }));
}

export async function organizationsByTypeStatus(db: Db): Promise<{ type: string; status: string; n: number }[]> {
  return (await query<{ type: string; status: string; n: number }>(db, "SELECT organization_type AS type, status, COUNT(*) AS n FROM organizations GROUP BY organization_type, status ORDER BY organization_type, status")).map((r) => ({
    type: str(r.type),
    status: str(r.status),
    n: num(r.n),
  }));
}

export async function jobsNeedingAttentionPlatform(db: Db, sinceIso: string, limit = 8): Promise<AdminJobRow[]> {
  return (await listJobs(db, { status: undefined, page: 1, pageSize: limit, attentionSince: sinceIso })).items;
}

export async function countJobsNeedingAttention(db: Db, sinceIso: string): Promise<number> {
  const r = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM optimisation_jobs WHERE status IN ('failed','infeasible') AND created_at >= ?", [sinceIso]);
  return num(r?.n);
}

/* ======================= organizations ======================= */

export interface AdminOrganizationRow {
  id: string;
  name: string;
  slug: string;
  organizationType: string;
  status: string;
  defaultCurrency: string;
  timezone: string;
  country: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  tripCount: number;
  quoteCount: number;
  propertyCount: number;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
}

const mapOrgRow = (r: Row): AdminOrganizationRow => ({
  id: str(r.id),
  name: str(r.name),
  slug: str(r.slug),
  organizationType: str(r.organization_type),
  status: str(r.status),
  defaultCurrency: str(r.default_currency),
  timezone: str(r.timezone),
  country: str(r.country),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
  memberCount: num(r.member_count),
  tripCount: num(r.trip_count),
  quoteCount: num(r.quote_count),
  propertyCount: num(r.property_count),
  subscriptionPlan: strOrNull(r.subscription_plan),
  subscriptionStatus: strOrNull(r.subscription_status),
});

export async function listOrganizations(
  db: Db,
  opts: { q?: string; status?: string; type?: string; page: number; pageSize: number },
): Promise<Page<AdminOrganizationRow>> {  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.q) (where.push("(o.name LIKE ? ESCAPE '\\' OR o.slug LIKE ? ESCAPE '\\')"), params.push(`%${escapeLike(opts.q)}%`, `%${escapeLike(opts.q)}%`));
  if (opts.status) (where.push("o.status = ?"), params.push(opts.status));
  if (opts.type) (where.push("o.organization_type = ?"), params.push(opts.type));
  return paginate(db, {
    select: `o.*,
      (SELECT COUNT(*) FROM organization_memberships m WHERE m.organization_id = o.id AND m.status = 'active') AS member_count,
      (SELECT COUNT(*) FROM trip_requests t WHERE t.organization_id = o.id) AS trip_count,
      (SELECT COUNT(*) FROM quotes q WHERE q.organization_id = o.id) AS quote_count,
      (SELECT COUNT(*) FROM properties p WHERE p.owner_organization_id = o.id) AS property_count,
      s.plan AS subscription_plan, s.status AS subscription_status`,
    from: "organizations o LEFT JOIN subscriptions s ON s.organization_id = o.id",
    where: where.join(" AND "),
    params,
    orderBy: "o.created_at DESC, o.id DESC",
    page: opts.page,
    pageSize: opts.pageSize,
    map: mapOrgRow,
  });
}

export async function createOrganizationWithOwnerUserId(
  db: Db,
  input: { name: string; slug: string; type: string; country: string; currency: string; timezone: string; ownerUserId: string; seatLimit: number; monthlyOptimisationLimit: number },
): Promise<string> {
  const ts = nowIso();
  const orgId = newId();
  await batch(db, [
    stmt(db, `INSERT INTO organizations (id,name,slug,organization_type,status,default_currency,timezone,country,created_at,updated_at) VALUES (?,?,?,?, 'active',?,?,?,?,?)`, [orgId, input.name, input.slug, input.type, input.currency, input.timezone, input.country, ts, ts]),
    stmt(db, `INSERT INTO organization_memberships (id,organization_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,'owner','active',?,?)`, [newId(), orgId, input.ownerUserId, ts, ts]),
    stmt(db, `INSERT INTO subscriptions (id,organization_id,plan,status,seat_limit,monthly_optimisation_limit,created_at,updated_at) VALUES (?,?,'trial','active',?,?,?,?)`, [newId(), orgId, input.seatLimit, input.monthlyOptimisationLimit, ts, ts]),
  ]);
  return orgId;
}

export async function updateOrganizationProfile(  db: Db,
  id: string,
  patch: { name?: string; slug?: string; organizationType?: string; defaultCurrency?: string; timezone?: string; country?: string },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) (sets.push("name = ?"), params.push(patch.name));
  if (patch.slug !== undefined) (sets.push("slug = ?"), params.push(patch.slug));
  if (patch.organizationType !== undefined) (sets.push("organization_type = ?"), params.push(patch.organizationType));
  if (patch.defaultCurrency !== undefined) (sets.push("default_currency = ?"), params.push(patch.defaultCurrency));
  if (patch.timezone !== undefined) (sets.push("timezone = ?"), params.push(patch.timezone));
  if (patch.country !== undefined) (sets.push("country = ?"), params.push(patch.country));
  if (sets.length === 0) return false;
  return (await execute(db, `UPDATE organizations SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...params, nowIso(), id])) > 0;
}

export async function setSubscription(
  db: Db,
  organizationId: string,
  p: { plan?: string; status?: string; seatLimit?: number; monthlyOptimisationLimit?: number },
): Promise<void> {
  const existing = await queryOne<{ id: string }>(db, "SELECT id FROM subscriptions WHERE organization_id = ?", [organizationId]);
  if (!existing) {
    await execute(
      db,
      "INSERT INTO subscriptions (id,organization_id,plan,status,seat_limit,monthly_optimisation_limit,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
      [newId(), organizationId, p.plan ?? "trial", p.status ?? "active", p.seatLimit ?? 5, p.monthlyOptimisationLimit ?? 200, nowIso(), nowIso()],
    );
    return;
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  if (p.plan !== undefined) (sets.push("plan = ?"), params.push(p.plan));
  if (p.status !== undefined) (sets.push("status = ?"), params.push(p.status));
  if (p.seatLimit !== undefined) (sets.push("seat_limit = ?"), params.push(p.seatLimit));
  if (p.monthlyOptimisationLimit !== undefined) (sets.push("monthly_optimisation_limit = ?"), params.push(p.monthlyOptimisationLimit));
  if (sets.length === 0) return;
  await execute(db, `UPDATE subscriptions SET ${sets.join(", ")}, updated_at = ? WHERE organization_id = ?`, [...params, nowIso(), organizationId]);
}

export interface OrganizationUsage {  trips: number;
  quotes: number;
  properties: number;
  customers: number;
  jobs: number;
  members: number;
  documents: number;
  storageBytes: number;
  pendingEmails: number;
  failedEmails: number;
  notifications: number;
  lastActivityAt: string | null;
}

export async function organizationUsage(db: Db, organizationId: string): Promise<OrganizationUsage> {
  const r = await queryOne<Record<string, unknown>>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM trip_requests WHERE organization_id = ?1) AS trips,
       (SELECT COUNT(*) FROM quotes WHERE organization_id = ?1) AS quotes,
       (SELECT COUNT(*) FROM properties WHERE owner_organization_id = ?1) AS properties,
       (SELECT COUNT(*) FROM customers WHERE organization_id = ?1) AS customers,
       (SELECT COUNT(*) FROM optimisation_jobs WHERE organization_id = ?1) AS jobs,
       (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = ?1 AND status = 'active') AS members,
       (SELECT COUNT(*) FROM documents WHERE organization_id = ?1) AS documents,
       (SELECT COALESCE(SUM(size_bytes), 0) FROM documents WHERE organization_id = ?1) AS storage_bytes,
       (SELECT COUNT(*) FROM email_outbox WHERE organization_id = ?1 AND status = 'pending') AS pending_emails,
       (SELECT COUNT(*) FROM email_outbox WHERE organization_id = ?1 AND status = 'failed') AS failed_emails,
       (SELECT COUNT(*) FROM notifications WHERE organization_id = ?1) AS notifications,
       (SELECT MAX(created_at) FROM audit_events WHERE organization_id = ?1) AS last_activity_at`,
    [organizationId],
  );
  return {
    trips: num(r?.trips),
    quotes: num(r?.quotes),
    properties: num(r?.properties),
    customers: num(r?.customers),
    jobs: num(r?.jobs),
    members: num(r?.members),
    documents: num(r?.documents),
    storageBytes: num(r?.storage_bytes),
    pendingEmails: num(r?.pending_emails),
    failedEmails: num(r?.failed_emails),
    notifications: num(r?.notifications),
    lastActivityAt: strOrNull(r?.last_activity_at),
  };
}

export interface AdminMemberRow {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  userStatus: string;
  platformRole: string | null;
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
  lastSeenAt: string | null;
}

export async function listMembers(db: Db, organizationId: string): Promise<AdminMemberRow[]> {
  const rows = await query(
    db,
    `SELECT m.*, u.email, u.display_name, u.status AS user_status, u.platform_role, u.email_verified_at,
       EXISTS(SELECT 1 FROM user_mfa f WHERE f.user_id = u.id AND f.enabled_at IS NOT NULL) AS mfa_enabled,
       (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at
       FROM organization_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ? AND m.status != 'removed'
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.display_name`,
    [organizationId],
  );
  return rows.map((r) => ({
    id: str(r.id),
    userId: str(r.user_id),
    email: str(r.email),
    displayName: str(r.display_name),
    role: str(r.role),
    status: str(r.status),
    createdAt: str(r.created_at),
    userStatus: str(r.user_status),
    platformRole: strOrNull(r.platform_role),
    emailVerifiedAt: strOrNull(r.email_verified_at),
    mfaEnabled: num(r.mfa_enabled) === 1,
    lastSeenAt: strOrNull(r.last_seen_at),
  }));
}

/** Active owner count, used to protect the last owner of an organisation. */
export async function countActiveOwners(db: Db, organizationId: string): Promise<number> {
  const r = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM organization_memberships WHERE organization_id = ? AND role = 'owner' AND status = 'active'", [organizationId]);
  return num(r?.n);
}

export async function addMembership(db: Db, organizationId: string, userId: string, role: string): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(db, "INSERT INTO organization_memberships (id,organization_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,?, 'active',?,?)", [id, organizationId, userId, role, ts, ts]);
  return id;
}

export async function updateMembership(
  db: Db,
  organizationId: string,
  membershipId: string,
  patch: { role?: string; status?: string },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.role !== undefined) (sets.push("role = ?"), params.push(patch.role));
  if (patch.status !== undefined) (sets.push("status = ?"), params.push(patch.status));
  if (sets.length === 0) return false;
  return (await execute(db, `UPDATE organization_memberships SET ${sets.join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ?`, [...params, nowIso(), membershipId, organizationId])) > 0;
}

export async function getMembership(db: Db, organizationId: string, membershipId: string): Promise<AdminMemberRow | null> {
  return (await listMembers(db, organizationId)).find((m) => m.id === membershipId) ?? null;
}

export interface AdminJobRow {
  id: string;
  organizationId: string;
  organizationName: string;
  tripRequestId: string;
  tripTitle: string | null;
  status: string;
  progress: number;
  stage: string | null;
  attempt: number;
  errorCode: string | null;
  errorSummary: string | null;
  algorithmVersion: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdByName: string | null;
}

const mapJobRow = (r: Row): AdminJobRow => ({
  id: str(r.id),
  organizationId: str(r.organization_id),
  organizationName: str(r.organization_name),
  tripRequestId: str(r.trip_request_id),
  tripTitle: strOrNull(r.trip_title),
  status: str(r.status),
  progress: num(r.progress),
  stage: strOrNull(r.stage),
  attempt: num(r.attempt),
  errorCode: strOrNull(r.error_code),
  errorSummary: strOrNull(r.error_summary),
  algorithmVersion: str(r.algorithm_version),
  createdAt: str(r.created_at),
  startedAt: strOrNull(r.started_at),
  completedAt: strOrNull(r.completed_at),
  createdByName: strOrNull(r.created_by_name),
});

/** Operational job listing. `attentionSince` limits to failed/infeasible jobs (dashboard callout). */
export async function listJobs(
  db: Db,
  opts: { status?: string; organizationId?: string; q?: string; attentionSince?: string; page: number; pageSize: number },
): Promise<Page<AdminJobRow>> {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.status) (where.push("j.status = ?"), params.push(opts.status));
  if (opts.organizationId) (where.push("j.organization_id = ?"), params.push(opts.organizationId));
  if (opts.attentionSince) (where.push("j.status IN ('failed','infeasible') AND j.created_at >= ?"), params.push(opts.attentionSince));
  if (opts.q) {
    where.push("(j.id LIKE ? ESCAPE '\\' OR t.title LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')");
    const like = `%${escapeLike(opts.q)}%`;
    params.push(like, like, like);
  }
  return paginate(db, {
    select: "j.*, o.name AS organization_name, t.title AS trip_title, u.display_name AS created_by_name",
    from: `optimisation_jobs j
      JOIN organizations o ON o.id = j.organization_id
      LEFT JOIN trip_requests t ON t.id = j.trip_request_id
      LEFT JOIN users u ON u.id = j.created_by`,
    where: where.join(" AND "),
    params,
    orderBy: "j.created_at DESC, j.id DESC",
    page: opts.page,
    pageSize: opts.pageSize,
    map: mapJobRow,
  });
}

export interface AdminJobDetail extends AdminJobRow {
  itineraryId: string;
  request: Record<string, unknown>;
  constraints: Record<string, unknown>;
  scoring: Record<string, unknown>;
  resultSummary: Record<string, unknown> | null;
  fx: unknown;
  candidateCount: number;
  manuallyModifiedCount: number;
  organizationStatus: string;
  organizationSlug: string;
}

export async function getJobDetail(db: Db, id: string): Promise<AdminJobDetail | null> {
  const r = await queryOne(
    db,
    `SELECT j.*, o.name AS organization_name, o.status AS organization_status, o.slug AS organization_slug,
       t.title AS trip_title, u.display_name AS created_by_name,
       (SELECT COUNT(*) FROM candidate_combinations c WHERE c.optimisation_job_id = j.id) AS candidate_count,
       (SELECT COUNT(*) FROM candidate_combinations c WHERE c.optimisation_job_id = j.id AND c.manually_modified = 1) AS modified_count
       FROM optimisation_jobs j JOIN organizations o ON o.id = j.organization_id
       LEFT JOIN trip_requests t ON t.id = j.trip_request_id
       LEFT JOIN users u ON u.id = j.created_by
      WHERE j.id = ?`,
    [id],
  );
  if (!r) return null;
  return {
    ...mapJobRow(r),
    itineraryId: str(r.itinerary_id),
    request: parseJson(r.request_json, {}),
    constraints: parseJson(r.constraints_snapshot_json, {}),
    scoring: parseJson(r.scoring_configuration_json, {}),
    resultSummary: parseJson(r.result_summary_json, null),
    fx: parseJson(r.fx_snapshot_json, null),
    candidateCount: num(r.candidate_count),
    manuallyModifiedCount: num(r.modified_count),
    organizationStatus: str(r.organization_status),
    organizationSlug: str(r.organization_slug),
  };
}

export async function cancelJob(db: Db, id: string): Promise<boolean> {
  return (await execute(db, "UPDATE optimisation_jobs SET status = 'cancelled', progress = 0, stage = 'cancelled', completed_at = ? WHERE id = ? AND status IN ('queued','running')", [nowIso(), id])) > 0;
}

/** Copies a terminal job into a fresh queued job so the original history is preserved. */
export async function cloneJobForRetry(db: Db, id: string, createdBy: string): Promise<string | null> {
  const old = await getJobDetail(db, id);
  if (!old) return null;
  const newJobId = newId();
  const changed = await execute(
    db,
    `INSERT INTO optimisation_jobs (id,organization_id,trip_request_id,itinerary_id,status,algorithm_version,request_json,constraints_snapshot_json,scoring_configuration_json,fx_snapshot_json,created_by,created_at)
     SELECT ?, organization_id, trip_request_id, itinerary_id, 'queued', algorithm_version, request_json, constraints_snapshot_json, scoring_configuration_json, fx_snapshot_json, ?, ?
       FROM optimisation_jobs WHERE id = ?`,
    [newJobId, createdBy, nowIso(), id],
  );
  return changed > 0 ? newJobId : null;
}

export async function supportSummary(db: Db, organizationId: string): Promise<{
  trips: { id: string; title: string; status: string; arrivalDate: string | null; updatedAt: string }[];
  quotes: { id: string; quoteNumber: string; status: string; currency: string; currentVersion: number; updatedAt: string }[];
  jobs: AdminJobRow[];
  customers: { id: string; name: string; email: string | null; createdAt: string }[];
}> {
  const [trips, quotes, jobs, customers] = await Promise.all([
    query<Row>(db, "SELECT id, title, status, arrival_date, updated_at FROM trip_requests WHERE organization_id = ? ORDER BY updated_at DESC LIMIT 25", [organizationId]),
    query<Row>(db, "SELECT id, quote_number, status, currency, current_version, updated_at FROM quotes WHERE organization_id = ? ORDER BY updated_at DESC LIMIT 25", [organizationId]),
    listJobs(db, { organizationId, page: 1, pageSize: 25 }),
    query<Row>(db, "SELECT id, name, email, created_at FROM customers WHERE organization_id = ? ORDER BY created_at DESC LIMIT 25", [organizationId]),
  ]);
  return {
    trips: trips.map((r) => ({ id: str(r.id), title: str(r.title), status: str(r.status), arrivalDate: strOrNull(r.arrival_date), updatedAt: str(r.updated_at) })),
    quotes: quotes.map((r) => ({ id: str(r.id), quoteNumber: str(r.quote_number), status: str(r.status), currency: str(r.currency), currentVersion: num(r.current_version), updatedAt: str(r.updated_at) })),
    jobs: jobs.items,
    customers: customers.map((r) => ({ id: str(r.id), name: str(r.name), email: strOrNull(r.email), createdAt: str(r.created_at) })),
  };
}

/* ======================= users ======================= */

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  status: string;
  platformRole: string | null;
  emailVerifiedAt: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  mfaEnabled: boolean;
  lastSeenAt: string | null;
  membershipCount: number;
  organizations: string | null;
}

const mapUserRow = (r: Row): AdminUserRow => ({
  id: str(r.id),
  email: str(r.email),
  displayName: str(r.display_name),
  status: str(r.status),
  platformRole: strOrNull(r.platform_role),
  emailVerifiedAt: strOrNull(r.email_verified_at),
  failedLoginCount: num(r.failed_login_count),
  lockedUntil: strOrNull(r.locked_until),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
  mfaEnabled: num(r.mfa_enabled) === 1,
  lastSeenAt: strOrNull(r.last_seen_at),
  membershipCount: num(r.membership_count),
  organizations: strOrNull(r.organizations),
});

export async function listUsers(
  db: Db,
  opts: { q?: string; status?: string; platformAdmin?: boolean; organizationId?: string; page: number; pageSize: number },
): Promise<Page<AdminUserRow>> {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.q) (where.push("(u.email LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')"), params.push(`%${escapeLike(opts.q)}%`, `%${escapeLike(opts.q)}%`));
  if (opts.status) (where.push("u.status = ?"), params.push(opts.status));
  if (opts.platformAdmin !== undefined) where.push(opts.platformAdmin ? "u.platform_role = 'platform_admin'" : "u.platform_role IS NULL");
  if (opts.organizationId) (where.push("EXISTS (SELECT 1 FROM organization_memberships mx WHERE mx.user_id = u.id AND mx.organization_id = ?)"), params.push(opts.organizationId));
  return paginate(db, {
    select: `u.*,
      EXISTS(SELECT 1 FROM user_mfa f WHERE f.user_id = u.id AND f.enabled_at IS NOT NULL) AS mfa_enabled,
      (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at,
      (SELECT COUNT(*) FROM organization_memberships m WHERE m.user_id = u.id AND m.status != 'removed') AS membership_count,
      (SELECT GROUP_CONCAT(o.name, ', ') FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = u.id AND m.status != 'removed') AS organizations`,
    from: "users u",
    where: where.join(" AND "),
    params,
    orderBy: "u.created_at DESC, u.id DESC",
    page: opts.page,
    pageSize: opts.pageSize,
    map: mapUserRow,
  });
}

export interface AdminUserDetail extends AdminUserRow {
  recoveryCodesRemaining: number;
  activeSessions: number;
  userAgent: string | null;
  created: { trips: number; quotes: number; jobs: number };
}

export async function getUserDetail(db: Db, id: string): Promise<AdminUserDetail | null> {
  const r = await queryOne(
    db,
    `SELECT u.*,
      EXISTS(SELECT 1 FROM user_mfa f WHERE f.user_id = u.id AND f.enabled_at IS NOT NULL) AS mfa_enabled,
      (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at,
      (SELECT COUNT(*) FROM organization_memberships m WHERE m.user_id = u.id AND m.status != 'removed') AS membership_count,
      (SELECT GROUP_CONCAT(o.name, ', ') FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = u.id AND m.status != 'removed') AS organizations,
      (SELECT COUNT(*) FROM mfa_recovery_codes c WHERE c.user_id = u.id AND c.used_at IS NULL) AS recovery_codes,
      (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ?) AS active_sessions,
      (SELECT s.user_agent FROM sessions s WHERE s.user_id = u.id ORDER BY s.last_seen_at DESC LIMIT 1) AS user_agent,
      (SELECT COUNT(*) FROM trip_requests t WHERE t.created_by = u.id) AS created_trips,
      (SELECT COUNT(*) FROM quotes q WHERE q.created_by = u.id) AS created_quotes,
      (SELECT COUNT(*) FROM optimisation_jobs j WHERE j.created_by = u.id) AS created_jobs
      FROM users u WHERE u.id = ?`,
    [nowIso(), id],
  );
  if (!r) return null;
  return {
    ...mapUserRow(r),
    recoveryCodesRemaining: num(r.recovery_codes),
    activeSessions: num(r.active_sessions),
    userAgent: strOrNull(r.user_agent),
    created: { trips: num(r.created_trips), quotes: num(r.created_quotes), jobs: num(r.created_jobs) },
  };
}

export interface AdminUserMembership {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationType: string;
  organizationStatus: string;
  role: string;
  status: string;
  createdAt: string;
}

export async function listUserMemberships(db: Db, userId: string): Promise<AdminUserMembership[]> {
  const rows = await query(
    db,
    `SELECT m.*, o.name AS organization_name, o.slug AS organization_slug, o.organization_type, o.status AS organization_status
       FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = ? ORDER BY o.name`,
    [userId],
  );
  return rows.map((r) => ({
    id: str(r.id),
    organizationId: str(r.organization_id),
    organizationName: str(r.organization_name),
    organizationSlug: str(r.organization_slug),
    organizationType: str(r.organization_type),
    organizationStatus: str(r.organization_status),
    role: str(r.role),
    status: str(r.status),
    createdAt: str(r.created_at),
  }));
}

export interface AdminSession {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  userAgent: string | null;
  active: boolean;
}

export async function listUserSessions(db: Db, userId: string, limit = 20): Promise<AdminSession[]> {
  const rows = await query(
    db,
    `SELECT s.*, o.name AS organization_name FROM sessions s LEFT JOIN organizations o ON o.id = s.active_organization_id
      WHERE s.user_id = ? ORDER BY s.last_seen_at DESC LIMIT ?`,
    [userId, limit],
  );
  const now = nowIso();
  return rows.map((r) => ({
    id: str(r.id),
    organizationId: strOrNull(r.active_organization_id),
    organizationName: strOrNull(r.organization_name),
    createdAt: str(r.created_at),
    lastSeenAt: str(r.last_seen_at),
    expiresAt: str(r.expires_at),
    revokedAt: strOrNull(r.revoked_at),
    userAgent: strOrNull(r.user_agent),
    active: !r.revoked_at && str(r.expires_at) > now,
  }));
}

export async function listUserAudit(db: Db, userId: string, limit = 30): Promise<Row[]> {
  return query(
    db,
    `SELECT a.*, o.name AS organization_name FROM audit_events a LEFT JOIN organizations o ON o.id = a.organization_id
      WHERE a.actor_user_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
    [userId, limit],
  );
}

export async function updateUser(
  db: Db,
  id: string,
  patch: { displayName?: string; email?: string; status?: string; platformRole?: string | null; emailVerified?: boolean },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.displayName !== undefined) (sets.push("display_name = ?"), params.push(patch.displayName));
  if (patch.email !== undefined) (sets.push("email = ?"), params.push(patch.email.toLowerCase()));
  if (patch.status !== undefined) (sets.push("status = ?"), params.push(patch.status));
  if (patch.platformRole !== undefined) (sets.push("platform_role = ?"), params.push(patch.platformRole));
  if (patch.emailVerified !== undefined) (sets.push("email_verified_at = ?"), params.push(patch.emailVerified ? nowIso() : null));
  if (sets.length === 0) return false;
  return (await execute(db, `UPDATE users SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...params, nowIso(), id])) > 0;
}

export async function unlockUser(db: Db, id: string): Promise<boolean> {
  return (await execute(db, "UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?", [nowIso(), id])) > 0;
}

export async function deleteUser(db: Db, id: string): Promise<boolean> {
  return (await execute(db, "DELETE FROM users WHERE id = ?", [id])) > 0;
}

export async function countPlatformAdmins(db: Db): Promise<number> {
  const r = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM users WHERE platform_role = 'platform_admin' AND status = 'active'");
  return num(r?.n);
}

export interface UserReferenceCounts {
  trips: number;
  quotes: number;
  jobs: number;
  documents: number;
  grants: number;
}

/** Records that would break foreign keys if the user row were deleted. */
export async function userReferenceCounts(db: Db, userId: string): Promise<UserReferenceCounts> {
  const r = await queryOne<Record<string, unknown>>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM trip_requests WHERE created_by = ?1) AS trips,
       (SELECT COUNT(*) FROM quotes WHERE created_by = ?1) AS quotes,
       (SELECT COUNT(*) FROM optimisation_jobs WHERE created_by = ?1) AS jobs,
       (SELECT COUNT(*) FROM documents WHERE created_by = ?1) AS documents,
       (SELECT COUNT(*) FROM platform_access_grants WHERE platform_user_id = ?1) AS grants`,
    [userId],
  );
  return { trips: num(r?.trips), quotes: num(r?.quotes), jobs: num(r?.jobs), documents: num(r?.documents), grants: num(r?.grants) };
}

export async function soleOwnedOrganizations(db: Db, userId: string): Promise<{ id: string; name: string }[]> {  const rows = await query(
    db,
    `SELECT o.id, o.name FROM organizations o
      WHERE EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = o.id AND m.user_id = ? AND m.role = 'owner' AND m.status = 'active')
        AND (SELECT COUNT(*) FROM organization_memberships m2 WHERE m2.organization_id = o.id AND m2.role = 'owner' AND m2.status = 'active') <= 1`,
    [userId],
  );
  return rows.map((r) => ({ id: str(r.id), name: str(r.name) }));
}

export async function listPlatformAdmins(db: Db): Promise<{ id: string; email: string; displayName: string; status: string; lastSeenAt: string | null }[]> {
  const rows = await query(
    db,
    `SELECT u.id, u.email, u.display_name, u.status, (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at
       FROM users u WHERE u.platform_role = 'platform_admin' ORDER BY u.display_name`,
  );
  return rows.map((r) => ({ id: str(r.id), email: str(r.email), displayName: str(r.display_name), status: str(r.status), lastSeenAt: strOrNull(r.last_seen_at) }));
}

/* ======================= audit ======================= */

export interface AdminAuditRow {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  metadataRestricted?: boolean;
  requestId: string | null;
  createdAt: string;
}

const mapAudit = (r: Row): AdminAuditRow => ({
  id: str(r.id),
  organizationId: strOrNull(r.organization_id),
  organizationName: strOrNull(r.organization_name),
  actorUserId: strOrNull(r.actor_user_id),
  actorName: strOrNull(r.actor_name),
  actorEmail: strOrNull(r.actor_email),
  action: str(r.action),
  resourceType: str(r.resource_type),
  resourceId: strOrNull(r.resource_id),
  metadata: parseJson(r.safe_metadata_json, {}),
  requestId: strOrNull(r.request_id),
  createdAt: str(r.created_at),
});

export async function listAudit(
  db: Db,
  opts: { q?: string; action?: string; resourceType?: string; organizationId?: string; actorUserId?: string; from?: string; to?: string; page: number; pageSize: number },
): Promise<Page<AdminAuditRow>> {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.q) (where.push("(a.action LIKE ? ESCAPE '\\' OR a.resource_type LIKE ? ESCAPE '\\' OR a.resource_id LIKE ? ESCAPE '\\')"), params.push(`%${escapeLike(opts.q)}%`, `%${escapeLike(opts.q)}%`, `%${escapeLike(opts.q)}%`));
  if (opts.action) (where.push("a.action LIKE ? ESCAPE '\\'"), params.push(`${escapeLike(opts.action)}%`));
  if (opts.resourceType) (where.push("a.resource_type = ?"), params.push(opts.resourceType));
  if (opts.organizationId) (where.push("a.organization_id = ?"), params.push(opts.organizationId));
  if (opts.actorUserId) (where.push("a.actor_user_id = ?"), params.push(opts.actorUserId));
  if (opts.from) (where.push("a.created_at >= ?"), params.push(`${opts.from}T00:00:00.000Z`));
  if (opts.to) (where.push("a.created_at <= ?"), params.push(`${opts.to}T23:59:59.999Z`));
  return paginate(db, {
    select: "a.*, o.name AS organization_name, u.display_name AS actor_name, u.email AS actor_email",
    from: "audit_events a LEFT JOIN organizations o ON o.id = a.organization_id LEFT JOIN users u ON u.id = a.actor_user_id",
    where: where.join(" AND "),
    params,
    orderBy: "a.created_at DESC, a.id DESC",
    page: opts.page,
    pageSize: opts.pageSize,
    map: mapAudit,
  });
}

export async function auditFacets(db: Db): Promise<{ actions: string[]; resourceTypes: string[]; organizations: { id: string; name: string }[] }> {
  const [actions, types, orgs] = await Promise.all([
    query<{ action: string }>(db, "SELECT DISTINCT action FROM audit_events ORDER BY action LIMIT 100"),
    query<{ resource_type: string }>(db, "SELECT DISTINCT resource_type FROM audit_events ORDER BY resource_type LIMIT 100"),
    query<{ id: string; name: string }>(db, "SELECT id, name FROM organizations ORDER BY name LIMIT 500"),
  ]);
  return { actions: actions.map((r) => str(r.action)), resourceTypes: types.map((r) => str(r.resource_type)), organizations: orgs.map((r) => ({ id: str(r.id), name: str(r.name) })) };
}

/** Organisations where this platform admin currently holds an unexpired, unrevoked support grant. */
export async function activeGrantOrganizationIds(db: Db, platformUserId: string, now = nowIso()): Promise<string[]> {
  const rows = await query<{ organization_id: string }>(db, "SELECT organization_id FROM platform_access_grants WHERE platform_user_id = ? AND revoked_at IS NULL AND expires_at > ?", [platformUserId, now]);
  return rows.map((r) => str(r.organization_id));
}

/* ======================= email outbox ======================= */

export interface AdminEmailRow {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  toEmail: string;
  subject: string;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

const mapEmail = (r: Row): AdminEmailRow => ({
  id: str(r.id),
  organizationId: strOrNull(r.organization_id),
  organizationName: strOrNull(r.organization_name),
  toEmail: str(r.to_email),
  subject: str(r.subject),
  status: str(r.status),
  providerMessageId: strOrNull(r.provider_message_id),
  error: strOrNull(r.error),
  createdAt: str(r.created_at),
  sentAt: strOrNull(r.sent_at),
});

export async function listEmails(
  db: Db,
  opts: { status?: string; q?: string; organizationId?: string; page: number; pageSize: number },
): Promise<Page<AdminEmailRow>> {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.status) (where.push("e.status = ?"), params.push(opts.status));
  if (opts.organizationId) (where.push("e.organization_id = ?"), params.push(opts.organizationId));
  if (opts.q) (where.push("(e.to_email LIKE ? ESCAPE '\\' OR e.subject LIKE ? ESCAPE '\\')"), params.push(`%${escapeLike(opts.q)}%`, `%${escapeLike(opts.q)}%`));
  return paginate(db, {
    select: "e.*, o.name AS organization_name",
    from: "email_outbox e LEFT JOIN organizations o ON o.id = e.organization_id",
    where: where.join(" AND "),
    params,
    orderBy: "e.created_at DESC, e.id DESC",
    page: opts.page,
    pageSize: opts.pageSize,
    map: mapEmail,
  });
}

export async function getEmail(db: Db, id: string): Promise<(AdminEmailRow & { bodyText: string }) | null> {
  const r = await queryOne(db, "SELECT e.*, o.name AS organization_name FROM email_outbox e LEFT JOIN organizations o ON o.id = e.organization_id WHERE e.id = ?", [id]);
  if (!r) return null;
  return { ...mapEmail(r), bodyText: str(r.body_text) };
}

export async function emailStats(db: Db): Promise<{ pending: number; sent: number; failed: number }> {
  const rows = await query<{ status: string; n: number }>(db, "SELECT status, COUNT(*) AS n FROM email_outbox GROUP BY status");
  const out = { pending: 0, sent: 0, failed: 0 };
  for (const r of rows) if (r.status in out) out[r.status as keyof typeof out] = num(r.n);
  return out;
}

/* ======================= telemetry ======================= */

export interface ProviderDailyUsage {
  date: string;
  providerKey: string;
  calls: number;
  errors: number;
  avgLatencyMs: number;
}

export async function providerUsageSeries(db: Db, sinceIso: string): Promise<ProviderDailyUsage[]> {
  const rows = await query(
    db,
    `SELECT substr(created_at, 1, 10) AS d, provider_key, COUNT(*) AS calls,
       SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors, AVG(latency_ms) AS avg_latency
       FROM external_api_usage WHERE created_at >= ? GROUP BY d, provider_key ORDER BY d, provider_key`,
    [sinceIso],
  );
  return rows.map((r) => ({ date: str(r.d), providerKey: str(r.provider_key), calls: num(r.calls), errors: num(r.errors), avgLatencyMs: Math.round(num(r.avg_latency)) }));
}

export async function aiUsagePlatform(db: Db, sinceIso: string): Promise<{ engine: string; operation: string; calls: number; inputChars: number; outputChars: number; avgLatencyMs: number }[]> {
  const rows = await query(
    db,
    `SELECT engine, operation, COUNT(*) AS calls, SUM(input_chars) AS input_chars, SUM(output_chars) AS output_chars, AVG(latency_ms) AS avg_latency
       FROM ai_usage WHERE created_at >= ? GROUP BY engine, operation ORDER BY calls DESC`,
    [sinceIso],
  );
  return rows.map((r) => ({ engine: str(r.engine), operation: str(r.operation), calls: num(r.calls), inputChars: num(r.input_chars), outputChars: num(r.output_chars), avgLatencyMs: Math.round(num(r.avg_latency)) }));
}

export interface SyncJobRow {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  providerKey: string;
  jobType: string;
  status: string;
  summary: Record<string, unknown>;
  errorSummary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export async function listSyncJobs(db: Db, page = 1, pageSize = 25): Promise<Page<SyncJobRow>> {
  return paginate(db, {
    select: "s.*, o.name AS organization_name",
    from: "supplier_sync_jobs s LEFT JOIN organizations o ON o.id = s.organization_id",
    where: "1=1",
    params: [],
    orderBy: "s.created_at DESC, s.id DESC",
    page,
    pageSize,
    map: (r) => ({
      id: str(r.id),
      organizationId: strOrNull(r.organization_id),
      organizationName: strOrNull(r.organization_name),
      providerKey: str(r.provider_key),
      jobType: str(r.job_type),
      status: str(r.status),
      summary: parseJson(r.summary_json, {}),
      errorSummary: strOrNull(r.error_summary),
      createdAt: str(r.created_at),
      startedAt: strOrNull(r.started_at),
      completedAt: strOrNull(r.completed_at),
    }),
  });
}

/* ======================= access grants ======================= */

export interface AccessGrantRow {
  id: string;
  platformUserId: string;
  platformUserName: string | null;
  platformUserEmail: string | null;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  reason: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
}

export async function listAccessGrants(
  db: Db,
  opts: { activeOnly?: boolean; organizationId?: string; page: number; pageSize: number },
  now = nowIso(),
): Promise<Page<AccessGrantRow>> {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.activeOnly) (where.push("g.revoked_at IS NULL AND g.expires_at > ?"), params.push(now));
  if (opts.organizationId) (where.push("g.organization_id = ?"), params.push(opts.organizationId));
  return paginate(db, {
    select: "g.*, u.display_name AS platform_user_name, u.email AS platform_user_email, o.name AS organization_name, o.slug AS organization_slug",
    from: "platform_access_grants g JOIN users u ON u.id = g.platform_user_id JOIN organizations o ON o.id = g.organization_id",
    where: where.join(" AND "),
    params,
    orderBy: "g.created_at DESC, g.id DESC",
    page: opts.page,
    pageSize: opts.pageSize,
    map: (r) => ({
      id: str(r.id),
      platformUserId: str(r.platform_user_id),
      platformUserName: strOrNull(r.platform_user_name),
      platformUserEmail: strOrNull(r.platform_user_email),
      organizationId: str(r.organization_id),
      organizationName: str(r.organization_name),
      organizationSlug: str(r.organization_slug),
      reason: str(r.reason),
      expiresAt: str(r.expires_at),
      revokedAt: strOrNull(r.revoked_at),
      createdAt: str(r.created_at),
      active: !r.revoked_at && str(r.expires_at) > now,
    }),
  });
}

export async function revokeAccessGrant(db: Db, id: string): Promise<boolean> {
  return (await execute(db, "UPDATE platform_access_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [nowIso(), id])) > 0;
}

export async function getAccessGrant(db: Db, id: string): Promise<AccessGrantRow | null> {
  const direct = await queryOne(
    db,
    `SELECT g.*, u.display_name AS platform_user_name, u.email AS platform_user_email, o.name AS organization_name, o.slug AS organization_slug
       FROM platform_access_grants g JOIN users u ON u.id = g.platform_user_id JOIN organizations o ON o.id = g.organization_id
      WHERE g.id = ?`,
    [id],
  );
  if (!direct) return null;
  return {
    id: str(direct.id),
    platformUserId: str(direct.platform_user_id),
    platformUserName: strOrNull(direct.platform_user_name),
    platformUserEmail: strOrNull(direct.platform_user_email),
    organizationId: str(direct.organization_id),
    organizationName: str(direct.organization_name),
    organizationSlug: str(direct.organization_slug),
    reason: str(direct.reason),
    expiresAt: str(direct.expires_at),
    revokedAt: strOrNull(direct.revoked_at),
    createdAt: str(direct.created_at),
    active: !direct.revoked_at && str(direct.expires_at) > nowIso(),
  };
}

/* ======================= global search ======================= */

export async function globalSearch(
  db: Db,
  q: string,
  limit = 5,
): Promise<{
  organizations: { id: string; name: string; slug: string; status: string; organizationType: string }[];
  users: { id: string; email: string; displayName: string; status: string; platformRole: string | null }[];
}> {
  const like = `%${escapeLike(q)}%`;
  const [orgs, users] = await Promise.all([
    query<Row>(db, "SELECT id, name, slug, status, organization_type FROM organizations WHERE name LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\' ORDER BY name LIMIT ?", [like, like, limit]),
    query<Row>(db, "SELECT id, email, display_name, status, platform_role FROM users WHERE email LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' ORDER BY display_name LIMIT ?", [like, like, limit]),
  ]);
  return {
    organizations: orgs.map((r) => ({ id: str(r.id), name: str(r.name), slug: str(r.slug), status: str(r.status), organizationType: str(r.organization_type) })),
    users: users.map((r) => ({ id: str(r.id), email: str(r.email), displayName: str(r.display_name), status: str(r.status), platformRole: strOrNull(r.platform_role) })),
  };
}

/* ======================= misc ======================= */

export interface DatabaseTableCount {
  table: string;
  rows: number;
}

/** Row counts for the storage/health panel. Table names come from a fixed allow-list, never user input. */
export async function tableCounts(db: Db): Promise<DatabaseTableCount[]> {
  const tables = [
    "organizations",
    "users",
    "organization_memberships",
    "sessions",
    "trip_requests",
    "quotes",
    "quote_versions",
    "properties",
    "rate_plans",
    "supplier_offers",
    "optimisation_jobs",
    "candidate_combinations",
    "audit_events",
    "email_outbox",
    "external_api_usage",
    "ai_usage",
  ];
  const out: DatabaseTableCount[] = [];
  for (const table of tables) {
    const r = await queryOne<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${table}`);
    out.push({ table, rows: num(r?.n) });
  }
  return out;
}

export async function countAuditSince(db: Db, sinceIso: string): Promise<number> {
  const r = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM audit_events WHERE created_at >= ?", [sinceIso]);
  return num(r?.n);
}

export async function recentAudit(db: Db, limit = 10): Promise<AdminAuditRow[]> {
  return (await listAudit(db, { page: 1, pageSize: limit })).items;
}

export async function recentOrganizations(db: Db, limit = 6): Promise<AdminOrganizationRow[]> {
  return (await listOrganizations(db, { page: 1, pageSize: limit })).items;
}

export async function subscriptionPlanDistribution(db: Db): Promise<{ plan: string; status: string; n: number }[]> {
  const rows = await query<{ plan: string; status: string; n: number }>(db, "SELECT plan, status, COUNT(*) AS n FROM subscriptions GROUP BY plan, status ORDER BY plan, status");
  return rows.map((r) => ({ plan: str(r.plan), status: str(r.status), n: num(r.n) }));
}
