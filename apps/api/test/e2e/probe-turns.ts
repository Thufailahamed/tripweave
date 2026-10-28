/**
 * Probes a running API with planning questions and reports, for every attempt the model made, the
 * validator's verdict. Used to find the mistakes a live model makes with the component library.
 * Run with: pnpm --filter @tripweave/api exec tsx test/e2e/probe-turns.ts <base> <tripId> <question>...
 */
import type { PlanningSnapshot } from "@tripweave/planning-contract";
import { requestNeedsMap } from "@tripweave/ai";
import { validatePlanningProgram } from "../../src/services/planning";

const [base = "http://localhost:8787", tripId = "", ...questions] = process.argv.slice(2);
const headers = { "content-type": "application/json", "x-requested-with": "tripweave" };
const email = process.env.PROBE_EMAIL ?? "demo@tripweave.example";
const password = process.env.PROBE_PASSWORD ?? "Demo-Passw0rd1";

const login = await fetch(`${base}/api/v1/auth/login`, { method: "POST", headers, body: JSON.stringify({ email, password }) });
const cookie = (login.headers as unknown as { getSetCookie(): string[] }).getSetCookie().map((value) => value.split(";")[0]).join("; ");
const auth = { ...headers, cookie, origin: "http://localhost:3000" };
const context = (await (await fetch(`${base}/api/v1/trips/${tripId}/planning`, { headers: auth })).json()) as { data: { snapshot: PlanningSnapshot } };
const snapshot = context.data.snapshot;

for (const question of questions) {
  const started = Date.now();
  const response = await fetch(`${base}/api/v1/trips/${tripId}/planning`, { method: "POST", headers: auth, body: JSON.stringify({ message: question, history: [] }) });
  const frames = (await response.text())
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => ({ event: /event: (\w+)/.exec(frame)?.[1], data: JSON.parse(/data: (.*)/s.exec(frame)?.[1] ?? "null") }));
  const attempts: string[] = [""];
  let done: Record<string, unknown> = {};
  for (const frame of frames) {
    if (frame.event === "delta") attempts[attempts.length - 1] += frame.data.text;
    if (frame.event === "reset") attempts.push("");
    if (frame.event === "done") done = frame.data;
  }
  console.log(`\n### ${question}  (${Date.now() - started} ms, fallback: ${done.usedFallback}, reason: ${done.reason ?? "-"})`);
  attempts.forEach((program, index) => {
    const verdict = validatePlanningProgram(program, snapshot, { requireMap: requestNeedsMap(question) });
    console.log(`  attempt ${index + 1}: ${verdict.ok ? "ok" : verdict.errors.join(" | ")}`);
    if (!verdict.ok && process.env.PROBE_VERBOSE) console.log(program.replace(/^/gm, "    "));
  });
}
