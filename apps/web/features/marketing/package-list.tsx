"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { OBJECTIVES } from "@/features/marketing/content";

/**
 * The five optimisation objectives as large accordion rows (one open at a time). Hovering a row's
 * header wipes it lime; the open row reveals the objective's intent and its ranking bias.
 */
export function PackageList() {
  const [open, setOpen] = React.useState(0);
  const base = React.useId();
  return (
    <ol className="border-t border-border">
      {OBJECTIVES.map((o, i) => {
        const isOpen = open === i;
        const panelId = `${base}-${i}`;
        return (
          <li key={o.key} className="border-b border-border">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="tw-wipe group relative flex w-full items-center gap-4 px-1 py-6 text-left transition-colors duration-500 md:gap-8 md:px-4 md:py-8"
              >
                <span className="tw-num w-8 shrink-0 text-xs text-muted-foreground transition-colors duration-500 group-hover:text-accent-foreground/60 md:w-12 md:text-sm">{String(i + 1).padStart(2, "0")}</span>
                <span className="tw-wide flex-1 text-[clamp(20px,3.6vw,52px)] leading-none transition-colors duration-500 group-hover:text-accent-foreground">{o.label}</span>
                <span className="tw-wide hidden text-[clamp(16px,2.4vw,36px)] leading-none text-white/15 transition-colors duration-500 group-hover:text-accent-foreground/35 lg:block">{o.bias}</span>
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-full border border-white/15 transition-[rotate,background-color,border-color,color] duration-500 group-hover:border-accent-foreground/25 group-hover:text-accent-foreground ${isOpen ? "rotate-45 bg-accent text-accent-foreground" : ""}`}>
                  <Plus className="size-4" aria-hidden />
                </span>
              </button>
            </h3>
            <div id={panelId} role="region" aria-label={o.label} className="tw-collapse" data-open={isOpen ? "1" : "0"}>
              <div className="overflow-hidden">
                <div className="grid gap-6 px-1 pb-8 md:grid-cols-[48px_1fr_auto] md:gap-8 md:px-4 lg:grid-cols-[48px_1fr_1fr]">
                  <span aria-hidden className="hidden md:block" />
                  <p className="max-w-xl text-base leading-relaxed text-foreground/70">{o.intent}</p>
                  <div className="flex items-start md:justify-end">
                    <span className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-accent-foreground">
                      <span aria-hidden className="size-1.5 rounded-full bg-accent-foreground" />
                      {o.bias}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
