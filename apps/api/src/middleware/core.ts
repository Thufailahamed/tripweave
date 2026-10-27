import type { ErrorHandler, MiddlewareHandler } from "hono";
import { ZodError } from "zod";
import { AppError } from "@tripweave/shared";
import type { Env, Vars, Deps } from "../env";
import { validationError } from "../lib/http";

type Bindings = { Bindings: Env; Variables: Vars };

export function log(level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}): void {
  // Structured, single-line JSON. Never pass request bodies, tokens or credentials here.
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Request ID, DB handle, injected collaborators, structured access log and security headers. */
export function requestContext(makeDeps: (scheduler: (p: Promise<unknown>) => void) => Deps): MiddlewareHandler<Bindings> {
  return async (c, next) => {
    const requestId = c.req.header("x-request-id")?.slice(0, 64) || crypto.randomUUID();
    c.set("requestId", requestId);
    c.set("db", c.env.DB as unknown as Vars["db"]);
    c.set(
      "deps",
      makeDeps((p) => {
        try {
          c.executionCtx.waitUntil(p);
        } catch {
          void p; // no execution context (tests/local): the promise simply runs to completion
        }
      }),
    );
    c.set("auth", null);
    const started = Date.now();
    await next();
    c.res.headers.set("x-request-id", requestId);
    c.res.headers.set("x-content-type-options", "nosniff");
    c.res.headers.set("referrer-policy", "no-referrer");
    c.res.headers.set("x-frame-options", "DENY");
    if (!c.res.headers.has("cache-control")) c.res.headers.set("cache-control", "no-store");
    if (c.env.COOKIE_SECURE === "true") c.res.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
    const auth = c.get("auth");
    log("info", "request", {
      requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      ms: Date.now() - started,
      userId: auth?.userId,
      organizationId: auth?.organizationId,
    });
  };
}

/**
 * CSRF defence for cookie-authenticated APIs: unsafe methods must carry a custom header (which
 * cross-site forms cannot set and cross-origin scripts cannot send without a CORS preflight, which
 * this API never grants) and, when present, an Origin that matches the app.
 */
export const csrfGuard: MiddlewareHandler<Bindings> = async (c, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) return next();
  if (c.req.header("x-requested-with") !== "tripweave") throw new AppError("forbidden", "Missing CSRF header");
  const origin = c.req.header("origin");
  if (origin) {
    const allowed = new URL(c.env.APP_BASE_URL).origin;
    const selfOrigin = new URL(c.req.url).origin;
    if (origin !== allowed && origin !== selfOrigin && !(c.env.ENVIRONMENT === "development" && /^https?:\/\/localhost(:\d+)?$/.test(origin)))
      throw new AppError("forbidden", "Cross-origin request rejected");
  }
  return next();
};

export const errorHandler: ErrorHandler<Bindings> = (err, c) => {
  const requestId = c.get("requestId");
  let appError: AppError;
  if (err instanceof AppError) appError = err;
  else if (err instanceof ZodError) appError = validationError(err);
  else if (/D1_ERROR|SQLITE|UNIQUE constraint|FOREIGN KEY/i.test(String(err?.message ?? err))) {
    const m = String(err.message ?? err);
    if (/UNIQUE/i.test(m)) appError = new AppError("conflict", "A record with these details already exists");
    else if (/FOREIGN KEY/i.test(m)) appError = new AppError("conflict", "The record references data that does not exist or is still in use");
    else appError = new AppError("internal_error", "A database error occurred");
    if (appError.code === "internal_error") log("error", "database_error", { requestId, error: m.slice(0, 300) });
  } else {
    log("error", "unhandled_error", { requestId, error: String((err as Error)?.message ?? err).slice(0, 300), stack: env(c) === "production" ? undefined : (err as Error)?.stack?.split("\n").slice(0, 4) });
    appError = new AppError("internal_error", "Something went wrong. Please try again.");
  }
  if (appError.status === 429) c.header("retry-after", String((appError.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 60));
  return c.json({ error: { code: appError.code, message: appError.message, details: appError.details, requestId } }, appError.status as 400);
};

const env = (c: { env: Env }) => c.env.ENVIRONMENT;

export const notFoundHandler = (c: Parameters<ErrorHandler<Bindings>>[1]) =>
  c.json({ error: { code: "not_found", message: "Route not found", requestId: c.get("requestId") } }, 404);
