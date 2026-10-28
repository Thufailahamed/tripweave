"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Layers,
  LayoutGrid,
  MapPin,
  Sparkles,
  Table2,
  Wallet,
  Wand2,
} from "lucide-react";
import { OBJECTIVE_LABELS } from "@tripweave/shared";
import { Alert, Badge, Card, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { CoverImage } from "@/features/hotels/hotel-card";
import { IMAGES, Photo } from "@/features/marketing/imagery";
import { useCan } from "@/lib/session";
import { cn, formatDate, formatDateTime, money, nightsLabel, titleCase } from "@/lib/utils";
import { PackageCard } from "@/features/trips/package-card";
import { PackageStoryPanel } from "@/features/package-showcase/panel";
import { InfeasibilityPanel, ProviderOutcomes } from "@/features/trips/job-results";
import { useJobs, usePackages, useTrip } from "@/features/trips/hooks";
import type { PackageView } from "@/features/trips/types";

type ViewMode = "cards" | "table";
type FilterMode = "all" | "under" | "live";
type SortMode = "recommended" | "price" | "score";

function HeroStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur-md">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">{label}</p>
      <p className="tw-num mt-1.5 font-display text-xl font-semibold tracking-[-0.04em] text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-white/45">{hint}</p> : null}
    </div>
  );
}

