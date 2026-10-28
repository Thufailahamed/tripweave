import { ApiError } from "@/lib/api";

/**
 * Server-sent events for generated-interface streams (planner and package presentation). Frames are
 * parsed as they arrive so progressive rendering shows each chunk without waiting for the end.
 */
export interface SseFrame {
  event: string;
  data: unknown;
}

export async function* sseFrames(response: Response): AsyncGenerator<SseFrame> {
  if (!response.body) throw new Error("The server returned no stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let match = /\r?\n\r?\n/.exec(buffer);
      while (match) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const frame = parseFrame(block);
        if (frame) yield frame;
        match = /\r?\n\r?\n/.exec(buffer);
      }
    }
    buffer += decoder.decode();
    const frame = parseFrame(buffer);
    if (frame) yield frame;
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(block: string): SseFrame | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  const text = data.join("\n");
  if (!text) return null;
  try {
    return { event, data: JSON.parse(text) };
  } catch {
    return null;
  }
}

export async function errorFromResponse(response: Response): Promise<never> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } };
    throw new ApiError(response.status, body.error?.code ?? "error", body.error?.message ?? `Request failed (${response.status})`, body.error?.details, body.error?.requestId);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(response.status, "error", `Request failed (${response.status})`);
  }
}

