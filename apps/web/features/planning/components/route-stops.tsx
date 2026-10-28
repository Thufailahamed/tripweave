"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { Check, Clock, Route, Timer } from "lucide-react";
import { RouteStopSchema, RouteStopsSchema, planningComponentDescriptions } from "@tripweave/planning-contract";
import { cn } from "@/lib/utils";
import { useAskAssistant } from "./travel";
import { DestinationPhoto } from "./destination-photo";

/**
 * One stop on a route: a photograph, its time and duration, a note, and a toggle the reader uses to
 * mark the stop visited while they travel. Directions to the stop are one tap away and go back to the
 * assistant as a question.
 */
export const RouteStop = defineComponent({
  name: "RouteStop",
  description: planningComponentDescriptions.RouteStop,
  props: RouteStopSchema,
  component: function RouteStopView({ props }) {
    const ask = useAskAssistant();
    const [visited, setVisited] = React.useState(false);
    return (
      <article className={cn("pl-card grid h-full grid-cols-1 gap-3 p-3 transition sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4 sm:p-4", visited && "opacity-75")}>
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[14px] sm:aspect-square">
          <DestinationPhoto destination={props.name} className="absolute inset-0 size-full" />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {props.time ? (
              <span className="pl-chip">
                <Clock className="size-3" aria-hidden /> {props.time}
              </span>
            ) : null}
            {props.duration ? (
              <span className="pl-chip">
                <Timer className="size-3" aria-hidden /> {props.duration}
              </span>
            ) : null}
          </div>
          <h4 className="pl-display text-[1.25rem] leading-tight break-words">{props.name}</h4>
          {props.note ? <p className="text-[12.5px] leading-relaxed text-[var(--pl-muted)]">{props.note}</p> : null}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            <button type="button" aria-pressed={visited} onClick={() => setVisited((value) => !value)} className={cn("pl-btn max-w-full", visited && "pl-btn-solid")}>
              <Check className="size-3.5" aria-hidden />
              {visited ? "Visited" : "Mark as visited"}
            </button>
            <button
              type="button"
              className="pl-btn max-w-full"
              onClick={() => ask(`How do I get to ${props.name} from the previous stop? Include the travel time and the best way to travel.`)}
            >
              <Route className="size-3.5" aria-hidden /> Directions
            </button>
          </div>
        </div>
      </article>
    );
  },
});

/** An ordered, numbered timeline of stops. Each stop keeps its own visited state. */
export const RouteStops = defineComponent({
  name: "RouteStops",
  description: planningComponentDescriptions.RouteStops,
  props: RouteStopsSchema,
  component: function RouteStopsView({ props, renderNode }) {
    return (
      <section aria-label={props.title} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="pl-eyebrow">{props.title}</p>
          <span className="text-[11px] text-[var(--pl-muted)]">
            {props.stops.length} stops
          </span>
        </div>
        <ol className="relative flex flex-col gap-3">
          <span aria-hidden className="absolute bottom-6 left-[15px] top-6 w-px bg-[var(--pl-line)] sm:left-[17px]" />
          {props.stops.map((stop, position) => (
            <li key={`${position}-${stop.props?.name ?? position}`} className="relative grid grid-cols-[32px_minmax(0,1fr)] items-stretch gap-3 sm:grid-cols-[36px_minmax(0,1fr)] sm:gap-4">
              <span aria-hidden className="relative z-10 mt-6 grid size-8 place-items-center rounded-full border border-[var(--pl-line)] bg-[var(--pl-surface)] text-[12px] font-semibold text-[var(--pl-accent)] sm:size-9">
                {position + 1}
              </span>
              <div className="min-w-0">{renderNode(stop)}</div>
            </li>
          ))}
        </ol>
      </section>
    );
  },
});
