import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatMoney, MEAL_PLAN_LABELS, type MealPlan } from "@tripweave/shared";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formats integer minor units for display. Falls back gracefully for unknown currencies. */
export function money(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "—";
  try {
    return formatMoney(minor, currency);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDate(date: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!date) return "—";
  // Calendar dates (YYYY-MM-DD) are rendered in UTC so they never shift with the viewer's timezone.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(d);
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function dateRange(a: string | null | undefined, b: string | null | undefined): string {
  if (!a && !b) return "Dates not set";
  return `${formatDate(a, { day: "numeric", month: "short" })} – ${formatDate(b)}`;
}

export function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : formatDate(ts);
}

export function percentFromBp(bp: number | null | undefined, digits = 1): string {
  if (bp === null || bp === undefined) return "—";
  return `${(bp / 100).toFixed(digits)}%`;
}

export function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const mealLabel = (m: string): string => MEAL_PLAN_LABELS[m as MealPlan] ?? m;

export function nightsLabel(n: number): string {
  return `${n} night${n === 1 ? "" : "s"}`;
}

export function minutesLabel(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

/** Parses a user-typed decimal ("1,250.50") into integer minor units (2 decimals). */
export function toMinor(input: string): number | null {
  const s = input.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
export const fromMinor = (minor: number | null | undefined): string => (minor === null || minor === undefined ? "" : (minor / 100).toFixed(2));
