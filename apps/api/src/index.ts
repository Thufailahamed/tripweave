import type { Db } from "@tripweave/database";
import { createApp, defaultDeps } from "./app";
import type { Env, JobMessage } from "./env";
import { log } from "./middleware/core";
import { dailyMaintenance, hourlyMaintenance } from "./services/maintenance";
import { startJob } from "./services/optimisation";

export { OptimisationWorkflow } from "./workflows/optimisation";

const app = createApp();
const MAX_ATTEMPTS = 3;

export default {
  fetch: app.fetch,

  /** Queue consumer: starts the durable workflow (or runs inline) once per job; duplicates are harmless. */
  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    const ctx = { env, db: env.DB as unknown as Db, deps: defaultDeps(() => undefined) };
    for (const msg of batch.messages) {
      try {
        const result = await startJob(ctx, msg.body, msg.attempts >= MAX_ATTEMPTS);
        if (result === "retry") msg.retry({ delaySeconds: 30 * msg.attempts });
        else msg.ack();
      } catch (e) {
        log("error", "queue_message_failed", { jobId: msg.body.jobId, attempts: msg.attempts, error: String((e as Error).message).slice(0, 200) });
        if (msg.attempts >= MAX_ATTEMPTS) msg.ack();
        else msg.retry({ delaySeconds: 30 * msg.attempts });
      }
    }
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    const result = event.cron === "30 2 * * *" ? await dailyMaintenance(env) : await hourlyMaintenance(env);
    log("info", "scheduled_complete", { cron: event.cron, ...result });
  },
} satisfies ExportedHandler<Env, JobMessage>;
