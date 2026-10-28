"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, BedDouble, Building2, CalendarDays, Car, PencilLine, Route, ShieldCheck, Users, UtensilsCrossed, Wallet, Wand2 } from "lucide-react";
import { MEAL_PLAN_LABELS, type MealPlan } from "@tripweave/shared";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/card";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";
import { dateRange, formatDate, formatDateTime, money, nightsLabel, titleCase } from "@/lib/utils";
import { Chip, EnquiryQuote, FactTile, SectionHeading } from "./dossier";
import { stageLabel } from "./hooks";
import { BUDGET_SCOPE_LABELS, type Itinerary, type JobSummaryRow, type Trip } from "./types";

function nightsBetween(arrival: string | null, departure: string | null): number | null {
  if (!arrival || !departure) return null;
  const nights = Math.round((Date.parse(departure) - Date.parse(arrival)) / 86_400_000);
  return Number.isFinite(nights) && nights > 0 ? nights : null;
}

function guestsLabel(trip: Trip): string {
  const { adults, children, childAges } = trip.party;
  const kids = children ? `, ${children} child${children === 1 ? "" : "ren"}${childAges?.length ? ` (ages ${childAges.join(", ")})` : ""}` : "";
  return `${adults} adult${adults === 1 ? "" : "s"}${kids}`;
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** The trip requirements as a readable brief: icon facts, amenity sets and the customer's own words. */
export function RequirementsBrief({ trip, onEdit }: { trip: Trip; onEdit?: () => void }) {
  const s = trip.specialRequirements ?? {};
  const nights = nightsBetween(trip.arrivalDate, trip.departureDate);
  const hasDates = !!(trip.arrivalDate || trip.departureDate);
  const missing = [!hasDates, trip.budgetAmountMinor === null, !trip.preferredHotelCategory, !trip.preferredMealPlan].filter(Boolean).length;
  const sets = [
    { label: "Must have", items: s.requiredAmenities ?? [], tone: "accent" as const },
    { label: "Nice to have", items: s.preferredAmenities ?? [], tone: "default" as const },
    { label: "Accessibility", items: s.accessibility ?? [], tone: "success" as const },
  ].filter((set) => set.items.length > 0);

  return (
    <section aria-labelledby="brief-h" className="flex min-w-0 flex-col gap-4">
      <SectionHeading
        id="brief-h"
        title="The brief"
        note={missing ? `${missing} detail${missing === 1 ? "" : "s"} still open` : "everything the optimiser needs"}
        aside={
          onEdit ? (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <PencilLine /> Edit requirements
            </Button>
          ) : null
        }
      />
      <dl className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        <FactTile icon={CalendarDays} label="Dates" tone="accent" missing={!hasDates}>
          <span className="tw-num">{dateRange(trip.arrivalDate, trip.departureDate)}</span>
          {nights ? <span className="block text-xs text-muted-foreground">{nightsLabel(nights)}</span> : null}
        </FactTile>
        <FactTile icon={Users} label="Guests" tone="info">
          <span className="tw-num">{guestsLabel(trip)}</span>
        </FactTile>
        <FactTile icon={BedDouble} label="Rooms" tone="info">
          <span className="tw-num">
            {trip.party.rooms.length} room{trip.party.rooms.length === 1 ? "" : "s"}
          </span>
        </FactTile>
        <FactTile icon={Wallet} label="Budget" tone="success" missing={trip.budgetAmountMinor === null}>
          <span className="tw-num">{trip.budgetAmountMinor === null ? null : money(trip.budgetAmountMinor, trip.budgetCurrency)}</span>
          <span className="block text-xs text-muted-foreground">{BUDGET_SCOPE_LABELS[trip.budgetScope] ?? trip.budgetScope}</span>
        </FactTile>
        <FactTile icon={Building2} label="Hotel category" missing={!trip.preferredHotelCategory}>
          {trip.preferredHotelCategory ? titleCase(trip.preferredHotelCategory) : null}
        </FactTile>
        <FactTile icon={UtensilsCrossed} label="Minimum meal plan" missing={!trip.preferredMealPlan}>
          {trip.preferredMealPlan ? (MEAL_PLAN_LABELS[trip.preferredMealPlan as MealPlan] ?? trip.preferredMealPlan) : null}
        </FactTile>
        <FactTile icon={ShieldCheck} label="Cancellation" tone={s.requireFreeCancellation ? "success" : "primary"}>
          {s.requireFreeCancellation ? "Free cancellation required" : "Flexible"}
        </FactTile>
        <FactTile icon={Car} label="Longest drive" missing={!s.maxLegDurationMinutes}>
          {s.maxLegDurationMinutes ? `Up to ${durationLabel(s.maxLegDurationMinutes)} between stops` : null}
        </FactTile>
      </dl>
      {sets.length > 0 || s.other ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/70 p-4">
          {sets.map((set) => (
            <div key={set.label} className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 w-24 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{set.label}</span>
              {set.items.map((item) => (
                <Chip key={item} tone={set.tone}>
                  {item}
                </Chip>
              ))}
            </div>
          ))}
          {s.other ? <p className="text-[13px] leading-relaxed text-muted-foreground">{s.other}</p> : null}
        </div>
      ) : null}
      {trip.description ? <EnquiryQuote text={trip.description} clamp /> : null}
    </section>
  );
}

