import { ops, type Db } from "@tripweave/database";
import type { Deps, Env } from "../env";
import { log } from "../middleware/core";

export interface OutgoingEmail {
  organizationId: string | null;
  to: string;
  subject: string;
  body: string;
}

/**
 * Every email is recorded in the outbox (auditable). It is delivered through an external API only
 * when EMAIL_PROVIDER=resend and credentials are configured; otherwise it stays `pending`, which is
 * the intended behaviour for local development.
 */
export async function sendEmail(env: Env, db: Db, deps: Deps, mail: OutgoingEmail): Promise<{ id: string; delivered: boolean }> {
  const id = await ops.enqueueEmail(db, mail);
  if (env.EMAIL_PROVIDER !== "resend" || !env.EMAIL_PROVIDER_API_KEY || !env.EMAIL_FROM_ADDRESS) {
    if (env.ENVIRONMENT === "development") log("info", "email_outbox", { to: mail.to, subject: mail.subject });
    return { id, delivered: false };
  }
  try {
    const res = await deps.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.EMAIL_PROVIDER_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM_ADDRESS, to: [mail.to], subject: mail.subject, text: mail.body }),
    });
    if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    await ops.markEmail(db, id, "sent", { messageId: body.id });
    return { id, delivered: true };
  } catch (e) {
    await ops.markEmail(db, id, "failed", { error: (e as Error).message.slice(0, 200) });
    log("warn", "email_failed", { id, error: (e as Error).message.slice(0, 200) });
    return { id, delivered: false };
  }
}

/** Verifies a Cloudflare Turnstile token when a secret is configured (no-op otherwise). */
export async function verifyTurnstile(env: Env, deps: Deps, token: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  try {
    const res = await deps.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}
