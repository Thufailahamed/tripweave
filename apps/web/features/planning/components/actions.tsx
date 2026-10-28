"use client";
import * as React from "react";
import { defineComponent, useTriggerAction } from "@openuidev/react-lang";
import { ArrowUpRight, Layers, Map, Wand2 } from "lucide-react";
import { QuickActionsSchema } from "@tripweave/planning-contract";
import { usePlanningMode, usePlanningSnapshot } from "../context";

const DESCRIPTION = "A row of permitted next-step actions derived from the server (itinerary, optimisation, packages). Takes no arguments. Use it at the end of a reply when a next step is genuinely useful; never invent an action.";

export const QuickActions = defineComponent({
  name: "QuickActions",
  description: DESCRIPTION,
  props: QuickActionsSchema,
  component: function QuickActionsView() {
    const snapshot = usePlanningSnapshot();
    const mode = usePlanningMode();
    const traveler = mode === "traveler";
    const action = useTriggerAction();
    const can = (name: string) => snapshot.allowedActions.includes(name as never);
    const items: { label: string; hint: string; icon: typeof Map; run: () => void }[] = [];
    if (snapshot.itinerary && can("open_itinerary")) {
      items.push({ label: "Itinerary", hint: "Stops, dates and drive times", icon: Map, run: () => void action("Open itinerary", undefined, { type: "open_itinerary", params: {} }) });
    }
    if (snapshot.packages.length > 0 && can("open_packages")) {
      items.push({ label: traveler ? "Stay ideas" : "Packages", hint: traveler ? "See the hotels along this route" : "Compare, re-price or quote", icon: Layers, run: () => void action("Open packages", undefined, { type: "open_packages", params: {} }) });
    }
    if (snapshot.permissions.canRunOptimisation && can("open_optimise")) {
      items.push({ label: traveler ? "Find stays" : "Optimise", hint: traveler ? "Search along the confirmed route" : "Search for a better stay", icon: Wand2, run: () => void action("Configure optimisation", undefined, { type: "open_optimise", params: {} }) });
    }
    if (items.length === 0) return null;
    return (
      <section aria-label="Next steps" className="flex flex-col gap-2">
        <p className="pl-hand pl-1">where to next?</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {items.map((item) => (
            <button key={item.label} type="button" onClick={item.run} className="pl-btn group h-auto justify-between px-4 py-3 text-left">
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="grid size-8 place-items-center rounded-full bg-[var(--pl-surface-2)] text-[var(--pl-accent)]">
                  <item.icon className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{item.label}</span>
                  <span className="text-[10px] font-medium text-[var(--pl-muted)]">{item.hint}</span>
                </span>
              </span>
              <ArrowUpRight className="size-4 text-[var(--pl-muted)] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
            </button>
          ))}
        </div>
      </section>
    );
  },
});
