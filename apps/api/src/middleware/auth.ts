import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { AppError, permissionsForRole, type Permission } from "@tripweave/shared";
import { identity, ops } from "@tripweave/database";
import type { AuthContext, Env, Vars } from "../env";
import { sha256Hex } from "../lib/crypto";
import { clientIp, type AppContext } from "../lib/http";

type Bindings = { Bindings: Env; Variables: Vars };

export const cookieName = (env: Env) => env.SESSION_COOKIE_NAME || "tw_session";
export const SESSION_TTL_DAYS = 14;

/** Resolves the session cookie to a verified user + membership. Never trusts browser-supplied org ids. */
export const authenticate: MiddlewareHandler<Bindings> = async (c, next) => {
  const token = getCookie(c, cookieName(c.env));
  if (token && token.length >= 20 && token.length <= 128) {
    const db = c.get("db");
    const session = await identity.getSessionByHash(db, await sha256Hex(token));
    if (session && !session.revokedAt && session.expiresAt > c.get("deps").now().toISOString()) {
      const user = await identity.findUserById(db, session.userId);
      if (user && user.status === "active") {
        const memberships = (await identity.listUserMemberships(db, user.id)).filter((m) => m.organizationStatus !== "closed");
        const chosen = memberships.find((m) => m.organizationId === session.activeOrganizationId) ?? memberships[0] ?? null;
        const auth: AuthContext = {
          userId: user.id,
          email: user.email,
          displayName: user.displayName,
          platformAdmin: user.platformRole === "platform_admin",
          emailVerified: !!user.emailVerifiedAt,
          sessionId: session.id,
          organizationId: chosen?.organizationId ?? null,
          organizationType: chosen?.organizationType ?? null,
          organizationName: chosen?.organizationName ?? null,
          accountKind: chosen?.organizationAccountKind ?? null,
          role: chosen?.role ?? null,
          permissions: new Set(chosen ? permissionsForRole(chosen.role) : []),
          memberships,
        };
        c.set("auth", auth);
      }
    }
  }
  await next();
};

/**
 * When REQUIRE_EMAIL_VERIFICATION=true, accounts with an unverified address can only use /auth/* (to verify,
 * resend the email, sign out). Platform admins are exempt so they can never be locked out of support.
 */
export const enforceEmailVerification: MiddlewareHandler<Bindings> = async (c, next) => {
  const a = c.get("auth");
  if (c.env.REQUIRE_EMAIL_VERIFICATION === "true" && a && !a.emailVerified && !a.platformAdmin && !c.req.path.includes("/api/v1/auth/")) {
    throw new AppError("forbidden", "Please verify your email address to continue.", { reason: "email_not_verified" });
  }
  await next();
};

export function getAuth(c: AppContext): AuthContext {
  const a = c.get("auth");
  if (!a) throw new AppError("unauthenticated", "Please sign in to continue");
  return a;
}

/** Authenticated AND acting inside an active organisation. Returns the verified context. */
export function getTenant(c: AppContext): AuthContext & { organizationId: string; accountKind: NonNullable<AuthContext["accountKind"]>; role: NonNullable<AuthContext["role"]> } {
  const a = getAuth(c);
  if (!a.organizationId || !a.role) throw new AppError("forbidden", "No active organisation for this account");
  const m = a.memberships.find((x) => x.organizationId === a.organizationId);
  if (m?.organizationStatus === "suspended") throw new AppError("forbidden", "This organisation is suspended");
  return a as AuthContext & { organizationId: string; accountKind: NonNullable<AuthContext["accountKind"]>; role: NonNullable<AuthContext["role"]> };
}

/** Authenticated inside a personal workspace. Business workspaces are rejected even when they hold every permission. */
export function getTraveler(c: AppContext): AuthContext & { organizationId: string; accountKind: "individual"; role: NonNullable<AuthContext["role"]> } {
  const t = getTenant(c);
  if (t.accountKind !== "individual") throw new AppError("forbidden", "This area is for personal trip planning");
  return t as AuthContext & { organizationId: string; accountKind: "individual"; role: NonNullable<AuthContext["role"]> };
}

/** Operator-only tenant surface (customers, quotations and other commercial workflows). */
export function getBusiness(c: AppContext): AuthContext & { organizationId: string; accountKind: "business"; role: NonNullable<AuthContext["role"]> } {
  const t = getTenant(c);
  if (t.accountKind === "individual") throw new AppError("forbidden", "This area is not available in a personal trip workspace");
  return t as AuthContext & { organizationId: string; accountKind: "business"; role: NonNullable<AuthContext["role"]> };
}

export const requireAuth: MiddlewareHandler<Bindings> = async (c, next) => {
  getAuth(c);
  await next();
};
export const requireTenant: MiddlewareHandler<Bindings> = async (c, next) => {
  getTenant(c);
  await next();
};
export const requireTraveler: MiddlewareHandler<Bindings> = async (c, next) => {
  getTraveler(c);
  await next();
};
export const requireBusiness: MiddlewareHandler<Bindings> = async (c, next) => {
  getBusiness(c);
  await next();
};
export function requirePermission(...perms: Permission[]): MiddlewareHandler<Bindings> {
  return async (c, next) => {
    const a = getTenant(c);
    for (const p of perms) if (!a.permissions.has(p)) throw new AppError("forbidden", "You do not have permission to perform this action", { required: p });
    await next();
  };
}
export const requirePlatformAdmin: MiddlewareHandler<Bindings> = async (c, next) => {
  const a = getAuth(c);
  if (!a.platformAdmin) throw new AppError("forbidden", "Platform administrator access required");
  await next();
};

export function can(c: AppContext, perm: Permission): boolean {
  return getTenant(c).permissions.has(perm);
}

export function rateLimit(opts: { name: string; limit: number; windowSeconds: number; by?: "ip" | "user" | "ip+body-email" }): MiddlewareHandler<Bindings> {
  return async (c, next) => {
    const auth = c.get("auth");
    let who = clientIp(c);
    if (opts.by === "user" && auth) who = auth.userId;
    const r = await ops.hitRateLimit(c.get("db"), `${opts.name}:${who}`, opts.limit, opts.windowSeconds, c.get("deps").now().getTime());
    c.header("x-ratelimit-remaining", String(r.remaining));
    if (!r.allowed) throw new AppError("rate_limited", "Too many requests. Please slow down and try again shortly.", { retryAfterSeconds: r.retryAfterSeconds });
    await next();
  };
}

export async function audit(c: AppContext, action: string, resourceType: string, resourceId: string | null, metadata?: Record<string, unknown>): Promise<void> {
  const a = c.get("auth");
  await ops.writeAudit(c.get("db"), { organizationId: a?.organizationId ?? null, actorUserId: a?.userId ?? null, action, resourceType, resourceId, metadata, requestId: c.get("requestId") });
}
