"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Car,
  ChevronDown,
  ChevronUp,
  FileText,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { OBJECTIVE_LABELS } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CoverImage } from "@/features/hotels/hotel-card";
import { IMAGES, Photo, type MarketingImage } from "@/features/marketing/imagery";
import { ApiError, apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { cn, formatDateTime, mealLabel, minutesLabel, money, nightsLabel, percentFromBp, titleCase } from "@/lib/utils";
import { AvailabilityBadges, cancellationText } from "./availability-badge";
import { tripKeys } from "./hooks";
import { ReplaceHotelDialog } from "./replace-hotel-dialog";
import { RepriceDialog } from "./reprice-dialog";
import { routeSourceLabel, type PackageSelectionView, type PackageView, type VerifyResponse } from "./types";

const BARS: { key: keyof PackageView["package"]["breakdown"]; label: string }[] = [
  { key: "budgetFit", label: "Budget fit" },
  { key: "quality", label: "Quality" },
  { key: "location", label: "Location" },
  { key: "amenities", label: "Amenities" },
  { key: "cancellation", label: "Cancellation" },
];

function destinationImage(destination: string | undefined): MarketingImage {
  const d = (destination ?? "").toLowerCase();
  if (/galle|unawatuna|mirissa|south coast|bentota|hikkaduwa/.test(d)) return IMAGES.hotels;
  if (/ella|nuwara|hill country|tea/.test(d)) return IMAGES.flow;
  if (/kandy|sigiriya|cultural triangle/.test(d)) return IMAGES.hero;
  return IMAGES.features;
}

const OBJECTIVE_HERO: Record<string, MarketingImage> = {
  budget_explorer: IMAGES.hotels,
  best_value: IMAGES.flow,
  comfort_journey: IMAGES.features,
  premium_experience: IMAGES.hero,
  company_preferred: IMAGES.operators,
};

function HotelThumb({ selection, className }: { selection: PackageSelectionView; className?: string }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-xl bg-muted", className)}>
      {selection.coverImageId ? (
        <CoverImage imageId={selection.coverImageId} alt={selection.offer.property.name} className="size-full" />
      ) : (
        <Photo image={destinationImage(selection.destination)} decorative sizes="96px" className="size-full" />
      )}
    </div>
  );
}

function ScoreRing({ score, className }: { score: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div
      className={cn("grid size-14 place-items-center rounded-full p-[3px] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.55)]", className)}
      style={{ background: `conic-gradient(var(--accent) ${pct * 3.6}deg, rgba(255,255,255,0.22) 0)` }}
      title={`Overall score ${pct}/100`}
    >
      <div className="grid size-11 place-items-center rounded-full bg-[#071619] text-[11px] font-semibold text-white">
        {pct}
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div className="tw-bar-grow h-full rounded-full bg-gradient-to-r from-accent/60 to-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="tw-num text-right font-semibold">{pct}%</span>
    </div>
  );
}

function VerifyButton({ offerId, showCost, currency }: { offerId: string; showCost: boolean; currency: string }) {
  const can = useCan();
  const [res, setRes] = React.useState<VerifyResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const verify = useMutation({
    mutationFn: () => apiPost<VerifyResponse>(`/hotel-offers/${encodeURIComponent(offerId)}/verify`, {}),
    onSuccess: (r) => {
      setRes(r);
      setErr(null);
    },
    onError: (e) => {
      setRes(null);
      setErr(errorMessage(e));
    },
  });
  if (!can("packages:write")) return null;
  return (
    <div className="mt-2">
      <Button size="sm" variant="outline" loading={verify.isPending} onClick={() => verify.mutate()}>
        <ShieldCheck /> Verify rate
      </Button>
      {err ? <p role="alert" className="mt-1 text-xs text-destructive">{err}</p> : null}
      {res ? (
        <div role="status" className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
          <p className="flex flex-wrap items-center gap-2">
            <StatusBadge status={res.status} />
            <span className="text-muted-foreground">checked {formatDateTime(res.checkedAt)}</span>
          </p>
          {res.message ? <p className="mt-1">{res.message}</p> : null}
          {showCost && res.currentTotalMinor !== null ? (
            <p className="tw-num mt-1">
              Supplier total {money(res.previousTotalMinor, currency)} → {money(res.currentTotalMinor, currency)}
            </p>
          ) : null}
          <p className="mt-1 text-muted-foreground">The package keeps its stored rate until you re-price it.</p>
        </div>
      ) : null}
    </div>
  );
}

