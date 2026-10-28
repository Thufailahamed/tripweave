import type { AccountKind, OrganizationType, Role } from "@tripweave/shared";
import { clock, batch, execute, newId, nowIso, parseJson, query, queryOne, stmt, toJson, str, strOrNull, num, type Db, type Row } from "../db";

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  organizationType: OrganizationType;
  accountKind: AccountKind;
  status: string;
  defaultCurrency: string;
  timezone: string;
  country: string;
  branding: Record<string, unknown>;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const mapOrg = (r: Row): OrganizationRow => ({
  id: str(r.id),
  name: str(r.name),
  slug: str(r.slug),
  organizationType: str(r.organization_type) as OrganizationType,
  accountKind: (strOrNull(r.account_kind) as AccountKind | null) ?? "business",
  status: str(r.status),
  defaultCurrency: str(r.default_currency),
  timezone: str(r.timezone),
  country: str(r.country),
  branding: parseJson(r.branding_configuration, {}),
  settings: parseJson(r.settings_json, {}),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  platformRole: string | null;
  status: string;
  failedLoginCount: number;
  lockedUntil: string | null;
  emailVerifiedAt: string | null;
}
export const mapUser = (r: Row): UserRow => ({
  id: str(r.id),
  email: str(r.email),
  displayName: str(r.display_name),
  passwordHash: strOrNull(r.password_hash),
  platformRole: strOrNull(r.platform_role),
  status: str(r.status),
  failedLoginCount: num(r.failed_login_count),
  lockedUntil: strOrNull(r.locked_until),
  emailVerifiedAt: strOrNull(r.email_verified_at),
});

export interface MembershipRow {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  status: string;
  organizationName?: string;
  organizationType?: OrganizationType;
  organizationAccountKind?: AccountKind;
  organizationStatus?: string;
  email?: string;
  displayName?: string;
  createdAt?: string;
}

export async function slugAvailable(db: Db, slug: string): Promise<boolean> {
  return !(await queryOne(db, "SELECT 1 AS x FROM organizations WHERE slug = ?", [slug]));
}

export async function uniqueSlug(db: Db, base: string): Promise<string> {
  const root = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org";
  let slug = root;
  for (let i = 2; !(await slugAvailable(db, slug)); i++) slug = `${root}-${i}`;
  return slug;
}

/** Creates organisation, owner user (if new), membership and trial subscription atomically. */
export async function createOrganizationWithOwner(
  db: Db,
  input: {
    name: string;
    slug: string;
    type: OrganizationType;
    country: string;
    currency: string;
    timezone: string;
    owner: { id?: string; email: string; displayName: string; passwordHash: string };
  },
): Promise<{ organizationId: string; userId: string }> {
  const ts = nowIso();
  const orgId = newId();
  const userId = input.owner.id ?? newId();
  const statements = [
    stmt(db, `INSERT INTO organizations (id,name,slug,organization_type,status,default_currency,timezone,country,created_at,updated_at) VALUES (?,?,?,?, 'active',?,?,?,?,?)`, [orgId, input.name, input.slug, input.type, input.currency, input.timezone, input.country, ts, ts]),
    stmt(db, `INSERT INTO users (id,email,display_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?, 'active',?,?)`, [userId, input.owner.email, input.owner.displayName, input.owner.passwordHash, ts, ts]),
    stmt(db, `INSERT INTO organization_memberships (id,organization_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,'owner','active',?,?)`, [newId(), orgId, userId, ts, ts]),
    stmt(db, `INSERT INTO subscriptions (id,organization_id,plan,status,created_at,updated_at) VALUES (?,?,'trial','active',?,?)`, [newId(), orgId, ts, ts]),
  ];
  await batch(db, statements);
  return { organizationId: orgId, userId };
}

/**
 * Creates a personal workspace for an individual traveller. The organisation is still a tenant
 * (so every existing constraint and repository works unchanged), but `staff` deliberately has no
 * margin or contract visibility and `account_kind` keeps the operator UI away from it.
 */
export async function createTravelerWorkspace(
  db: Db,
  input: {
    organizationName: string;
    slug: string;
    country: string;
    currency: string;
    timezone: string;
    user: { email: string; displayName: string; passwordHash: string };
  },
): Promise<{ organizationId: string; userId: string }> {
  const ts = nowIso();
  const orgId = newId();
  const userId = newId();
  await batch(db, [
    stmt(db, `INSERT INTO organizations (id,name,slug,organization_type,account_kind,status,default_currency,timezone,country,created_at,updated_at) VALUES (?,?,?,?, 'individual', 'active',?,?,?,?,?)`, [orgId, input.organizationName, input.slug, "tour_operator", input.currency, input.timezone, input.country, ts, ts]),
    stmt(db, `INSERT INTO users (id,email,display_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?, 'active',?,?)`, [userId, input.user.email, input.user.displayName, input.user.passwordHash, ts, ts]),
    stmt(db, `INSERT INTO organization_memberships (id,organization_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,'staff','active',?,?)`, [newId(), orgId, userId, ts, ts]),
    stmt(db, `INSERT INTO subscriptions (id,organization_id,plan,status,seat_limit,created_at,updated_at) VALUES (?,?,'trial','active',1,?,?)`, [newId(), orgId, ts, ts]),
  ]);
  return { organizationId: orgId, userId };
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  const r = await queryOne(db, "SELECT * FROM users WHERE email = ?", [email]);
  return r ? mapUser(r) : null;
}
export async function findUserById(db: Db, id: string): Promise<UserRow | null> {
  const r = await queryOne(db, "SELECT * FROM users WHERE id = ?", [id]);
  return r ? mapUser(r) : null;
}

export async function createUser(db: Db, u: { email: string; displayName: string; passwordHash: string }): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(db, `INSERT INTO users (id,email,display_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?, 'active',?,?)`, [id, u.email, u.displayName, u.passwordHash, ts, ts]);
  return id;
}

