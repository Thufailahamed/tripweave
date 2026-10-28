import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { PlanningUnavailableError, streamPackageShowcaseProgram } from "@tripweave/ai";
import { PACKAGE_SHOWCASE_COMPONENT_NAMES } from "@tripweave/planning-contract";
import { ops } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { ok, parseBody, requireParam } from "../lib/http";
import { audit, rateLimit, requirePermission, requireTenant } from "../middleware/auth";
import { loadIntegrations } from "../services/settings";
import { buildPackageFallbackProgram, buildPackageShowcaseSnapshot, validatePackageShowcaseProgram } from "../services/package-showcase";

export const packageShowcaseRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
packageShowcaseRoutes.use("*", requireTenant);

const presentationSchema = z.object({
  /** Defaults to the latest run that produced packages. */
  jobId: z.string().trim().min(1).max(64).optional(),
  /** Optional reader focus. Control characters are refused; the text is still treated as data. */
  focus: z
    .string()
    .trim()
    .max(300)
    .regex(/^[^\u0000-\u001f\u007f]*$/, "Control characters are not allowed")
    .optional(),
});

/** Overall budget for one presentation, covering the first attempt and its single repair. */
const PRESENTATION_TIMEOUT_MS = 60_000;
/** One generation plus one repair. A second failure falls back to the standard presentation. */
const MAX_ATTEMPTS = 2;

/**
 * The current presentation snapshot without any generation. The browser refreshes it after a live price
 * check, so generated blocks keep their layout while every value they show is updated.
 */
packageShowcaseRoutes.get("/trips/:id/packages/presentation", requirePermission("trips:read"), async (c) => {
  const id = requireParam(c, "id");
  const jobId = c.req.query("jobId") || null;
  const snapshot = await buildPackageShowcaseSnapshot(c, id, jobId);
  c.header("cache-control", "no-store");
  return ok(c, { snapshot, allowlist: PACKAGE_SHOWCASE_COMPONENT_NAMES });
});

/**
 * Composes the packages page from one optimisation run. The snapshot is sent first, so the browser can
 * resolve refs while OpenUI Lang streams. A failed validation resets the draft and retries once with
 * the problems attached. `done.program` is always the program the browser should settle on, and it is
 * the deterministic presentation whenever generation is unavailable or still invalid.
 */
packageShowcaseRoutes.post(
  "/trips/:id/packages/presentation",
  requirePermission("trips:read"),
  rateLimit({ name: "package-presentation", limit: 30, windowSeconds: 3_600, by: "user" }),
  async (c) => {
    const id = requireParam(c, "id");
    const body = await parseBody(c, presentationSchema);
    const started = Date.now();
    const snapshot = await buildPackageShowcaseSnapshot(c, id, body.jobId ?? null);
    const organizationId = c.get("auth")!.organizationId!;
    const integrations = await loadIntegrations(c.get("db"), organizationId);
    const llm = integrations.aiEngine === "rules" ? null : c.get("deps").buildLlm(c.env);
    const available = !!llm && (!!llm.stream || !!llm.generate);
    const focus = body.focus ?? "";

    c.header("x-accel-buffering", "no");
    const response = streamSSE(c, async (stream) => {
      const controller = new AbortController();
      let clientAborted = false;
      stream.onAbort(() => {
        clientAborted = true;
        controller.abort();
      });
      const timedOut = { value: false };
      const timer = setTimeout(() => {
        timedOut.value = true;
        controller.abort();
      }, PRESENTATION_TIMEOUT_MS);
      const write = async (event: string, data: unknown) => {
        if (clientAborted) return false;
        try {
          await stream.writeSSE({ event, data: JSON.stringify(data) });
          return true;
        } catch {
          clientAborted = true;
          return false;
        }
      };
      const record = (engine: string, model: string | null, outputChars: number, status: "ok" | "fallback") =>
        ops.recordAiUsage(c.get("db"), { organizationId, operation: "package_presentation", engine, model, inputChars: focus.length, outputChars, latencyMs: Date.now() - started, status });
      const settle = async (program: string, reason: string | undefined, engine: string, model: string | null, attempts: number, warnings: string[], validationErrors?: string[]) => {
        await write("done", { program, engine, model, usedFallback: reason !== undefined, ...(reason ? { reason } : {}), attempts, warnings, ...(validationErrors ? { validationErrors } : {}) });
      };
      let attempts = 0;
      try {
        const metaSent = await write("meta", { snapshot, allowlist: PACKAGE_SHOWCASE_COMPONENT_NAMES, engineAvailable: available, fallbackAvailable: true });
        if (!metaSent) return;
        if (!available) {
          const program = buildPackageFallbackProgram(snapshot, "unavailable");
          await write("delta", { text: program });
          await settle(program, "unavailable", "rules", null, 0, ["AI composition is not configured, so a standard presentation is shown."]);
          await record("rules", null, program.length, "fallback");
          return;
        }

        let repair: { previousReply: string; problems: string[] } | undefined;
        let outputChars = 0;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          attempts = attempt;
          if (attempt > 1 && !(await write("reset", { attempt, reason: "repair" }))) return;
          let text = "";
          try {
            const result = await streamPackageShowcaseProgram(llm, snapshot, { focus, repair }, (chunk) => void write("delta", { text: chunk }), controller.signal);
            text = result.text;
            outputChars += text.length;
            const validation = validatePackageShowcaseProgram(text, snapshot);
            if (validation.ok) {
              await settle(text, undefined, result.engine, result.model, attempts, result.warnings);
              await record(result.engine, result.model, outputChars, "ok");
              await audit(c, "trip.package_presentation", "trip", id, { engine: result.engine, fallback: false, attempts });
              return;
            }
            repair = { previousReply: text, problems: validation.errors.slice(0, 5) };
            if (attempt === MAX_ATTEMPTS) {
              const program = buildPackageFallbackProgram(snapshot, "invalid");
              await settle(program, "invalid", result.engine, result.model, attempts, ["The generated presentation did not pass validation, so a standard presentation is shown."], repair.problems);
              await record(result.engine, result.model, outputChars, "fallback");
              await audit(c, "trip.package_presentation", "trip", id, { engine: result.engine, fallback: true, attempts });
              return;
            }
          } catch (error) {
            if (clientAborted) return;
            const timedOutNow = timedOut.value;
            const message = error instanceof PlanningUnavailableError ? "AI composition is not configured." : timedOutNow ? "AI composition timed out." : "AI composition failed.";
            await settle(buildPackageFallbackProgram(snapshot, "unavailable"), timedOutNow ? "timeout" : "error", "rules", null, attempts, [`${message} A standard presentation is shown.`]);
            await record(llm?.engine ?? "rules", llm?.model ?? null, outputChars + text.length, "fallback");
            await audit(c, "trip.package_presentation", "trip", id, { engine: llm?.engine ?? "rules", fallback: true, attempts });
            return;
          }
        }
      } finally {
        clearTimeout(timer);
      }
    });
    // no-transform stops compressing proxies from buffering the stream until it ends.
    response.headers.set("cache-control", "no-store, no-transform");
    return response;
  },
);
