"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CalendarDays, Map, MapPin, Plus, Search, Users } from "lucide-react";
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

const initialsOf = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

function FilterChip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-full border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background"
          : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

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
        cell: ({ row }) => {
          const t = row.original;
          const destinations = t.parseResult?.parsed?.destinations ?? [];
          return (
            <div className="flex min-w-[240px] items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent-soft text-[11px] font-semibold text-accent" aria-hidden>
                {initialsOf(t.customerName || t.title)}
              </span>
              <div className="min-w-0">
                <Link href={`/trips/${t.id}`} className="font-semibold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                  {t.title}
                </Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{t.customerName ?? "No customer"}</span>
                  {destinations.length > 0 ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{destinations.slice(0, 4).join(" · ")}</span>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        header: "Dates",
        enableSorting: false,
        cell: ({ row }) => {
          const nights = row.original.arrivalDate && row.original.departureDate ? Math.max(0, Math.round((Date.parse(row.original.departureDate) - Date.parse(row.original.arrivalDate)) / 86_400_000)) : null;
          return (
            <div className="whitespace-nowrap">
              <p className="tw-num">{dateRange(row.original.arrivalDate, row.original.departureDate)}</p>
              {nights !== null ? <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3" aria-hidden />{nights} night{nights === 1 ? "" : "s"}</p> : null}
            </div>
          );
        },
      },
      {
        header: "Guests",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tw-num inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
            <Users className="size-3.5 text-muted-foreground" aria-hidden />
            {row.original.party.adults + row.original.party.children}
          </span>
        ),
      },
      {
        header: "Budget",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tw-num whitespace-nowrap">
            {row.original.budgetAmountMinor === null ? "—" : money(row.original.budgetAmountMinor, row.original.budgetCurrency)}
            {row.original.budgetAmountMinor !== null ? <span className="ml-1 text-xs text-muted-foreground">{row.original.budgetScope === "all_inclusive_trip" ? "whole trip" : "accommodation"}</span> : null}
          </span>
        ),
      },
      { header: "Status", enableSorting: false, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { header: "Updated", enableSorting: false, cell: ({ row }) => <span className="tw-num whitespace-nowrap text-muted-foreground">{formatDate(row.original.updatedAt)}</span> },
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
      <PageHeader title="Trip requests" description="Every enquiry from first message to won or lost." actions={newAction} icon={Map} image={IMAGES.hotels} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quick view</span>
        <FilterChip active={!status} onClick={() => setParams({ status: null })}>All</FilterChip>
        {TRIP_STATUSES.map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setParams({ status: s })}>{titleCase(s)}</FilterChip>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {list.data ? `${list.data.meta.total} request${list.data.meta.total === 1 ? "" : "s"}` : "Loading…"}
        </span>
      </div>

      <form role="search" aria-label="Filter trips" className="tw-surface mb-4 grid gap-3 rounded-2xl border border-border p-4 shadow-[0_14px_40px_-30px_rgba(20,26,45,0.3)] sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => e.preventDefault()}>
        <Field label="Search" htmlFor="trip-q" className="lg:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="trip-q" className="pl-8" placeholder="Trip title or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
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