export async function setPassword(db: Db, userId: string, hash: string): Promise<void> {
  await execute(db, "UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?", [hash, nowIso(), userId]);
}

export async function updateUserDisplayName(db: Db, userId: string, displayName: string): Promise<void> {
  await execute(db, "UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?", [displayName, nowIso(), userId]);
}

export async function recordLoginFailure(db: Db, userId: string, maxFailures: number, lockMinutes: number): Promise<void> {
  const u = await findUserById(db, userId);
  if (!u) return;
  const count = u.failedLoginCount + 1;
  const lockedUntil = count >= maxFailures ? new Date(clock().getTime() + lockMinutes * 60_000).toISOString() : null;
  await execute(db, "UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?", [count, lockedUntil, nowIso(), userId]);
}
export async function recordLoginSuccess(db: Db, userId: string): Promise<void> {
  await execute(db, "UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?", [userId]);
}

export async function getOrganization(db: Db, id: string): Promise<OrganizationRow | null> {
  const r = await queryOne(db, "SELECT * FROM organizations WHERE id = ?", [id]);
  return r ? mapOrg(r) : null;
}

export async function updateOrganization(
  db: Db,
  id: string,
  patch: { name?: string; defaultCurrency?: string; timezone?: string; country?: string; branding?: Record<string, unknown> },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) (sets.push("name = ?"), params.push(patch.name));
  if (patch.defaultCurrency !== undefined) (sets.push("default_currency = ?"), params.push(patch.defaultCurrency));
  if (patch.timezone !== undefined) (sets.push("timezone = ?"), params.push(patch.timezone));
  if (patch.country !== undefined) (sets.push("country = ?"), params.push(patch.country));
  if (patch.branding !== undefined) (sets.push("branding_configuration = ?"), params.push(toJson(patch.branding)));
  if (sets.length === 0) return;
  await execute(db, `UPDATE organizations SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...params, nowIso(), id]);
}

export async function listUserMemberships(db: Db, userId: string): Promise<MembershipRow[]> {
  const rows = await query(
    db,
    `SELECT m.*, o.name AS organization_name, o.organization_type, o.account_kind AS organization_account_kind, o.status AS organization_status
       FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = ? AND m.status = 'active' ORDER BY o.name`,
    [userId],
  );
  return rows.map((r) => ({
    id: str(r.id),
    organizationId: str(r.organization_id),
    userId: str(r.user_id),
    role: str(r.role) as Role,
    status: str(r.status),
    organizationName: str(r.organization_name),
    organizationType: str(r.organization_type) as OrganizationType,
    organizationAccountKind: (strOrNull(r.organization_account_kind) as AccountKind | null) ?? "business",
    organizationStatus: str(r.organization_status),
  }));
}

export async function getMembership(db: Db, organizationId: string, userId: string): Promise<MembershipRow | null> {
  const r = await queryOne(
    db,
    `SELECT m.*, o.name AS organization_name, o.organization_type, o.account_kind AS organization_account_kind, o.status AS organization_status
       FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
      WHERE m.organization_id = ? AND m.user_id = ?`,
    [organizationId, userId],
  );
  if (!r) return null;
  return {
    id: str(r.id),
    organizationId: str(r.organization_id),
    userId: str(r.user_id),
    role: str(r.role) as Role,
    status: str(r.status),
    organizationName: str(r.organization_name),
    organizationType: str(r.organization_type) as OrganizationType,
    organizationAccountKind: (strOrNull(r.organization_account_kind) as AccountKind | null) ?? "business",
    organizationStatus: str(r.organization_status),
  };
}

export async function listOrganizationMembers(db: Db, organizationId: string): Promise<MembershipRow[]> {
  const rows = await query(
    db,
    `SELECT m.*, u.email, u.display_name FROM organization_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ? AND m.status != 'removed' ORDER BY u.display_name`,
    [organizationId],
  );
  return rows.map((r) => ({
    id: str(r.id),
    organizationId: str(r.organization_id),
    userId: str(r.user_id),
    role: str(r.role) as Role,
    status: str(r.status),
    email: str(r.email),
    displayName: str(r.display_name),
    createdAt: str(r.created_at),
  }));
}

export async function addMembership(db: Db, organizationId: string, userId: string, role: Role): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(db, `INSERT INTO organization_memberships (id,organization_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,?, 'active',?,?)`, [id, organizationId, userId, role, ts, ts]);
  return id;
}

export async function updateMembership(db: Db, organizationId: string, membershipId: string, patch: { role?: Role; status?: string }): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.role) (sets.push("role = ?"), params.push(patch.role));
  if (patch.status) (sets.push("status = ?"), params.push(patch.status));
  if (sets.length === 0) return false;
  const n = await execute(db, `UPDATE organization_memberships SET ${sets.join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ? AND role != 'owner'`, [...params, nowIso(), membershipId, organizationId]);
  return n > 0;
}

export async function countActiveMembers(db: Db, organizationId: string): Promise<number> {
  const r = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM organization_memberships WHERE organization_id = ? AND status = 'active'", [organizationId]);
  return r?.n ?? 0;
}

/* ---------- sessions ---------- */

export interface SessionRow {
  id: string;
  userId: string;
  activeOrganizationId: string | null;
  expiresAt: string;
  revokedAt: string | null;
}

export async function createSession(db: Db, s: { userId: string; tokenHash: string; organizationId: string | null; expiresAt: string; userAgent?: string | null }): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(db, `INSERT INTO sessions (id,user_id,token_hash,active_organization_id,created_at,expires_at,last_seen_at,user_agent) VALUES (?,?,?,?,?,?,?,?)`, [id, s.userId, s.tokenHash, s.organizationId, ts, s.expiresAt, ts, s.userAgent ?? null]);
  return id;
}

export async function getSessionByHash(db: Db, tokenHash: string): Promise<SessionRow | null> {
  const r = await queryOne(db, "SELECT * FROM sessions WHERE token_hash = ?", [tokenHash]);
  if (!r) return null;
  return { id: str(r.id), userId: str(r.user_id), activeOrganizationId: strOrNull(r.active_organization_id), expiresAt: str(r.expires_at), revokedAt: strOrNull(r.revoked_at) };
}
export async function touchSession(db: Db, id: string): Promise<void> {
  await execute(db, "UPDATE sessions SET last_seen_at = ? WHERE id = ?", [nowIso(), id]);
}
export async function setSessionOrganization(db: Db, id: string, organizationId: string): Promise<void> {
  await execute(db, "UPDATE sessions SET active_organization_id = ? WHERE id = ?", [organizationId, id]);
}
export async function revokeSession(db: Db, id: string): Promise<void> {
  await execute(db, "UPDATE sessions SET revoked_at = ? WHERE id = ?", [nowIso(), id]);
}
export async function revokeUserSessions(db: Db, userId: string): Promise<void> {
  await execute(db, "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", [nowIso(), userId]);
}

export async function createResetToken(db: Db, userId: string, tokenHash: string, expiresAt: string): Promise<void> {
  await execute(db, "INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)", [newId(), userId, tokenHash, expiresAt, nowIso()]);
}
/** Atomically consumes a reset token; returns the user id when valid. */
export async function consumeResetToken(db: Db, tokenHash: string): Promise<string | null> {
  const changed = await execute(db, "UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?", [nowIso(), tokenHash, nowIso()]);
  if (changed === 0) return null;
  const r = await queryOne<{ user_id: string }>(db, "SELECT user_id FROM password_reset_tokens WHERE token_hash = ?", [tokenHash]);
  return r?.user_id ?? null;
}

/* ---------- email verification ---------- */

export async function createEmailVerificationToken(db: Db, userId: string, tokenHash: string, expiresAt: string): Promise<void> {
  await execute(db, "INSERT INTO email_verification_tokens (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)", [newId(), userId, tokenHash, expiresAt, nowIso()]);
}
/** Atomically consumes a verification token and marks the address verified; returns the user id when valid. */
export async function consumeEmailVerificationToken(db: Db, tokenHash: string): Promise<string | null> {
  const changed = await execute(db, "UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?", [nowIso(), tokenHash, nowIso()]);
  if (changed === 0) return null;
  const r = await queryOne<{ user_id: string }>(db, "SELECT user_id FROM email_verification_tokens WHERE token_hash = ?", [tokenHash]);
  if (!r) return null;
  await execute(db, "UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?", [nowIso(), nowIso(), r.user_id]);
  return r.user_id;
}

/** Completing a password reset proves control of the mailbox, so it also verifies the address. */
export async function markEmailVerified(db: Db, userId: string): Promise<void> {
  await execute(db, "UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?", [nowIso(), nowIso(), userId]);
}

/* ---------- multi-factor authentication (TOTP) ---------- */

export interface MfaRow { userId: string; secretEncrypted: string; enabledAt: string | null; lastUsedStep: number }
const mapMfa = (r: Row): MfaRow => ({ userId: str(r.user_id), secretEncrypted: str(r.secret_encrypted), enabledAt: strOrNull(r.enabled_at), lastUsedStep: num(r.last_used_step) });

export async function getMfa(db: Db, userId: string): Promise<MfaRow | null> {
  const r = await queryOne(db, "SELECT * FROM user_mfa WHERE user_id = ?", [userId]);
  return r ? mapMfa(r) : null;
}
/** Stores a pending (unconfirmed) secret, replacing any earlier pending one. Never touches an enabled factor. */
export async function savePendingMfa(db: Db, userId: string, secretEncrypted: string): Promise<boolean> {
  const ts = nowIso();
  await execute(db, "INSERT INTO user_mfa (user_id,secret_encrypted,enabled_at,last_used_step,created_at,updated_at) VALUES (?,?,NULL,0,?,?) ON CONFLICT(user_id) DO UPDATE SET secret_encrypted = excluded.secret_encrypted, updated_at = excluded.updated_at WHERE user_mfa.enabled_at IS NULL", [userId, secretEncrypted, ts, ts]);
  return (await getMfa(db, userId))?.secretEncrypted === secretEncrypted;
}
export async function enableMfa(db: Db, userId: string, step: number, recoveryCodeHashes: string[]): Promise<boolean> {
  const ts = nowIso();
  const changed = await execute(db, "UPDATE user_mfa SET enabled_at = ?, last_used_step = ?, updated_at = ? WHERE user_id = ? AND enabled_at IS NULL", [ts, step, ts, userId]);
  if (changed === 0) return false;
  await replaceRecoveryCodes(db, userId, recoveryCodeHashes);
  return true;
}
/** Records the accepted TOTP time-step; false when that step (or a later one) was already used (replay). */
export async function advanceMfaStep(db: Db, userId: string, step: number): Promise<boolean> {
  return (await execute(db, "UPDATE user_mfa SET last_used_step = ?, updated_at = ? WHERE user_id = ? AND enabled_at IS NOT NULL AND last_used_step < ?", [step, nowIso(), userId, step])) > 0;
}
export async function deleteMfa(db: Db, userId: string): Promise<void> {
  await batch(db, [
    stmt(db, "DELETE FROM mfa_recovery_codes WHERE user_id = ?", [userId]),
    stmt(db, "DELETE FROM mfa_challenges WHERE user_id = ?", [userId]),
    stmt(db, "DELETE FROM user_mfa WHERE user_id = ?", [userId]),
  ]);
}
export async function replaceRecoveryCodes(db: Db, userId: string, hashes: string[]): Promise<void> {
  const ts = nowIso();
  await batch(db, [
    stmt(db, "DELETE FROM mfa_recovery_codes WHERE user_id = ?", [userId]),
    ...hashes.map((h) => stmt(db, "INSERT INTO mfa_recovery_codes (id,user_id,code_hash,created_at) VALUES (?,?,?,?)", [newId(), userId, h, ts])),
  ]);
}
/** Single-use: true only for the one caller that flips used_at. */
export async function consumeRecoveryCode(db: Db, userId: string, hash: string): Promise<boolean> {
  return (await execute(db, "UPDATE mfa_recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL", [nowIso(), userId, hash])) > 0;
}
export async function countRecoveryCodes(db: Db, userId: string): Promise<number> {
  return (await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL", [userId]))?.n ?? 0;
}

export interface MfaChallengeRow { id: string; userId: string; attempts: number; expiresAt: string }
export async function createMfaChallenge(db: Db, userId: string, tokenHash: string, expiresAt: string): Promise<void> {
  // One outstanding challenge per user keeps the table small and invalidates older password-step proofs.
  await batch(db, [
    stmt(db, "DELETE FROM mfa_challenges WHERE user_id = ?", [userId]),
    stmt(db, "INSERT INTO mfa_challenges (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)", [newId(), userId, tokenHash, expiresAt, nowIso()]),
  ]);
}
export async function getMfaChallenge(db: Db, tokenHash: string): Promise<MfaChallengeRow | null> {
  const r = await queryOne(db, "SELECT * FROM mfa_challenges WHERE token_hash = ?", [tokenHash]);
  return r ? { id: str(r.id), userId: str(r.user_id), attempts: num(r.attempts), expiresAt: str(r.expires_at) } : null;
}
export async function bumpMfaChallengeAttempts(db: Db, id: string): Promise<number> {
  await execute(db, "UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = ?", [id]);
  return (await queryOne<{ attempts: number }>(db, "SELECT attempts FROM mfa_challenges WHERE id = ?", [id]))?.attempts ?? 0;
}
/** True for exactly one caller, so a challenge can be exchanged for a session only once. */
export async function consumeMfaChallenge(db: Db, id: string): Promise<boolean> {
  return (await execute(db, "DELETE FROM mfa_challenges WHERE id = ?", [id])) > 0;
}

/* ---------- platform admin ---------- */

export async function listOrganizations(db: Db, opts: { q?: string; page: number; pageSize: number }): Promise<{ items: (OrganizationRow & { memberCount: number })[]; total: number }> {
  const like = opts.q ? `%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : "%";
  const total = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM organizations WHERE name LIKE ? ESCAPE '\\'", [like]);
  const rows = await query(
    db,
    `SELECT o.*, (SELECT COUNT(*) FROM organization_memberships m WHERE m.organization_id = o.id AND m.status='active') AS member_count
       FROM organizations o WHERE o.name LIKE ? ESCAPE '\\' ORDER BY o.created_at DESC, o.rowid DESC LIMIT ? OFFSET ?`,
    [like, opts.pageSize, (opts.page - 1) * opts.pageSize],
  );
  return { items: rows.map((r) => ({ ...mapOrg(r), memberCount: num(r.member_count) })), total: total?.n ?? 0 };
}

export async function setOrganizationStatus(db: Db, id: string, status: string): Promise<boolean> {
  return (await execute(db, "UPDATE organizations SET status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), id])) > 0;
}

export async function getSubscription(db: Db, organizationId: string): Promise<Row | null> {
  return queryOne(db, "SELECT * FROM subscriptions WHERE organization_id = ?", [organizationId]);
}
export async function updateSubscription(db: Db, organizationId: string, p: { plan?: string; status?: string; seatLimit?: number; monthlyOptimisationLimit?: number }): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (p.plan) (sets.push("plan = ?"), params.push(p.plan));
  if (p.status) (sets.push("status = ?"), params.push(p.status));
  if (p.seatLimit !== undefined) (sets.push("seat_limit = ?"), params.push(p.seatLimit));
  if (p.monthlyOptimisationLimit !== undefined) (sets.push("monthly_optimisation_limit = ?"), params.push(p.monthlyOptimisationLimit));
  if (sets.length === 0) return;
  await execute(db, `UPDATE subscriptions SET ${sets.join(", ")}, updated_at = ? WHERE organization_id = ?`, [...params, nowIso(), organizationId]);
}

export async function createAccessGrant(db: Db, g: { platformUserId: string; organizationId: string; reason: string; expiresAt: string }): Promise<string> {
  const id = newId();
  await execute(db, "INSERT INTO platform_access_grants (id,platform_user_id,organization_id,reason,expires_at,created_at) VALUES (?,?,?,?,?,?)", [id, g.platformUserId, g.organizationId, g.reason, g.expiresAt, nowIso()]);
  return id;
}
export async function hasActiveAccessGrant(db: Db, platformUserId: string, organizationId: string): Promise<boolean> {
  return !!(await queryOne(db, "SELECT 1 AS x FROM platform_access_grants WHERE platform_user_id = ? AND organization_id = ? AND revoked_at IS NULL AND expires_at > ?", [platformUserId, organizationId, nowIso()]));
}
