import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { planningStarters, requestNeedsMap, streamPlanningProgram, PlanningGenerationError, PlanningUnavailableError } from "@tripweave/ai";
import { clarificationSubmissionSchema, PLANNING_COMPONENT_NAMES, placeLookupRequestSchema } from "@tripweave/planning-contract";
import { ops } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { ok, parseBody, requireParam, type AppContext } from "../lib/http";
import { audit, rateLimit, requirePermission, requireTenant } from "../middleware/auth";
import { loadIntegrations } from "../services/settings";
import { lookupPlaces } from "../services/places";
import { applyClarificationAnswers, buildFallbackProgram, buildPlanningSnapshot, normalisePlanningProgram, validatePlanningProgram } from "../services/planning";

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

/** Overall budget for one turn, covering the first attempt and its single repair. */
const TURN_TIMEOUT_MS = 60_000;
/** One generation plus one repair. A second failure falls back to the standard view. */
const MAX_ATTEMPTS = 2;

/**
 * A single planning turn. The snapshot is sent before generation so the client can render from
 * authoritative data while OpenUI Lang streams. If a reply fails validation, the client receives a
 * `reset` event and one repair attempt streams with the validation problems attached. `done.program`
 * is always the validated program the client should settle on (the deterministic fallback when
 * generation or validation still fails).
 */
planningRoutes.post("/trips/:id/planning", requirePermission("trips:read"), rateLimit({ name: "planning", limit: 60, windowSeconds: 3_600, by: "user" }), async (c) => {
  const id = requireParam(c, "id");
  const body = await parseBody(c, turnSchema);
  const started = Date.now();
  const snapshot = await buildPlanningSnapshot(c, id);
  const integrations = await loadIntegrations(c.get("db"), c.get("auth")?.organizationId ?? "");
  const llm = integrations.aiEngine === "rules" ? null : c.get("deps").buildLlm(c.env);
  const available = !!llm && (!!llm.stream || !!llm.generate);
  const starters = planningStarters(snapshot);
  const organizationId = c.get("auth")!.organizationId!;
  const inputChars = body.message.length + body.history.reduce((total, item) => total + item.content.length, 0);

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
    }, TURN_TIMEOUT_MS);
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
      ops.recordAiUsage(c.get("db"), { organizationId, operation: "planning_turn", engine, model, inputChars, outputChars, latencyMs: Date.now() - started, status });
    let usedFallback = false;
    let attempts = 0;
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
          attempts: 0,
          warnings: ["AI generation is not configured, so a standard summary is shown."],
        });
        await record("rules", null, program.length, "fallback");
        return;
      }

      let repair: { previousReply: string; problems: string[] } | undefined;
      let outputChars = 0;
      const requireMap = requestNeedsMap(body.message);
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        attempts = attempt;
        if (attempt > 1 && !(await write("reset", { attempt, reason: "repair" }))) return;
        let text = "";
        try {
          const result = await streamPlanningProgram(llm, snapshot, { message: body.message, history: body.history, repair }, (chunk) => void write("delta", { text: chunk }), controller.signal);
          text = normalisePlanningProgram(result.text);
          outputChars += text.length;
          const validation = validatePlanningProgram(text, snapshot, { requireMap });
          if (validation.ok) {
            await write("done", { program: text, engine: result.engine, model: result.model, usedFallback: false, attempts, warnings: result.warnings });
            await record(result.engine, result.model, outputChars, "ok");
            await audit(c, "trip.planning_turn", "trip", id, { engine: result.engine, fallback: false, attempts });
            return;
          }
          repair = { previousReply: text, problems: validation.errors.slice(0, 5) };
          if (attempt === MAX_ATTEMPTS) {
            usedFallback = true;
            const program = buildFallbackProgram(snapshot, "invalid");
            await write("done", {
              program,
              engine: result.engine,
              model: result.model,
              usedFallback: true,
              reason: "invalid",
              attempts,
              warnings: ["The generated interface did not pass validation, so a standard summary is shown."],
              validationErrors: repair.problems,
            });
            await record(result.engine, result.model, outputChars, "fallback");
            await audit(c, "trip.planning_turn", "trip", id, { engine: result.engine, fallback: true, attempts });
            return;
          }
        } catch (error) {
          if (clientAborted) return;
          usedFallback = true;
          const timedOutNow = timedOut.value;
          const message =
            error instanceof PlanningUnavailableError
              ? "AI generation is not configured."
              : timedOutNow
                ? "AI generation timed out."
                : "AI generation failed.";
          await write("done", {
            program: buildFallbackProgram(snapshot, "unavailable"),
            engine: "rules",
            model: null,
            usedFallback: true,
            reason: timedOutNow ? "timeout" : "error",
            attempts,
            warnings: [`${message} A standard summary is shown.`],
          });
          await record(llm?.engine ?? "rules", llm?.model ?? null, outputChars + text.length, "fallback");
          await audit(c, "trip.planning_turn", "trip", id, { engine: llm?.engine ?? "rules", fallback: true, attempts });
          return;
        }
      }
    } finally {
      clearTimeout(timer);
    }
  });
  // streamSSE sets "no-cache"; no-transform also stops compressing proxies (including the Next dev
  // rewrite) from buffering the stream until it ends.
  response.headers.set("cache-control", "no-store, no-transform");
  return response;
});

/**
 * Public place reference data (article, description, photograph, coordinates) for the planner's photo
 * and map blocks. The browser sends batches of names; the API resolves each one once for all users.
 */
planningRoutes.post("/planning/places", requirePermission("trips:read"), rateLimit({ name: "place-lookup", limit: 600, windowSeconds: 3_600, by: "user" }), async (c) => {
  const body = await parseBody(c, placeLookupRequestSchema);
  const places = await lookupPlaces(c, body.names);
  c.header("cache-control", "private, max-age=600");
  return ok(c, { places });
});

planningRoutes.post("/trips/:id/planning/clarifications", requirePermission("trips:write"), rateLimit({ name: "planning-clarify", limit: 60, windowSeconds: 3_600, by: "user" }), async (c) => {
  const id = requireParam(c, "id");
  const submission = await parseBody(c, clarificationSubmissionSchema);
  c.header("cache-control", "no-store");
  return ok(c, await applyClarificationAnswers(c, id, submission));
});
