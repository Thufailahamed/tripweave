import type { LlmClient } from "./parse";

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

/**
 * A rewrite is "grounded" only if every number it contains also appears in the source facts and it
 * names no capitalised multi-word entity (hotel/place) that is absent from them.
 */
export function isGrounded(output: string, facts: string[]): boolean {
  const source = facts.join("\n");
  const sourceNumbers = new Set((source.match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, "")));
  for (const n of output.match(NUMBER_RE) ?? []) if (!sourceNumbers.has(n.replace(/,/g, ""))) return false;
  const lowerSource = source.toLowerCase();
  for (const m of output.matchAll(/\b([A-Z][a-z']+(?:\s+[A-Z][a-z']+)+)\b/g)) {
    if (!lowerSource.includes(m[1]!.toLowerCase())) return false;
  }
  return true;
}

export interface PolishResult {
  text: string;
  engine: "ai" | "deterministic";
}

/** Optionally rewrites deterministic explanation bullets as friendly prose, falling back if ungrounded. */
export async function polishExplanation(facts: string[], llm: LlmClient | null | undefined, timeoutMs = 8_000): Promise<PolishResult> {
  const deterministic = facts.join(" ");
  if (!llm) return { text: deterministic, engine: "deterministic" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const raw = await llm.extract({
      system: "Rewrite the FACTS as 3-5 clear sentences for a travel quotation reader. Use ONLY the facts given: do not add hotels, places, numbers, ratings or promises. Respond as JSON: {\"text\": string}.",
      user: `FACTS:\n${facts.map((f) => `- ${f}`).join("\n")}`,
      schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      signal: controller.signal,
    });
    const obj = typeof raw === "string" ? JSON.parse(raw) : (raw as { text?: unknown });
    const text = typeof obj?.text === "string" ? obj.text.trim() : "";
    if (text && text.length < 1_500 && isGrounded(text, facts)) return { text, engine: "ai" };
  } catch {
    /* fall through to deterministic text */
  } finally {
    clearTimeout(timer);
  }
  return { text: deterministic, engine: "deterministic" };
}
