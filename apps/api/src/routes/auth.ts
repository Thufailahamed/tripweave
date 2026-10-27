import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { AppError, forgotPasswordSchema, loginSchema, passwordSchema, registerSchema, resetPasswordSchema, switchOrganizationSchema, permissionsForRole } from "@tripweave/shared";
import { identity, ops } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "../lib/crypto";
import { clientIp, ok, parseBody, type AppContext } from "../lib/http";
import { openSecret, sealSecret } from "../lib/secretbox";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUri, verifyTotp } from "../lib/totp";
import { audit, cookieName, getAuth, rateLimit, requireAuth, SESSION_TTL_DAYS } from "../middleware/auth";
import { sendEmail, verifyTurnstile } from "../services/email";
import { platformSettings } from "../services/platform";
import { pricingConfigSchema } from "@tripweave/shared";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

const EMAIL_VERIFY_TTL_MS = 48 * 3_600_000;
const MFA_CHALLENGE_TTL_SECONDS = 300;
const MFA_MAX_ATTEMPTS = 5;

async function startSession(c: AppContext, userId: string, organizationId: string | null) {
  const token = randomToken(32);
  const expires = new Date(c.get("deps").now().getTime() + SESSION_TTL_DAYS * 86_400_000);
  await identity.createSession(c.get("db"), { userId, tokenHash: await sha256Hex(token), organizationId, expiresAt: expires.toISOString(), userAgent: c.req.header("user-agent")?.slice(0, 200) ?? null });
  setCookie(c, cookieName(c.env), token, { httpOnly: true, secure: c.env.COOKIE_SECURE === "true", sameSite: "Lax", path: "/", expires });
}

async function sendVerificationEmail(c: AppContext, user: { id: string; email: string }) {
  const token = randomToken(32);
  await identity.createEmailVerificationToken(c.get("db"), user.id, await sha256Hex(token), new Date(c.get("deps").now().getTime() + EMAIL_VERIFY_TTL_MS).toISOString());
  await sendEmail(c.env, c.get("db"), c.get("deps"), { organizationId: null, to: user.email, subject: "Verify your TripWeave email address", body: `Confirm your email address to finish setting up your account (link valid for 48 hours):\n${c.env.APP_BASE_URL}/verify-email?token=${token}\n\nIf you did not create a TripWeave account, you can ignore this email.` });
}

function mfaKey(c: AppContext): string {
  const key = c.env.MFA_ENCRYPTION_KEY;
  if (!key) throw new AppError("precondition_failed", "Multi-factor authentication is not configured on this platform yet");
  return key;
}

/** Checks a TOTP code (with replay protection) or a single-use recovery code. */
async function checkSecondFactor(c: AppContext, userId: string, mfa: identity.MfaRow, factor: { code?: string; recoveryCode?: string }): Promise<boolean> {
  const db = c.get("db");
  if (factor.recoveryCode) return identity.consumeRecoveryCode(db, userId, await hashRecoveryCode(factor.recoveryCode));
  if (!factor.code) return false;
  const step = await verifyTotp(await openSecret(mfa.secretEncrypted, mfaKey(c)), factor.code, c.get("deps").now().getTime());
  return step !== null && (await identity.advanceMfaStep(db, userId, step));
}

const secondFactorSchema = z.object({ code: z.string().max(32).optional(), recoveryCode: z.string().max(32).optional() });
const oneFactor = (b: { code?: string; recoveryCode?: string }) => !!b.code !== !!b.recoveryCode;

export async function describeSession(c: AppContext) {
  const a = getAuth(c);
  const org = a.organizationId ? await identity.getOrganization(c.get("db"), a.organizationId) : null;
  const mfa = await identity.getMfa(c.get("db"), a.userId);
  return {
    user: { id: a.userId, email: a.email, displayName: a.displayName, platformAdmin: a.platformAdmin, emailVerified: a.emailVerified, mfaEnabled: !!mfa?.enabledAt },
    organization: org && a.role ? { id: org.id, name: org.name, slug: org.slug, type: org.organizationType, status: org.status, defaultCurrency: org.defaultCurrency, timezone: org.timezone, country: org.country, branding: org.branding, role: a.role } : null,
    permissions: a.role ? permissionsForRole(a.role) : [],
    memberships: a.memberships.map((m) => ({ organizationId: m.organizationId, name: m.organizationName, type: m.organizationType, role: m.role, status: m.organizationStatus })),
  };
}

