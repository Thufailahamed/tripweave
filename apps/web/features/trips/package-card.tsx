"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Car, FileText, RefreshCw, Repeat, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { OBJECTIVE_LABELS } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <li className="rounded-lg border border-border bg-background/30 p-3.5 transition-colors hover:border-foreground/15">
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
      {o.mealPlanStatus === "unconfirmed" ? (
        <p className="mt-1">
          <Badge tone="warning">Meal plan to confirm</Badge>
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{cancellationText(o.cancellation)}</p>
      <div className="mt-2">
        <AvailabilityBadges offer={o} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Source: {o.supplierName || o.providerKey} ({o.providerKey}){o.rateSource?.contractReference ? ` · contract ${o.rateSource.contractReference}` : ""} · retrieved {formatDateTime(o.retrievedAt)}
        {o.expiresAt ? ` · valid until ${formatDateTime(o.expiresAt)}` : ""}
      </p>
      <VerifyButton offerId={o.offerId} showCost={showCost} currency={o.currency} />
    </li>
  );
}

export function PackageCard({ pkg, tripId, parentLabel }: { pkg: PackageView; tripId: string; parentLabel?: string | null }) {
  const can = useCan();
  const qc = useQueryClient();
  const router = useRouter();
  const [replaceOpen, setReplaceOpen] = React.useState(false);
  const [repriceOpen, setRepriceOpen] = React.useState(false);
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

  return (
    <Card className={cn("group/pkg relative flex flex-col overflow-hidden transition-colors hover:border-foreground/20", anyMock && "border-destructive/50")} aria-labelledby={`pkg-${pkg.id}`}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-accent transition-transform duration-700 ease-out group-hover/pkg:scale-x-100" />
      <div className="flex flex-col gap-2 border-b border-border px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`pkg-${pkg.id}`} className="font-display text-xl font-semibold tracking-[-0.045em]">
            {label} <span className="text-sm font-normal text-muted-foreground">#{pkg.number}</span>
          </h3>
          <Badge tone="primary" title="Overall score on a neutral weighting so packages are comparable">
            Score {Math.round(p.score)}/100
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {anyMock ? <Badge tone="danger" className="border border-destructive/40">Illustrative data: cannot be quoted</Badge> : null}
          {pkg.parentId ? <Badge tone="accent">{pkg.manuallyModified ? "Manually modified" : "Re-priced"}{parentLabel ? ` from ${parentLabel}` : ""}</Badge> : null}
          {!pkg.parentId && pkg.manuallyModified ? <Badge tone="accent">Manually modified</Badge> : null}
          {pkg.feasibility === "over_budget" ? <Badge tone="danger">Over budget</Badge> : null}
          {p.diversityNote ? <Badge tone="outline">{p.diversityNote}</Badge> : null}
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col gap-5">
        <section aria-label="Price">
          {pr ? (
            <>
              <p className="tw-num font-display text-[40px] font-semibold leading-none tracking-[-0.06em]">{money(pr.sellingPriceMinor, pr.currency)}</p>
              <p className="text-xs text-muted-foreground">Selling price{pr.sellingTaxMinor > 0 ? ` · tax ${money(pr.sellingTaxMinor, pr.currency)} · total payable ${money(pr.totalPayableMinor, pr.currency)}` : ""}</p>
              {pr.warnings.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-xs text-warning">
                  {pr.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <Alert tone="warning" title="Selling price unavailable">
              Pricing could not be calculated for this package, usually because exchange rates are missing. Check Settings, then re-price.
            </Alert>
          )}
          <p className={cn("mt-2 text-sm font-semibold", diff === null ? "text-muted-foreground" : diff >= 0 ? "text-success" : "text-destructive")}>
            {diff === null ? "No budget set to compare against" : diff >= 0 ? `${money(diff, cur)} under budget` : `${money(-diff, cur)} over budget`}
          </p>
        </section>

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
          <div role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="mb-1">
              <Badge tone={explainText.engine === "ai" ? "accent" : "neutral"}>{explainText.engine === "ai" ? "AI-written summary (checked against the facts above)" : "Deterministic summary (no AI used)"}</Badge>
            </p>
            {explainText.text}
          </div>
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
          <section aria-label="Internal margin" className="rounded-lg border border-accent/50 bg-accent-soft/40 p-3">
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
      </CardContent>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
        {can("quotes:write") ? (
          <Button loading={quote.isPending} onClick={() => (setQuoteError(null), quote.mutate())}>
            <FileText /> Create quotation
          </Button>
        ) : null}
        {can("packages:write") ? (
          <>
            <Button variant="outline" onClick={() => setReplaceOpen(true)}>
              <Repeat /> Replace hotel
            </Button>
            <Button variant="outline" onClick={() => setRepriceOpen(true)}>
              <RefreshCw /> Re-price
            </Button>
            <Button variant="outline" loading={explain.isPending} onClick={() => explain.mutate()}>
              <Sparkles /> AI summary
            </Button>
          </>
        ) : null}
      </div>

      {replaceOpen ? <ReplaceHotelDialog pkg={pkg} tripId={tripId} open={replaceOpen} onOpenChange={setReplaceOpen} showCost={internal} /> : null}
      {repriceOpen ? <RepriceDialog pkg={pkg} tripId={tripId} open={repriceOpen} onOpenChange={setRepriceOpen} showCost={internal} /> : null}
    </Card>
  );
}
