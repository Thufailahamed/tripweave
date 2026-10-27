"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, Building2, Mail, Plug, Search, ShieldCheck } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, IconTile, LoadingBlock, PageHeader, Stat, StatusBadge } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { apiGet, apiList } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import { AdminGuard, type AdminOrganization } from "@/features/admin/admin-guard";
import { ProviderHealthTable, type ProviderHealth } from "@/features/settings/provider-health";

interface Metrics {
  organizations: { type: string; status: string; n: number }[];
  jobsLast7d: { status: string; n: number; avg_ms: number | null }[];
  providerHealthPlatformWide: ProviderHealth[];
  pendingEmails: number;
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function MetricsSection() {
  const q = useQuery({ queryKey: ["admin-metrics"], queryFn: () => apiGet<Metrics>("/admin/metrics") });
  if (q.isLoading) return <LoadingBlock rows={3} label="Loading platform metrics" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load platform metrics" />;
  const m = q.data!;
  const total = m.organizations.reduce((s, o) => s + o.n, 0);
  const jobsTotal = m.jobsLast7d.reduce((s, j) => s + j.n, 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Building2} iconTone="primary" label="Organisations" value={total} />
        <Stat icon={Activity} iconTone="info" label="Optimisation jobs, 7 days" value={jobsTotal} />
        <Stat icon={Mail} iconTone="warning" label="Pending emails" value={m.pendingEmails} tone={m.pendingEmails > 0 ? "warning" : "default"} hint="Queued in the outbox, not yet delivered" />
        <Stat icon={Plug} iconTone="success" label="Providers called, 7 days" value={m.providerHealthPlatformWide.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <IconTile icon={Building2} tone="primary" size="sm" />
            <CardTitle>Organisations by type and status</CardTitle>
          </CardHeader>
          <CardContent>
            {m.organizations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organisations yet.</p>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Organisation counts by type and status</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1 font-semibold">Type</th>
                    <th scope="col" className="py-1 font-semibold">Status</th>
                    <th scope="col" className="py-1 text-right font-semibold">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {m.organizations.map((o) => (
                    <tr key={`${o.type}-${o.status}`} className="border-t border-border">
                      <td className="py-1.5">{titleCase(o.type)}</td>
                      <td className="py-1.5">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="tw-num py-1.5 text-right">{o.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <IconTile icon={Activity} tone="info" size="sm" />
            <CardTitle>Optimisation jobs, last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            {m.jobsLast7d.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs were run in the last 7 days.</p>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Jobs by status with average duration</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1 font-semibold">Status</th>
                    <th scope="col" className="py-1 text-right font-semibold">Jobs</th>
                    <th scope="col" className="py-1 text-right font-semibold">Avg duration</th>
                  </tr>
                </thead>
                <tbody>
                  {m.jobsLast7d.map((j) => (
                    <tr key={j.status} className="border-t border-border">
                      <td className="py-1.5">
                        <StatusBadge status={j.status} />
                      </td>
                      <td className="tw-num py-1.5 text-right">{j.n}</td>
                      <td className="tw-num py-1.5 text-right">{j.avg_ms === null ? "—" : `${(j.avg_ms / 1000).toFixed(1)} s`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="ph">
        <h2 id="ph" className="mb-2 font-display text-lg font-semibold">
          Provider health, platform-wide
        </h2>
        <ProviderHealthTable rows={m.providerHealthPlatformWide} caption="Platform-wide provider health, last 7 days" />
      </section>
    </div>
  );
}

function OrganisationsSection() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const q = useDebounced(search.trim());
  React.useEffect(() => setPage(1), [q]);
  const list = useQuery({
    queryKey: ["admin-orgs", q, page],
    queryFn: () => apiList<AdminOrganization>("/admin/organizations", { q, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  const columns = React.useMemo<ColumnDef<AdminOrganization, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Organisation",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.slug}</p>
          </div>
        ),
      },
      { accessorKey: "organizationType", header: "Type", cell: ({ row }) => titleCase(row.original.organizationType) },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { accessorKey: "memberCount", header: "Members", cell: ({ row }) => <span className="tw-num">{row.original.memberCount ?? 0}</span> },
      { accessorKey: "country", header: "Country", cell: ({ row }) => row.original.country },
      { accessorKey: "createdAt", header: "Created", cell: ({ row }) => <span className="tw-num text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    ],
    [],
  );
  return (
    <section aria-labelledby="orgs-h">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 id="orgs-h" className="font-display text-lg font-semibold">
          Organisations
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search organisations by name" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 pl-8" />
        </div>
      </div>
      {list.isLoading ? (
        <LoadingBlock label="Loading organisations" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <DataTable
          data={list.data?.items ?? []}
          columns={columns}
          caption="Organisations"
          meta={list.data?.meta}
          onPageChange={setPage}
          onRowClick={(o) => router.push(`/admin/${o.id}`)}
          empty={<EmptyState title={q ? "No organisations match your search" : "No organisations yet"} description={q ? "Try a different name." : "Organisations appear here after they register."} />}
        />
      )}
      <p className="mt-2 text-xs text-muted-foreground">Select a row to open the organisation. Click or press Enter.</p>
    </section>
  );
}

export default function AdminPage() {
  return (
    <AdminGuard>
      <PageHeader title="Platform admin" eyebrow="Platform" description="Operate the TripWeave platform. Tenant data stays private unless you request time-boxed support access." icon={ShieldCheck} image={IMAGES.features} />
      <Alert tone="info" className="mb-6">
        Every action on this page and its sub-pages is recorded in the audit log, including opening an organisation.
      </Alert>
      <div className="flex flex-col gap-8">
        <MetricsSection />
        <OrganisationsSection />
      </div>
    </AdminGuard>
  );
}
