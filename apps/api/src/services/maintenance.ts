import { ops, quotes, trips, type Db } from "@tripweave/database";
import type { Env, JobMessage } from "../env";
import { log } from "../middleware/core";

/** Hourly housekeeping: expire overdue quotations, fail hung jobs, purge old counters. */
export async function hourlyMaintenance(env: Env, now = new Date()): Promise<Record<string, number>> {
  const db = env.DB as unknown as Db;
  const expired = await quotes.expireOverdueQuotes(db, now.toISOString().slice(0, 10));
  for (const id of expired) log("info", "quote_expired", { quoteId: id });

  // Jobs stuck "running" for >20 minutes have lost their worker: fail them with a clear message.
  let failedJobs = 0;
  for (const job of await trips.staleRunningJobs(db, 20)) {
    if (job.status === "running") {
      await trips.finishJob(db, job.id, { status: "failed", errorCode: "timeout", errorSummary: "The optimisation did not finish in time. Please try again." });
      failedJobs++;
    } else if (job.status === "queued" && env.JOBS) {
      // Re-dispatch jobs that were never picked up (lost message); the claim step makes this idempotent.
      await env.JOBS.send({ type: "optimise", jobId: job.id, organizationId: job.organizationId } satisfies JobMessage);
    }
  }
  const purged = await ops.purgeRateLimits(db);
  return { expiredQuotes: expired.length, failedJobs, purgedRateLimits: purged };
}

/** Daily: flag agreements that ended, and warn about contracts ending within 30 days. */
export async function dailyMaintenance(env: Env, now = new Date()): Promise<Record<string, number>> {
  const db = env.DB as unknown as Db;
  const today = now.toISOString().slice(0, 10);
  const marked = await db.prepare("UPDATE supplier_agreements SET status = 'expired', updated_at = ? WHERE status = 'active' AND effective_to < ?").bind(now.toISOString(), today).run();
  const soon = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.prepare("SELECT organization_id, contract_reference, effective_to FROM supplier_agreements WHERE status = 'active' AND effective_to <= ? AND effective_to >= ?").bind(soon, today).all<{ organization_id: string; contract_reference: string; effective_to: string }>();
  let warned = 0;
  for (const r of rows.results ?? []) {
    const title = `Agreement ${r.contract_reference} ends ${r.effective_to}`;
    const dup = await db.prepare("SELECT 1 AS x FROM notifications WHERE organization_id = ? AND kind = 'agreement_expiring' AND title = ?").bind(r.organization_id, title).first();
    if (!dup) {
      await ops.addNotification(db, { organizationId: r.organization_id, kind: "agreement_expiring", title, body: "Review or renew this supplier agreement to keep its rates usable.", link: "/hotels/agreements" });
      warned++;
    }
  }
  return { expiredAgreements: marked.meta?.changes ?? 0, warnings: warned };
}
