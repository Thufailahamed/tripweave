"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { apiList } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import type { AdminJobRow } from "@/features/admin/types";
import { useOrganizationOptions } from "@/features/admin/ui";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function duration(job: AdminJobRow): string {
  if (!job.startedAt) return "—";
  const end = job.completedAt ? new Date(job.completedAt).getTime() : Date.now();
  const ms = end - new Date(job.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function JobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState(searchParams.get("status") ?? "");
  const [organizationId, setOrganizationId] = React.useState(searchParams.get("organizationId") ?? "");
  const [page, setPage] = React.useState(1);
  const q = useDebounced(search.trim());
  const orgs = useOrganizationOptions();
  React.useEffect(() => setPage(1), [q, status, organizationId]);
  const list = useQuery({
    queryKey: ["admin-jobs", q, status, organizationId, page],
    queryFn: () => apiList<AdminJobRow>("/admin/jobs", { q, status, organizationId: organizationId || undefined, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const columns = React.useMemo<ColumnDef<AdminJobRow, any>[]>(
    () => [
      {
        accessorKey: "organizationName",
        header: "Organisation",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold">{row.original.organizationName}</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{row.original.id.slice(0, 12)}</p>
          </div>
        ),
      },
      { accessorKey: "tripTitle", header: "Trip", cell: ({ row }) => <span className="line-clamp-1 max-w-[16rem] text-xs text-muted-foreground">{row.original.tripTitle ?? row.original.tripRequestId.slice(0, 8)}</span> },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        id: "progress",
        header: "Progress",
        cell: ({ row }) => (
          <div className="flex min-w-28 items-center gap-2">
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, row.original.progress))}%` }} /></span>
            <span className="tw-num text-[11px] text-muted-foreground">{row.original.progress}%</span>
          </div>
        ),
      },
      { accessorKey: "stage", header: "Stage", cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.stage ?? "—"}</span> },
      { accessorKey: "createdAt", header: "Created", cell: ({ row }) => <span className="tw-num text-xs text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
      { id: "duration", header: "Duration", cell: ({ row }) => <span className="tw-num text-xs text-muted-foreground">{duration(row.original)}</span> },
      { accessorKey: "errorSummary", header: "Error", cell: ({ row }) => (row.original.errorSummary || row.original.errorCode ? <Badge tone="danger">{row.original.errorCode ?? "error"}</Badge> : <span className="text-xs text-muted-foreground">—</span>) },
    ],
    [],
  );
  return (
    <>
      <PageHeader
        title="Optimisation jobs"
        eyebrow="Platform administration"
        description="Every package-generation job on the platform, across all organisations. Open a job to inspect progress, errors and results, or to retry and cancel."
        icon={Activity}
        image={IMAGES.features}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="">All statuses</option>
            {["queued", "running", "succeeded", "failed", "infeasible", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select aria-label="Filter by organisation" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="w-56">
            <option value="">All organisations</option>
            {orgs.data?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search jobs" placeholder="Job id, trip or organisation…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 pl-8" />
        </div>
      </div>
      {list.isLoading ? (
        <LoadingBlock label="Loading optimisation jobs" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <DataTable
          data={list.data?.items ?? []}
          columns={columns}
          caption="Optimisation jobs"
          meta={list.data?.meta}
          onPageChange={setPage}
          onRowClick={(j) => router.push(`/admin/jobs/${j.id}`)}
          empty={<EmptyState icon={Activity} title={q || status || organizationId ? "No jobs match these filters" : "No optimisation jobs yet"} description="Jobs appear here when an organisation runs package generation." />}
        />
      )}
      <p className="mt-2 text-xs text-muted-foreground">This page refreshes every 30 seconds. Detailed request and result content needs a support grant for the organisation.</p>
    </>
  );
}

export default function AdminJobsPage() {
  return (
    <React.Suspense fallback={<LoadingBlock rows={4} label="Loading jobs" />}>
      <JobsPage />
    </React.Suspense>
  );
}
