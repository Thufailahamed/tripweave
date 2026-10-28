"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { ShieldCheck } from "lucide-react";
import { PlanningCanvasSchema, planningComponentDescriptions } from "@tripweave/planning-contract";
import { usePlanningSnapshot } from "../context";

/**
 * Marks one word or place in the headline with a highlighter stroke. The model may name it; otherwise
 * the first saved destination that appears in the title is marked, and plain titles stay plain.
 */
export function HighlightedTitle({ title, highlight, fallbacks = [] }: { title: string; highlight?: string | null; fallbacks?: string[] }) {
  const lower = title.toLowerCase();
  const candidates = [highlight ?? "", ...fallbacks].map((value) => value.trim()).filter((value) => value.length >= 2);
  const match = candidates.find((value) => lower.includes(value.toLowerCase()));
  if (!match) return <>{title}</>;
  const start = lower.indexOf(match.toLowerCase());
  const end = start + match.length;
  return (
    <>
      {title.slice(0, start)}
      <mark className="pl-mark">{title.slice(start, end)}</mark>
      {title.slice(end)}
    </>
  );
}

export const PlanningCanvas = defineComponent({
  name: "PlanningCanvas",
  description: planningComponentDescriptions.PlanningCanvas,
  props: PlanningCanvasSchema,
  component: function PlanningCanvasView({ props, renderNode }) {
    const snapshot = usePlanningSnapshot();
    const id = React.useId();
    const destinations = snapshot.itinerary?.stops.map((stop) => stop.destination) ?? [];
    return (
      <section aria-labelledby={id} className="tw-planner pl-flat">
        <header className="flex min-w-0 max-w-3xl flex-col">
          <h2 id={id} className="pl-display text-[2.3rem] sm:text-[3.2rem]">
            <HighlightedTitle title={props.title ?? ""} highlight={props.highlight} fallbacks={destinations} />
          </h2>
          {props.subtitle ? <p className="pl-deck mt-4 max-w-2xl">{props.subtitle}</p> : null}
          {props.note ? <p className="pl-hand mt-2">{props.note}</p> : null}
          {props.chips && props.chips.length > 0 ? (
            <ul aria-label="Summary" className="mt-4 flex flex-wrap gap-1.5">
              {props.chips.map((chip, position) => (
                <li key={`${position}-${chip}`} className="pl-chip">
                  {chip}
                </li>
              ))}
            </ul>
          ) : null}
        </header>
        <div className="mt-7 grid min-w-0 gap-8 [&>*]:min-w-0">{renderNode(props.blocks)}</div>
        <footer className="mt-8 flex items-start gap-1.5 text-[10px] leading-relaxed text-[var(--pl-muted)]">
          <ShieldCheck className="mt-px size-3 shrink-0" aria-hidden />
          Composed on demand for this question. Trip prices, availability and bookings come from the server, never the model.
        </footer>
      </section>
    );
  },
});
