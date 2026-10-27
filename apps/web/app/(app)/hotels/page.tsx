"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownAZ, ArrowUpAZ, Download, Hotel, LayoutGrid, Plus, Search, Table2, X } from "lucide-react";
import { toast } from "sonner";
import { HOTEL_CATEGORIES } from "@tripweave/shared";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Skeleton, StatusBadge } from "@/components/ui/card";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { apiBlob, apiList, errorMessage, openBlob } from "@/lib/api";
import { useCan } from "@/lib/session";
import { AMENITY_SUGGESTIONS, CATEGORY_LABEL, useDebounced, usePersistedState } from "@/features/hotels/lib";
import { AccessBadge, AmenityChips, CoverImage, HotelCard, ReviewScore } from "@/features/hotels/hotel-card";
import type { Property } from "@/features/hotels/types";
import { IMAGES } from "@/features/marketing/imagery";

const VIEWS = ["grid", "table"] as const;
const SORTS = [
  { value: "name", label: "Name" },
  { value: "city", label: "City" },
  { value: "category", label: "Category" },
  { value: "review", label: "Review score" },
  { value: "updated", label: "Recently updated" },
] as const;

function HotelCatalogue() {
  const can = useCan();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [city, setCity] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [amenity, setAmenity] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [scope, setScope] = React.useState<"all" | "own">("all");
  const [sort, setSort] = React.useState<string>("name");
  const [order, setOrder] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);
  const [view, setView] = usePersistedState<(typeof VIEWS)[number]>("tw.hotels.view", "grid", VIEWS);

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
  const query = { q: dq, city: dcity, category, amenity: damenity, status, scope, sort, order, page, pageSize };

  const list = useQuery({ queryKey: ["hotels", query], queryFn: ({ signal }) => apiList<Property>("/hotels", query, signal), placeholderData: (prev) => prev });
  const filtersActive = !!(q || city || category || amenity || status || scope !== "all");
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

  const exportCsv = useMutation({
    mutationFn: () => apiBlob("/exports/hotels.csv"),
    onSuccess: (b) => {
      openBlob(b, "hotels.csv");
      toast.success("Hotel list exported (your own properties).");
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
      title={filtersActive ? "No hotels match these filters" : "No hotels yet"}
      description={filtersActive ? "Try removing a filter or searching by a different name or city." : "Add your first property, or ask a partner to share theirs with you."}
      action={
        filtersActive ? (
          <Button variant="outline" onClick={reset}>
            Clear filters
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
        description="Properties you own, properties partners have shared with you, and provider listings."
        icon={Hotel}
        image={IMAGES.hotels}
        actions={
          <>
            <Button variant="outline" loading={exportCsv.isPending} onClick={() => exportCsv.mutate()}>
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

      <Card className="mb-5 p-4">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search hotels by name or city" placeholder="Search by name or city" className="pl-9" value={q} onChange={(e) => upd(setQ)(e.target.value)} />
          </div>
          <Input aria-label="Filter by city" placeholder="City (exact)" value={city} onChange={(e) => upd(setCity)(e.target.value)} />
          <Select aria-label="Filter by category" value={category} onChange={(e) => upd(setCategory)(e.target.value)}>
            <option value="">All categories</option>
            {HOTEL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          <div>
            <Input aria-label="Filter by amenity" placeholder="Amenity" list="amenity-options" value={amenity} onChange={(e) => upd(setAmenity)(e.target.value)} />
            <datalist id="amenity-options">
              {AMENITY_SUGGESTIONS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <Select aria-label="Filter by status" value={status} onChange={(e) => upd(setStatus)(e.target.value)}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Select aria-label="Ownership scope" value={scope} onChange={(e) => upd(setScope)(e.target.value as "all" | "own")}>
            <option value="all">All visible hotels</option>
            <option value="own">Only my properties</option>
          </Select>
          <div className="flex gap-2">
            <Select aria-label="Sort by" value={sort} onChange={(e) => upd(setSort)(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  Sort: {s.label}
                </option>
              ))}
            </Select>
            <Button type="button" variant="outline" size="icon" aria-label={order === "asc" ? "Ascending; switch to descending" : "Descending; switch to ascending"} onClick={() => upd(setOrder)(order === "asc" ? "desc" : "asc")}>
              {order === "asc" ? <ArrowDownAZ /> : <ArrowUpAZ />}
            </Button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {list.data ? `${list.data.meta.total} hotel${list.data.meta.total === 1 ? "" : "s"}` : "Loading…"}
            {filtersActive ? (
              <Button variant="link" size="sm" className="ml-2 h-auto p-0 text-xs" onClick={reset}>
                <X /> Clear filters
              </Button>
            ) : null}
          </p>
          <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-md border border-input">
            <Button type="button" size="sm" variant={view === "grid" ? "secondary" : "ghost"} aria-pressed={view === "grid"} className="rounded-none" onClick={() => setView("grid")}>
              <LayoutGrid /> Grid
            </Button>
            <Button type="button" size="sm" variant={view === "table" ? "secondary" : "ghost"} aria-pressed={view === "table"} className="rounded-none" onClick={() => setView("table")}>
              <Table2 /> Table
            </Button>
          </div>
        </div>
      </Card>

      {list.isLoading ? (
        view === "grid" ? (
          <div role="status" aria-label="Loading hotels" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-72" />
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
        <div className={list.isPlaceholderData ? "opacity-60 transition-opacity" : ""}>
          {view === "grid" ? (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.data.items.map((h) => (
                  <li key={h.id} className="flex">
                    <div className="flex w-full">
                      <HotelCard hotel={h} />
                    </div>
                  </li>
                ))}
              </ul>
              {list.data.meta.pages > 1 ? (
                <Card className="mt-4">
                  <Pagination meta={list.data.meta} onPageChange={setPage} />
                </Card>
              ) : null}
            </>
          ) : (
            <DataTable data={list.data.items} columns={columns} meta={list.data.meta} onPageChange={setPage} caption="Hotels" />
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