function PackageHero({
  tripId,
  trip,
  packages,
  job,
  canOptimise,
}: {
  tripId: string;
  trip: ReturnType<typeof useTrip>["data"];
  packages: PackageView[];
  job: { completedAt: string | null } | null;
  canOptimise: boolean;
}) {
  const t = trip?.trip;
  const stops = trip?.itinerary?.stops ?? [];
  const currency = packages[0]?.pricing?.currency ?? t?.budgetCurrency ?? "USD";
  const best = packages.reduce<number | null>((min, p) => {
    const price = p.pricing?.sellingPriceMinor;
    return price === undefined ? min : min === null ? price : Math.min(min, price);
  }, null);
  const budget = t?.budgetAmountMinor ?? null;
  const live = packages.filter((p) => p.verification?.allVerified).length;

  return (
    <section className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#071619] text-white shadow-[0_24px_80px_-32px_rgba(4,20,24,0.65)]">
      <Photo image={IMAGES.flow} decorative priority sizes="(min-width: 1400px) 1400px, 100vw" className="absolute inset-0 -z-20 size-full object-cover opacity-65" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#071619]/95 via-[#071619]/80 to-[#071619]/25" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_100%_at_80%_0%,rgba(251,161,58,0.18),transparent_55%)]" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-[#071619]/80 to-transparent" />

      <div className="relative p-6 md:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
          <div className="flex items-center gap-1.5">
            <Link href={`/trips/${tripId}`} className="transition-colors hover:text-white">Trip request</Link>
            <ChevronRight className="size-3.5" aria-hidden />
            <span className="font-medium text-white/90">Package comparison</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="border-white/15 bg-white/10 text-white backdrop-blur-md">{packages.length} curated package{packages.length === 1 ? "" : "s"}</Badge>
            {job ? <span className="hidden sm:inline">Run {job.completedAt ? formatDateTime(job.completedAt) : "completed"}</span> : null}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-7">
          <div className="max-w-3xl">
            <p className="tw-eyebrow text-white/55">Tailor-made Sri Lanka</p>
            <h1 className="mt-3 font-display text-[38px] font-semibold leading-[0.98] tracking-[-0.065em] md:text-[58px]">{t?.title ?? "Package comparison"}</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">
              A considered shortlist of hotel combinations, scored against budget, location and comfort. Open a package to see the full stay, live-price status and quotation actions.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {stops.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs text-white/85 backdrop-blur-md">
                  <MapPin className="size-3.5 text-accent" aria-hidden />
                  {s.destination}
                  <span className="text-white/45">{nightsLabel(s.nights)}</span>
                </span>
              ))}
              {t?.arrivalDate && t.departureDate ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs text-white/85 backdrop-blur-md">
                  <CalendarDays className="size-3.5 text-accent" aria-hidden />
                  {formatDate(t.arrivalDate)} → {formatDate(t.departureDate)}
                </span>
              ) : null}
              {budget !== null ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs text-white/85 backdrop-blur-md">
                  <Wallet className="size-3.5 text-accent" aria-hidden />
                  {money(budget, currency)} budget
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canOptimise ? (
              <Button asChild className="border-0 bg-white text-[#071619] shadow-[0_10px_30px_-12px_rgba(255,255,255,0.45)] hover:bg-white/90">
                <Link href={`/trips/${tripId}/optimise`}><Wand2 /> New optimisation</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <Link href={`/trips/${tripId}/itinerary`}>Review itinerary</Link>
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat label="Packages ready" value={String(packages.length)} hint={packages.length ? "Scored against the brief" : "Run an optimisation"} />
          <HeroStat label="Best price" value={best === null ? "—" : money(best, currency)} hint="Lowest selling price" />
          <HeroStat label="Budget" value={budget === null ? "Not set" : money(budget, currency)} hint={t?.budgetScope === "accommodation_only" ? "Accommodation only" : "Whole trip"} />
          <HeroStat label="Live checked" value={packages.length ? `${live}/${packages.length}` : "—"} hint="Ready to quote" />
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
    <div className="flex rounded-full border border-border bg-muted/50 p-0.5">
      {([["cards", LayoutGrid, "Cards"], ["table", Table2, "Table"]] as const).map(([key, Icon, label]) => (
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

function packagePrice(p: PackageView): number | null {
  return p.pricing?.sellingPriceMinor ?? null;
}

function ComparisonTable({ packages, onOpen }: { packages: PackageView[]; onOpen: (p: PackageView) => void }) {
  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Compare at a glance</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">A side-by-side view of price, budget and score. Open any package for the full stay.</p>
          </div>
          <Badge tone="outline">{packages.length} options</Badge>
        </div>
      </CardHeader>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">Packages compared by price, budget difference and score</caption>
          <thead className="bg-muted/45 text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3">Package</th>
              <th scope="col" className="px-4 py-3 text-right">Selling price</th>
              <th scope="col" className="px-4 py-3 text-right">Vs budget</th>
              <th scope="col" className="px-4 py-3 text-right">Score</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p, index) => {
              const d = p.package.budgetDifferenceMinor;
              const first = p.package.selections[0];
              const live = p.verification?.allVerified;
              return (
                <tr key={p.id} className="group border-t border-border/70 transition-colors hover:bg-muted/25">
                  <th scope="row" className="px-4 py-3 text-left">
                    <div className="flex items-center gap-3">
                      <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                        <CoverImage imageId={first?.coverImageId} alt={first?.offer.property.name ?? "Hotel"} className="size-full" />
                        <span className="absolute left-1 top-1 grid size-4 place-items-center rounded-full bg-[#071619]/80 text-[9px] font-semibold text-white">{index + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold">{OBJECTIVE_LABELS[p.objective]} <span className="font-normal text-muted-foreground">#{p.number}</span></p>
                        <p className="truncate text-xs text-muted-foreground">{p.package.selections.map((s) => s.destination).join(" · ")}</p>
                      </div>
                    </div>
                  </th>
                  <td className="tw-num px-4 py-3 text-right font-semibold">{p.pricing ? money(p.pricing.sellingPriceMinor, p.pricing.currency) : "Unavailable"}</td>
                  <td className={cn("tw-num px-4 py-3 text-right font-semibold", d === null ? "text-muted-foreground" : d >= 0 ? "text-success" : "text-destructive")}>
                    {d === null ? "No budget" : d >= 0 ? `${money(d, p.package.currency)} under` : `${money(-d, p.package.currency)} over`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/[0.06]">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, Math.round(p.package.score)))}%` }} />
                      </div>
                      <span className="tw-num w-7 text-right text-xs font-semibold">{Math.round(p.package.score)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {live ? <Badge tone="success">Live checked</Badge> : <Badge tone="warning">Indicative</Badge>}
                      {p.package.selections.some((s) => s.offer.isMock) ? <Badge tone="danger">Illustrative</Badge> : null}
                      {p.parentId ? <Badge tone="accent">{p.manuallyModified ? "Modified" : "Re-priced"}</Badge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => onOpen(p)}>Open <ChevronRight /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function PackagesPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ViewMode>("cards");
  const [filter, setFilter] = React.useState<FilterMode>("all");
  const [sort, setSort] = React.useState<SortMode>("recommended");
  const trip = useTrip(id);
  const jobs = useJobs(id);
  const q = usePackages(id, jobId);

  const base = `/trips/${id}`;
  const packages = q.data?.packages ?? [];
  const job = q.data?.job ?? null;
  const completedJobs = (jobs.data ?? []).filter((j) => j.status === "succeeded" || j.status === "infeasible");
  const currency = packages[0]?.pricing?.currency ?? trip.data?.trip.budgetCurrency ?? "USD";

  const visible = React.useMemo(() => {
    let list = [...packages];
    if (filter === "under") list = list.filter((p) => p.package.budgetDifferenceMinor !== null && p.package.budgetDifferenceMinor >= 0);
    if (filter === "live") list = list.filter((p) => p.verification?.allVerified === true);
    if (sort === "price") list.sort((a, b) => (packagePrice(a) ?? Number.MAX_SAFE_INTEGER) - (packagePrice(b) ?? Number.MAX_SAFE_INTEGER));
    if (sort === "score") list.sort((a, b) => b.package.score - a.package.score);
    return list;
  }, [packages, filter, sort]);

  const hero = <PackageHero tripId={id} trip={trip.data} packages={packages} job={job} canOptimise={can("optimisation:run")} />;

  if (q.isLoading) return <div className="tw-page-in flex flex-col gap-6">{hero}<LoadingBlock label="Loading packages" /></div>;
  if (q.isError) return <div className="tw-page-in flex flex-col gap-6">{hero}<ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load packages" /></div>;

  const focusPackage = (packageId: string) => {
    setView("cards");
    window.setTimeout(() => document.getElementById(`pkgcard-${packageId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="tw-page-in flex flex-col gap-6">
      {hero}

      {!job ? (
        <EmptyState icon={Layers} title="No packages yet" description="Confirm the itinerary, then run an optimisation to generate hotel packages." image={IMAGES.hotels} action={<div className="flex gap-2"><Button asChild variant="outline"><Link href={`${base}/itinerary`}>Review itinerary</Link></Button>{can("optimisation:run") ? <Button asChild><Link href={`${base}/optimise`}><Sparkles /> Optimise</Link></Button> : null}</div>} />
      ) : (
        <>
          {job.status === "succeeded" && packages.length > 0 ? <PackageStoryPanel tripId={id} jobId={job.id} onFocusPackage={focusPackage} /> : null}

          <div className="sticky top-16 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/85 p-2.5 shadow-[0_12px_40px_-24px_rgba(20,26,45,0.3)] backdrop-blur-xl">
            <ViewToggle view={view} onChange={setView} />
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
              <FilterChip active={filter === "under"} onClick={() => setFilter("under")}>Under budget</FilterChip>
              <FilterChip active={filter === "live"} onClick={() => setFilter("live")}>Live checked</FilterChip>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label="Sort packages" className="h-9 w-[10.5rem] text-xs">
                <option value="recommended">Recommended</option>
                <option value="price">Lowest price</option>
                <option value="score">Highest score</option>
              </Select>
              {completedJobs.length > 1 ? (
                <Select id="pk-job" value={jobId ?? job?.id ?? ""} onChange={(e) => setJobId(e.target.value)} aria-label="Optimisation run" className="h-9 w-[13rem] text-xs">
                  {completedJobs.map((j) => <option key={j.id} value={j.id}>{formatDateTime(j.createdAt)} · {titleCase(j.status)}</option>)}
                </Select>
              ) : null}
            </div>
          </div>

          {job.status === "infeasible" || packages.length === 0 ? (
            <div className="flex flex-col gap-4">
              <Alert tone="warning" title="No feasible package was found for this run">No hotel combination satisfied every mandatory requirement. Relax a constraint and run again.</Alert>
              <InfeasibilityPanel infeasible={job.infeasible} funnel={job.funnel} currency={currency} />
              <Button asChild className="self-start"><Link href={`${base}/optimise`}>Relax constraints and re-run</Link></Button>
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

              {visible.length === 0 ? (
                <EmptyState icon={Layers} title="No packages match this filter" description="Try another filter or show all packages." action={<Button variant="outline" onClick={() => setFilter("all")}>Show all packages</Button>} />
              ) : view === "table" ? (
                <ComparisonTable packages={visible} onOpen={(p) => focusPackage(p.id)} />
              ) : (
                <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
                  {visible.map((p) => {
                    const parent = p.parentId ? packages.find((x) => x.id === p.parentId) : undefined;
                    return (
                      <div key={p.id} id={`pkgcard-${p.id}`} className="scroll-mt-24">
                        <PackageCard pkg={p} tripId={id} featured={p.objective === "best_value" && !p.parentId} parentLabel={parent ? `${OBJECTIVE_LABELS[parent.objective]} #${parent.number}` : p.parentId ? "an earlier package" : null} />
                      </div>
                    );
                  })}
                </div>
              )}
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
              <div className="border-t border-border/70 px-5 py-4"><ProviderOutcomes providers={job.providers} /></div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