/** The saved stops as a photo timeline. */
export function RouteCard({ tripId, itinerary }: { tripId: string; itinerary: Itinerary | null }) {
  const stops = itinerary?.stops ?? [];
  const nights = stops.reduce((sum, stop) => sum + stop.nights, 0);
  return (
    <section aria-labelledby="route-h" className="tw-surface rounded-2xl border border-border p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="tw-kicker">The route</p>
          <h3 id="route-h" className="tw-trip-display mt-1 text-[1.6rem] leading-none">
            {stops.length ? `${stops.length} stop${stops.length === 1 ? "" : "s"}, ${nightsLabel(nights)}` : "No stops yet"}
          </h3>
        </div>
        {itinerary ? <StatusBadge status={itinerary.status} /> : null}
      </div>
      {stops.length ? (
        <ol className="relative flex flex-col gap-3">
          <span aria-hidden className="absolute bottom-7 left-7 top-7 w-px bg-border" />
          {stops.map((stop) => (
            <li key={stop.id} className="relative flex items-center gap-3">
              <span className="relative shrink-0">
                <DestinationPhoto destination={stop.destination} className="size-14 rounded-xl ring-4 ring-card" />
                <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">{stop.sequence}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="tw-trip-display block truncate text-[1.2rem] leading-tight">{stop.destination}</span>
                <span className="tw-num block text-xs text-muted-foreground">
                  {formatDate(stop.arrivalDate, { day: "numeric", month: "short" })} → {formatDate(stop.departureDate, { day: "numeric", month: "short" })}
                </span>
              </span>
              <span className="tw-num shrink-0 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">{nightsLabel(stop.nights)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Build the overnight stops from the enquiry or by hand.</p>
      )}
      <Button asChild size="sm" variant="outline" className="group/btn mt-5">
        <Link href={`/trips/${tripId}/itinerary`}>
          <Route /> {itinerary ? "Open itinerary" : "Build itinerary"} <ArrowRight className="transition-transform group-hover/btn:translate-x-0.5" />
        </Link>
      </Button>
    </section>
  );
}

/** The latest optimisation run, with live progress while it works. */
export function OptimisationCard({ tripId, job }: { tripId: string; job: JobSummaryRow | null }) {
  const running = job?.status === "queued" || job?.status === "running";
  return (
    <section aria-labelledby="opt-h" className="tw-surface rounded-2xl border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tw-kicker">Latest optimisation</p>
          <h3 id="opt-h" className="tw-trip-display mt-1 text-[1.6rem] leading-none">
            {job ? titleCase(job.status) : "Not run yet"}
          </h3>
        </div>
        <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
          <Wand2 className="size-5" strokeWidth={1.8} />
        </span>
      </div>
      {job ? (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <p className="tw-num text-xs text-muted-foreground">{formatDateTime(job.createdAt)}</p>
          {running ? (
            <div role="status" className="flex flex-col gap-1.5">
              <p className="text-xs">{stageLabel(job.stage, job.status)}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${Math.max(4, job.progress)}%` }} />
              </div>
            </div>
          ) : null}
          {job.errorSummary ? <p className="text-destructive">{job.errorSummary}</p> : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Generate hotel packages that satisfy the brief.</p>
      )}
      <Button asChild size="sm" variant="outline" className="group/btn mt-4">
        <Link href={`/trips/${tripId}/optimise`}>
          {job ? "View runs" : "Configure and run"} <ArrowRight className="transition-transform group-hover/btn:translate-x-0.5" />
        </Link>
      </Button>
    </section>
  );
}
