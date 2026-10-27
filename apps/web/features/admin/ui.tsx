"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiList } from "@/lib/api";
import { cn, formatDate, titleCase } from "@/lib/utils";
import type { AdminOrganizationRow, AdminOverview, SystemInfo } from "./types";

export function ActivityChart({ points }: { points: AdminOverview["activity"] }) {
  const series = [
    { key: "trips" as const, label: "Trip requests", className: "bg-primary" },
    { key: "quotes" as const, label: "Quotations", className: "bg-accent" },
    { key: "jobs" as const, label: "Optimisations", className: "bg-info" },
  ];
  const max = Math.max(1, ...points.flatMap((p) => series.map((s) => p[s.key])));
  return (
    <figure aria-labelledby="activity-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="activity-title" className="font-display text-[15px] font-semibold tracking-[-0.03em]">
            Daily activity
          </h3>
          <p className="text-sm text-muted-foreground">New work created across the platform over the last 14 days.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2 rounded-sm", s.className)} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Bar chart of daily trip, quote and optimisation counts">
        {points.map((p) => (
          <div key={p.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-1" title={`${formatDate(p.date)} — ${p.trips} trips, ${p.quotes} quotations, ${p.jobs} optimisations`}>
            <div className="flex h-full items-end justify-center gap-[2px]">
              {series.map((s) => (
                <span key={s.key} className={cn("w-full max-w-2 rounded-t-sm transition-opacity group-hover:opacity-100", s.className, p[s.key] === 0 ? "opacity-15" : "opacity-80")} style={{ height: `${p[s.key] === 0 ? 2 : Math.max(4, (p[s.key] / max) * 100)}%` }} />
              ))}
            </div>
            <span className="truncate text-center text-[9px] text-muted-foreground">{formatDate(p.date, { day: "numeric", month: "short" }).replace(" ", "\u00a0")}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Daily activity for the last 14 days</caption>
        <thead>
          <tr>
            <th>Date</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              {series.map((s) => (
                <td key={s.key}>{p[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function SystemPanel({ system, compact }: { system: SystemInfo; compact?: boolean }) {
  const bindings = [
    ["Database", system.bindings.database],
    ["R2 media", system.bindings.media],
    ["KV cache", system.bindings.kv],
    ["Queue", system.bindings.queue],
    ["Workflow", system.bindings.workflow],
    ["Workers AI", system.bindings.workersAi],
  ] as const;
  const integrations = [
    ["Email delivery", system.integrations.emailConfigured, system.integrations.emailProvider],
    ["Routing", system.integrations.routingConfigured, system.integrations.routingProvider],
    ["Hotelbeds", system.integrations.hotelbedsConfigured, "supplier"],
    ["Amadeus", system.integrations.amadeusConfigured, "supplier"],
    ["Google Hotels", system.integrations.googleHotelsConfigured, "supplier"],
    ["OpenStreetMap", system.integrations.openStreetMapEnabled, "keyless discovery"],
    ["Mock provider", system.integrations.mockProviderAllowed, "illustrative data"],
    ["External LLM", system.integrations.externalLlmConfigured, "fallback available"],
    ["MFA encryption", system.integrations.mfaConfigured, "TOTP"],
    ["Turnstile", system.integrations.turnstileConfigured, "bot protection"],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform configuration</CardTitle>
        <CardDescription>
          {system.environment} · API {system.apiVersion} · {system.appBaseUrl}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Bindings</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {bindings.map(([label, on]) => (
              <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                <span>{label}</span>
                <Badge tone={on ? "success" : "neutral"}>{on ? "bound" : "not set"}</Badge>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Integrations</p>
          <div className={cn("grid gap-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
            {integrations.map(([label, on, detail]) => (
              <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{titleCase(String(detail))}</span>
                </span>
                <Badge tone={on ? "success" : "warning"}>{on ? "ready" : "off"}</Badge>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">External supplier allow-list: <span className="font-mono">{system.integrations.externalProviderAllowList || "none"}</span>. Secrets are never exposed by the API.</p>
      </CardContent>
    </Card>
  );
}

export function JsonPanel({ title, value }: { title: string; value: unknown }) {
  const text = React.useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <details className="rounded-lg border border-border bg-background/30">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">{title}</summary>
      <pre className="max-h-80 overflow-auto border-t border-border px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">{text}</pre>
    </details>
  );
}

/** Organisation options for filter selects. Cached per session; the admin list is small. */
export function useOrganizationOptions() {
  return useQuery({
    queryKey: ["admin-org-options"],
    queryFn: () => apiList<AdminOrganizationRow>("/admin/organizations", { page: 1, pageSize: 100 }),
    staleTime: 60_000,
  });
}
