"use client";
import * as React from "react";
import { ArrowUpRight, Camera, CalendarDays, Compass, Layers, Lightbulb, ListChecks, Luggage, Sparkles } from "lucide-react";
import type { PlanningSnapshot, PlanningStarter } from "@tripweave/planning-contract";
import { nightsLabel } from "@/lib/utils";
import { DestinationPhoto } from "./components/destination-photo";

function starterIcon(label: string) {
  if (/missing|ask/i.test(label)) return ListChecks;
  if (/package|compare|value/i.test(label)) return Layers;
  if (/why|explain|recommend/i.test(label)) return Lightbulb;
  if (/best time|season|when/i.test(label)) return CalendarDays;
  if (/pack/i.test(label)) return Luggage;
  if (/see|do|day|relaxed|visit/i.test(label)) return Camera;
  if (/next|itinerary|summar|glance/i.test(label)) return Compass;
  return Sparkles;
}

/**
 * Opening state of the planner. Every photograph comes from the trip's own stops (or offers), so the
 * page shows the journey before the first reply. Starters and stop chips only send prompts; they never
 * change data.
 */
export function PlannerWelcome({
  snapshot,
  starters,
  disabled,
  onAsk,
}: {
  snapshot: PlanningSnapshot;
  starters: PlanningStarter[];
  disabled: boolean;
  onAsk: (prompt: string) => void;
}) {
  const stops = snapshot.itinerary?.stops ?? [];
  const places = (stops.length > 0 ? stops.map((stop) => stop.destination) : snapshot.offers.map((offer) => offer.destination)).filter(Boolean);
  const placeFor = (index: number) => (places.length > 0 ? places[index % places.length]! : snapshot.trip.title);
  const nights = stops.reduce((sum, stop) => sum + stop.nights, 0);

  return (
    <div className="tw-planner overflow-hidden rounded-[22px] border border-[var(--pl-line)]">
      <div className="relative h-[230px] sm:h-[280px]">
        <DestinationPhoto destination={placeFor(0)} className="absolute inset-0 size-full" eager />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(20,16,10,0.2)_0%,rgba(20,16,10,0.12)_35%,rgba(20,16,10,0.78)_100%)]" />
        {stops.length > 0 ? (
          <div className="absolute left-4 top-4 flex flex-wrap gap-1.5 sm:left-6 sm:top-5">
            <span className="pl-chip border-white/25 bg-black/25 text-white backdrop-blur-[6px]">{stops.length} stop{stops.length === 1 ? "" : "s"}</span>
            <span className="pl-chip border-white/25 bg-black/25 text-white backdrop-blur-[6px]">{nightsLabel(nights)}</span>
          </div>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <p className="pl-eyebrow [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]" style={{ color: "rgba(255,255,255,0.9)" }}>
            <span aria-hidden className="size-1.5 rounded-full bg-white/90" /> Generated on demand
          </p>
          <h3 className="pl-display mt-2 max-w-lg text-[2.5rem] leading-[0.95] text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.45)] sm:text-[3.2rem]">What shall we plan next?</h3>
        </div>
      </div>

      <div className="flex flex-col gap-5 bg-[var(--pl-surface)] p-5 sm:p-7">
        <p className="max-w-xl text-[13px] leading-relaxed text-[var(--pl-muted)]">
          Ask about this trip or about travel in general. I can compose a route, compare packages, explain a recommendation, suggest places and day plans, or gather missing details. Every layout is built for your question; every trip number comes from the saved trip.
        </p>

        {stops.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="pl-eyebrow">Jump to a stop</p>
            <div className="pl-scroll flex gap-2 overflow-x-auto pb-1">
              {stops.map((stop) => (
                <button
                  key={stop.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAsk(`Tell me about ${stop.destination}: the nights, what to do there and the stay options.`)}
                  className="group flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--pl-line)] bg-[var(--pl-surface-2)] py-1 pl-1 pr-3.5 text-left transition hover:-translate-y-0.5 hover:border-[var(--pl-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DestinationPhoto destination={stop.destination} className="size-9 shrink-0 rounded-full" />
                  <span className="flex flex-col">
                    <span className="text-[12px] font-semibold leading-tight">{stop.destination}</span>
                    <span className="text-[10px] leading-tight text-[var(--pl-muted)]">{nightsLabel(stop.nights)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {starters.map((starter, index) => {
            const Icon = starterIcon(starter.label);
            return (
              <button
                key={starter.label}
                type="button"
                aria-label={starter.label}
                disabled={disabled}
                onClick={() => onAsk(starter.prompt)}
                className="pl-card pl-rise group flex min-h-[104px] overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-24px_rgba(30,22,12,0.55)] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ "--i": index } as React.CSSProperties}
              >
                <span className="relative w-24 shrink-0 sm:w-28">
                  <DestinationPhoto destination={placeFor(index)} className="absolute inset-0 size-full" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3.5">
                  <span className="flex items-center justify-between gap-2">
                    <span aria-hidden className="grid size-7 place-items-center rounded-full bg-[var(--pl-surface-2)] text-[var(--pl-accent)]">
                      <Icon className="size-3.5" />
                    </span>
                    <ArrowUpRight className="size-4 text-[var(--pl-muted)] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold leading-snug">{starter.label}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-[var(--pl-muted)]">{starter.prompt}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="pl-hand">nothing is booked or changed without you</p>
      </div>
    </div>
  );
}
