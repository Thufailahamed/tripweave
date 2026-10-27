"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, BrainCircuit, Mail, Plug, RefreshCw } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, Stat, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import { ProviderHealthTable } from "@/features/settings/provider-health";
import type { ProvidersResponse } from "@/features/admin/types";
import { SystemPanel } from "@/features/admin/ui";

export default function AdminProvidersPage() {
  const q = useQuery({ queryKey: ["admin-providers"], queryFn: () => apiGet<ProvidersResponse>("/admin/providers"), refetchInterval: 60_000 });
  if (q.isLoading) return <LoadingBlock rows={5} label="Loading provider telemetry" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load provider telemetry" />;
  const d = q.data!;
  const calls24 = d.health24.reduce((s, p) => s + p.calls, 0);
  const errors24 = d.health24.reduce((s, p) => s + p.errors, 0);
  const aiCalls = d.ai.reduce((s, a) => s + a.calls, 0);
  const byProvider = new Map<string, { calls: number; errors: number; latency: number; n: number }>();
  for (const u of d.usage) {
    const cur = byProvider.get(u.providerKey) ?? { calls: 0, errors: 0, latency: 0, n: 0 };
    byProvider.set(u.providerKey, { calls: cur.calls + u.calls, errors: cur.errors + u.errors, latency: cur.latency + u.avgLatencyMs, n: cur.n + 1 });
  }
  return (
    <>
      <PageHeader
        title="Providers & usage"
        eyebrow="Platform administration"
        description="Supplier calls, AI usage, synchronisation jobs and email delivery across every organisation. Secrets are never exposed."
        icon={Plug}
        image={IMAGES.features}
        actions={<Button asChild variant="outline"><Link href="/admin/settings"><RefreshCw /> Platform settings</Link></Button>}
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Activity} iconTone="info" label="Provider calls, 24h" value={calls24} hint={`${errors24} error${errors24 === 1 ? "" : "s"} · ${d.health24.length} provider${d.health24.length === 1 ? "" : "s"} called`} tone={errors24 > 0 ? "warning" : "default"} />
        <Stat icon={BrainCircuit} iconTone="accent" label="AI calls, 30 days" value={aiCalls} hint={`${d.ai.length} engine/operation combinations`} />
        <Stat icon={RefreshCw} iconTone="primary" label="Supplier sync jobs" value={d.syncJobsTotal} hint={`${d.syncJobs.filter((s) => s.status === "failed").length} failed in the latest 25`} />
        <Stat icon={Mail} iconTone={d.email.failed > 0 ? "danger" : "success"} label="Email outbox" value={d.email.pending} hint={`${d.email.failed} failed · ${d.email.sent} delivered`} tone={d.email.failed > 0 ? "warning" : "default"} />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Provider health, 24 hours</h2>
          <ProviderHealthTable rows={d.health24} caption="Provider health, last 24 hours" />
        </div>
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Provider health, 7 days</h2>
          <ProviderHealthTable rows={d.health7} caption="Provider health, last 7 days" />
        </div>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>External API usage, 14 days</CardTitle><CardDescription>Aggregated provider calls recorded by the API adapters.</CardDescription></CardHeader>
          <CardContent>
            {byProvider.size === 0 ? <EmptyState title="No external calls recorded" description="Calls appear when an organisation searches live supplier inventory or uses routing." /> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-semibold">Provider</th><th className="py-1 text-right font-semibold">Calls</th><th className="py-1 text-right font-semibold">Errors</th><th className="py-1 text-right font-semibold">Avg latency</th></tr></thead>
                <tbody>
                  {[...byProvider.entries()].sort((a, b) => b[1].calls - a[1].calls).map(([provider, v]) => (
                    <tr key={provider} className="border-t border-border"><td className="py-2 font-semibold">{provider}</td><td className="tw-num py-2 text-right">{v.calls}</td><td className="tw-num py-2 text-right">{v.errors > 0 ? <span className="text-destructive">{v.errors}</span> : "0"}</td><td className="tw-num py-2 text-right text-muted-foreground">{v.n > 0 ? Math.round(v.latency / v.n) : 0} ms</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {d.usage.length > 0 ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Daily breakdown</summary>
                <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border">
                  <table className="w-full min-w-[480px] text-xs">
                    <thead className="sticky top-0 bg-card"><tr className="text-left text-muted-foreground"><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Provider</th><th className="px-3 py-2 text-right font-semibold">Calls</th><th className="px-3 py-2 text-right font-semibold">Errors</th><th className="px-3 py-2 text-right font-semibold">Avg</th></tr></thead>
                    <tbody>{[...d.usage].reverse().map((u, i) => <tr key={`${u.date}-${u.providerKey}-${i}`} className="border-t border-border"><td className="tw-num px-3 py-1.5">{u.date}</td><td className="px-3 py-1.5">{u.providerKey}</td><td className="tw-num px-3 py-1.5 text-right">{u.calls}</td><td className="tw-num px-3 py-1.5 text-right">{u.errors}</td><td className="tw-num px-3 py-1.5 text-right text-muted-foreground">{u.avgLatencyMs} ms</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>AI usage, 30 days</CardTitle><CardDescription>Workers AI and external LLM calls, with the deterministic-rules fallback included.</CardDescription></CardHeader>
          <CardContent>
            {d.ai.length === 0 ? <EmptyState title="No AI usage recorded" description="Requirement extraction and explanation polishing will appear here." /> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-semibold">Engine</th><th className="py-1 font-semibold">Operation</th><th className="py-1 text-right font-semibold">Calls</th><th className="py-1 text-right font-semibold">Chars in/out</th><th className="py-1 text-right font-semibold">Avg</th></tr></thead>
                <tbody>{d.ai.map((a) => <tr key={`${a.engine}-${a.operation}`} className="border-t border-border"><td className="py-2"><Badge tone="outline">{a.engine}</Badge></td><td className="py-2 text-xs">{titleCase(a.operation)}</td><td className="tw-num py-2 text-right">{a.calls}</td><td className="tw-num py-2 text-right text-xs text-muted-foreground">{a.inputChars.toLocaleString()} / {a.outputChars.toLocaleString()}</td><td className="tw-num py-2 text-right text-xs text-muted-foreground">{a.avgLatencyMs} ms</td></tr>)}</tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader><CardTitle>Supplier synchronisation jobs</CardTitle><CardDescription>Background catalogue/availability imports. Failed jobs surface their error summary for support.</CardDescription></CardHeader>
        <CardContent>
          {d.syncJobs.length === 0 ? <EmptyState title="No synchronisation jobs" description="Jobs appear when a supplier catalogue or availability import runs." /> : (
            <div className="relative overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5 font-semibold">Provider</th><th className="px-4 py-2.5 font-semibold">Job</th><th className="px-4 py-2.5 font-semibold">Organisation</th><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 font-semibold">Created</th><th className="px-4 py-2.5 font-semibold">Completed</th><th className="px-4 py-2.5 font-semibold">Error</th></tr></thead>
                <tbody>{d.syncJobs.map((s) => <tr key={s.id} className="border-t border-border"><td className="px-4 py-3 font-semibold">{s.providerKey}</td><td className="px-4 py-3 text-xs">{s.jobType}</td><td className="px-4 py-3 text-xs text-muted-foreground">{s.organizationName ?? "Platform"}</td><td className="px-4 py-3"><StatusBadge status={s.status} /></td><td className="tw-num px-4 py-3 text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</td><td className="tw-num px-4 py-3 text-xs text-muted-foreground">{s.completedAt ? formatDateTime(s.completedAt) : "—"}</td><td className="max-w-[18rem] truncate px-4 py-3 text-xs text-destructive">{s.errorSummary ?? "—"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <SystemPanel system={d.system} />
      <p className="mt-4 text-xs text-muted-foreground">Telemetry refreshes every 60 seconds while this page is open. Provider call counts come from the API adapters; secrets are never exposed.</p>
    </>
  );
}