function HotelRow({ s, showCost, currency }: { s: PackageSelectionView; showCost: boolean; currency: string }) {
  const o = s.offer;
  const unrated = o.property.reviewScore === null;
  return (
    <li className="rounded-xl border border-border/70 bg-background/40 p-3.5 transition-colors hover:border-foreground/15">
      <div className="flex gap-3">
        <HotelThumb selection={s} className="size-16" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {s.destination} · {nightsLabel(o.nights)} · {o.stayStart} → {o.stayEnd}
            </p>
            {showCost ? <span className="tw-num text-xs text-muted-foreground">Supplier cost {money(s.costMinor, currency)}</span> : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-semibold">{o.property.name}</span>
            {o.property.category ? <Badge tone="outline">{titleCase(o.property.category)}</Badge> : <Badge tone="outline">Category unknown</Badge>}
            <Badge tone={unrated ? "neutral" : "primary"}>{unrated ? "Unrated" : `${o.property.reviewScore}/10 review`}</Badge>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {o.roomType.name} · {mealLabel(o.mealPlan)} · {o.roomsRequired} room{o.roomsRequired === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-muted-foreground">{cancellationText(o.cancellation)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <AvailabilityBadges offer={o} />
            {o.mealPlanStatus === "unconfirmed" ? <Badge tone="warning">Meal plan to confirm</Badge> : null}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Source: {o.supplierName || o.providerKey} ({o.providerKey}){o.rateSource?.contractReference ? ` · contract ${o.rateSource.contractReference}` : ""} · retrieved {formatDateTime(o.retrievedAt)}
        {o.expiresAt ? ` · valid until ${formatDateTime(o.expiresAt)}` : ""}
      </p>
      <VerifyButton offerId={o.offerId} showCost={showCost} currency={o.currency} />
    </li>
  );
}

function ItineraryStrip({ selections, showCost, currency }: { selections: PackageSelectionView[]; showCost: boolean; currency: string }) {
  return (
    <div className="flex flex-col gap-2">
      {selections.map((s) => (
        <div key={s.stopId} className="group/tile relative overflow-hidden rounded-xl border border-border/70 bg-muted/20 p-2.5 transition-colors hover:border-accent/40 hover:bg-muted/35">
          <div className="flex items-center gap-2.5">
            <HotelThumb selection={s} className="size-11" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{s.destination}</p>
                <p className="text-[11px] text-muted-foreground">{nightsLabel(s.offer.nights)}</p>
              </div>
              <p className="truncate text-xs font-semibold">{s.offer.property.name}</p>
              <p className="text-[11px] text-muted-foreground">{mealLabel(s.offer.mealPlan)} · {s.offer.roomsRequired} room{s.offer.roomsRequired === 1 ? "" : "s"}</p>
            </div>
            {showCost ? <p className="tw-num shrink-0 text-[10px] text-muted-foreground">{money(s.costMinor, currency)}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PackageCard({ pkg, tripId, parentLabel, featured = false }: { pkg: PackageView; tripId: string; parentLabel?: string | null; featured?: boolean }) {
  const can = useCan();
  const qc = useQueryClient();
  const router = useRouter();
  const [replaceOpen, setReplaceOpen] = React.useState(false);
  const [repriceOpen, setRepriceOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [explainText, setExplainText] = React.useState<{ text: string; engine: string } | null>(null);
  const [quoteError, setQuoteError] = React.useState<{ message: string; problems: string[] } | null>(null);

  const p = pkg.package;
  const pr = pkg.pricing;
  const internal = pr?.grossMarginBp !== undefined;
  const anyMock = p.selections.some((s) => s.offer.isMock);
  const diff = p.budgetDifferenceMinor;
  const cur = p.currency;
  const label = OBJECTIVE_LABELS[pkg.objective] ?? titleCase(pkg.objective);
  const nameOfStop = (id: string) => p.selections.find((s) => s.stopId === id)?.destination ?? "stop";
  const heroSelection = p.selections.find((s) => s.coverImageId) ?? p.selections[0];
  const heroImage = OBJECTIVE_HERO[pkg.objective] ?? destinationImage(heroSelection?.destination);
  const destinations = p.selections.map((s) => s.destination).join(" · ");

  const explain = useMutation({
    mutationFn: () => apiPost<{ text: string; engine: string }>(`/packages/${pkg.id}/explain`, {}),
    onSuccess: (r) => setExplainText(r),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const quote = useMutation({
    mutationFn: () => apiPost<{ id: string }>("/quotes", { tripRequestId: tripId, packageId: pkg.id }),
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      toast.success("Quotation created");
      router.push(`/quotes/${q.id}`);
    },
    onError: (e) => {
      const problems = e instanceof ApiError ? (e.details as { problems?: string[] } | undefined)?.problems : undefined;
      setQuoteError({ message: errorMessage(e), problems: Array.isArray(problems) ? problems : [] });
    },
  });

  const validate = useMutation({
    mutationFn: () => apiPost<{ package: PackageView; verification: NonNullable<PackageView["verification"]>; changed: boolean }>(`/packages/${pkg.id}/validate`, {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["trips", "packages", tripId] });
      qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      if (r.verification.allVerified) toast.success(r.changed ? "Live prices checked; package totals updated" : "Live prices checked");
      else toast.error("Live price check failed — the package cannot be quoted");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const external = p.selections.some((s) => s.offer.source === "external");
  const verification = pkg.verification;
  const liveValid = verification?.allVerified === true && !!verification.checkedAt && !!verification.validUntil && Date.parse(verification.validUntil) > Date.now();
  const needsLiveCheck = external && !liveValid;

  return (
    <Card className={cn("group/pkg relative flex flex-col overflow-hidden rounded-2xl border-border/80 bg-card shadow-[0_1px_2px_rgba(20,26,45,0.04),0_18px_44px_-24px_rgba(20,26,45,0.18)] transition-all duration-500 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_1px_2px_rgba(20,26,45,0.05),0_28px_60px_-28px_rgba(20,26,45,0.24)]", featured && "ring-1 ring-accent/45", anyMock && "border-destructive/50")} aria-labelledby={`pkg-${pkg.id}`}>
      <div className="relative h-48 overflow-hidden bg-muted">
        {heroSelection?.coverImageId ? (
          <CoverImage imageId={heroSelection.coverImageId} alt={heroSelection.offer.property.name} className="absolute inset-0 size-full transition-transform duration-[1800ms] ease-out group-hover/pkg:scale-[1.04]" />
        ) : (
          <Photo image={heroImage} decorative className="absolute inset-0 size-full transition-transform duration-[1800ms] ease-out group-hover/pkg:scale-[1.04]" sizes="(min-width: 1400px) 480px, (min-width: 768px) 50vw, 100vw" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#071619] via-[#071619]/30 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge className="border-white/15 bg-white/10 text-white backdrop-blur-md">{label} · #{pkg.number}</Badge>
            {featured ? <Badge className="border-accent/30 bg-accent/20 text-white backdrop-blur-md">Editor&apos;s pick</Badge> : null}
          </div>
          <ScoreRing score={p.score} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-4 text-white">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/60">Curated stay</p>
            <p className="font-display text-lg font-semibold tracking-[-0.03em]">{destinations}</p>
          </div>
          <Badge className={cn("border-white/15 bg-white/10 text-white backdrop-blur-md", liveValid && "border-success/30 bg-success/20")}>
            {liveValid ? "Live checked" : needsLiveCheck ? "Indicative" : "Company rate"}
          </Badge>
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Selling price</p>
            <p className="tw-num font-display text-[34px] font-semibold leading-none tracking-[-0.06em]">{pr ? money(pr.sellingPriceMinor, pr.currency) : "Unavailable"}</p>
            <p className={cn("mt-1 text-sm font-semibold", diff === null ? "text-muted-foreground" : diff >= 0 ? "text-success" : "text-destructive")}>
              {diff === null ? "No budget set to compare against" : diff >= 0 ? `${money(diff, cur)} under budget` : `${money(-diff, cur)} over budget`}
            </p>
          </div>
          <div className="flex max-w-[15rem] flex-wrap justify-end gap-1.5">
            {anyMock ? <Badge tone="danger" className="border border-destructive/40">Illustrative data</Badge> : null}
            {pkg.feasibility === "over_budget" ? <Badge tone="danger">Over budget</Badge> : null}
            {pkg.parentId ? <Badge tone="accent">{pkg.manuallyModified ? "Modified" : "Re-priced"}{parentLabel ? ` from ${parentLabel}` : ""}</Badge> : null}
            {!pkg.parentId && pkg.manuallyModified ? <Badge tone="accent">Manually modified</Badge> : null}
            {p.diversityNote ? <Badge tone="outline">{p.diversityNote}</Badge> : null}
            {p.unverified.length > 0 ? <Badge tone="warning">{p.unverified.length} to confirm</Badge> : null}
          </div>
        </div>

        <ItineraryStrip selections={p.selections} showCost={internal} currency={cur} />

        {quoteError ? (
          <Alert tone="danger" title={quoteError.problems.length > 0 ? "This package cannot be quoted yet" : quoteError.message}>
            {quoteError.problems.length > 0 ? (
              <ul className="mt-1 list-disc pl-5">
                {quoteError.problems.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}

        {needsLiveCheck ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/25 bg-warning-soft/40 px-3 py-2">
            <p className="flex items-center gap-2 text-xs font-medium text-warning" title="Prices are indicative until the external rates are checked live.">
              <ShieldCheck className="size-4" aria-hidden /> Indicative price · live check required
            </p>
            <Button size="sm" variant="outline" loading={validate.isPending} onClick={() => validate.mutate()}>
              <ShieldCheck /> Check live prices
            </Button>
          </div>
        ) : liveValid ? (
          <p className="flex items-center gap-2 rounded-xl border border-success/20 bg-success-soft/35 px-3 py-2 text-xs text-success">
            <ShieldCheck className="size-4" aria-hidden /> Live prices verified {formatDateTime(verification!.checkedAt!)} · valid until {formatDateTime(verification!.validUntil!)}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {can("quotes:write") ? (
            <Button loading={quote.isPending} disabled={needsLiveCheck} title={needsLiveCheck ? "Check live prices before creating a quotation" : undefined} onClick={() => (setQuoteError(null), quote.mutate())}>
              <FileText /> Create quotation
            </Button>
          ) : null}
          {needsLiveCheck ? (
            <Button variant="outline" loading={validate.isPending} onClick={() => validate.mutate()}>
              <ShieldCheck /> Check live prices
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setDetailsOpen((v) => !v)} aria-expanded={detailsOpen}>
            {detailsOpen ? <ChevronUp /> : <ChevronDown />} {detailsOpen ? "Hide details" : "View details"}
          </Button>
        </div>

        {detailsOpen ? (
          <div className="flex flex-col gap-5 border-t border-border/70 pt-5">
            <section aria-label="Score breakdown" className="flex flex-col gap-1.5">
              <h4 className="text-xs font-medium text-muted-foreground">Score breakdown</h4>
              {BARS.map((b) => (
                <ScoreBar key={b.key} label={b.label} value={p.breakdown[b.key]} />
              ))}
            </section>

            <section aria-label="Hotels by night">
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">Hotels</h4>
              <ul className="flex flex-col gap-2">
                {p.selections.map((s) => (
                  <HotelRow key={s.stopId} s={s} showCost={internal} currency={cur} />
                ))}
              </ul>
            </section>

            <section aria-label="Travel">
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Car className="size-3.5" /> Travel between stops
              </h4>
              {p.travel.legs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Single stop: no travel between hotels.</p>
              ) : (
                <>
                  <p className="tw-num text-sm">
                    {p.travel.totalDriveMinutes === null ? "Total drive time unavailable" : `Total ${minutesLabel(p.travel.totalDriveMinutes)} driving`}
                    {p.travel.anyEstimated ? <Badge tone="warning" className="ml-2">Estimated</Badge> : null}
                    {p.travel.anyUnavailable ? <Badge tone="danger" className="ml-2">Some legs unavailable</Badge> : null}
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {p.travel.legs.map((l, i) => (
                      <li key={i} className="tw-num">
                        {nameOfStop(l.fromStopId)} → {nameOfStop(l.toStopId)}: {l.durationMinutes === null ? "n/a" : minutesLabel(l.durationMinutes)}
                        {l.distanceKm !== null ? `, ${l.distanceKm} km` : ""} ({routeSourceLabel(l.source).toLowerCase()}{l.source === "estimated" ? ", not exact" : ""})
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {p.explanation.length > 0 ? (
              <section aria-label="Why this package">
                <h4 className="mb-1 text-xs font-medium text-muted-foreground">Why this package</h4>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {p.explanation.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {explainText ? (
              <div role="status" className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <p className="mb-1">
                  <Badge tone={explainText.engine === "ai" ? "accent" : "neutral"}>{explainText.engine === "ai" ? "AI-written summary (checked against the facts above)" : "Deterministic summary (no AI used)"}</Badge>
                </p>
                {explainText.text}
              </div>
            ) : null}

            {verification?.status === "failed" && verification.checks?.length ? (
              <section aria-label="Live check failures">
                <Alert tone="warning" title="Live check failed for this package">
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {verification.checks.filter((c) => c.status !== "confirmed" && c.status !== "price_changed" && c.status !== "not_required").map((c) => (
                      <li key={`${c.stopId}:${c.offerId}`}>{c.propertyName ?? c.stopId}: {c.message ?? c.status}</li>
                    ))}
                  </ul>
                </Alert>
              </section>
            ) : null}

            {p.assumptions.length > 0 || p.unverified.length > 0 ? (
              <section aria-label="Assumptions and warnings" className="flex flex-col gap-2">
                {p.unverified.length > 0 ? (
                  <Alert tone="warning" title="Not verified">
                    <ul className="list-disc pl-5">
                      {p.unverified.map((u) => (
                        <li key={u}>{u}</li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}
                {p.assumptions.length > 0 ? (
                  <div>
                    <h4 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <AlertTriangle className="size-3.5" /> Assumptions
                    </h4>
                    <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                      {p.assumptions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            {internal && pr ? (
              <section aria-label="Internal margin" className="rounded-xl border border-accent/50 bg-accent-soft/40 p-3">
                <h4 className="mb-2 text-xs font-semibold text-accent">Internal only: not shown to the customer</h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Accommodation cost</dt>
                  <dd className="tw-num text-right font-semibold">{money(p.totalCostMinor, cur)}</dd>
                  <dt className="text-muted-foreground">Cost per night</dt>
                  <dd className="tw-num text-right">{money(p.costPerNightMinor, cur)}</dd>
                  <dt className="text-muted-foreground">Total cost incl. extras</dt>
                  <dd className="tw-num text-right">{money(pr.totalCostMinor, pr.currency)}</dd>
                  <dt className="text-muted-foreground">Gross profit</dt>
                  <dd className="tw-num text-right font-semibold">{money(pr.grossProfitMinor, pr.currency)}</dd>
                  <dt className="text-muted-foreground">Gross margin</dt>
                  <dd className="tw-num text-right">{percentFromBp(pr.grossMarginBp)}</dd>
                  <dt className="text-muted-foreground">Markup</dt>
                  <dd className="tw-num text-right">{percentFromBp(pr.markupBp)}</dd>
                </dl>
                {pr.approval?.required ? <p className="mt-2 text-xs font-semibold text-warning">Margin approval would be required for a quotation at this price.</p> : null}
              </section>
            ) : null}

            {can("packages:write") ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setReplaceOpen(true)}>
                  <Repeat /> Replace hotel
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRepriceOpen(true)}>
                  <RefreshCw /> Re-price
                </Button>
                <Button variant="outline" size="sm" loading={explain.isPending} onClick={() => explain.mutate()}>
                  <Sparkles /> AI summary
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>

      {replaceOpen ? <ReplaceHotelDialog pkg={pkg} tripId={tripId} open={replaceOpen} onOpenChange={setReplaceOpen} showCost={internal} /> : null}
      {repriceOpen ? <RepriceDialog pkg={pkg} tripId={tripId} open={repriceOpen} onOpenChange={setRepriceOpen} showCost={internal} /> : null}
    </Card>
  );
}
