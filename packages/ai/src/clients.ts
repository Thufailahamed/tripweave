import type { LlmClient } from "./parse";

/** Minimal Workers AI binding surface (env.AI). */
export interface AiBinding {
  run(model: string, input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export class WorkersAiClient implements LlmClient {
  readonly engine = "workers_ai" as const;
  constructor(private readonly ai: AiBinding, readonly model: string = DEFAULT_WORKERS_AI_MODEL) {}

  async extract(args: { system: string; user: string; schema: object; signal: AbortSignal }): Promise<unknown> {
    const run = this.ai.run(this.model, {
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      response_format: { type: "json_schema", json_schema: args.schema },
      max_tokens: 1_200,
      temperature: 0,
    });
    const result = await raceAbort(run, args.signal);
    const r = result as { response?: unknown } | null;
    return r && typeof r === "object" && "response" in r ? r.response : result;
  }
}

export interface ExternalLlmConfig {
  apiKey: string;
  model: string;
  /** OpenAI-compatible base URL, e.g. https://api.example.com/v1 */
  baseUrl: string;
  fetch?: typeof fetch;
}

/** Optional external provider, used only when explicitly configured. */
export class ExternalLlmClient implements LlmClient {
  readonly engine = "external_llm" as const;
  readonly model: string;
  constructor(private readonly cfg: ExternalLlmConfig) {
    this.model = cfg.model;
  }
  async extract(args: { system: string; user: string; schema: object; signal: AbortSignal }): Promise<unknown> {
    const f = this.cfg.fetch ?? fetch;
    const res = await f(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: args.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({
        model: this.cfg.model,
        temperature: 0,
        max_tokens: 1_200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${args.system}\nJSON schema: ${JSON.stringify(args.schema)}` },
          { role: "user", content: args.user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM provider returned ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM provider returned no content");
    return content;
  }
}

function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