/** Finishes a sign-in once every required factor has been proven: resets lockout state and opens the session. */
async function completeLogin(c: AppContext, user: identity.UserRow) {
  const db = c.get("db");
  await identity.recordLoginSuccess(db, user.id);
  const memberships = await identity.listUserMemberships(db, user.id);
  const first = memberships.find((m) => m.organizationStatus === "active") ?? memberships[0] ?? null;
  await startSession(c, user.id, first?.organizationId ?? null);
  await ops.writeAudit(db, { organizationId: first?.organizationId ?? null, actorUserId: user.id, action: "auth.login", resourceType: "user", resourceId: user.id, requestId: c.get("requestId") });
  c.set("auth", { userId: user.id, email: user.email, displayName: user.displayName, platformAdmin: user.platformRole === "platform_admin", emailVerified: !!user.emailVerifiedAt, sessionId: "", organizationId: first?.organizationId ?? null, organizationType: first?.organizationType ?? null, organizationName: first?.organizationName ?? null, role: first?.role ?? null, permissions: new Set(first ? permissionsForRole(first.role) : []), memberships });
  return ok(c, await describeSession(c));
}

authRoutes.post("/register", rateLimit({ name: "register", limit: 10, windowSeconds: 3600 }), async (c) => {
  const body = await parseBody(c, registerSchema);
  const settings = await platformSettings(c.get("db"), c.get("deps").now().getTime());
  if (settings.maintenanceMode) throw new AppError("maintenance", "TripWeave is undergoing scheduled maintenance. Please try again shortly.", { supportEmail: settings.supportEmail || undefined });
  if (!settings.signupsEnabled) throw new AppError("forbidden", "New registrations are currently closed. Please contact support.");
  if (!(await verifyTurnstile(c.env, c.get("deps"), body.turnstileToken, clientIp(c)))) throw new AppError("forbidden", "Human verification failed. Please try again.");
  const db = c.get("db");
  const email = body.email.toLowerCase();
  if (await identity.findUserByEmail(db, email)) throw new AppError("conflict", "An account with this email already exists. Please sign in instead.");
  const { organizationId, userId } = await identity.createOrganizationWithOwner(db, {
    name: body.organizationName, slug: await identity.uniqueSlug(db, body.organizationName), type: body.organizationType, country: body.country, currency: body.defaultCurrency, timezone: body.timezone,
    owner: { email, displayName: body.displayName, passwordHash: await hashPassword(body.password, c.get("deps").pbkdf2Iterations) },
  });
  await ops.setSetting(db, organizationId, "pricing", pricingConfigSchema.parse({}), userId);
  await identity.updateSubscription(db, organizationId, { seatLimit: settings.defaultSeatLimit, monthlyOptimisationLimit: settings.defaultOptimisationLimit });
  await ops.writeAudit(db, { organizationId, actorUserId: userId, action: "organization.created", resourceType: "organization", resourceId: organizationId, metadata: { type: body.organizationType }, requestId: c.get("requestId") });
  await startSession(c, userId, organizationId);
  await sendVerificationEmail(c, { id: userId, email });
  c.set("auth", { userId, email, displayName: body.displayName, platformAdmin: false, emailVerified: false, sessionId: "", organizationId, organizationType: body.organizationType, organizationName: body.organizationName, role: "owner", permissions: new Set(permissionsForRole("owner")), memberships: await identity.listUserMemberships(db, userId) });
  return ok(c, await describeSession(c), 201);
});

