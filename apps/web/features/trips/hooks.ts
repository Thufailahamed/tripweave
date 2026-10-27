"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiList } from "@/lib/api";
import type { ItineraryView, JobDetail, JobSummaryRow, PackagesResponse, Trip, TripDetail } from "./types";

export const tripKeys = {
  all: ["trips"] as const,
  list: (params: Record<string, unknown>) => ["trips", "list", params] as const,
  detail: (id: string) => ["trips", "detail", id] as const,
  itinerary: (id: string) => ["trips", "itinerary", id] as const,
  jobs: (id: string) => ["trips", "jobs", id] as const,
  job: (jobId: string) => ["trips", "job", jobId] as const,
  packages: (id: string, jobId?: string | null) => ["trips", "packages", id, jobId ?? "latest"] as const,
  integrations: ["org", "integrations"] as const,
};

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function useTrip(id: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: tripKeys.detail(id), queryFn: () => apiGet<TripDetail>(`/trips/${id}`), enabled: enabled && !!id });
}

export function useItineraryView(id: string) {
  return useQuery({ queryKey: tripKeys.itinerary(id), queryFn: () => apiGet<ItineraryView>(`/trips/${id}/itinerary`) });
}

export function useJobs(id: string) {
  return useQuery({ queryKey: tripKeys.jobs(id), queryFn: () => apiGet<JobSummaryRow[]>(`/trips/${id}/optimisations`) });
}

/** Polls every 1.5s while the job is queued or running. */
export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: tripKeys.job(jobId ?? "none"),
    enabled: !!jobId,
    queryFn: () => apiGet<JobDetail>(`/optimisations/${jobId}`),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "queued" || s === "running" ? 1500 : false;
    },
  });
}

export function usePackages(id: string, jobId?: string | null) {
  return useQuery({
    queryKey: tripKeys.packages(id, jobId),
    queryFn: () => apiGet<PackagesResponse>(`/trips/${id}/packages`, { jobId: jobId ?? undefined }),
  });
}

export function useTripsList(params: Record<string, string | number | undefined>) {
  return useQuery({ queryKey: tripKeys.list(params), queryFn: () => apiList<Trip>("/trips", params), placeholderData: (prev) => prev });
}

export function stageLabel(stage: string | null | undefined, status?: string): string {
  if (!stage) return status === "queued" ? "Waiting to start" : "Working";
  if (stage.startsWith("searching:")) return `Searching hotels in ${stage.slice("searching:".length)}`;
  const map: Record<string, string> = {
    starting: "Starting",
    routing: "Calculating travel times between stops",
    optimising: "Building and scoring package combinations",
    retrying: "Retrying after a temporary problem",
    succeeded: "Finished",
    failed: "Failed",
    infeasible: "Finished with no feasible package",
    cancelled: "Cancelled",
  };
  return map[stage] ?? stage;
}
