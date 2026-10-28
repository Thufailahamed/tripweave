"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Hotel, LayoutGrid, Plus, RotateCcw, Search, SlidersHorizontal, Table2, X } from "lucide-react";
import { toast } from "sonner";
import { HOTEL_CATEGORIES } from "@tripweave/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Skeleton, StatusBadge } from "@/components/ui/card";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { apiBlob, apiList, errorMessage, openBlob } from "@/lib/api";
import { useCan } from "@/lib/session";
import { cn, titleCase } from "@/lib/utils";
import { AMENITY_SUGGESTIONS, CATEGORY_LABEL, useDebounced, usePersistedState } from "@/features/hotels/lib";
import { AccessBadge, AmenityChips, CoverImage, HotelCard, ReviewScore } from "@/features/hotels/hotel-card";
import type { Property } from "@/features/hotels/types";
import { IMAGES } from "@/features/marketing/imagery";

const VIEWS = ["grid", "table"] as const;
type View = (typeof VIEWS)[number];

const SORT_OPTIONS = [
  { value: "name:asc", label: "Name (A–Z)" },
  { value: "name:desc", label: "Name (Z–A)" },
  { value: "city:asc", label: "City (A–Z)" },
  { value: "review:desc", label: "Review score (high to low)" },
  { value: "category:asc", label: "Category" },
  { value: "updated:desc", label: "Recently updated" },
] as const;

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div role="group" aria-label="View" className="flex rounded-full border border-border bg-muted/50 p-0.5">
      {([["grid", LayoutGrid, "Grid"], ["table", Table2, "Table"]] as const).map(([key, Icon, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={view === key}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3",
            view === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

function HotelSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="mt-2 h-7 w-full" />
      </div>
    </div>
  );
}

function HotelCatalogue() {
  const can = useCan();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [city, setCity] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [amenity, setAmenity] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [scope, setScope] = React.useState<"all" | "own">("all");
  const [sortKey, setSortKey] = React.useState<string>("name:asc");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [view, setView] = usePersistedState<View>("tw.hotels.view", "grid", VIEWS);

  // Follow ?q= when the global search sends the user here again.
  const urlQ = params.get("q");
  React.useEffect(() => {
    if (urlQ !== null) {
      setQ(urlQ);
      setPage(1);
    }
  }, [urlQ]);

  const dq = useDebounced(q.trim());
  const dcity = useDebounced(city.trim());
  const damenity = useDebounced(amenity.trim());
  const pageSize = view === "grid" ? 12 : 20;
  const [sort = "name", order = "asc"] = sortKey.split(":");
  const query = { q: dq, city: dcity, category, amenity: damenity, status, scope, sort, order, page, pageSize };

  const list = useQuery({ queryKey: ["hotels", query], queryFn: ({ signal }) => apiList<Property>("/hotels", query, signal), placeholderData: (prev) => prev });
  const filtersActive = !!(q.trim() || city.trim() || category || amenity.trim() || status || scope !== "all");
  const reset = () => {
    setQ("");
    setCity("");
    setCategory("");
    setAmenity("");
    setStatus("");
    setScope("all");
    setPage(1);
  };
  const upd = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const cityOptions = React.useMemo(() => {
    const cities = new Set((list.data?.items ?? []).map((hotel) => hotel.city).filter(Boolean));
    if (city.trim()) cities.add(city.trim());
    return [...cities].sort((a, b) => a.localeCompare(b));
  }, [list.data?.items, city]);

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (q.trim()) activeFilters.push({ key: "q", label: `Search: ${q.trim()}`, clear: () => { setQ(""); setPage(1); } });
  if (city.trim()) activeFilters.push({ key: "city", label: `City: ${city.trim()}`, clear: () => { setCity(""); setPage(1); } });
  if (category) activeFilters.push({ key: "category", label: `Category: ${CATEGORY_LABEL[category] ?? category}`, clear: () => { setCategory(""); setPage(1); } });
  if (status) activeFilters.push({ key: "status", label: `Status: ${titleCase(status)}`, clear: () => { setStatus(""); setPage(1); } });
  if (amenity.trim()) activeFilters.push({ key: "amenity", label: `Amenity: ${amenity.trim()}`, clear: () => { setAmenity(""); setPage(1); } });
  if (scope !== "all") activeFilters.push({ key: "scope", label: "Owned properties only", clear: () => { setScope("all"); setPage(1); } });

  const exportCsv = useMutation({
    mutationFn: () => apiBlob("/exports/hotels.csv"),
    onSuccess: (b) => {
      openBlob(b, "hotels.csv");
      toast.success("Your properties were exported as CSV.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns = React.useMemo<ColumnDef<Property>[]>(
    () => [
      {
        id: "name",
        header: "Hotel",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <CoverImage imageId={row.original.coverImageId} alt="" className="size-12 shrink-0 rounded-md" />
            <div className="min-w-0">
              <Link href={`/hotels/${row.original.id}`} className="font-semibold text-primary hover:underline">
                {row.original.name}
              </Link>
              <div className="mt-0.5 flex flex-wrap gap-1">
                <AccessBadge access={row.original.access} />
              </div>
            </div>
          </div>
        ),
      },
      { id: "city", header: "City", enableSorting: false, cell: ({ row }) => row.original.city },
      { id: "category", header: "Category", enableSorting: false, cell: ({ row }) => CATEGORY_LABEL[row.original.category] ?? row.original.category },
      { id: "review", header: "Review", enableSorting: false, cell: ({ row }) => <ReviewScore score={row.original.reviewScore} /> },
      { id: "amenities", header: "Amenities", enableSorting: false, cell: ({ row }) => <AmenityChips amenities={row.original.amenities} max={3} /> },
      { id: "status", header: "Status", enableSorting: false, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    ],
    [],
  );

  const empty = (
    <EmptyState
      icon={Hotel}
      image={filtersActive ? undefined : IMAGES.hotels}
      title={filtersActive ? "No hotels match these filters" : "No hotels yet"}
      description={filtersActive ? "Try removing a filter or searching by a different name or city." : "Add your first property, or ask a partner to share theirs with you."}
      action={
        filtersActive ? (
          <Button variant="outline" onClick={reset}>
            <RotateCcw /> Clear filters
          </Button>
        ) : can("hotels:write") ? (
          <Button asChild>
            <Link href="/hotels/new">
              <Plus /> Add hotel
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div>
      <PageHeader
        title="Hotel catalogue"
        description="Every property you can see and sell — owned, shared by partners, or imported from providers."
        icon={Hotel}
        image={IMAGES.hotels}
        actions={
          <>
            <Button
              variant="outline"
              loading={exportCsv.isPending}
              onClick={() => exportCsv.mutate()}
              title="Exports properties your organisation owns"
              aria-label="Export your properties as CSV"
            >
              <Download /> Export CSV
            </Button>
            {can("hotels:write") ? (
              <Button asChild>
                <Link href="/hotels/new">
                  <Plus /> Add hotel
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
          <div className="hidden min-w-0 items-center gap-2.5 xl:flex">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <SlidersHorizontal className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-[-0.02em]">Find a property</p>
              <p className="truncate text-[11px] text-muted-foreground">Filter the catalogue by name, city, category or amenities.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-xl:w-full max-xl:justify-between xl:ml-auto">
            <span className="tw-num rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground" aria-live="polite">
              {list.data ? `${list.data.meta.total.toLocaleString()} ${filtersActive ? (list.data.meta.total === 1 ? "match" : "matches") : list.data.meta.total === 1 ? "hotel" : "hotels"}` : "Loading…"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="xl:hidden"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-controls="hotel-advanced-filters"
            >
              <SlidersHorizontal /> Filters
              {activeFilters.length > 0 ? <span className="tw-num ml-0.5 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] text-background">{activeFilters.length}</span> : null}
            </Button>
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>

        <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 px-4 pb-4 pt-1 sm:grid-cols-2 xl:grid-cols-12">
          <Field label="Search" htmlFor="hotel-search" className="sm:col-span-2 xl:col-span-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="hotel-search" placeholder="Name or city" className="pl-9" value={q} onChange={(e) => upd(setQ)(e.target.value)} />
            </div>
          </Field>

          <div id="hotel-advanced-filters" className={cn("sm:col-span-2 sm:max-xl:grid-cols-2 max-xl:gap-3 xl:contents", filtersOpen ? "max-xl:grid" : "max-xl:hidden")}>
            <Field label="City" htmlFor="hotel-city" className="xl:col-span-2">
              <Input id="hotel-city" list="hotel-city-options" placeholder="Any city" value={city} onChange={(e) => upd(setCity)(e.target.value)} title="Exact city match" />
              <datalist id="hotel-city-options">
                {cityOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>

            <Field label="Category" htmlFor="hotel-category" className="xl:col-span-2">
              <Select id="hotel-category" value={category} onChange={(e) => upd(setCategory)(e.target.value)}>
                <option value="">All categories</option>
                {HOTEL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Status" htmlFor="hotel-status" className="xl:col-span-2">
              <Select id="hotel-status" value={status} onChange={(e) => upd(setStatus)(e.target.value)}>
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>

            <Field label="Amenity" htmlFor="hotel-amenity" className="xl:col-span-2">
              <Input id="hotel-amenity" placeholder="Any amenity" list="hotel-amenity-options" value={amenity} onChange={(e) => upd(setAmenity)(e.target.value)} />
              <datalist id="hotel-amenity-options">
                {AMENITY_SUGGESTIONS.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </Field>

            <Field label="Ownership" htmlFor="hotel-scope" className="xl:col-span-4">
              <Select id="hotel-scope" value={scope} onChange={(e) => upd(setScope)(e.target.value as "all" | "own")}>
                <option value="all">All visible hotels</option>
                <option value="own">Only my properties</option>
              </Select>
            </Field>

            <Field label="Sort by" htmlFor="hotel-sort" className="xl:col-span-5">
              <Select id="hotel-sort" value={sortKey} onChange={(e) => upd(setSortKey)(e.target.value)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex items-end sm:max-xl:col-span-2 xl:col-span-3">
              <Button type="button" variant="outline" className="w-full" onClick={reset} disabled={!filtersActive}>
                <RotateCcw /> Reset filters
              </Button>
            </div>
          </div>
        </form>

        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 bg-muted/20 px-4 py-3">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Active</span>
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={filter.clear}
                className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium shadow-sm transition-colors hover:border-foreground/25 hover:bg-muted"
              >
                <span className="truncate">{filter.label}</span>
                <X className="size-3 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
            <button type="button" onClick={reset} className="ml-auto text-[11px] font-semibold text-accent underline-offset-2 hover:underline">
              Clear all
            </button>
          </div>
        ) : null}
      </Card>

      {list.isLoading ? (
        view === "grid" ? (
          <div role="status" aria-label="Loading hotels" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <HotelSkeleton key={i} />
            ))}
          </div>
        ) : (
          <LoadingBlock label="Loading hotels" />
        )
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="Could not load hotels" />
      ) : list.data && list.data.items.length === 0 ? (
        empty
      ) : list.data ? (
        <div aria-busy={list.isPlaceholderData} className={cn("transition-opacity", list.isPlaceholderData && "opacity-60")}>
          {view === "grid" ? (
            <>
              <ul aria-label="Hotel results" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {list.data.items.map((hotel) => (
                  <li key={hotel.id} className="min-w-0">
                    <HotelCard hotel={hotel} />
                  </li>
                ))}
              </ul>
              {list.data.meta.pages > 1 ? (
                <Card className="mt-4 overflow-hidden">
                  <Pagination meta={list.data.meta} onPageChange={setPage} />
                </Card>
              ) : null}
            </>
          ) : (
            <DataTable data={list.data.items} columns={columns} meta={list.data.meta} onPageChange={setPage} caption="Hotel catalogue" />
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function HotelsPage() {
  return (
    <React.Suspense fallback={<LoadingBlock label="Loading hotels" />}>
      <HotelCatalogue />
    </React.Suspense>
  );
}
