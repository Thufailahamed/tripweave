import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Db } from "@tripweave/database";
import type { Env, JobMessage } from "../env";
import { defaultDeps } from "../app";
import { failJob, stageFetch, stagePrepare, stageSearch } from "../services/optimisation";

/**
 * Durable execution of the optimisation pipeline. Stages talk to each other only through D1 (never
 * through step outputs), so step results stay tiny and every stage is safe to retry.
 */
export class OptimisationWorkflow extends WorkflowEntrypoint<Env, JobMessage> {
  override async run(event: WorkflowEvent<JobMessage>, step: WorkflowStep): Promise<void> {
    const { jobId } = event.payload;
    const ctx = { env: this.env, db: this.env.DB as unknown as Db, deps: defaultDeps(() => undefined) };

    const claimed = await step.do("claim-job", async () => stagePrepare(ctx, jobId));
    if (!claimed) return;
    try {
      await step.do("fetch-candidates", { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "3 minutes" }, async () => stageFetch(ctx, jobId));
      await step.do("search-and-persist", { retries: { limit: 1, delay: "5 seconds", backoff: "constant" }, timeout: "2 minutes" }, async () => stageSearch(ctx, jobId));
    } catch (e) {
      await step.do("mark-failed", async () => failJob(ctx, jobId, e));
    }
  }
}
