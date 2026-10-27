"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Building2,
  ChevronRight,
  FileText,
  Mail,
  Map,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, Stat, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { formatDate, formatDateTime, relativeTime, titleCase } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import { ProviderHealthTable } from "@/features/settings/provider-health";
import type { AdminOverview } from "@/features/admin/types";
import { ActivityChart, SystemPanel } from "@/features/admin/ui";

function Breakdown({ title, description, rows }: { title: string; description?: string; rows: { status: string; n: number }[] }) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1 font-semibold">Status</th>
                <th scope="col" className="py-1 text-right font-semibold">Count</th>
                <th scope="col" className="w-1/3 py-1 pl-4 font-semibold">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.status} className="border-t border-border">
                  <td className="py-2"><StatusBadge status={r.status} /></td>
                  <td className="tw-num py-2 text-right font-semibold">{r.n}</td>
                  <td className="py-2 pl-4">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${total > 0 ? Math.max(2, (r.n / total) * 100) : 0}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminOverviewPage() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => apiGet<AdminOverview>("/admin/overview"), refetchInterval: 60_000 });
  if (q.isLoading) return <LoadingBlock rows={5} label="Loading platform overview" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load the platform overview" />;
  const d = q.data!;
  const t = d.totals;

  return (
    <>
      <PageHeader
        title="Platform overview"
        eyebrow="Platform administration"
        description="Every organisation, account and operation across TripWeave. Changes you make here are audited against your name."
        icon={ShieldCheck}
        image={IMAGES.features}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/settings"><Wrench /> Platform settings</Link>
            </Button>
            <Button asChild variant="accent">
              <Link href="/admin/organizations">Manage organisations</Link>
            </Button>
          </>
        }
      />

      {d.alerts.length > 0 ? (
        <div className="mb-6 flex flex-col gap-3">
          {d.alerts.map((a) => (
            <Alert key={a.title} tone={a.tone} title={a.title}>
              <span className="flex flex-wrap items-center gap-2">
                {a.body}
                {a.href ? (
                  <Link href={a.href} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
                    Review <ChevronRight className="size-3" />
                  </Link>
                ) : null}
              </span>
            </Alert>
          ))}
        </div>
      ) : (
        <Alert tone="success" className="mb-6" title="No platform alerts">
          All background work, provider calls and email delivery are within normal thresholds.
        </Alert>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Building2} iconTone="primary" label="Organisations" value={t.organizations} hint={`${t.activeOrganizations} active · ${t.suspendedOrganizations} suspended · ${d.growth.organizations} new in 30 days`} />
        <Stat icon={Users} iconTone="info" label="Users" value={t.users} hint={`${t.activeUsers} active · ${t.platformAdmins} platform admins · ${d.growth.users} new in 30 days`} />
        <Stat icon={Map} iconTone="accent" label="Trip requests" value={t.trips} hint={`${d.growth.trips} created in the last 30 days`} />
        <Stat icon={FileText} iconTone="success" label="Quotations" value={t.quotes} hint={`${d.growth.quotes} created in the last 30 days`} />
        <Stat icon={Activity} iconTone="warning" label="Optimisation jobs" value={t.jobs} hint={`${d.growth.jobs} created in the last 30 days`} />
        <Stat icon={Mail} iconTone={t.failedEmails > 0 ? "danger" : "neutral"} label="Email outbox" value={d.email.pending} hint={`${d.email.failed} failed · ${d.email.sent} delivered`} tone={d.email.failed > 0 ? "warning" : "default"} />
        <Stat icon={ShieldCheck} iconTone="success" label="Active support grants" value={t.activeGrants} hint="Time-boxed access to tenant data" />
        <Stat icon={AlertTriangle} iconTone={d.attentionTotal > 0 ? "warning" : "neutral"} label="Jobs needing attention" value={d.attentionTotal} hint="Failed or infeasible in the last seven days" />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardContent className="pt-5">
            <ActivityChart points={d.activity} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent sign-ups</CardTitle>
            <CardDescription>The newest organisations on the platform.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {d.recentOrganizations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organisations yet.</p>
            ) : (
              d.recentOrganizations.map((o) => (
                <Link key={o.id} href={`/admin/organizations/${o.id}`} className="group flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-primary-soft/40">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{o.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{titleCase(o.organizationType)} · {o.country} · {o.memberCount} member{o.memberCount === 1 ? "" : "s"}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={o.status} />
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))
            )}
            <Button asChild variant="outline" size="sm" className="mt-1 self-start">
              <Link href="/admin/organizations">All organisations</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Breakdown title="Optimisation jobs" description="All jobs ever run on the platform." rows={d.jobsByStatus} />
        <Breakdown title="Quotations" description="Every quotation by lifecycle status." rows={d.quotesByStatus} />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organisations by type and status</CardTitle>
            <CardDescription>Registration mix and account state.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.organizationsByTypeStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organisations yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1 font-semibold">Type</th>
                    <th scope="col" className="py-1 font-semibold">Status</th>
                    <th scope="col" className="py-1 text-right font-semibold">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {d.organizationsByTypeStatus.map((o) => (
                    <tr key={`${o.type}-${o.status}`} className="border-t border-border">
                      <td className="py-2">{titleCase(o.type)}</td>
                      <td className="py-2"><StatusBadge status={o.status} /></td>
                      <td className="tw-num py-2 text-right font-semibold">{o.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {d.plans.length > 0 ? (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Subscriptions</p>
                <div className="flex flex-wrap gap-2">
                  {d.plans.map((p) => (
                    <Badge key={`${p.plan}-${p.status}`} tone={p.status === "active" ? "success" : p.status === "past_due" ? "warning" : "neutral"}>
                      {titleCase(p.plan)} · {p.n}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latest platform activity</CardTitle>
            <CardDescription>Security-relevant actions and operator changes, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.recentAudit.length === 0 ? (
              <EmptyState title="No audit events yet" description="Admin and tenant actions will appear here." />
            ) : (
              <ol className="flex flex-col">
                {d.recentAudit.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px] font-semibold">{a.action}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {a.actorName ?? "System"} · {a.organizationName ?? "Platform"} · {relativeTime(a.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/admin/audit">Open audit log</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {d.attention.length > 0 ? (
        <section aria-labelledby="attention" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="attention" className="font-display text-lg font-semibold">Jobs needing attention</h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/jobs?status=failed">View all jobs</Link>
            </Button>
          </div>
          <div className="tw-surface overflow-hidden rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-background/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Organisation</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Job</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Error</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {d.attention.map((j) => (
                  <tr key={j.id} className="border-t border-border">
                    <td className="px-5 py-3 font-semibold">{j.organizationName}</td>
                    <td className="px-5 py-3 font-mono text-[11px]">{j.id.slice(0, 8)}</td>
                    <td className="px-5 py-3"><StatusBadge status={j.status} /></td>
                    <td className="max-w-[22rem] truncate px-5 py-3 text-xs text-muted-foreground">{j.errorSummary ?? j.errorCode ?? "—"}</td>
                    <td className="tw-num px-5 py-3 text-xs text-muted-foreground">{formatDateTime(j.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Provider health</h2>
          <Button asChild variant="ghost" size="sm"><Link href="/admin/providers">Usage &amp; integrations</Link></Button>
        </div>
        <ProviderHealthTable rows={d.providerHealth} caption="Platform-wide provider health, last 7 days" />
      </div>

      <SystemPanel system={d.system} />
      <p className="mt-4 text-xs text-muted-foreground">Snapshot generated {formatDateTime(d.generatedAt)}. Times are shown in your local timezone.</p>
    </>
  );
}
