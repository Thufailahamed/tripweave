import type { LlmClient } from "./parse";

/** Minimal Workers AI binding surface (env.AI). */
export interface AiBinding {
  run(model: string, input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface LlmTextArgs {
  system: string;
  user: string;
  signal: AbortSignal;
  maxTokens?: number;
}

export const DEFAULT_WORKERS_AI_MODEL = "@cf/google/gemma-4-26b-a4b-it";

export class WorkersAiClient implements LlmClient {
  readonly engine = "workers_ai" as const;
  constructor(
    private readonly ai: AiBinding,
    readonly model: string = DEFAULT_WORKERS_AI_MODEL,
    private readonly gatewayId?: string,
  ) {}

  private gatewayOptions(): Record<string, unknown> | undefined {
    return this.gatewayId ? { gateway: { id: this.gatewayId } } : undefined;
  }

  /** Gemma 4 supports optional thinking tokens; the planner needs direct OpenUI Lang, so keep it concise. */
  private thinkingOptions(): Record<string, unknown> {
    return this.model.includes("gemma-4") ? { chat_template_kwargs: { enable_thinking: false } } : {};
  }

  async extract(args: { system: string; user: string; schema: object; signal: AbortSignal }): Promise<unknown> {
    const run = this.ai.run(
      this.model,
      {
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
        response_format: { type: "json_schema", json_schema: args.schema },
        max_tokens: 1_200,
        temperature: 0,
        ...this.thinkingOptions(),
      },
      this.gatewayOptions(),
    );
    const result = await raceAbort(run, args.signal);
    const r = result as { response?: unknown } | null;
    return r && typeof r === "object" && "response" in r ? r.response : result;
  }

  async generate(args: LlmTextArgs): Promise<string> {
    const run = this.ai.run(
      this.model,
      {
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
        max_tokens: args.maxTokens ?? 2_000,
        temperature: 0,
        ...this.thinkingOptions(),
      },
      this.gatewayOptions(),
    );
    const result = await raceAbort(run, args.signal);
    const r = result as { response?: unknown } | null;
    const response = r && typeof r === "object" && "response" in r ? r.response : result;
    if (typeof response === "string") return response;
    if (response && typeof response === "object") return JSON.stringify(response);
    throw new Error("Workers AI returned no text");
  }

  async *stream(args: LlmTextArgs): AsyncIterable<string> {
    const result = await raceAbort(
      this.ai.run(
        this.model,
        {
          messages: [
            { role: "system", content: args.system },
            { role: "user", content: args.user },
          ],
          stream: true,
          max_tokens: args.maxTokens ?? 2_000,
          temperature: 0,
          ...this.thinkingOptions(),
        },
        this.gatewayOptions(),
      ),
      args.signal,
    );
    if (!(result instanceof ReadableStream)) throw new Error("Workers AI did not return a stream");
    for await (const data of sseData(result, args.signal)) {
      const text = workersAiText(data);
      if (text === null) return;
      if (text) yield text;
    }
  }
}


export interface ExternalLlmConfig {
  apiKey: string;
  model: string;
  /** OpenAI-compatible base URL, e.g. https://api.example.com/v1 */
  baseUrl: string;
  /** Optional AI Gateway name; sent as cf-aig-gateway-id for Cloudflare's OpenAI-compatible endpoint. */
  gatewayId?: string;
  fetch?: typeof fetch;
}

/** Optional external provider, used only when explicitly configured. */
export class ExternalLlmClient implements LlmClient {
  readonly engine = "external_llm" as const;
  readonly model: string;
  constructor(private readonly cfg: ExternalLlmConfig) {
    this.model = cfg.model;
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.cfg.apiKey}`,
      ...(this.cfg.gatewayId ? { "cf-aig-gateway-id": this.cfg.gatewayId } : {}),
    };
  }
  async extract(args: { system: string; user: string; schema: object; signal: AbortSignal }): Promise<unknown> {
    const f = this.cfg.fetch ?? fetch;
    const res = await f(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: args.signal,
      headers: this.headers(),
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

  async generate(args: LlmTextArgs): Promise<string> {
    const f = this.cfg.fetch ?? fetch;
    const res = await f(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: args.signal,
      headers: this.headers(),
      body: JSON.stringify({
        model: this.cfg.model,
        temperature: 0,
        max_tokens: args.maxTokens ?? 2_000,
        messages: [
          { role: "system", content: args.system },
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

  async *stream(args: LlmTextArgs): AsyncIterable<string> {
    const f = this.cfg.fetch ?? fetch;
    const res = await f(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: args.signal,
      headers: this.headers(),
      body: JSON.stringify({
        model: this.cfg.model,
        temperature: 0,
        max_tokens: args.maxTokens ?? 2_000,
        stream: true,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM provider returned ${res.status}`);
    if (!res.body) throw new Error("LLM provider returned no stream");
    for await (const data of sseData(res.body, args.signal)) {
      const text = openAiText(data);
      if (text === null) return;
      if (text) yield text;
    }
  }
}

function workersAiText(data: string): string | null {
  if (data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data) as {
      response?: unknown;
      text?: unknown;
      choices?: { delta?: { content?: string | null }; message?: { content?: string | null } }[];
    };
    if (typeof parsed.response === "string") return parsed.response;
    if (typeof parsed.text === "string") return parsed.text;
    const content = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    return "";
  } catch {
    return data;
  }
}

function openAiText(data: string): string | null {
  if (data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data) as {
      choices?: { delta?: { content?: string | null }; message?: { content?: string | null } }[];
    };
    return parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? "";
  } catch {
    return data;
  }
}

/** Reads SSE `data:` frames from a byte stream, retaining a partial line between chunks. */
export async function* sseData(stream: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const onAbort = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", onAbort, { once: true });
  let buffer = "";
  try {
    while (true) {
      if (signal.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) yield line.slice(5).trimStart();
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().startsWith("data:")) yield buffer.trim().slice(5).trimStart();
    if (signal.aborted) throw abortError();
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function abortError(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}


function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
