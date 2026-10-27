"use client";
import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Select } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { apiDelete, apiList, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import type { AccessGrant } from "@/features/admin/types";

function until(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "expired";
  const minutes = Math.round(ms / 60_000);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function AdminSupportPage() {
  const qc = useQueryClient();
  const [scope, setScope] = React.useState<"active" | "all">("active");
  const [page, setPage] = React.useState(1);
  const [revoking, setRevoking] = React.useState<AccessGrant | null>(null);
  React.useEffect(() => setPage(1), [scope]);
  const list = useQuery({
    queryKey: ["admin-grants", scope, page],
    queryFn: () => apiList<AccessGrant>("/admin/access-grants", { active: scope === "active" ? "true" : "false", page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/access-grants/${id}`),
    onSuccess: () => {
      toast.success("Access grant revoked");
      qc.invalidateQueries({ queryKey: ["admin-grants"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-org"] });
      setRevoking(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const columns = React.useMemo<ColumnDef<AccessGrant, any>[]>(
    () => [
      { accessorKey: "organizationName", header: "Organisation", cell: ({ row }) => <Link href={`/admin/organizations/${row.original.organizationId}`} className="font-semibold hover:underline">{row.original.organizationName}</Link> },
      { accessorKey: "platformUserName", header: "Platform admin", cell: ({ row }) => <div><p className="text-sm">{row.original.platformUserName ?? "—"}</p><p className="text-[10px] text-muted-foreground">{row.original.platformUserEmail}</p></div> },
      { accessorKey: "reason", header: "Reason", cell: ({ row }) => <span className="line-clamp-2 max-w-[22rem] text-xs text-muted-foreground">{row.original.reason}</span> },
      { accessorKey: "createdAt", header: "Granted", cell: ({ row }) => <span className="tw-num text-xs text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
      { accessorKey: "expiresAt", header: "Expires", cell: ({ row }) => <span className="tw-num text-xs" title={formatDateTime(row.original.expiresAt)}>{until(row.original.expiresAt)}</span> },
      { id: "state", header: "State", cell: ({ row }) => <Badge tone={row.original.active ? "success" : row.original.revokedAt ? "danger" : "neutral"}>{row.original.active ? "Active" : row.original.revokedAt ? "Revoked" : "Expired"}</Badge> },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (row.original.active ? <Button size="sm" variant="outline" onClick={() => setRevoking(row.original)}>Revoke</Button> : null),
      },
    ],
    [],
  );
  return (
    <>
      <PageHeader
        title="Support access"
        eyebrow="Platform administration"
        description="Time-boxed grants that let platform staff read tenant business content for support. Grants are reason-bound, expire automatically and can be revoked at any time."
        icon={ShieldCheck}
        image={IMAGES.features}
      />
      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader><CardTitle>How access works</CardTitle><CardDescription>The privacy model is deliberate.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p><span className="font-semibold text-foreground">1.</span> A platform admin opens an organisation and requests access with a reason and a duration (5–240 minutes).</p>
            <p><span className="font-semibold text-foreground">2.</span> The grant is checked on every tenant-data read. Without a live grant, the API returns 403 and no tenant content is exposed.</p>
            <p><span className="font-semibold text-foreground">3.</span> Every grant, every read and every revocation is recorded in the audit log with the admin's name.</p>
            <p>Operational metadata (job status, provider health, counts, account identity) does not require a grant. Customer names, trip titles, quotation content and job payloads do.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Active grants at a glance</CardTitle><CardDescription>Revoke access immediately when an investigation ends.</CardDescription></CardHeader>
          <CardContent>
            {list.data ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">Shown on this page</p><p className="tw-num font-display text-3xl font-semibold">{list.data.meta.total}</p><p className="mt-1 text-xs text-muted-foreground">{scope === "active" ? "active grants" : "grants in history"}</p></div>
                <div className="rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">Longest live grant</p><p className="font-display text-lg font-semibold">{list.data.items.filter((g) => g.active).length > 0 ? until(list.data.items.filter((g) => g.active).sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0]!.expiresAt) : "—"}</p><p className="mt-1 text-xs text-muted-foreground">time until expiry</p></div>
              </div>
            ) : <div className="h-24 animate-pulse rounded-lg bg-muted" />}
            <Alert tone="info" className="mt-4">Prefer the shortest duration that lets you finish the investigation. Revoke as soon as you are done.</Alert>
          </CardContent>
        </Card>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select aria-label="Grant scope" value={scope} onChange={(e) => setScope(e.target.value as "active" | "all")} className="w-44">
          <option value="active">Active only</option>
          <option value="all">All grants</option>
        </Select>
        <p className="text-xs text-muted-foreground">Request new access from an organisation&apos;s <span className="font-medium">Support &amp; data</span> tab.</p>
      </div>
      {list.isLoading ? <LoadingBlock label="Loading access grants" /> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <DataTable data={list.data?.items ?? []} columns={columns} caption="Support access grants" meta={list.data?.meta} onPageChange={setPage} empty={<EmptyState icon={ShieldAlert} title={scope === "active" ? "No active support grants" : "No grants recorded"} description={scope === "active" ? "Tenant data is not readable without one." : "Grants appear here when an admin requests tenant access."} />} />
      )}
      <ConfirmDialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)} title={revoking ? `Revoke access to ${revoking.organizationName}?` : ""} description="The admin loses tenant-data access immediately. This cannot be undone; a new grant must be requested if needed." confirmLabel="Revoke grant" destructive loading={revoke.isPending} onConfirm={() => revoking && revoke.mutate(revoking.id)} />
    </>
  );
}
