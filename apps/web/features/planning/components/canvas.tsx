"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { ShieldCheck, Sparkles } from "lucide-react";
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
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="pl-chip pl-chip-accent">
              <Sparkles className="size-3" aria-hidden /> Generated on demand
            </span>
            <span className="pl-chip pl-chip-sage">
              <ShieldCheck className="size-3" aria-hidden /> Grounded in server data
            </span>
          </div>
          <div className="min-w-0 max-w-3xl">
            <p className="pl-eyebrow truncate">
              TripWeave · <span className="normal-case tracking-normal">{snapshot.trip.title}</span>
            </p>
            <h2 id={id} className="pl-display mt-2 text-[2.1rem] sm:text-[2.9rem]">
              {props.title}
            </h2>
            {props.subtitle ? <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--pl-muted)]">{props.subtitle}</p> : null}
          </div>
        </header>
        <div className="mt-6 grid min-w-0 gap-5 [&>*]:min-w-0">{renderNode(props.blocks)}</div>
        <footer className="mt-6 flex items-start gap-2 border-t border-[var(--pl-line)] pt-3 text-[10px] leading-relaxed text-[var(--pl-muted)]">
          <ShieldCheck className="mt-px size-3 shrink-0" aria-hidden />
          The layout is generated on demand from an approved component set. Prices, availability, routes, permissions and bookings are supplied by the server, never by the model.
        </footer>
      </section>
    );
  },
});
