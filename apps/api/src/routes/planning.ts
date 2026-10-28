import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { planningStarters, streamPlanningProgram, PlanningGenerationError, PlanningUnavailableError } from "@tripweave/ai";
import { clarificationSubmissionSchema, PLANNING_COMPONENT_NAMES } from "@tripweave/planning-contract";
import { ops } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { ok, parseBody, requireParam, type AppContext } from "../lib/http";
import { audit, rateLimit, requirePermission, requireTenant } from "../middleware/auth";
import { loadIntegrations } from "../services/settings";
import { applyClarificationAnswers, buildFallbackProgram, buildPlanningSnapshot, validatePlanningProgram } from "../services/planning";

export const planningRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
planningRoutes.use("*", requireTenant);

const turnSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8_000) }))
    .max(12)
    .default([]),
});

function engineAvailable(c: AppContext, aiEngine: string): boolean {
  return aiEngine !== "rules" && !!c.get("deps").buildLlm(c.env);
}

planningRoutes.get("/trips/:id/planning", requirePermission("trips:read"), async (c) => {
  const id = requireParam(c, "id");
  const snapshot = await buildPlanningSnapshot(c, id);
  const integrations = await loadIntegrations(c.get("db"), c.get("auth")?.organizationId ?? "");
  c.header("cache-control", "no-store");
  return ok(c, {
    snapshot,
    starters: planningStarters(snapshot),
    allowlist: PLANNING_COMPONENT_NAMES,
    engineAvailable: engineAvailable(c, integrations.aiEngine),
  });
});

/**
 * A single planning turn. The snapshot is sent before generation so the client can render from
 * authoritative data while OpenUI Lang streams. `done.program` is always the validated program the
 * client should settle on (the deterministic fallback when generation or validation fails).
 */
planningRoutes.post("/trips/:id/planning", requirePermission("trips:read"), rateLimit({ name: "planning", limit: 40, windowSeconds: 3_600, by: "user" }), async (c) => {
  const id = requireParam(c, "id");
  const body = await parseBody(c, turnSchema);
  const started = Date.now();
  const snapshot = await buildPlanningSnapshot(c, id);
  const integrations = await loadIntegrations(c.get("db"), c.get("auth")?.organizationId ?? "");
  const llm = integrations.aiEngine === "rules" ? null : c.get("deps").buildLlm(c.env);
  const available = !!llm && (!!llm.stream || !!llm.generate);
  const starters = planningStarters(snapshot);

  c.header("cache-control", "no-store");
  c.header("x-accel-buffering", "no");
  return streamSSE(c, async (stream) => {
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
    }, 30_000);
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
    let generated = "";
    let usedFallback = false;
    try {
      const metaSent = await write("meta", {
        snapshot,
        starters,
        allowlist: PLANNING_COMPONENT_NAMES,
        engineAvailable: available,
        fallbackAvailable: true,
      });
      if (!metaSent) return;
      if (!available) {
        usedFallback = true;
        const program = buildFallbackProgram(snapshot, "unavailable");
        await write("delta", { text: program });
        await write("done", {
          program,
          engine: "rules",
          model: null,
          usedFallback: true,
          reason: "unavailable",
          warnings: ["AI generation is not configured, so a standard summary is shown."],
        });
        await ops.recordAiUsage(c.get("db"), {
          organizationId: c.get("auth")!.organizationId!,
          operation: "planning_turn",
          engine: "rules",
          model: null,
          inputChars: body.message.length + body.history.reduce((total, item) => total + item.content.length, 0),
          outputChars: program.length,
          latencyMs: Date.now() - started,
          status: "fallback",
        });
        return;
      }
      try {
        const result = await streamPlanningProgram(llm, snapshot, body, (chunk) => void write("delta", { text: chunk }), controller.signal);
        generated = result.text;
        const validation = validatePlanningProgram(result.text, snapshot);
        if (!validation.ok) {
          usedFallback = true;
          const program = buildFallbackProgram(snapshot, "invalid");
          await write("done", {
            program,
            engine: result.engine,
            model: result.model,
            usedFallback: true,
            reason: "invalid",
            warnings: ["The generated interface did not pass validation, so a standard summary is shown."],
            validationErrors: validation.errors.slice(0, 5),
          });
          await ops.recordAiUsage(c.get("db"), {
            organizationId: c.get("auth")!.organizationId!,
            operation: "planning_turn",
            engine: result.engine,
            model: result.model,
            inputChars: body.message.length,
            outputChars: result.text.length,
            latencyMs: Date.now() - started,
            status: "fallback",
          });
          return;
        }
        await write("done", {
          program: result.text,
          engine: result.engine,
          model: result.model,
          usedFallback: false,
          warnings: result.warnings,
        });
        await ops.recordAiUsage(c.get("db"), {
          organizationId: c.get("auth")!.organizationId!,
          operation: "planning_turn",
          engine: result.engine,
          model: result.model,
          inputChars: body.message.length,
          outputChars: result.text.length,
          latencyMs: Date.now() - started,
          status: "ok",
        });
      } catch (error) {
        if (clientAborted) return;
        usedFallback = true;
        const program = buildFallbackProgram(snapshot, "unavailable");
        const message =
          error instanceof PlanningUnavailableError
            ? "AI generation is not configured."
            : error instanceof PlanningGenerationError
              ? timedOut.value
                ? "AI generation timed out."
                : "AI generation failed."
              : "AI generation failed.";
        await write("done", {
          program,
          engine: "rules",
          model: null,
          usedFallback: true,
          reason: timedOut.value ? "timeout" : "error",
          warnings: [`${message} A standard summary is shown.`],
        });
        await ops.recordAiUsage(c.get("db"), {
          organizationId: c.get("auth")!.organizationId!,
          operation: "planning_turn",
          engine: llm?.engine ?? "rules",
          model: llm?.model ?? null,
          inputChars: body.message.length,
          outputChars: generated.length,
          latencyMs: Date.now() - started,
          status: "fallback",
        });
      }
    } finally {
      clearTimeout(timer);
    }
    await audit(c, "trip.planning_turn", "trip", id, { engine: llm?.engine ?? "rules", fallback: usedFallback });
  });
});

planningRoutes.post("/trips/:id/planning/clarifications", requirePermission("trips:write"), rateLimit({ name: "planning-clarify", limit: 60, windowSeconds: 3_600, by: "user" }), async (c) => {
  const id = requireParam(c, "id");
  const submission = await parseBody(c, clarificationSubmissionSchema);
  c.header("cache-control", "no-store");
  return ok(c, await applyClarificationAnswers(c, id, submission));
});
