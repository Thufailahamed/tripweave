"use client";
import * as React from "react";
import { BedDouble, CalendarDays, CheckCircle2, ChevronDown, FileText, Hotel, Lock, MapPin, StickyNote, Utensils, XCircle } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverImage } from "@/features/hotels/hotel-card";
import { cn, dateRange, mealLabel, nightsLabel, formatDate, titleCase } from "@/lib/utils";
import { cancellationLabel } from "./helpers";
import type { VersionDetail } from "./types";

export function ItineraryCard({ version }: { version: VersionDetail }) {
  const stops = version.itinerary.stops ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>The route</CardTitle>
        <CardDescription>{version.itinerary.title ?? "Itinerary snapshot"} — frozen with this version.</CardDescription>
      </CardHeader>
      <CardContent>
        {stops.length === 0 ? (
          <p className="text-sm text-muted-foreground">This version has no itinerary stops.</p>
        ) : (
          <ol className="grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
            {stops.map((s, i) => (
              <li key={`${s.destination}-${i}`} className="relative rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                  <p className="flex min-w-0 items-center gap-1.5 font-display text-lg leading-tight tracking-[-0.03em]">
                    <MapPin className="size-3.5 shrink-0 text-accent" aria-hidden />
                    <span className="truncate">{s.destination}</span>
                  </p>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{dateRange(s.arrivalDate, s.departureDate)}</p>
                <Badge tone="primary" className="mt-2">{nightsLabel(s.nights)}</Badge>
                {s.activities && s.activities.length > 0 ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{s.activities.join(" · ")}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function HotelsCard({ version }: { version: VersionDetail }) {
  const stays = version.package.selections ?? [];
  const nights = stays.reduce((sum, s) => sum + s.offer.nights, 0);
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Where you&apos;ll stay</CardTitle>
        <CardDescription>
          {stays.length > 0
            ? `${stays.length} stay${stays.length === 1 ? "" : "s"} · ${nights} night${nights === 1 ? "" : "s"}, frozen with this version.`
            : "Accommodation frozen with this version."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stays.length === 0 ? (
          <p className="text-sm text-muted-foreground">This version has no accommodation.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stays.map((s, i) => (
              <li key={`${s.offer.property.name}-${i}`} className="group overflow-hidden rounded-2xl border border-border bg-card">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <CoverImage
                    src={s.imageUrl}
                    alt={s.offer.property.name}
                    variant="card"
                    className="size-full transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                    <Badge tone="primary" className="bg-card/90 text-foreground shadow-sm backdrop-blur">
                      {s.destination}
                    </Badge>
                    {s.offer.property.category ? (
                      <Badge tone="accent" className="shadow-sm">
                        {titleCase(s.offer.property.category)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Stay {i + 1}</p>
                  <h3 className="mt-1 font-display text-[22px] leading-tight tracking-[-0.04em]">{s.offer.property.name}</h3>
                  <div className="mt-3 flex flex-col gap-1.5 text-sm">
                    <p className="flex items-start gap-2">
                      <BedDouble className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      <span>{s.offer.roomType.name}</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <Utensils className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      <span>{mealLabel(s.offer.mealPlan)}</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      <span>
                        {formatDate(s.offer.stayStart, { day: "numeric", month: "short" })} – {formatDate(s.offer.stayEnd)} · {nightsLabel(s.offer.nights)}
                      </span>
                    </p>
                  </div>
                  <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{cancellationLabel(s.offer.cancellation)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.offer.isMock ? <Badge tone="warning">Illustrative data</Badge> : null}
                    {s.offer.verificationStatus ? <Badge tone="outline">{titleCase(s.offer.verificationStatus)}</Badge> : null}
                    {s.offer.supplierName ? <Badge tone="outline">Supplier: {s.offer.supplierName}</Badge> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function TermsCard({ version }: { version: VersionDetail }) {
  const t = version.terms;
  const [showTerms, setShowTerms] = React.useState(false);
  const inclusions = t.inclusions ?? [];
  const exclusions = t.exclusions ?? [];
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>Terms, inclusions and notes</CardTitle>
          <CardDescription>What is covered, what is not, and the fine print for this version.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">{inclusions.length} inclusion{inclusions.length === 1 ? "" : "s"}</Badge>
          <Badge tone="danger">{exclusions.length} exclusion{exclusions.length === 1 ? "" : "s"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-success/25 bg-success-soft/60 p-4">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-success">
              <CheckCircle2 className="size-4" aria-hidden /> Inclusions
            </p>
            {inclusions.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {inclusions.map((x, i) => (
                  <li key={i} className="flex gap-2 leading-snug">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-muted-foreground">None listed.</p>
            )}
          </div>
          <div className="rounded-2xl border border-destructive/20 bg-destructive-soft/45 p-4">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-destructive">
              <XCircle className="size-4" aria-hidden /> Exclusions
            </p>
            {exclusions.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {exclusions.map((x, i) => (
                  <li key={i} className="flex gap-2 leading-snug">
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-muted-foreground">None listed.</p>
            )}
          </div>
        </div>

        {t.clientNotes ? (
          <div className="rounded-2xl border border-accent/25 bg-accent-soft/50 p-4">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              <StickyNote className="size-4" aria-hidden /> Notes for the client
            </p>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed">{t.clientNotes}</p>
          </div>
        ) : null}

        {version.internalNotes ? (
          <div className="rounded-2xl border border-dashed border-warning/45 bg-warning-soft/35 p-4">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-warning">
              <Lock className="size-4" aria-hidden /> Internal only
            </p>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed">{version.internalNotes}</p>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Never shown to the client</p>
          </div>
        ) : null}

        {t.terms ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-muted/30">
            <button
              type="button"
              onClick={() => setShowTerms((v) => !v)}
              aria-expanded={showTerms}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent-soft/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4 text-accent" aria-hidden /> Terms and conditions
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {showTerms ? "Hide full terms" : "Show full terms"}
                <ChevronDown className={cn("size-4 transition-transform duration-300", showTerms && "rotate-180")} aria-hidden />
              </span>
            </button>
            {showTerms ? <p className="whitespace-pre-wrap border-t border-border px-4 py-3 leading-relaxed text-muted-foreground">{t.terms}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
