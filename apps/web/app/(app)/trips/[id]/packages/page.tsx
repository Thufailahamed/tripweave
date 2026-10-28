"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, Layers, LayoutGrid, ShieldCheck, Sparkles, Table2, Users, Wallet, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { OBJECTIVE_LABELS } from "@tripweave/shared";
import type { PlanningPackageView } from "@tripweave/planning-contract";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { IMAGES } from "@/features/marketing/imagery";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";
import { apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { cn, formatDate, formatDateTime, nightsLabel, titleCase } from "@/lib/utils";
import { PackageStoryPanel } from "@/features/package-showcase/panel";
import { buildGalleryProgram, PackageGallery } from "@/features/package-showcase/gallery";
import { useShowcaseActions, type PackageEdit } from "@/features/package-showcase/actions";
import { fetchPackageSnapshot } from "@/features/package-showcase/use-package-stream";
import { needsLiveCheck, liveStatus, sellingPriceOf } from "@/features/package-showcase/helpers";
import { useRunHotelPhotos } from "@/features/package-showcase/photos";
import { CurrencySwitcher, DisplayCurrencyProvider, useMoney } from "@/features/package-showcase/currency";
import { InfeasibilityPanel, ProviderOutcomes } from "@/features/trips/job-results";
import { ReplaceHotelDialog } from "@/features/trips/replace-hotel-dialog";
import { RepriceDialog } from "@/features/trips/reprice-dialog";
import { tripKeys, useJobs, usePackages, useTrip } from "@/features/trips/hooks";
import type { PackageView } from "@/features/trips/types";

type ViewMode = "cards" | "compare";
type FilterMode = "all" | "under" | "live";
type SortMode = "recommended" | "price" | "score";

function HeroStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "success" | "warning" }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.07] p-3.5 backdrop-blur-md">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">{label}</p>
      <p className={cn("tw-num mt-1.5 font-display text-[22px] font-semibold leading-none tracking-[-0.04em] text-white", tone === "success" && "text-[#a8d5a2]", tone === "warning" && "text-[#f2c97d]")}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-white/55">{hint}</p> : null}
    </div>
  );
}

