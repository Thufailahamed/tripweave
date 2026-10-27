"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Map, Plus, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/form";
import { useCan } from "@/lib/session";
import { IMAGES } from "@/features/marketing/imagery";
import { dateRange, formatDate, money, titleCase } from "@/lib/utils";
import { useDebouncedValue, useTripsList } from "@/features/trips/hooks";
import { TRIP_STATUSES, type Trip } from "@/features/trips/types";

const SORTS = [
  { value: "updated", label: "Last updated" },
  { value: "created", label: "Date created" },
  { value: "arrival", label: "Arrival date" },
  { value: "title", label: "Title" },
  { value: "status", label: "Status" },
];

function TripsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const can = useCan();
  const urlQ = sp.get("q") ?? "";
  const [search, setSearch] = React.useState(urlQ);
  const status = sp.get("status") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const sort = sp.get("sort") ?? "updated";
  const order = sp.get("order") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);

  // Keep the box in step when the shell search box navigates here with a new ?q=.
  React.useEffect(() => setSearch(urlQ), [urlQ]);

  const setParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in patch)) next.delete("page");
      const s = next.toString();
      router.replace(s ? `/trips?${s}` : "/trips");
    },
    [router, sp],
  );

  const debounced = useDebouncedValue(search.trim());
  React.useEffect(() => {
    if (debounced !== urlQ) setParams({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const dateError = from && to && to < from ? "The end date must be on or after the start date." : null;
  const list = useTripsList({ q: urlQ || undefined, status: status || undefined, from: from || undefined, to: dateError ? undefined : to || undefined, sort, order, page, pageSize: 20 });
  const filtersActive = !!(urlQ || status || from || to);

  const columns = React.useMemo<ColumnDef<Trip>[]>(
    () => [
      {
        header: "Trip",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/trips/${row.original.id}`} className="font-semibold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.original.title}
            </Link>
            <p className="text-xs text-muted-foreground">{row.original.customerName ?? "No customer"}</p>
          </div>
        ),
      },
      { header: "Dates", enableSorting: false, cell: ({ row }) => <span className="tw-num">{dateRange(row.original.arrivalDate, row.original.departureDate)}</span> },
      { header: "Guests", enableSorting: false, cell: ({ row }) => <span className="tw-num">{row.original.party.adults + row.original.party.children}</span> },
      {
        header: "Budget",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tw-num">
            {row.original.budgetAmountMinor === null ? "—" : money(row.original.budgetAmountMinor, row.original.budgetCurrency)}
            {row.original.budgetAmountMinor !== null ? <span className="ml-1 text-xs text-muted-foreground">{row.original.budgetScope === "all_inclusive_trip" ? "whole trip" : "accommodation"}</span> : null}
          </span>
        ),
      },
      { header: "Status", enableSorting: false, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { header: "Updated", enableSorting: false, cell: ({ row }) => <span className="tw-num text-muted-foreground">{formatDate(row.original.updatedAt)}</span> },
    ],
    [],
  );

  const newAction = can("trips:write") ? (
    <Button asChild>
      <Link href="/trips/new">
        <Plus /> New trip request
      </Link>
    </Button>
  ) : undefined;

  return (
    <div>
      <PageHeader title="Trip requests" description="Every enquiry from first message to won or lost." actions={newAction} icon={Map} image={IMAGES.flow} />
      <form role="search" aria-label="Filter trips" className="tw-surface mb-4 grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => e.preventDefault()}>
        <Field label="Search" htmlFor="trip-q" className="lg:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="trip-q" className="pl-8" placeholder="Trip title or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Field>
        <Field label="Status" htmlFor="trip-status">
          <Select id="trip-status" value={status} onChange={(e) => setParams({ status: e.target.value })}>
            <option value="">All statuses</option>
            {TRIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Arrival from" htmlFor="trip-from">
          <Input id="trip-from" type="date" value={from} onChange={(e) => setParams({ from: e.target.value })} />
        </Field>
        <Field label="Arrival to" htmlFor="trip-to" error={dateError}>
          <Input id="trip-to" type="date" value={to} min={from || undefined} onChange={(e) => setParams({ to: e.target.value })} />
        </Field>
        <Field label="Sort by" htmlFor="trip-sort">
          <div className="flex gap-1">
            <Select id="trip-sort" value={sort} onChange={(e) => setParams({ sort: e.target.value })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Button variant="outline" size="icon" aria-label={order === "asc" ? "Ascending; switch to descending" : "Descending; switch to ascending"} onClick={() => setParams({ order: order === "asc" ? "desc" : "asc" })}>
              {order === "asc" ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
            </Button>
          </div>
        </Field>
        {filtersActive ? (
          <div className="sm:col-span-2 lg:col-span-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                router.replace("/trips");
              }}
            >
              Clear all filters
            </Button>
          </div>
        ) : null}
      </form>
      {list.isLoading ? (
        <LoadingBlock label="Loading trips" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="Could not load trip requests" />
      ) : (
        <DataTable
          data={list.data!.items}
          columns={columns}
          caption="Trip requests"
          meta={list.data!.meta}
          onPageChange={(p) => setParams({ page: String(p) })}
          onRowClick={(t) => router.push(`/trips/${t.id}`)}
          empty={
            filtersActive ? (
              <EmptyState icon={Map} title="No trips match these filters" description="Widen the date range or clear the filters." />
            ) : (
              <EmptyState icon={Map} image={IMAGES.flow} title="No trip requests yet" description="Paste a customer enquiry or fill in the requirements to create your first trip." action={newAction} />
            )
          }
        />
      )}
    </div>
  );
}

export default function TripsPage() {
  return (
    <React.Suspense fallback={<LoadingBlock label="Loading trips" />}>
      <TripsInner />
    </React.Suspense>
  );
}
