"use client";
import { apiGet, apiPost } from "@/lib/api";
import { errorFromResponse, sseFrames } from "@/lib/sse";
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
  /** The server discarded the streamed draft and is repairing it; clear what was shown. */
  onReset: () => void;
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
  for await (const frame of sseFrames(response)) {
    if (frame.event === "meta") args.onMeta(frame.data as PlanningContextResponse & { fallbackAvailable?: boolean });
    else if (frame.event === "delta") args.onDelta((frame.data as { text?: string }).text ?? "");
    else if (frame.event === "reset") args.onReset();
    else if (frame.event === "done") args.onDone(frame.data as PlanningDone);
  }
}