authRoutes.post("/login", rateLimit({ name: "login", limit: 20, windowSeconds: 600 }), async (c) => {
  const body = await parseBody(c, loginSchema);
  const db = c.get("db");
  const email = body.email.toLowerCase();
  const generic = new AppError("unauthenticated", "Invalid email or password");
  const emailLimit = await ops.hitRateLimit(db, `login-email:${await sha256Hex(email)}`, 10, 900, c.get("deps").now().getTime());
  const user = await identity.findUserByEmail(db, email);
  const passwordOk = await verifyPassword(body.password, user?.passwordHash ?? null);
  if (!emailLimit.allowed) throw new AppError("rate_limited", "Too many sign-in attempts. Try again later.", { retryAfterSeconds: emailLimit.retryAfterSeconds });
  if (!user || user.status !== "active") throw generic;
  if (user.lockedUntil && user.lockedUntil > c.get("deps").now().toISOString()) throw new AppError("rate_limited", "This account is temporarily locked after repeated failed sign-ins. Try again later.", { retryAfterSeconds: 900 });
  if (!passwordOk) {
    await identity.recordLoginFailure(db, user.id, 5, 15);
    await ops.writeAudit(db, { organizationId: null, actorUserId: user.id, action: "auth.login_failed", resourceType: "user", resourceId: user.id, requestId: c.get("requestId") });
    throw generic;
  }
  const mfa = await identity.getMfa(db, user.id);
  if (mfa?.enabledAt) {
    // Password was right; hand back a short-lived, single-use proof to exchange for a session with the second factor.
    const mfaToken = randomToken(32);
    await identity.createMfaChallenge(db, user.id, await sha256Hex(mfaToken), new Date(c.get("deps").now().getTime() + MFA_CHALLENGE_TTL_SECONDS * 1000).toISOString());
    return ok(c, { mfaRequired: true, mfaToken, expiresInSeconds: MFA_CHALLENGE_TTL_SECONDS });
  }
  return completeLogin(c, user);
});

authRoutes.post("/mfa/verify", rateLimit({ name: "mfa-verify", limit: 30, windowSeconds: 600 }), async (c) => {
  const body = await parseBody(c, secondFactorSchema.extend({ mfaToken: z.string().min(20).max(200) }).refine(oneFactor, "Send either code or recoveryCode"));
  const db = c.get("db");
  const invalid = new AppError("unauthenticated", "That code is not valid, or the sign-in attempt has expired. Please sign in again.");
  const challenge = await identity.getMfaChallenge(db, await sha256Hex(body.mfaToken));
  if (!challenge || challenge.expiresAt <= c.get("deps").now().toISOString()) throw invalid;
  if (challenge.attempts >= MFA_MAX_ATTEMPTS) {
    await identity.consumeMfaChallenge(db, challenge.id);
    throw invalid;
  }
  const user = await identity.findUserById(db, challenge.userId);
  const mfa = user ? await identity.getMfa(db, user.id) : null;
  if (!user || user.status !== "active" || !mfa?.enabledAt) throw invalid;
  if (!(await checkSecondFactor(c, user.id, mfa, body))) {
    const attempts = await identity.bumpMfaChallengeAttempts(db, challenge.id);
    if (attempts >= MFA_MAX_ATTEMPTS) await identity.consumeMfaChallenge(db, challenge.id);
    await ops.writeAudit(db, { organizationId: null, actorUserId: user.id, action: "auth.mfa_failed", resourceType: "user", resourceId: user.id, requestId: c.get("requestId") });
    throw invalid;
  }
  if (!(await identity.consumeMfaChallenge(db, challenge.id))) throw invalid; // a challenge buys exactly one session
  if (body.recoveryCode) await ops.writeAudit(db, { organizationId: null, actorUserId: user.id, action: "auth.mfa_recovery_code_used", resourceType: "user", resourceId: user.id, requestId: c.get("requestId") });
  return completeLogin(c, user);
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, cookieName(c.env));
  if (token) {
    const s = await identity.getSessionByHash(c.get("db"), await sha256Hex(token));
    if (s) await identity.revokeSession(c.get("db"), s.id);
  }
  deleteCookie(c, cookieName(c.env), { path: "/" });
  return ok(c, { loggedOut: true });
});

authRoutes.get("/me", requireAuth, async (c) => ok(c, await describeSession(c)));

authRoutes.post("/switch-organization", requireAuth, async (c) => {
  const a = getAuth(c);
  const { organizationId } = await parseBody(c, switchOrganizationSchema);
  const m = a.memberships.find((x) => x.organizationId === organizationId && x.status === "active");
  if (!m) throw new AppError("forbidden", "You are not a member of that organisation");
  await identity.setSessionOrganization(c.get("db"), a.sessionId, organizationId);
  c.set("auth", { ...a, organizationId, organizationType: m.organizationType ?? null, organizationName: m.organizationName ?? null, role: m.role, permissions: new Set(permissionsForRole(m.role)) });
  await audit(c, "auth.switch_organization", "organization", organizationId);
  return ok(c, await describeSession(c));
});

