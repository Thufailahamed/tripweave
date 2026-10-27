"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { apiGet, apiList } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import type { AdminAuditRow, AuditFacets } from "@/features/admin/types";
import { JsonPanel, useOrganizationOptions } from "@/features/admin/ui";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function AuditPage() {
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState("");
  const [action, setAction] = React.useState("");
  const [resourceType, setResourceType] = React.useState("");
  const [organizationId, setOrganizationId] = React.useState(searchParams.get("organizationId") ?? "");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AdminAuditRow | null>(null);
  const q = useDebounced(search.trim());
  const orgs = useOrganizationOptions();
  const facets = useQuery({ queryKey: ["admin-audit-facets"], queryFn: () => apiGet<AuditFacets>("/admin/audit/facets"), staleTime: 120_000 });
  React.useEffect(() => setPage(1), [q, action, resourceType, organizationId, from, to]);
  const list = useQuery({
    queryKey: ["admin-audit", q, action, resourceType, organizationId, from, to, page],
    queryFn: () => apiList<AdminAuditRow>("/admin/audit", { q, action, resourceType, organizationId: organizationId || undefined, from: from || undefined, to: to || undefined, page, pageSize: 30 }),
    placeholderData: keepPreviousData,
  });
  const columns = React.useMemo<ColumnDef<AdminAuditRow, any>[]>(
    () => [
      { accessorKey: "createdAt", header: "When", cell: ({ row }) => <span className="tw-num whitespace-nowrap text-xs text-muted-foreground" title={formatDateTime(row.original.createdAt)}>{relativeTime(row.original.createdAt)}</span> },
      { accessorKey: "actorName", header: "Actor", cell: ({ row }) => <div className="min-w-0"><p className="truncate text-sm">{row.original.actorName ?? "System"}</p>{row.original.actorEmail ? <p className="truncate text-[10px] text-muted-foreground">{row.original.actorEmail}</p> : null}</div> },
      { accessorKey: "action", header: "Action", cell: ({ row }) => <Badge tone={row.original.action.startsWith("admin.") ? "accent" : row.original.action.startsWith("auth.") ? "info" : "neutral"}>{row.original.action}</Badge> },
      { accessorKey: "organizationName", header: "Organisation", cell: ({ row }) => row.original.organizationId ? <Link href={`/admin/organizations/${row.original.organizationId}`} onClick={(e) => e.stopPropagation()} className="text-sm hover:underline">{row.original.organizationName ?? row.original.organizationId.slice(0, 8)}</Link> : <span className="text-xs text-muted-foreground">Platform</span> },
      { accessorKey: "resourceType", header: "Resource", cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.resourceType}</span> },
      { accessorKey: "resourceId", header: "Resource id", cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{row.original.resourceId?.slice(0, 12) ?? "—"}</span> },
    ],
    [],
  );
  return (
    <>
      <PageHeader
        title="Audit log"
        eyebrow="Platform administration"
        description="A chronological record of security-relevant actions across every organisation: sign-ins, tenant changes, admin overrides and support-data reads."
        icon={ScrollText}
        image={IMAGES.features}
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search audit events" placeholder="Action, resource type or id…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 pl-8" />
        </div>
        <Input aria-label="Filter by action prefix" list="audit-actions" placeholder="Action starts with…" value={action} onChange={(e) => setAction(e.target.value)} className="w-52" />
        <datalist id="audit-actions">{facets.data?.actions.map((a) => <option key={a} value={a} />)}</datalist>
        <Select aria-label="Filter by resource type" value={resourceType} onChange={(e) => setResourceType(e.target.value)} className="w-44">
          <option value="">All resources</option>
          {facets.data?.resourceTypes.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Select aria-label="Filter by organisation" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="w-56">
          <option value="">All organisations</option>
          {orgs.data?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">From <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From date" /></label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">To <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To date" /></label>
        {(search || action || resourceType || organizationId || from || to) ? (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setAction(""); setResourceType(""); setOrganizationId(""); setFrom(""); setTo(""); }}>Clear filters</Button>
        ) : null}
      </div>
      {list.isLoading ? (
        <LoadingBlock label="Loading audit events" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <DataTable
          data={list.data?.items ?? []}
          columns={columns}
          caption="Platform audit events"
          meta={list.data?.meta}
          onPageChange={setPage}
          onRowClick={setSelected}
          empty={<EmptyState icon={ScrollText} title="No audit events match these filters" description="Try a wider date range or clear the filters." />}
        />
      )}
      <p className="mt-2 text-xs text-muted-foreground">Select a row for safe metadata. Credentials and tokens are stripped before audit events are stored.</p>
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent title={selected?.action ?? "Audit event"} description={selected ? `${selected.actorName ?? "System"} · ${formatDateTime(selected.createdAt)}` : undefined} wide>
          {selected ? (
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[["Event id", selected.id], ["Organisation", selected.organizationName ?? "Platform"], ["Resource", `${selected.resourceType} ${selected.resourceId ?? ""}`], ["Request id", selected.requestId ?? "—"]].map(([label, value]) => (
                  <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-all font-mono text-xs">{value}</dd></div>
                ))}
              </dl>
              <JsonPanel title="Safe metadata" value={selected.metadata} />
              {selected.metadataRestricted ? <Alert tone="warning" title="Tenant metadata is hidden">This event belongs to an organisation where you have no active support grant. Event type, actor, resource and timestamp stay visible; business metadata requires time-boxed access.</Alert> : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminAuditPage() {
  return (
    <React.Suspense fallback={<LoadingBlock rows={4} label="Loading audit log" />}>
      <AuditPage />
    </React.Suspense>
  );
}
