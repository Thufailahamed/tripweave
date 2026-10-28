import { describe, expect, it, vi } from "vitest";
import { ExternalLlmClient, WorkersAiClient } from "./clients";

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

describe("AI Gateway routing", () => {
  it("passes the AI Gateway id to Workers AI for extract, generate and stream", async () => {
    const run = vi.fn(async (_model: string, input: Record<string, unknown>, _options?: Record<string, unknown>) => {
      if (input.stream) return streamOf('data: {"response":"streamed"}\n\ndata: [DONE]\n\n');
      return { response: "generated" };
    });
    const client = new WorkersAiClient({ run }, "test-model", "default");
    const signal = new AbortController().signal;
    expect(await client.extract({ system: "s", user: "u", schema: {}, signal })).toBe("generated");
    expect(await client.generate({ system: "s", user: "u", signal })).toBe("generated");
    const chunks: string[] = [];
    for await (const chunk of client.stream({ system: "s", user: "u", signal })) chunks.push(chunk);
    expect(chunks.join("")).toBe("streamed");
    expect(run).toHaveBeenCalledTimes(3);
    for (const call of run.mock.calls) expect(call[2]).toEqual({ gateway: { id: "default" } });
  });

  it("omits the gateway option when no gateway is configured", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>, _options?: Record<string, unknown>) => ({ response: "ok" }));
    const client = new WorkersAiClient({ run }, "test-model");
    await client.extract({ system: "s", user: "u", schema: {}, signal: new AbortController().signal });
    expect(run.mock.calls[0]?.[2]).toBeUndefined();
  });

  it("disables Gemma 4 thinking tokens so the reply is direct OpenUI Lang", async () => {
    let input: Record<string, unknown> | undefined;
    const run = vi.fn(async (_model: string, value: Record<string, unknown>, _options?: Record<string, unknown>) => {
      input = value;
      return streamOf('data: {"response":"root"}\n\ndata: [DONE]\n\n');
    });
    const client = new WorkersAiClient({ run }, "@cf/google/gemma-4-26b-a4b-it", "default");
    const chunks: string[] = [];
    for await (const chunk of client.stream({ system: "s", user: "u", signal: new AbortController().signal })) chunks.push(chunk);
    expect(input?.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(chunks.join("")).toBe("root");
  });

  it("parses OpenAI-style Workers AI chunks used by newer models", async () => {
    let input: Record<string, unknown> | undefined;
    const run = vi.fn(async (_model: string, value: Record<string, unknown>, _options?: Record<string, unknown>) => {
      input = value;
      return streamOf('data: {"choices":[{"delta":{"content":"root"}}]}\n\ndata: [DONE]\n\n');
    });
    const client = new WorkersAiClient({ run }, "@cf/google/gemma-4-26b-a4b-it", "default");
    const chunks: string[] = [];
    for await (const chunk of client.stream({ system: "s", user: "u", signal: new AbortController().signal })) chunks.push(chunk);
    expect(chunks.join("")).toBe("root");
    expect(input?.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("sends cf-aig-gateway-id for a Cloudflare AI Gateway OpenAI-compatible endpoint", async () => {
    let headers: Record<string, string> | undefined;
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>;
      return Response.json({ choices: [{ message: { content: "ok" } }] });
    }) as unknown as typeof globalThis.fetch;
    const client = new ExternalLlmClient({ apiKey: "token", model: "m", baseUrl: "https://ai-gateway.test/v1", gatewayId: "default", fetch });
    expect(await client.generate({ system: "s", user: "u", signal: new AbortController().signal })).toBe("ok");
    expect(headers?.["cf-aig-gateway-id"]).toBe("default");
    expect(headers?.authorization).toBe("Bearer token");
  });
});