authRoutes.post("/forgot-password", rateLimit({ name: "forgot", limit: 5, windowSeconds: 3600 }), async (c) => {
  const body = await parseBody(c, forgotPasswordSchema);
  if (!(await verifyTurnstile(c.env, c.get("deps"), body.turnstileToken, clientIp(c)))) throw new AppError("forbidden", "Human verification failed. Please try again.");
  const db = c.get("db");
  const user = await identity.findUserByEmail(db, body.email.toLowerCase());
  if (user && user.status === "active") {
    const token = randomToken(32);
    await identity.createResetToken(db, user.id, await sha256Hex(token), new Date(c.get("deps").now().getTime() + 3_600_000).toISOString());
    await sendEmail(c.env, db, c.get("deps"), { organizationId: null, to: user.email, subject: "Reset your TripWeave password", body: `Use this link within one hour to choose a new password:\n${c.env.APP_BASE_URL}/reset-password?token=${token}\n\nIf you did not request this, you can ignore this email.` });
    await ops.writeAudit(db, { organizationId: null, actorUserId: user.id, action: "auth.password_reset_requested", resourceType: "user", resourceId: user.id, requestId: c.get("requestId") });
  }
  // Identical response whether or not the account exists (prevents account enumeration).
  return ok(c, { message: "If an account exists for that email, a reset link has been sent." });
});

authRoutes.post("/reset-password", rateLimit({ name: "reset", limit: 10, windowSeconds: 3600 }), async (c) => {
  const body = await parseBody(c, resetPasswordSchema);
  const db = c.get("db");
  const userId = await identity.consumeResetToken(db, await sha256Hex(body.token));
  if (!userId) throw new AppError("bad_request", "This reset link is invalid or has expired. Please request a new one.");
  await identity.setPassword(db, userId, await hashPassword(body.password, c.get("deps").pbkdf2Iterations));
  await identity.markEmailVerified(db, userId); // the link was delivered to the mailbox, so it proves control of it
  await identity.revokeUserSessions(db, userId);
  await ops.writeAudit(db, { organizationId: null, actorUserId: userId, action: "auth.password_reset", resourceType: "user", resourceId: userId, requestId: c.get("requestId") });
  return ok(c, { message: "Password updated. Please sign in." });
});

authRoutes.post("/change-password", requireAuth, async (c) => {
  const a = getAuth(c);
  const body = await parseBody(c, z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema }));
  const db = c.get("db");
  const user = await identity.findUserById(db, a.userId);
  if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) throw new AppError("forbidden", "Current password is incorrect");
  await identity.setPassword(db, a.userId, await hashPassword(body.newPassword, c.get("deps").pbkdf2Iterations));
  await identity.revokeUserSessions(db, a.userId);
  await startSession(c, a.userId, a.organizationId);
  await audit(c, "auth.password_changed", "user", a.userId);
  return ok(c, { message: "Password changed." });
});

/* ---------- email verification ---------- */

authRoutes.post("/verify-email", rateLimit({ name: "verify-email", limit: 20, windowSeconds: 3600 }), async (c) => {
  const { token } = await parseBody(c, z.object({ token: z.string().min(20).max(200) }));
  const userId = await identity.consumeEmailVerificationToken(c.get("db"), await sha256Hex(token));
  if (!userId) throw new AppError("bad_request", "This verification link is invalid or has expired. Sign in and request a new one.");
  await ops.writeAudit(c.get("db"), { organizationId: null, actorUserId: userId, action: "auth.email_verified", resourceType: "user", resourceId: userId, requestId: c.get("requestId") });
  return ok(c, { message: "Email address verified." });
});

authRoutes.post("/resend-verification", requireAuth, rateLimit({ name: "resend-verification", limit: 5, windowSeconds: 3600, by: "user" }), async (c) => {
  const a = getAuth(c);
  const user = await identity.findUserById(c.get("db"), a.userId);
  if (!user || user.emailVerifiedAt) return ok(c, { message: "Your email address is already verified.", alreadyVerified: true });
  await sendVerificationEmail(c, user);
  return ok(c, { message: "Verification email sent." });
});

/* ---------- multi-factor authentication ---------- */

