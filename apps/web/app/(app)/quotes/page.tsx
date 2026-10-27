"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Search, X } from "lucide-react";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { apiList } from "@/lib/api";
import { formatDate, money, percentFromBp } from "@/lib/utils";
import { QUOTE_STATUS_OPTIONS, statusLabel } from "@/features/quotes/helpers";
import { quoteKeys, type QuoteSummary } from "@/features/quotes/types";
import { IMAGES } from "@/features/marketing/imagery";

const PAGE_SIZE = 20;

export default function QuotesPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = { q: q || undefined, status: status || undefined, page, pageSize: PAGE_SIZE };
  const query = useQuery({
    queryKey: quoteKeys.list(params),
    queryFn: () => apiList<QuoteSummary>("/quotes", params),
    placeholderData: keepPreviousData,
  });

  const showMargin = (query.data?.items ?? []).some((x) => x.grossMarginBp !== undefined);
  const columns = React.useMemo<ColumnDef<QuoteSummary, any>[]>(() => {
    const cols: ColumnDef<QuoteSummary, any>[] = [
      {
        id: "number",
        header: "Quotation",
        accessorFn: (r) => r.quoteNumber,
        cell: ({ row }) => (
          <Link href={`/quotes/${row.original.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-primary hover:underline">
            {row.original.quoteNumber}
          </Link>
        ),
      },
      {
        id: "customer",
        header: "Customer / trip",
        accessorFn: (r) => r.customerName ?? "",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.customerName ?? "No customer"}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.tripTitle ?? "—"}</p>
          </div>
        ),
      },
      { id: "status", header: "Status", accessorFn: (r) => r.status, cell: ({ row }) => <StatusBadge status={row.original.status} label={statusLabel(row.original.status)} /> },
      { id: "valid", header: "Valid until", accessorFn: (r) => r.validUntil ?? "", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.validUntil)}</span> },
      { id: "version", header: "Version", accessorFn: (r) => r.currentVersion, cell: ({ row }) => <span className="tw-num">v{row.original.currentVersion}</span> },
      {
        id: "price",
        header: () => <span className="block text-right">Selling price</span>,
        accessorFn: (r) => r.sellingPriceMinor ?? 0,
        cell: ({ row }) => <span className="tw-num block text-right font-medium">{money(row.original.sellingPriceMinor, row.original.currency)}</span>,
      },
    ];
    if (showMargin)
      cols.push({
        id: "margin",
        header: () => <span className="block text-right">Margin</span>,
        accessorFn: (r) => r.grossMarginBp ?? 0,
        cell: ({ row }) => <span className="tw-num block text-right">{row.original.grossMarginBp !== undefined ? percentFromBp(row.original.grossMarginBp) : "—"}</span>,
      });
    cols.push({ id: "updated", header: "Updated", accessorFn: (r) => r.updatedAt, cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.updatedAt)}</span> });
    return cols;
  }, [showMargin]);

  const filtered = !!q || !!status;
  const clear = () => {
    setSearch("");
    setQ("");
    setStatus("");
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Quotations" description="Every quotation with its current version, status and selling price. Open one to revise, approve, send or download it." icon={FileText} image={IMAGES.features} />
      <form role="search" className="tw-surface mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border p-4" onSubmit={(e) => e.preventDefault()}>
        <label className="relative min-w-60 flex-1 sm:max-w-sm">
          <span className="sr-only">Search quotations</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-9" type="search" placeholder="Search number, customer or trip" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="sr-only">Filter by status</span>
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Filter by status" className="w-44">
            <option value="">All statuses</option>
            {QUOTE_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        </label>
        {filtered ? (
          <Button variant="ghost" onClick={clear}>
            <X /> Clear filters
          </Button>
        ) : null}
      </form>

      <div aria-live="polite" className="sr-only">
        {query.data ? `${query.data.meta.total} quotations` : ""}
      </div>
      {query.isLoading ? (
        <LoadingBlock rows={6} label="Loading quotations" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load quotations" />
      ) : (
        <DataTable
          caption="Quotations"
          data={query.data?.items ?? []}
          columns={columns}
          meta={query.data?.meta}
          onPageChange={setPage}
          onRowClick={(r) => router.push(`/quotes/${r.id}`)}
          empty={
            filtered ? (
              <EmptyState icon={Search} title="No quotations match" description="Try a different search or clear the filters." action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState
                icon={FileText}
                image={IMAGES.features}
                title="No quotations yet"
                description="Quotations are created from an optimised package on a trip request. Create a trip request, run the optimiser, then quote the package you like."
                action={
                  <Button asChild>
                    <Link href="/trips">Go to trip requests</Link>
                  </Button>
                }
              />
            )
          }
        />
      )}
    </div>
  );
}
