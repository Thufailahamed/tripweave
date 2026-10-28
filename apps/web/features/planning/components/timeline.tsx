"use client";
import * as React from "react";
import { defineComponent, useTriggerAction } from "@openuidev/react-lang";
import { ArrowLeft, ArrowRight, CalendarDays, Car, Check, Route, TriangleAlert } from "lucide-react";
import { DestinationTimelineSchema } from "@tripweave/planning-contract";
import { cancellationText } from "@/features/trips/availability-badge";
import { routeSourceLabel } from "@/features/trips/types";
import { formatDate, mealLabel, minutesLabel, money, nightsLabel } from "@/lib/utils";
import { usePlanningItinerary, usePlanningSnapshot } from "../context";
import { EmptyBlock, MissingEntity, SectionHeader } from "../ui";
import { DestinationPhoto, PhotoCreditLine } from "./destination-photo";

const DESCRIPTION = "Ordered overnight stops with dates, nights and travel legs from the saved itinerary. Pass the itineraryId from CONTEXT.";

export const DestinationTimeline = defineComponent({
  name: "DestinationTimeline",
  description: DESCRIPTION,
  props: DestinationTimelineSchema,
  component: function DestinationTimelineView({ props }) {
    const snapshot = usePlanningSnapshot();
    const itinerary = usePlanningItinerary(props.itineraryId);
    const triggerAction = useTriggerAction();
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());
    const panelId = React.useId();
    const [shortlist, setShortlist] = React.useState<Set<string>>(() => new Set());
    if (!itinerary) return <MissingEntity what="itinerary" />;
    const stops = itinerary.stops;
    if (stops.length === 0) {
      return <EmptyBlock>This itinerary has no stops yet. Add a stop in the itinerary editor to see the route here.</EmptyBlock>;
    }

    const activeIndex = Math.max(0, stops.findIndex((stop) => stop.id === activeId));
    const active = stops[activeIndex]!;
    const legInto = (stopId: string) => itinerary.legs.find((leg) => leg.toStopId === stopId) ?? null;
    const nameOf = (stopId: string) => stops.find((stop) => stop.id === stopId)?.destination ?? "the previous stop";
    const leg = legInto(active.id);
    const hotels = snapshot.offers.filter((entry) => entry.stopId === active.id);
    const totalNights = stops.reduce((sum, stop) => sum + stop.nights, 0);
    const canEditItinerary = snapshot.allowedActions.includes("open_itinerary");

    const select = (index: number) => {
      const next = stops[(index + stops.length) % stops.length];
      if (!next) return;
      setActiveId(next.id);
      tabRefs.current.get(next.id)?.focus();
    };

    const onRailKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        select(activeIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        select(activeIndex - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        select(0);
      } else if (event.key === "End") {
        event.preventDefault();
        select(stops.length - 1);
      }
    };

    return (
      <section aria-label={itinerary.title || "Destination timeline"} className="flex flex-col gap-4">
        <SectionHeader
          icon={Route}
          eyebrow="The route"
          title={itinerary.title || "Where you'll stay"}
          meta={
            <>
              <span className={`pl-chip ${itinerary.status === "confirmed" ? "pl-chip-sage" : "pl-chip-accent"}`}>{itinerary.status === "confirmed" ? "Confirmed itinerary" : `${itinerary.status} itinerary`}</span>
              <span className="pl-chip">
                {stops.length} stop{stops.length === 1 ? "" : "s"} · {nightsLabel(totalNights)}
              </span>
            </>
          }
        />

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

        {/* The route rail: each stop is a photographic tab, and the drive time sits on the connector into it. */}
        <div role="tablist" aria-label="Stops in order" onKeyDown={onRailKeyDown} className="pl-scroll -mx-1 flex items-stretch overflow-x-auto px-1 pb-2">
          {stops.map((stop, index) => {
            const selected = stop.id === active.id;
            const incoming = index > 0 ? legInto(stop.id) : null;
            return (
              <React.Fragment key={stop.id}>
                {incoming ? (
                  <div aria-hidden className="flex min-w-[76px] shrink-0 flex-col items-center justify-center gap-1 px-1.5 text-[10px] text-[var(--pl-muted)]">
                    <span className="flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--pl-line)] bg-[var(--pl-surface)] px-2 py-0.5 font-semibold">
                      <Car className="size-3 text-[var(--pl-accent)]" /> {incoming.durationMinutes === null ? "—" : minutesLabel(incoming.durationMinutes)}
                    </span>
                    <span className="h-px w-full bg-[linear-gradient(90deg,var(--pl-line)_0_4px,transparent_4px_8px)]" />
                  </div>
                ) : null}
                <button
                  type="button"
                  role="tab"
                  id={`${panelId}-tab-${stop.id}`}
                  aria-selected={selected}
                  aria-controls={panelId}
                  tabIndex={selected ? 0 : -1}
                  ref={(node) => {
                    if (node) tabRefs.current.set(stop.id, node);
                    else tabRefs.current.delete(stop.id);
                  }}
                  onClick={() => setActiveId(stop.id)}
                  className={`group flex w-36 shrink-0 flex-col overflow-hidden rounded-2xl border bg-[var(--pl-surface)] text-left transition sm:w-40 ${selected ? "border-[var(--pl-ink)] shadow-[0_16px_28px_-22px_rgba(30,22,12,0.6)]" : "border-[var(--pl-line)] hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--pl-ink)_30%,var(--pl-line))]"}`}
                >
                  <span className="relative block h-20 w-full">
                    <DestinationPhoto destination={stop.destination} className="absolute inset-0 size-full" />
                    <span aria-hidden className="tw-num absolute left-2 top-2 grid size-6 place-items-center rounded-full bg-white/90 text-[10px] font-bold text-[#1c1a15] shadow-sm">
                      {stop.sequence}
                    </span>
                  </span>
                  <span className="flex flex-col gap-0.5 px-3 py-2">
                    <span className="truncate text-[13px] font-semibold">{stop.destination}</span>
                    <span className="tw-num truncate text-[10px] text-[var(--pl-muted)]">{nightsLabel(stop.nights)}</span>
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* The selected stop: the photograph, its dates and activities, the leg in, and the hotels that stay here. */}
        <article
          key={active.id}
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${panelId}-tab-${active.id}`}
          className="pl-card pl-rise grid overflow-hidden md:grid-cols-[1.05fr_1fr]"
          style={{ "--i": 0 } as React.CSSProperties}
        >
          <div className="relative min-h-[240px] md:min-h-[380px]">
            <DestinationPhoto destination={active.destination} className="absolute inset-0 size-full" eager />
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(20,16,10,0.1)_0%,transparent_35%,rgba(20,16,10,0.72)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 sm:p-6">
              <div className="min-w-0">
                <p className="pl-eyebrow text-white/85 [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
                  Stop {active.sequence} of {stops.length}
                </p>
                <h4 className="pl-display mt-1.5 text-[2.5rem] leading-[0.95] text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.45)]">{active.destination}</h4>
              </div>
              <span className="pl-chip shrink-0 border-white/25 bg-black/30 text-white backdrop-blur-[6px]">{nightsLabel(active.nights)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <p className="tw-num flex flex-wrap items-center gap-1.5 text-[12px] font-medium">
              <CalendarDays className="size-3.5 text-[var(--pl-accent)]" aria-hidden />
              {formatDate(active.arrivalDate, { day: "numeric", month: "short", year: "numeric" })} → {formatDate(active.departureDate, { day: "numeric", month: "short", year: "numeric" })}
            </p>

            {active.activities.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="pl-eyebrow">Things to do</p>
                  <span className="tw-num text-[10px] text-[var(--pl-muted)]">{active.activities.filter((activity) => shortlist.has(`${active.id}|${activity}`)).length} shortlisted</span>
                </div>
                <ul className="flex flex-wrap gap-1.5" aria-label="Things to do">
                  {active.activities.slice(0, 8).map((activity) => {
                    const key = `${active.id}|${activity}`;
                    const picked = shortlist.has(key);
                    return (
                      <li key={activity}>
                        <button
                          type="button"
                          aria-pressed={picked}
                          onClick={() =>
                            setShortlist((current) => {
                              const next = new Set(current);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                          className={`pl-chip cursor-pointer transition ${picked ? "pl-chip-sage" : "hover:border-[var(--pl-ink)]"}`}
                        >
                          {picked ? <Check className="size-3" aria-hidden /> : null}
                          {activity}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {leg ? (
              <p className="flex items-start gap-2 rounded-xl bg-[var(--pl-surface-2)] px-3 py-2.5 text-[12px] leading-relaxed">
                <Car className="mt-0.5 size-3.5 shrink-0 text-[var(--pl-accent)]" aria-hidden />
                <span>
                  From {nameOf(leg.fromStopId)}: {leg.durationMinutes === null ? "drive time unavailable" : minutesLabel(leg.durationMinutes)}
                  {leg.distanceKm !== null ? ` · ${leg.distanceKm} km` : ""}{" "}
                  <span className="text-[var(--pl-muted)]">({routeSourceLabel(leg.source).toLowerCase()})</span>
                </span>
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              <p className="pl-eyebrow">Where you stay</p>
              {hotels.length === 0 ? (
                <p className="text-[12px] text-[var(--pl-muted)]">No hotel offer is attached to this stop yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {hotels.slice(0, 3).map((entry) => (
                    <li key={entry.offerId} className="flex items-center gap-3 rounded-xl border border-[var(--pl-line)] p-2 pr-3">
                      <DestinationPhoto destination={entry.destination} imageId={entry.coverImageId} className="size-14 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{entry.offer.property.name}</p>
                        <p className="truncate text-[11px] text-[var(--pl-muted)]">
                          {entry.offer.roomType.name} · {mealLabel(entry.offer.mealPlan)}
                        </p>
                        <p className="truncate text-[10px] text-[var(--pl-muted)]">{cancellationText(entry.offer.cancellation)}</p>
                      </div>
                      <p className="tw-num shrink-0 text-right text-[12px] font-semibold">
                        {entry.offer.totalAmountMinor === undefined ? "In package" : money(entry.offer.totalAmountMinor, entry.offer.currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--pl-line)] pt-3">
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label="Previous stop" disabled={activeIndex === 0} onClick={() => select(activeIndex - 1)} className="pl-btn size-9 justify-center p-0 disabled:opacity-40">
                  <ArrowLeft className="size-4" aria-hidden />
                </button>
                <button type="button" aria-label="Next stop" disabled={activeIndex === stops.length - 1} onClick={() => select(activeIndex + 1)} className="pl-btn size-9 justify-center p-0 disabled:opacity-40">
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              </div>
              {canEditItinerary ? (
                <button type="button" className="pl-btn pl-btn-solid" onClick={() => void triggerAction("Open itinerary", undefined, { type: "open_itinerary", params: {} })}>
                  Edit itinerary <ArrowRight className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
            <PhotoCreditLine destination={active.destination} />
          </div>
        </article>

        {itinerary.summary ? <p className="pl-1 text-[13px] leading-relaxed text-[var(--pl-muted)]">{itinerary.summary}</p> : null}
        {itinerary.warnings.length > 0 ? <p className="pl-1 text-[11px] text-[var(--pl-muted)]">{itinerary.warnings.slice(0, 3).join(" · ")}</p> : null}
      </section>
    );
  },
});
