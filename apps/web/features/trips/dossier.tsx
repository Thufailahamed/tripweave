"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { IconTile, type TileTone } from "@/components/ui/card";

/**
 * Building blocks for the trip dossier tabs. They share the AI planner's travel-journal voice: serif
 * headings, a handwritten aside, icon fact tiles and quoted enquiries, all on the `.tw-trip` palette.
 */

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

/** Serif section heading with an optional eyebrow, handwritten note and right-hand aside. */
export function SectionHeading({ id, title, eyebrow, note, aside, className }: { id?: string; title: React.ReactNode; eyebrow?: React.ReactNode; note?: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="tw-kicker mb-1.5">{eyebrow}</p> : null}
        <h2 id={id} className="tw-trip-display text-[2rem] leading-none">
          {title}
        </h2>
        {note ? <p className="tw-hand mt-1.5">{note}</p> : null}
      </div>
      {aside ? <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">{aside}</div> : null}
    </div>
  );
}

/** One labelled fact with an icon. Missing values read as a quiet "Not set" rather than a dash. */
export function FactTile({ icon, label, children, tone = "primary", missing, missingLabel = "Not set", className }: { icon: IconType; label: string; children?: React.ReactNode; tone?: TileTone; missing?: boolean; missingLabel?: string; className?: string }) {
  return (
    <div className={cn("group flex min-w-0 items-start gap-3 rounded-xl border border-border bg-card/70 p-3.5 transition-colors", missing && "border-dashed bg-transparent", className)}>
      <IconTile icon={icon} tone={missing ? "neutral" : tone} size="sm" />
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
        <dd className={cn("mt-1 text-[13.5px] leading-snug break-words", missing && "text-muted-foreground")}>{missing ? missingLabel : children}</dd>
      </div>
    </div>
  );
}

/** Small rounded label for amenity lists and similar sets. */
export function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "accent" | "success" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
        tone === "accent" ? "border-accent/30 bg-accent-soft text-accent" : tone === "success" ? "border-success/30 bg-success-soft text-success" : "border-border bg-card text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** The customer's own words, set as a pulled quote. */
export function EnquiryQuote({ text, caption = "from the original enquiry", clamp = false }: { text: string; caption?: string; clamp?: boolean }) {
  return (
    <figure className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 pl-12 sm:p-7 sm:pl-14">
      <span aria-hidden className="tw-trip-display pointer-events-none absolute left-4 top-1 select-none text-[5rem] leading-none text-accent/35 sm:left-5">
        “
      </span>
      <blockquote className={cn("tw-trip-display whitespace-pre-wrap text-[1.3rem] leading-[1.35] text-foreground/90 sm:text-[1.45rem]", clamp && "line-clamp-6")}>{text}</blockquote>
      <figcaption className="tw-hand mt-3">{caption}</figcaption>
    </figure>
  );
}
