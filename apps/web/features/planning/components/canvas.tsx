"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { ShieldCheck } from "lucide-react";
import { PlanningCanvasSchema } from "@tripweave/planning-contract";
import { usePlanningSnapshot } from "../context";

const DESCRIPTION = "Top-level container for one planning reply. Put the most useful block first. The title and subtitle are short plain-text framing, not a place for prices or claims.";

export const PlanningCanvas = defineComponent({
  name: "PlanningCanvas",
  description: DESCRIPTION,
  props: PlanningCanvasSchema,
  component: function PlanningCanvasView({ props, renderNode }) {
    const snapshot = usePlanningSnapshot();
    const id = React.useId();
    return (
      <section aria-labelledby={id} className="tw-planner p-5 sm:p-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="pl-eyebrow max-w-full">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--pl-accent)]" />
              <span className="shrink-0">TripWeave</span>
              <span className="min-w-0 truncate text-[var(--pl-muted)]">· {snapshot.trip.title}</span>
            </p>
            <h2 id={id} className="pl-display mt-2 text-[2.1rem] sm:text-[2.9rem]">
              {props.title}
            </h2>
            {props.subtitle ? <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--pl-muted)]">{props.subtitle}</p> : null}
          </div>
          <span className="pl-chip pl-chip-sage shrink-0 self-start">
            <ShieldCheck className="size-3" aria-hidden /> Grounded in server data
          </span>
        </header>
        <div className="mt-6 grid gap-5">{renderNode(props.blocks)}</div>
        <footer className="mt-6 flex items-start gap-2 border-t border-[var(--pl-line)] pt-3 text-[10px] leading-relaxed text-[var(--pl-muted)]">
          <ShieldCheck className="mt-px size-3 shrink-0" aria-hidden />
          The layout is generated on demand from an approved component set. Prices, availability, routes, permissions and bookings are supplied by the server, never by the model.
        </footer>
      </section>
    );
  },
});