function PackageHero({
  tripId,
  trip,
  packages,
  completedAt,
  canOptimise,
}: {
  tripId: string;
  trip: ReturnType<typeof useTrip>["data"];
  packages: PackageView[];
  completedAt: string | null;
  canOptimise: boolean;
}) {
  const fmt = useMoney();
  const t = trip?.trip;
  const stops = trip?.itinerary?.stops ?? [];
  const currency = packages[0]?.pricing?.currency ?? t?.budgetCurrency ?? "USD";
  const prices = packages.map((p) => p.pricing?.sellingPriceMinor).filter((v): v is number => typeof v === "number");
  const best = prices.length ? Math.min(...prices) : null;
  const budget = t?.budgetAmountMinor ?? null;
  // Packages built only from catalogue rates need no live check, so they count as ready.
  const ready = packages.filter((p) => !needsLiveCheck(p as unknown as PlanningPackageView)).length;
  const underBudget = packages.filter((p) => p.package.budgetDifferenceMinor !== null && p.package.budgetDifferenceMinor >= 0).length;
  const nights = stops.reduce((n, s) => n + s.nights, 0);
  const party = t ? `${t.party.adults} adult${t.party.adults === 1 ? "" : "s"}${t.party.children ? `, ${t.party.children} child${t.party.children === 1 ? "" : "ren"}` : ""}` : null;
  const cover = stops[0]?.destination ?? "";

  return (
    <section className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1714] text-white shadow-[0_30px_90px_-40px_rgba(4,20,24,0.7)]">
      <div aria-hidden className="absolute inset-0 -z-20">
        {cover ? <DestinationPhoto destination={cover} eager className="size-full" imgClassName="opacity-70" /> : null}
      </div>
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1714] via-[#0b1714]/85 to-[#0b1714]/30" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[#0b1714] to-transparent" />

      <div className="relative flex flex-col gap-8 p-6 md:p-9">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
              Hotel packages{nights ? ` · ${nightsLabel(nights)}` : ""}
              {completedAt ? <span className="hidden font-normal normal-case tracking-normal text-white/45 sm:inline"> · run {formatDateTime(completedAt)}</span> : null}
            </p>
            <h1 className="mt-3 break-words font-display text-[34px] font-semibold leading-[1] tracking-[-0.055em] md:text-[52px]">{t?.title ?? "Package comparison"}</h1>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              {stops.map((s, i) => (
                <span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] py-1 pl-1 pr-3 backdrop-blur-md">
                  <span className="relative size-6 overflow-hidden rounded-full ring-1 ring-white/30">
                    <DestinationPhoto destination={s.destination} className="size-full" />
                  </span>
                  <span className="tw-num text-white/50">{i + 1}</span>
                  <span className="font-medium text-white/90">{s.destination}</span>
                  <span className="text-white/50">{nightsLabel(s.nights)}</span>
                </span>
              ))}
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
              {t?.arrivalDate && t.departureDate ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-accent" aria-hidden />
                  {formatDate(t.arrivalDate)} – {formatDate(t.departureDate)}
                </span>
              ) : null}
              {party ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5 text-accent" aria-hidden />
                  {party} · {t!.party.rooms.length} room{t!.party.rooms.length === 1 ? "" : "s"}
                </span>
              ) : null}
              {budget !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="size-3.5 text-accent" aria-hidden />
                  {fmt(budget, t!.budgetCurrency)} {t?.budgetScope === "accommodation_only" ? "for hotels" : "for the trip"}
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canOptimise ? (
              <Button asChild className="border-0 bg-white text-[#0b1714] hover:bg-white/90">
                <Link href={`/trips/${tripId}/optimise`}>
                  <Wand2 /> New optimisation
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <Link href={`/trips/${tripId}/itinerary`}>Review itinerary</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <HeroStat label="Packages" value={String(packages.length)} hint={packages.length ? `${underBudget} within budget` : "Run an optimisation"} />
          <HeroStat label="From" value={best === null ? "—" : fmt(best, currency)} hint="Lowest package price" />
          <HeroStat label="Budget" value={budget === null ? "Not set" : fmt(budget, t!.budgetCurrency)} hint={t?.budgetScope === "accommodation_only" ? "Accommodation only" : "Whole trip"} />
          <HeroStat label="Ready to quote" value={packages.length ? `${ready} of ${packages.length}` : "—"} hint={ready === packages.length && ready > 0 ? "All rates live or contracted" : "Check live prices first"} tone={packages.length && ready === packages.length ? "success" : packages.length ? "warning" : undefined} />
        </div>
      </div>
    </section>
  );
}

