"use client";
import * as React from "react";
import { useTriggerAction } from "@openuidev/react-lang";
import { AlertTriangle } from "lucide-react";
import { OBJECTIVE_LABELS, type NormalisedOffer } from "@tripweave/shared";
import type { PackageShowcaseAction } from "@tripweave/planning-contract";
import { cn, money, titleCase } from "@/lib/utils";

export const BREAKDOWN_LABELS: { key: "budgetFit" | "quality" | "location" | "amenities" | "cancellation" | "preference" | "value"; label: string }[] = [
  { key: "budgetFit", label: "Budget fit" },
  { key: "quality", label: "Quality" },
  { key: "location", label: "Location" },
  { key: "amenities", label: "Amenities" },
  { key: "cancellation", label: "Cancellation" },
  { key: "preference", label: "Preferences" },
  { key: "value", label: "Value" },
];

export function objectiveLabel(objective: string): string {
  return OBJECTIVE_LABELS[objective as keyof typeof OBJECTIVE_LABELS] ?? titleCase(objective);
}

/** Opens a host action. The page's handler performs it; an unknown type is ignored there. */
export function useHostAction() {
  const trigger = useTriggerAction();
  return (label: string, type: PackageShowcaseAction, params: Record<string, unknown> = {}) => void trigger(label, undefined, { type, params });
}

export function MissingEntity({ what }: { what: string }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      This {what} is not in the latest optimisation run, so it is not shown.
    </div>
  );
}

/** Short, plain cancellation label for dense tables. The full wording is shown on the stay card. */
export function shortCancellation(cancellation: NormalisedOffer["cancellation"]): string {
  if (cancellation.refundable === true) return "Refundable";
  if (cancellation.refundable === false) return "Non-refundable";
  return "Terms unknown";
}

export function budgetText(difference: number | null, currency: string, perTraveller = false): string {
  if (difference === null) return "No budget comparison";
  const suffix = perTraveller ? " per traveller" : "";
  return difference >= 0 ? `${money(difference, currency)}${suffix} under budget` : `${money(-difference, currency)}${suffix} over budget`;
}

export function ScoreRing({ score, className }: { score: number; className?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className={cn("relative grid size-12 shrink-0 place-items-center", className)} role="img" aria-label={`Score ${value} out of 100`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={radius} fill="none" className="stroke-foreground/10" strokeWidth="3" />
        <circle cx="22" cy="22" r={radius} fill="none" className="stroke-accent" strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} />
      </svg>
      <span className="tw-num text-[11px] font-bold">{value}</span>
    </span>
  );
}

export function Meter({ label, fraction, className }: { label: string; fraction: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className={cn("h-2 overflow-hidden rounded-full bg-foreground/[0.07]", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-700", pct > 100 ? "bg-destructive" : "bg-gradient-to-r from-accent/70 to-accent")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="tw-num text-right font-semibold">{pct}%</span>
    </div>
  );
}

export function Stars({ count }: { count: number | null }) {
  if (count === null || count <= 0) return null;
  return (
    <span className="tw-num text-xs text-accent" aria-label={`${count} star hotel`}>
      {"★".repeat(Math.min(5, Math.round(count)))}
    </span>
  );
}
