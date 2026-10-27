"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, ArrowLeft, Ban, RotateCcw, ShieldAlert } from "lucide-react";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorState, LoadingBlock, PageHeader, Stat, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { ApiError, apiGet, apiPost, errorMessage } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/utils";
import type { AdminJobDetail } from "@/features/admin/types";
import { JsonPanel } from "@/features/admin/ui";

function duration(job: AdminJobDetail): string {
  if (!job.startedAt) return "—";
  const end = job.completedAt ? new Date(job.completedAt).getTime() : Date.now();
  const ms = end - new Date(job.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function AdminJobDetailView({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-job", id], queryFn: () => apiGet<AdminJobDetail>(`/admin/jobs/${id}`), refetchInterval: (query) => (query.state.data && ["queued", "running"].includes(query.state.data.status) ? 3000 : false) });
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [retryOpen, setRetryOpen] = React.useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-job", id] });
    qc.invalidateQueries({ queryKey: ["admin-jobs"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  };
  const cancel = useMutation({
    mutationFn: () => apiPost(`/admin/jobs/${id}/cancel`),
    onSuccess: () => {
      toast.success("Job cancelled");
      refresh();
      setCancelOpen(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const retry = useMutation({
    mutationFn: () => apiPost<{ jobId: string }>(`/admin/jobs/${id}/retry`),
    onSuccess: (r) => {
      toast.success("Retry queued as a new job");
      refresh();
      setRetryOpen(false);
      router.push(`/admin/jobs/${r.jobId}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <LoadingBlock rows={5} label="Loading job" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title={q.error instanceof ApiError && q.error.status === 404 ? "Job not found" : "Could not load job"} />;
  const job = q.data!;
  const canCancel = ["queued", "running"].includes(job.status);
  const canRetry = ["failed", "infeasible", "cancelled"].includes(job.status);

  return (
    <>
      <PageHeader
        eyebrow="Platform administration"
        title={`Job ${job.id.slice(0, 8)}`}
        icon={Activity}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            <span>{job.organizationName} · algorithm {job.algorithmVersion} · created {formatDateTime(job.createdAt)}</span>
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline"><Link href="/admin/jobs"><ArrowLeft /> All jobs</Link></Button>
            {canCancel ? <Button variant="destructive" onClick={() => setCancelOpen(true)}><Ban /> Cancel job</Button> : null}
            {canRetry ? <Button variant="accent" onClick={() => setRetryOpen(true)}><RotateCcw /> Retry as new job</Button> : null}
          </>
        }
      />
      {job.errorSummary || job.errorCode ? (
        <Alert tone="danger" className="mb-6" title={job.errorCode ?? "Job failed"}>{job.errorSummary ?? "No error summary was recorded."}</Alert>
      ) : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Progress" value={`${job.progress}%`} hint={job.stage ?? "No stage reported"} />
        <Stat label="Attempt" value={job.attempt} hint={`Duration ${duration(job)}`} />
        <Stat label="Candidate packages" value={job.candidateCount} hint={`${job.manuallyModifiedCount} manually modified`} />
        <Stat label="Organisation" value={<Link className="hover:underline" href={`/admin/organizations/${job.organizationId}`}>{job.organizationName}</Link>} hint={titleCase(job.organizationStatus)} />
      </div>

      {!job.tenantAccess ? (
        <Alert tone="warning" className="mb-6" title="Tenant content is hidden">
          You can see operational metadata, but the request, constraints and result content are tenant business data. Open the organisation and request a time-boxed support grant to view them.{" "}
          <Link href={`/admin/organizations/${job.organizationId}`} className="font-semibold underline underline-offset-2">Open organisation support</Link>
        </Alert>
      ) : null}

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="payload">Request &amp; result</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Job identity</CardTitle><CardDescription>Stable identifiers and ownership.</CardDescription></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-3 text-sm">
                  {[
                    ["Job id", <span key="id" className="font-mono text-xs">{job.id}</span>],
                    ["Organisation", <Link key="org" href={`/admin/organizations/${job.organizationId}`} className="font-semibold hover:underline">{job.organizationName}</Link>],
                    ["Organisation slug", <span key="slug" className="font-mono text-xs">{job.organizationSlug}</span>],
                    ["Trip request", <span key="trip" className="font-mono text-xs">{job.tripRequestId}</span>],
                    ["Trip title", job.tripTitle ?? "Hidden until support access is granted"],
                    ["Itinerary", <span key="it" className="font-mono text-xs">{job.itineraryId}</span>],
                    ["Created by", job.createdByName ?? "System"],
                    ["Created", <span key="c" className="tw-num">{formatDateTime(job.createdAt)}</span>],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex items-start justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="max-w-[65%] text-right">{value}</dd></div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Progress &amp; timing</CardTitle><CardDescription>Live state reported by the queue/workflow pipeline.</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>Progress</span><span className="tw-num">{job.progress}%</span></div>
                  <span className="block h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${job.progress}%` }} /></span>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[["Stage", job.stage ?? "—"], ["Attempt", String(job.attempt)], ["Started", formatDateTime(job.startedAt)], ["Completed", formatDateTime(job.completedAt)], ["Duration", duration(job)], ["Algorithm", job.algorithmVersion]].map(([label, value]) => (
                    <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5">{value}</dd></div>
                  ))}
                </dl>
                {job.resultSummary ? <JsonPanel title="Result summary (safe metrics)" value={{ funnel: job.resultSummary.funnel, stats: job.resultSummary.stats, warnings: job.resultSummary.warnings, providers: job.resultSummary.providers }} /> : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="payload">
          {!job.tenantAccess ? (
            <Card><CardContent className="flex flex-col items-start gap-3 py-8"><ShieldAlert className="size-6 text-warning" /><p className="text-sm text-muted-foreground">This content is tenant business data. Request support access for {job.organizationName} to inspect the request, constraints, scoring, FX snapshot and full result.</p><Button asChild variant="outline"><Link href={`/admin/organizations/${job.organizationId}`}>Open organisation</Link></Button></CardContent></Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <JsonPanel title="Request" value={job.request} />
              <JsonPanel title="Constraints snapshot" value={job.constraints} />
              <JsonPanel title="Scoring configuration" value={job.scoring} />
              <JsonPanel title="FX snapshot" value={job.fx} />
              <div className="lg:col-span-2"><JsonPanel title="Full result summary" value={job.resultSummary} /></div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle><CardDescription>Recorded lifecycle timestamps for this job.</CardDescription></CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-0">
                {[
                  ["Created", job.createdAt, job.status === "queued"],
                  ["Started", job.startedAt, job.status === "running"],
                  ["Completed", job.completedAt, ["succeeded", "failed", "infeasible", "cancelled"].includes(job.status)],
                ].map(([label, ts, active], i) => (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center"><span className={`mt-1 size-2.5 rounded-full ${active ? "bg-accent" : "bg-muted-foreground/30"}`} />{i < 2 ? <span className="h-10 w-px bg-border" /> : null}</div>
                    <div className="pb-4"><p className="text-sm font-semibold">{label}</p><p className="tw-num text-xs text-muted-foreground">{ts ? formatDateTime(String(ts)) : "Not reached"}</p></div>
                  </li>
                ))}
              </ol>
              {job.errorCode ? <Alert tone="danger" title={job.errorCode}>{job.errorSummary ?? "No error summary recorded."}</Alert> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel this job?" description="Queued or running work stops. A running workflow may take a moment to wind down. You can retry afterwards as a new job." confirmLabel="Cancel job" destructive loading={cancel.isPending} onConfirm={() => cancel.mutate()} />
      <ConfirmDialog open={retryOpen} onOpenChange={setRetryOpen} title="Retry as a new job?" description="A new job is created with the same request and constraints, preserving this job's history. Usage still counts against the organisation's monthly quota." confirmLabel="Queue retry" loading={retry.isPending} onConfirm={() => retry.mutate()} />
      <p className="mt-4 text-xs text-muted-foreground">Opened views and actions are recorded in the platform audit log. The page polls every 3 seconds while the job is queued or running.</p>
    </>
  );
}