authRoutes.get("/mfa", requireAuth, async (c) => {
  const a = getAuth(c);
  const mfa = await identity.getMfa(c.get("db"), a.userId);
  return ok(c, { available: !!c.env.MFA_ENCRYPTION_KEY, enabled: !!mfa?.enabledAt, recoveryCodesRemaining: mfa?.enabledAt ? await identity.countRecoveryCodes(c.get("db"), a.userId) : 0 });
});

/** Starts enrolment: issues a secret (shown once, for the authenticator app). Nothing is enforced until /mfa/enable. */
authRoutes.post("/mfa/setup", requireAuth, rateLimit({ name: "mfa-setup", limit: 10, windowSeconds: 3600, by: "user" }), async (c) => {
  const key = mfaKey(c);
  const a = getAuth(c);
  const db = c.get("db");
  if ((await identity.getMfa(db, a.userId))?.enabledAt) throw new AppError("conflict", "Multi-factor authentication is already enabled. Disable it first to enrol a new device.");
  const secret = generateTotpSecret();
  if (!(await identity.savePendingMfa(db, a.userId, await sealSecret(secret, key)))) throw new AppError("conflict", "Multi-factor authentication is already enabled.");
  return ok(c, { secret, otpauthUri: otpauthUri(secret, a.email, "TripWeave") });
});

/** Confirms enrolment with a code from the app, turns MFA on and returns the one-time recovery codes. */
authRoutes.post("/mfa/enable", requireAuth, rateLimit({ name: "mfa-enable", limit: 15, windowSeconds: 3600, by: "user" }), async (c) => {
  const key = mfaKey(c);
  const a = getAuth(c);
  const { code } = await parseBody(c, z.object({ code: z.string().min(6).max(12) }));
  const db = c.get("db");
  const mfa = await identity.getMfa(db, a.userId);
  if (!mfa || mfa.enabledAt) throw new AppError("bad_request", "Start setup first to get a new secret.");
  const step = await verifyTotp(await openSecret(mfa.secretEncrypted, key), code, c.get("deps").now().getTime());
  if (step === null) throw new AppError("bad_request", "That code is not correct. Check the time on your phone and try the next code.");
  const { codes, hashes } = await generateRecoveryCodes();
  if (!(await identity.enableMfa(db, a.userId, step, hashes))) throw new AppError("conflict", "Multi-factor authentication is already enabled.");
  await audit(c, "auth.mfa_enabled", "user", a.userId);
  return ok(c, { recoveryCodes: codes });
});

/** Re-authenticates with the password plus a second factor before changing MFA state. */
async function reauthenticate(c: AppContext, body: { password: string; code?: string; recoveryCode?: string }) {
  const a = getAuth(c);
  const db = c.get("db");
  const user = await identity.findUserById(db, a.userId);
  const mfa = await identity.getMfa(db, a.userId);
  if (!user || !mfa?.enabledAt) throw new AppError("bad_request", "Multi-factor authentication is not enabled.");
  if (!(await verifyPassword(body.password, user.passwordHash))) throw new AppError("forbidden", "Password is incorrect");
  if (!(await checkSecondFactor(c, a.userId, mfa, body))) throw new AppError("forbidden", "That code is not valid");
  return a;
}
const reauthSchema = secondFactorSchema.extend({ password: z.string().min(1).max(200) }).refine(oneFactor, "Send either code or recoveryCode");

authRoutes.post("/mfa/disable", requireAuth, rateLimit({ name: "mfa-disable", limit: 10, windowSeconds: 3600, by: "user" }), async (c) => {
  const a = await reauthenticate(c, await parseBody(c, reauthSchema));
  await identity.deleteMfa(c.get("db"), a.userId);
  await audit(c, "auth.mfa_disabled", "user", a.userId);
  return ok(c, { enabled: false });
});

authRoutes.post("/mfa/recovery-codes", requireAuth, rateLimit({ name: "mfa-recovery", limit: 10, windowSeconds: 3600, by: "user" }), async (c) => {
  const a = await reauthenticate(c, await parseBody(c, reauthSchema));
  const { codes, hashes } = await generateRecoveryCodes();
  await identity.replaceRecoveryCodes(c.get("db"), a.userId, hashes);
  await audit(c, "auth.mfa_recovery_codes_regenerated", "user", a.userId);
  return ok(c, { recoveryCodes: codes });
});
