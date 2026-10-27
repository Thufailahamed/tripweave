"use client";
import * as React from "react";
import type { ZodError } from "zod";
import { ApiError } from "@/lib/api";

/** Maps Zod issues to `{ "path.to.field": message }` (first message per path wins). */
export function issuesToErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join(".");
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}

/** Field errors from an API 422 (if any) so server-side validation lands next to the right input. */
export function apiFieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError ? e.fieldErrors : {};
}

/** localStorage-backed state that never throws (private mode, blocked storage, SSR). */
export function usePersistedState<T extends string>(key: string, initial: T, allowed?: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = React.useState<T>(initial);
  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(key);
      if (v && (!allowed || (allowed as readonly string[]).includes(v))) setValue(v as T);
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = React.useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, v);
      } catch {
        /* storage unavailable */
      }
    },
    [key],
  );
  return [value, set];
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Today as a YYYY-MM-DD calendar date (UTC, matching how the API stores dates). */
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Calendar-date arithmetic for UI defaults/ranges only (no business rules). */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysUntil(date: string): number {
  const a = new Date(`${date}T00:00:00Z`).getTime();
  const b = new Date(`${todayIso()}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

export type ExpiryState = { kind: "expired"; days: number } | { kind: "soon"; days: number } | null;
/** Display helper: classifies an end date as expired or ending within `windowDays`. */
export function expiryState(effectiveTo: string, windowDays = 30): ExpiryState {
  const d = daysUntil(effectiveTo);
  if (d < 0) return { kind: "expired", days: -d };
  if (d <= windowDays) return { kind: "soon", days: d };
  return null;
}

export const CATEGORY_LABEL: Record<string, string> = {
  budget: "Budget",
  standard: "Standard",
  comfort: "Comfort",
  boutique: "Boutique",
  premium: "Premium",
  luxury: "Luxury",
};

export const RATE_TYPE_LABEL: Record<string, string> = { contract: "Contract", rack: "Rack", promotional: "Promotional", package: "Package" };
export const PRICING_BASIS_LABEL: Record<string, string> = { per_room_per_night: "Per room, per night", per_person_per_night: "Per person, per night" };
export const PAYMENT_TYPE_LABEL: Record<string, string> = { pay_now: "Pay now", pay_at_hotel: "Pay at hotel", credit: "On credit", deposit: "Deposit" };
export const SUPPLIER_TYPE_LABEL: Record<string, string> = { direct_hotel: "Direct hotel", dmc: "DMC", wholesaler: "Wholesaler", api_provider: "API provider", partner: "Partner" };
export const AGREEMENT_TYPE_LABEL: Record<string, string> = { net_rate: "Net rate", commissionable: "Commissionable", allotment: "Allotment", contract_rate: "Contract rate" };

/** Suggestions only; users can type any amenity. */
export const AMENITY_SUGGESTIONS = [
  "Wi-Fi", "Air conditioning", "Swimming pool", "Spa", "Gym", "Restaurant", "Bar", "Beach access", "Airport transfer", "Parking",
  "Breakfast included", "Family rooms", "Garden", "Yoga", "Room service", "Laundry", "Pet friendly", "Wheelchair accessible", "Safari tours", "Cooking classes",
];
export const BED_SUGGESTIONS = ["1 king bed", "1 queen bed", "2 single beds", "1 double bed", "Sofa bed", "Extra bed on request"];

export function downloadText(text: string, filename: string, openBlobFn: (b: Blob, f?: string) => void) {
  openBlobFn(new Blob([text], { type: "text/csv;charset=utf-8" }), filename);
}

/** Percent text ("10", "12.5") to basis points; null when not a number. */
export function percentToBp(text: string): number | null {
  const s = text.trim();
  if (s === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
export const bpToPercentText = (bp: number): string => (bp === 0 ? "0" : String(bp / 100));

/** Parses an optional numeric text field. "" -> null, invalid -> NaN. */
export function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  return Number(t);
}
