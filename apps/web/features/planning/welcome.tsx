"use client";
import * as React from "react";
import { CalendarDays, Camera, Compass, Layers, Lightbulb, ListChecks, Luggage, MapPinned, Sparkles } from "lucide-react";
import type { PlanningSnapshot, PlanningStarter } from "@tripweave/planning-contract";
import { dateRange, nightsLabel } from "@/lib/utils";
import { DestinationPhoto } from "./components/destination-photo";

function starterIcon(label: string) {
  if (/missing|ask/i.test(label)) return ListChecks;
  if (/package|compare|value/i.test(label)) return Layers;
  if (/why|explain|recommend/i.test(label)) return Lightbulb;
  if (/best time|season|when/i.test(label)) return CalendarDays;
  if (/pack/i.test(label)) return Luggage;
  if (/map|where/i.test(label)) return MapPinned;
  if (/see|do|day|relaxed|visit/i.test(label)) return Camera;
  if (/next|itinerary|summar|glance/i.test(label)) return Compass;
  return Sparkles;
}

function partyLabel(party: PlanningSnapshot["trip"]["party"]): string | null {
  const adults = party?.adults ?? 0;
  const children = party?.children ?? 0;
  if (!adults && !children) return null;
  const parts = [adults ? `${adults} adult${adults === 1 ? "" : "s"}` : null, children ? `${children} child${children === 1 ? "" : "ren"}` : null].filter(Boolean);
  return parts.join(", ");
}

/**
 * Opening state of the planner, laid out like the first page of a travel journal: a handwritten line
 * about the trip, a large question, photographed starters and the saved stops. Every photograph comes
 * from the trip's own stops (or offers). Starters and stop chips only send prompts; they never change data.
 */
export function PlannerWelcome({
  snapshot,
  starters,
  disabled,
  onAsk,
  composer,
}: {
  snapshot: PlanningSnapshot;
  starters: PlanningStarter[];
  disabled: boolean;
  onAsk: (prompt: string) => void;
  /** The message box, placed under the question until the conversation starts. */
  composer?: React.ReactNode;
}) {
  const stops = snapshot.itinerary?.stops ?? [];
  const places = (stops.length > 0 ? stops.map((stop) => stop.destination) : snapshot.offers.map((offer) => offer.destination)).filter(Boolean);
  const placeFor = (index: number) => (places.length > 0 ? places[index % places.length]! : snapshot.trip.title);
  const nights = stops.reduce((sum, stop) => sum + stop.nights, 0);
  const tripLine = [dateRange(snapshot.trip.arrivalDate, snapshot.trip.departureDate), partyLabel(snapshot.trip.party), stops.length > 0 ? stops.map((stop) => stop.destination).join(" → ") : null]
    .filter((part) => part && part !== "Dates not set")
    .join(" · ");

  return (
    <div className="flex flex-col gap-9 pt-4 sm:pt-8">
      <div className="flex flex-col gap-4">
        {tripLine ? <p className="pl-hand pl-hand-muted">{tripLine}</p> : null}
        <h3 className="pl-display text-[2.9rem] sm:text-[4.2rem]">
          What shall we plan <mark className="pl-mark">next</mark>?
        </h3>
        <p className="pl-deck max-w-xl">I can find places, compare the saved packages and shape day plans as we talk. Every page is composed for your question.</p>
      </div>

      {composer}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {starters.map((starter, index) => {
          const Icon = starterIcon(starter.label);
          return (
            <button
              key={starter.label}
              type="button"
              aria-label={starter.label}
              title={starter.prompt}
              disabled={disabled}
              onClick={() => onAsk(starter.prompt)}
              className="pl-tile pl-rise group flex flex-col overflow-hidden p-1.5 text-left"
              style={{ "--i": index } as React.CSSProperties}
            >
              <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-[13px]">
                <DestinationPhoto destination={placeFor(index)} className="pl-photo absolute inset-0 size-full" eager={index < 3} />
                <span aria-hidden className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-[var(--pl-surface)]/90 text-[var(--pl-accent)] shadow-sm backdrop-blur-[4px]">
                  <Icon className="size-3.5" />
                </span>
              </span>
              <span className="px-2 pb-2 pt-2.5 text-[13.5px] font-semibold leading-snug">{starter.label}</span>
            </button>
          );
        })}
      </div>

      {stops.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <p className="pl-eyebrow">
            Jump to a stop · {stops.length} stop{stops.length === 1 ? "" : "s"}, {nightsLabel(nights)}
          </p>
          <div className="pl-scroll flex gap-2 overflow-x-auto pb-1">
            {stops.map((stop) => (
              <button
                key={stop.id}
                type="button"
                disabled={disabled}
                onClick={() => onAsk(`Tell me about ${stop.destination}: the nights, what to do there and the stay options.`)}
                className="group flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--pl-line)] bg-[var(--pl-surface)] py-1 pl-1 pr-3.5 text-left transition hover:-translate-y-0.5 hover:border-[var(--pl-ink)] disabled:cursor-not-allowed disabled:opacity-50"
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

      <p className="pl-hand">nothing is booked or changed without you</p>
    </div>
  );
}
