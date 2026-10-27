"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Database, Mail, Play, Settings, ShieldCheck, Users, Wrench } from "lucide-react";
import { Alert, Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, ErrorState, LoadingBlock, PageHeader, Stat, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Field, Input, Switch } from "@/components/ui/form";
import { apiGet, apiPost, apiPut, errorMessage } from "@/lib/api";
import { formatDateTime, relativeTime, titleCase } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import type { PlatformSettings, PlatformSettingsResponse } from "@/features/admin/types";
import { SystemPanel } from "@/features/admin/ui";

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => apiGet<PlatformSettingsResponse>("/admin/settings") });
  const [form, setForm] = React.useState<PlatformSettings | null>(null);
  const [confirmMaintenance, setConfirmMaintenance] = React.useState<PlatformSettings | null>(null);
  const [maintenanceResult, setMaintenanceResult] = React.useState<Record<string, number> | null>(null);
  React.useEffect(() => {
    if (q.data?.settings) setForm(q.data.settings);
  }, [q.data?.settings]);
  const save = useMutation({
    mutationFn: (v: PlatformSettings) => apiPut<PlatformSettings>("/admin/settings", v),
    onSuccess: () => {
      toast.success("Platform settings saved");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["platform-config"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const hourly = useMutation({
    mutationFn: () => apiPost<Record<string, number>>("/admin/system/maintenance/hourly"),
    onSuccess: (r) => {
      setMaintenanceResult(r);
      toast.success("Hourly maintenance completed");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const daily = useMutation({
    mutationFn: () => apiPost<Record<string, number>>("/admin/system/maintenance/daily"),
    onSuccess: (r) => {
      setMaintenanceResult(r);
      toast.success("Daily maintenance completed");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <LoadingBlock rows={5} label="Loading platform settings" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load platform settings" />;
  if (!form) return <LoadingBlock rows={3} label="Preparing settings" />;
  const d = q.data!;
  const dirty = JSON.stringify(form) !== JSON.stringify(d.settings);
  const update = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (form.maintenanceMode && !d.settings.maintenanceMode) {
      setConfirmMaintenance(form);
      return;
    }
    save.mutate(form);
  };

  return (
    <>
      <PageHeader
        title="Platform settings"
        eyebrow="Platform administration"
        description="Global switches that change how TripWeave behaves for every organisation: registration, maintenance mode, defaults and the announcement banner."
        icon={Settings}
        image={IMAGES.features}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} iconTone="info" label="Platform admins" value={d.platformAdmins.length} hint={`${d.platformAdmins.filter((a) => a.status === "active").length} active`} />
        <Stat icon={Mail} iconTone={d.email.failed > 0 ? "danger" : "success"} label="Email failures" value={d.email.failed} hint={`${d.email.pending} pending · ${d.email.sent} delivered`} tone={d.email.failed > 0 ? "warning" : "default"} />
        <Stat icon={Database} iconTone="primary" label="Tracked tables" value={d.tableCounts.length} hint="Row counts in the health panel" />
        <Stat icon={ShieldCheck} iconTone="accent" label="Environment" value={titleCase(d.system.environment)} hint={`API ${d.system.apiVersion}`} />
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Global switches</CardTitle>
            <CardDescription>These settings are enforced by the API, not just the UI.</CardDescription>
          </CardHeader>
          <form onSubmit={submit}>
            <CardContent className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-semibold">Allow new registrations</p>
                  <p className="text-xs text-muted-foreground">When off, self-service registration is rejected with a clear message. Existing organisations are unaffected.</p>
                </div>
                <Switch checked={form.signupsEnabled} onCheckedChange={(v) => update("signupsEnabled", v)} label={form.signupsEnabled ? "On" : "Off"} />
              </div>
              <div className="flex items-start justify-between gap-4 rounded-lg border border-warning/40 bg-warning-soft/30 p-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-warning" /> Maintenance mode</p>
                  <p className="text-xs text-muted-foreground">Blocks every tenant and public API endpoint except sign-in, health checks, the public config and this admin portal. Use during deployments or incidents.</p>
                </div>
                <Switch checked={form.maintenanceMode} onCheckedChange={(v) => update("maintenanceMode", v)} label={form.maintenanceMode ? "On" : "Off"} />
              </div>
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-semibold">Show announcement banner</p>
                  <p className="text-xs text-muted-foreground">Master switch for active announcements in the app shell. Individual announcements still have their own status and window.</p>
                </div>
                <Switch checked={form.announcementBannerEnabled} onCheckedChange={(v) => update("announcementBannerEnabled", v)} label={form.announcementBannerEnabled ? "On" : "Off"} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Support email" htmlFor="ps-email" hint="Shown on maintenance responses and public status."><Input id="ps-email" type="email" value={form.supportEmail} onChange={(e) => update("supportEmail", e.target.value)} placeholder="support@tripweave.example" /></Field>
                <Field label="Default seat limit" htmlFor="ps-seats" hint="Applied to newly created organisations."><Input id="ps-seats" type="number" min={1} max={10_000} className="tw-num" value={form.defaultSeatLimit} onChange={(e) => update("defaultSeatLimit", Number(e.target.value))} /></Field>
                <Field label="Default monthly optimisations" htmlFor="ps-opt" hint="Applied to newly created organisations."><Input id="ps-opt" type="number" min={0} max={1_000_000} className="tw-num" value={form.defaultOptimisationLimit} onChange={(e) => update("defaultOptimisationLimit", Number(e.target.value))} /></Field>
              </div>
              {form.maintenanceMode ? <Alert tone="warning" title="Maintenance mode is enabled">Saving will keep tenant and public endpoints blocked. Only platform admins and sign-in remain available.</Alert> : null}
            </CardContent>
            <CardFooter><Button type="submit" loading={save.isPending} disabled={!dirty}>Save platform settings</Button></CardFooter>
          </form>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>Platform administrators</CardTitle><CardDescription>Accounts that can access this portal. Grant the role from a user&apos;s account page.</CardDescription></CardHeader>
            <CardContent>
              {d.platformAdmins.length === 0 ? <p className="text-sm text-muted-foreground">No platform admins.</p> : (
                <div className="flex flex-col">
                  {d.platformAdmins.map((a) => (
                    <Link key={a.id} href={`/admin/users/${a.id}`} className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{a.displayName}</span><span className="block truncate text-[11px] text-muted-foreground">{a.email}</span></span>
                      <span className="flex shrink-0 items-center gap-2"><StatusBadge status={a.status} /><span className="text-[10px] text-muted-foreground">{a.lastSeenAt ? relativeTime(a.lastSeenAt) : "never"}</span></span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Maintenance actions</CardTitle><CardDescription>Run the scheduled housekeeping immediately. Hourly expires quotations, fails hung jobs and purges rate-limit counters; daily expires agreements and warns about renewals.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => hourly.mutate()} loading={hourly.isPending}><Play /> Run hourly maintenance</Button>
                <Button variant="outline" onClick={() => daily.mutate()} loading={daily.isPending}><Play /> Run daily maintenance</Button>
              </div>
              {maintenanceResult ? (
                <div className="rounded-lg border border-border p-3 text-xs">
                  <p className="mb-1 font-semibold">Last run</p>
                  <ul className="grid grid-cols-2 gap-1 text-muted-foreground">{Object.entries(maintenanceResult).map(([k, v]) => <li key={k}><span className="font-mono">{k}</span>: <span className="tw-num text-foreground">{v}</span></li>)}</ul>
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">Scheduled runs continue automatically (hourly at :05, daily at 02:30 in the Worker&apos;s configured cron). These buttons are for immediate intervention.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mb-8">
        <CardHeader><CardTitle>Database footprint</CardTitle><CardDescription>Row counts for the main tables. Use this to spot runaway growth; D1 has per-database limits (see docs/d1-scaling.md).</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
            {d.tableCounts.map((t) => (
              <div key={t.table} className="rounded-lg border border-border px-3 py-2">
                <p className="truncate font-mono text-[10px] text-muted-foreground">{t.table}</p>
                <p className="tw-num font-display text-xl font-semibold">{t.rows.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <SystemPanel system={d.system} compact />
      <p className="mt-4 text-xs text-muted-foreground">Settings last loaded {formatDateTime(new Date().toISOString())}. Changes are audited with your name.</p>

      <ConfirmDialog
        open={!!confirmMaintenance}
        onOpenChange={(o) => !o && setConfirmMaintenance(null)}
        title="Enable maintenance mode?"
        description="Every tenant and public API endpoint will return 503 for all users except platform admins and sign-in. Quotes shared with clients will also be unavailable. Proceed only if this is intentional."
        confirmLabel="Enable maintenance mode"
        destructive
        loading={save.isPending}
        onConfirm={() => {
          if (!confirmMaintenance) return;
          save.mutate(confirmMaintenance, { onSuccess: () => setConfirmMaintenance(null) });
        }}
      />
    </>
  );
}
