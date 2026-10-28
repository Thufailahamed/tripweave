"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { CalendarDays, Car, TriangleAlert } from "lucide-react";
import { DestinationTimelineSchema } from "@tripweave/planning-contract";
import { formatDate, minutesLabel, nightsLabel } from "@/lib/utils";
import { routeSourceLabel } from "@/features/trips/types";
import { usePlanningItinerary } from "../context";
import { MissingEntity } from "../ui";
import { DestinationPhoto, PhotoCreditLine } from "./destination-photo";

const DESCRIPTION = "Ordered overnight stops with dates, nights and travel legs from the saved itinerary. Pass the itineraryId from CONTEXT.";

export const DestinationTimeline = defineComponent({
  name: "DestinationTimeline",
  description: DESCRIPTION,
  props: DestinationTimelineSchema,
  component: function DestinationTimelineView({ props }) {
    const itinerary = usePlanningItinerary(props.itineraryId);
    if (!itinerary) return <MissingEntity what="itinerary" />;
    const nameOf = (stopId: string) => itinerary.stops.find((stop) => stop.id === stopId)?.destination ?? "Unknown stop";
    return (
      <section aria-label={itinerary.title || "Destination timeline"} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="pl-eyebrow">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--pl-sage)]" /> The route
            </p>
            <h3 className="pl-display mt-1 text-[1.9rem] leading-none">{itinerary.title || "Where you'll stay"}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`pl-chip ${itinerary.status === "confirmed" ? "pl-chip-sage" : "pl-chip-accent"}`}>{itinerary.status === "confirmed" ? "Confirmed itinerary" : `${itinerary.status} itinerary`}</span>
            <span className="pl-chip">
              <CalendarDays className="size-3" aria-hidden /> {itinerary.stops.length} stop{itinerary.stops.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {itinerary.issues.length > 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_oklab,var(--pl-accent)_35%,var(--pl-line))] bg-[var(--pl-accent-soft)] px-3 py-2 text-xs text-[var(--pl-ink)]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--pl-accent)]" aria-hidden />
            <ul className="list-disc space-y-0.5 pl-4">
              {itinerary.issues.slice(0, 5).map((issue) => (
                <li key={`${issue.code}-${issue.stopId ?? ""}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {itinerary.stops.map((stop, index) => {
            const leg = itinerary.legs.find((candidate) => candidate.toStopId === stop.id);
            return (
              <article key={stop.id} className="pl-card pl-rise pl-photo group overflow-hidden" style={{ "--i": index } as React.CSSProperties}>
                <div className="relative">
                  <DestinationPhoto destination={stop.destination} className="h-44 w-full sm:h-52" />
                  <span aria-hidden className="tw-num absolute left-3 top-3 grid size-7 place-items-center rounded-full bg-white/90 text-[11px] font-bold text-[#1c1a15] shadow-sm ring-1 ring-black/5">
                    {stop.sequence}
                  </span>
                  <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-[4px]">{nightsLabel(stop.nights)}</span>
                </div>
                <div className="flex flex-col gap-1.5 p-4">
                  <h4 className="pl-display text-[1.55rem] leading-none">{stop.destination}</h4>
                  <p className="tw-num text-[11px] font-medium text-[var(--pl-muted)]">
                    {formatDate(stop.arrivalDate, { day: "numeric", month: "short" })} → {formatDate(stop.departureDate, { day: "numeric", month: "short" })}
                  </p>
                  {stop.activities.length > 0 ? <p className="text-xs leading-relaxed text-[var(--pl-muted)]">{stop.activities.join(" · ")}</p> : null}
                  {leg ? (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--pl-muted)]">
                      <Car className="size-3.5 text-[var(--pl-accent)]" aria-hidden />
                      From {nameOf(leg.fromStopId)}: {leg.durationMinutes === null ? "drive time unavailable" : minutesLabel(leg.durationMinutes)}
                      {leg.distanceKm !== null ? ` · ${leg.distanceKm} km` : ""} <span className="opacity-70">({routeSourceLabel(leg.source).toLowerCase()})</span>
                    </p>
                  ) : null}
                  <div className="mt-1.5 border-t border-[var(--pl-line)] pt-1.5">
                    <PhotoCreditLine destination={stop.destination} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {itinerary.summary ? <p className="pl-1 text-[13px] leading-relaxed text-[var(--pl-muted)]">{itinerary.summary}</p> : null}
        {itinerary.warnings.length > 0 ? <p className="pl-1 text-[11px] text-[var(--pl-muted)]">{itinerary.warnings.slice(0, 3).join(" · ")}</p> : null}
      </section>
    );
  },
});
