"use client";
import { apiGet } from "@/lib/api";
import { errorFromResponse, sseFrames } from "@/lib/sse";
import type { PackageShowcaseSnapshot } from "@tripweave/planning-contract";

export interface PackagePresentationDone {
  program: string;
  engine: string;
  model: string | null;
  usedFallback: boolean;
  reason?: string;
  warnings: string[];
  validationErrors?: string[];
}

/** The current snapshot without generation; used after a live price check to refresh every value. */
export function fetchPackageSnapshot(tripId: string, jobId: string | null, signal?: AbortSignal): Promise<{ snapshot: PackageShowcaseSnapshot }> {
  return apiGet<{ snapshot: PackageShowcaseSnapshot }>(`/trips/${tripId}/packages/presentation`, jobId ? { jobId } : undefined, signal);
}

/**
 * Streams one presentation. Resolves when the stream closes; `onDone` is the only signal that the program
 * is final, so the caller can tell a finished reply from a dropped connection.
 */
export async function streamPackagePresentation(args: {
  tripId: string;
  jobId: string | null;
  focus: string;
  signal: AbortSignal;
  onMeta: (snapshot: PackageShowcaseSnapshot) => void;
  onDelta: (text: string) => void;
  /** The server discarded the draft and is repairing it; clear what was shown. */
  onReset: () => void;
  onDone: (done: PackagePresentationDone) => void;
}): Promise<void> {
  const response = await fetch(`/api/v1/trips/${args.tripId}/packages/presentation`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "text/event-stream", "content-type": "application/json", "x-requested-with": "tripweave" },
    body: JSON.stringify({ ...(args.jobId ? { jobId: args.jobId } : {}), ...(args.focus ? { focus: args.focus } : {}) }),
    signal: args.signal,
  });
  if (!response.ok) await errorFromResponse(response);
  for await (const frame of sseFrames(response)) {
    if (frame.event === "meta") args.onMeta((frame.data as { snapshot: PackageShowcaseSnapshot }).snapshot);
    else if (frame.event === "delta") args.onDelta((frame.data as { text?: string }).text ?? "");
    else if (frame.event === "reset") args.onReset();
    else if (frame.event === "done") args.onDone(frame.data as PackagePresentationDone);
  }
}
