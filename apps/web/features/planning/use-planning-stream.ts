"use client";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { PlanningSnapshot, PlanningStarter } from "@tripweave/planning-contract";

export interface PlanningContextResponse {
  snapshot: PlanningSnapshot;
  starters: PlanningStarter[];
  allowlist: string[];
  engineAvailable: boolean;
}

export interface PlanningDone {
  program: string;
  engine: string;
  model: string | null;
  usedFallback: boolean;
  reason?: string;
  warnings: string[];
  validationErrors?: string[];
}

interface SseFrame {
  event: string;
  data: unknown;
}

async function* frames(response: Response): AsyncGenerator<SseFrame> {
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

async function errorFromResponse(response: Response): Promise<never> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } };
    throw new ApiError(response.status, body.error?.code ?? "error", body.error?.message ?? `Request failed (${response.status})`, body.error?.details, body.error?.requestId);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(response.status, "error", `Request failed (${response.status})`);
  }
}

export function fetchPlanningContext(tripId: string, signal?: AbortSignal): Promise<PlanningContextResponse> {
  return apiGet<PlanningContextResponse>(`/trips/${tripId}/planning`, undefined, signal);
}

export function applyClarificationAnswers(tripId: string, answers: { questionId: string; value: unknown }[]): Promise<{ applied: string[]; snapshot: PlanningSnapshot; warnings: string[] }> {
  return apiPost(`/trips/${tripId}/planning/clarifications`, { answers });
}

export async function streamPlanningTurn(args: {
  tripId: string;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
  onMeta: (meta: PlanningContextResponse & { fallbackAvailable?: boolean }) => void;
  onDelta: (text: string) => void;
  onDone: (done: PlanningDone) => void;
}): Promise<void> {
  const response = await fetch(`/api/v1/trips/${args.tripId}/planning`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "text/event-stream", "content-type": "application/json", "x-requested-with": "tripweave" },
    body: JSON.stringify({ message: args.message, history: args.history.slice(-10) }),
    signal: args.signal,
  });
  if (!response.ok) await errorFromResponse(response);
  for await (const frame of frames(response)) {
    if (frame.event === "meta") args.onMeta(frame.data as PlanningContextResponse & { fallbackAvailable?: boolean });
    else if (frame.event === "delta") args.onDelta((frame.data as { text?: string }).text ?? "");
    else if (frame.event === "done") args.onDone(frame.data as PlanningDone);
  }
}