function FilterChip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex rounded-full border border-border bg-muted/50 p-0.5" role="group" aria-label="Layout">
      {(
        [
          ["cards", LayoutGrid, "Cards"],
          ["compare", Table2, "Compare"],
        ] as const
      ).map(([key, Icon, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={view === key}
          className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors", view === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          <Icon className="size-3.5" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

/** The OpenUI comparison shows up to six packages side by side. */
const MAX_COMPARED = 6;

export default function PackagesPage() {
  return (
    <DisplayCurrencyProvider>
      <PackagesView />
    </DisplayCurrencyProvider>
  );
}

function PackagesView() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const qc = useQueryClient();
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ViewMode>("cards");
  const [filter, setFilter] = React.useState<FilterMode>("all");
  const [sort, setSort] = React.useState<SortMode>("recommended");
  const [edit, setEdit] = React.useState<{ packageId: string; kind: PackageEdit } | null>(null);
  const [bulk, setBulk] = React.useState<{ done: number; total: number } | null>(null);
  const trip = useTrip(id);
  const jobs = useJobs(id);
  const q = usePackages(id, jobId);

  const base = `/trips/${id}`;
  const packages = React.useMemo(() => q.data?.packages ?? [], [q.data]);
  const job = q.data?.job ?? null;
  const runId = job?.id ?? null;
  const completedJobs = (jobs.data ?? []).filter((j) => j.status === "succeeded" || j.status === "infeasible");
  const currency = packages[0]?.pricing?.currency ?? trip.data?.trip.budgetCurrency ?? "USD";
  const hasPackages = job?.status === "succeeded" && packages.length > 0;

  const snapshotQuery = useQuery({
    queryKey: [...tripKeys.packages(id, runId), "presentation"],
    queryFn: ({ signal }) => fetchPackageSnapshot(id, runId, signal).then((r) => r.snapshot),
    enabled: hasPackages,
  });
  const snapshot = snapshotQuery.data ?? null;
  const needsPhotos = !!snapshot?.offers.some((o) => o.offer.providerKey === "google_hotels" && !(Array.isArray(o.offer.providerMetadata?.images) && o.offer.providerMetadata.images.length));
  const photos = useRunHotelPhotos(id, runId, hasPackages && needsPhotos).data;

  const focusPackage = (packageId: string) => {
    setView("cards");
    setFilter("all");
    window.setTimeout(() => document.querySelector(`[data-package-ref="${snapshot?.packages.find((p) => p.id === packageId)?.ref}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const actions = useShowcaseActions({ tripId: id, snapshot, onFocusPackage: focusPackage, onEditPackage: (packageId, kind) => setEdit({ packageId, kind }) });

  const visible = React.useMemo(() => {
    let list: PlanningPackageView[] = [...(snapshot?.packages ?? [])];
    if (filter === "under") list = list.filter((p) => p.package.budgetDifferenceMinor !== null && p.package.budgetDifferenceMinor >= 0);
    if (filter === "live") list = list.filter((p) => liveStatus(p).state === "live");
    if (sort === "price") list.sort((a, b) => (sellingPriceOf(a) ?? Number.MAX_SAFE_INTEGER) - (sellingPriceOf(b) ?? Number.MAX_SAFE_INTEGER));
    if (sort === "score") list.sort((a, b) => b.package.score - a.package.score);
    return list;
  }, [snapshot, filter, sort]);

  const leadRef = snapshot?.packages.find((p) => p.objective === "best_value" && !p.parentId)?.ref ?? snapshot?.packages[0]?.ref ?? null;
  const compareRefs = visible.slice(0, MAX_COMPARED).map((p) => p.ref);
  const showCompare = view === "compare" && compareRefs.length >= 2;
  const program = React.useMemo(
    () =>
      buildGalleryProgram({
        refs: showCompare ? compareRefs : visible.map((p) => p.ref),
        leadRef,
        view: showCompare ? "compare" : "cards",
        title: showCompare ? "Side by side" : filter === "all" ? "All packages" : filter === "under" ? "Within budget" : "Live checked",
        subtitle:
          showCompare && visible.length > MAX_COMPARED
            ? `The first ${MAX_COMPARED} of ${visible.length} packages`
            : `${visible.length} package${visible.length === 1 ? "" : "s"} · ${sort === "recommended" ? "recommended order" : sort === "price" ? "lowest price first" : "highest score first"}`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, leadRef, showCompare, filter, sort],
  );

  const unchecked = (snapshot?.packages ?? []).filter((p) => needsLiveCheck(p));
  const checkAll = async () => {
    if (!unchecked.length) return;
    setBulk({ done: 0, total: unchecked.length });
    let ok = 0;
    let failed = 0;
    for (const [i, p] of unchecked.entries()) {
      try {
        const r = await apiPost<{ verification: { allVerified: boolean } }>(`/packages/${p.id}/validate`, {});
        if (r.verification.allVerified) ok++;
        else failed++;
      } catch (e) {
        failed++;
        toast.error(`Package #${p.number}: ${errorMessage(e)}`);
      }
      setBulk({ done: i + 1, total: unchecked.length });
    }
    setBulk(null);
    await qc.invalidateQueries({ queryKey: ["trips", "packages", id] });
    void qc.invalidateQueries({ queryKey: tripKeys.detail(id) });
    if (failed === 0) toast.success(`Live prices checked for ${ok} package${ok === 1 ? "" : "s"}`);
    else toast.warning(`${ok} package${ok === 1 ? "" : "s"} confirmed, ${failed} could not be confirmed live`);
  };

  const editing = edit ? packages.find((p) => p.id === edit.packageId) : undefined;
  const hero = <PackageHero tripId={id} trip={trip.data} packages={packages} completedAt={job?.completedAt ?? null} canOptimise={can("optimisation:run")} />;

  if (q.isLoading) return <div className="tw-page-in flex flex-col gap-6">{hero}<LoadingBlock label="Loading packages" /></div>;
  if (q.isError) return <div className="tw-page-in flex flex-col gap-6">{hero}<ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load packages" /></div>;

  return (
    <div className="tw-page-in flex flex-col gap-6">
      {hero}

      {!job ? (
        <EmptyState
          icon={Layers}
          title="No packages yet"
          description="Confirm the itinerary, then run an optimisation to generate hotel packages."
          image={IMAGES.hotels}
          action={
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={`${base}/itinerary`}>Review itinerary</Link>
              </Button>
              {can("optimisation:run") ? (
                <Button asChild>
                  <Link href={`${base}/optimise`}>
                    <Sparkles /> Optimise
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        />
      ) : (
        <>
          <div className="sticky top-16 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/85 p-2.5 shadow-[0_12px_40px_-24px_rgba(40,32,20,0.3)] backdrop-blur-xl">
            <ViewToggle view={view} onChange={setView} />
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
              <FilterChip active={filter === "under"} onClick={() => setFilter("under")}>Within budget</FilterChip>
              <FilterChip active={filter === "live"} onClick={() => setFilter("live")}>Live checked</FilterChip>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <CurrencySwitcher billing={currency} />
              {can("packages:write") && unchecked.length > 0 ? (
                <Button size="sm" variant="accent" loading={!!bulk} onClick={() => void checkAll()}>
                  {bulk ? null : <ShieldCheck />} {bulk ? `Checking ${bulk.done + 1} of ${bulk.total}…` : `Check live prices (${unchecked.length})`}
                </Button>
              ) : null}
              <Select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label="Sort packages" className="h-9 w-[10.5rem] text-xs">
                <option value="recommended">Recommended</option>
                <option value="price">Lowest price</option>
                <option value="score">Highest score</option>
              </Select>
              {completedJobs.length > 1 ? (
                <Select id="pk-job" value={jobId ?? job?.id ?? ""} onChange={(e) => setJobId(e.target.value)} aria-label="Optimisation run" className="h-9 w-[13rem] text-xs">
                  {completedJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {formatDateTime(j.createdAt)} · {titleCase(j.status)}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          </div>

          {job.status === "infeasible" || packages.length === 0 ? (
            <div className="flex flex-col gap-4">
              <Alert tone="warning" title="No feasible package was found for this run">No hotel combination satisfied every mandatory requirement. Relax a constraint and run again.</Alert>
              <InfeasibilityPanel infeasible={job.infeasible} funnel={job.funnel} currency={currency} />
              <Button asChild className="self-start">
                <Link href={`${base}/optimise`}>Relax constraints and re-run</Link>
              </Button>
            </div>
          ) : (
            <>
              {job.warnings.length > 0 || job.notes.length > 0 || job.omittedObjectives.length > 0 ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  {job.warnings.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}
                  {job.notes.map((n) => <Alert key={n} tone="info">{n}</Alert>)}
                  {job.omittedObjectives.map((o) => <Alert key={o.objective} tone="info" title={`${OBJECTIVE_LABELS[o.objective]} not shown`}>{o.reason}</Alert>)}
                </div>
              ) : null}

              {snapshotQuery.isError ? (
                <ErrorState error={snapshotQuery.error} onRetry={() => snapshotQuery.refetch()} title="Could not load the package cards" />
              ) : !snapshot ? (
                <LoadingBlock label="Loading package cards" rows={3} />
              ) : visible.length === 0 ? (
                <EmptyState icon={Layers} title="No packages match this filter" description="Try another filter or show all packages." action={<Button variant="outline" onClick={() => setFilter("all")}>Show all packages</Button>} />
              ) : (
                <PackageGallery snapshot={snapshot} program={program} pending={actions.pending} photos={photos} onAction={actions.handleAction} />
              )}

              <PackageStoryPanel tripId={id} jobId={job.id} onFocusPackage={focusPackage} onEditPackage={(packageId, kind) => setEdit({ packageId, kind })} photos={photos} />
            </>
          )}

          {job.providers.length > 0 ? (
            <details className="group rounded-2xl border border-border/70 bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-display text-base font-semibold tracking-[-0.02em]">Run diagnostics</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Supplier results, offer counts and response times for this optimisation.</p>
                </div>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="border-t border-border/70 px-5 py-4">
                <ProviderOutcomes providers={job.providers} />
              </div>
            </details>
          ) : null}
        </>
      )}

      {editing && edit?.kind === "replace_hotel" ? <ReplaceHotelDialog pkg={editing} tripId={id} open onOpenChange={(open) => !open && setEdit(null)} showCost={editing.pricing?.grossMarginBp !== undefined} /> : null}
      {editing && edit?.kind === "reprice_package" ? <RepriceDialog pkg={editing} tripId={id} open onOpenChange={(open) => !open && setEdit(null)} showCost={editing.pricing?.grossMarginBp !== undefined} /> : null}
    </div>
  );
}
