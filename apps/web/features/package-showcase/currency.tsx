"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { money } from "@/lib/utils";

/** Currencies a reader may view prices in. Quotations are still priced and billed in the package currency. */
export const DISPLAY_CURRENCIES = ["USD", "EUR", "GBP", "LKR", "INR", "AUD", "CAD", "CHF", "JPY", "CNY", "SGD", "AED"] as const;

export interface DisplayFx {
  base: "USD";
  /** Units of each currency per 1 USD. */
  rates: Record<string, number>;
  asOf: string;
  source: string;
  live: boolean;
}

const STORAGE_KEY = "tw.displayCurrency";
const MINOR_DIGITS: Record<string, number> = { JPY: 0 };

interface DisplayCurrencyValue {
  /** The currency to show, or null to show each amount in its own currency. */
  currency: string | null;
  setCurrency: (currency: string | null) => void;
  fx: DisplayFx | null;
}

const DisplayCurrencyContext = React.createContext<DisplayCurrencyValue>({ currency: null, setCurrency: () => undefined, fx: null });

export function useDisplayFx() {
  return useQuery({
    queryKey: ["fx", "display"],
    queryFn: ({ signal }) => apiGet<DisplayFx>("/organization/fx/display", undefined, signal),
    staleTime: 60 * 60_000,
    retry: 1,
  });
}

/** Holds the reader's chosen display currency for the page, remembered in this browser only. */
export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const fx = useDisplayFx().data ?? null;
  const [currency, setState] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && (DISPLAY_CURRENCIES as readonly string[]).includes(saved)) setState(saved);
    } catch {
      // Storage can be unavailable (private mode); the switcher still works for this visit.
    }
  }, []);
  const setCurrency = React.useCallback((next: string | null) => {
    setState(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }, []);
  const value = React.useMemo(() => ({ currency, setCurrency, fx }), [currency, setCurrency, fx]);
  return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>;
}

export function useDisplayCurrency(): DisplayCurrencyValue {
  return React.useContext(DisplayCurrencyContext);
}

/** Converts an amount in minor units between currencies with USD-based rates; null when a rate is missing. */
export function convertForDisplay(amountMinor: number, from: string, to: string, fx: DisplayFx | null): number | null {
  if (from === to) return amountMinor;
  const rFrom = fx?.rates[from];
  const rTo = fx?.rates[to];
  if (!rFrom || !rTo) return null;
  const major = amountMinor / 10 ** (MINOR_DIGITS[from] ?? 2);
  return Math.round(((major / rFrom) * rTo) * 10 ** (MINOR_DIGITS[to] ?? 2));
}

/**
 * Formats money in the reader's display currency. A converted amount is marked "≈", because it uses a
 * market rate for viewing; the original amount in the package currency is what is quoted and billed.
 */
export function useMoney() {
  const { currency: display, fx } = useDisplayCurrency();
  return React.useCallback(
    (amountMinor: number | null | undefined, currency: string): string => {
      if (amountMinor === null || amountMinor === undefined) return "—";
      if (!display || display === currency) return money(amountMinor, currency);
      const converted = convertForDisplay(amountMinor, currency, display, fx);
      if (converted === null) return money(amountMinor, currency);
      const digits = MINOR_DIGITS[display] ?? 2;
      try {
        return `≈ ${new Intl.NumberFormat("en-GB", { style: "currency", currency: display, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(converted / 10 ** digits)}`;
      } catch {
        return `≈ ${(converted / 10 ** digits).toFixed(digits)} ${display}`;
      }
    },
    [display, fx],
  );
}

/** Whether amounts in `currency` are currently shown converted. */
export function useIsConverted(currency: string): boolean {
  const { currency: display, fx } = useDisplayCurrency();
  return !!display && display !== currency && !!fx?.rates[display] && !!fx?.rates[currency];
}

/** The page control: pick the currency to view prices in, with the rate source underneath. */
export function CurrencySwitcher({ billing }: { billing: string }) {
  const { currency, setCurrency, fx } = useDisplayCurrency();
  const shown = currency ?? billing;
  const available = DISPLAY_CURRENCIES.filter((code) => code === billing || !!fx?.rates[code]);
  const rate = shown !== billing ? convertForDisplay(100, billing, shown, fx) : null;
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={fx ? `${fx.live ? "Market rates" : "Rates"} from ${fx.source}, ${new Date(fx.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}. Quotations are billed in ${billing}.` : undefined}>
      <span className="hidden sm:inline">Show in</span>
      <select
        value={shown}
        onChange={(e) => setCurrency(e.target.value === billing ? null : e.target.value)}
        aria-label="Currency to show prices in"
        className="h-9 rounded-full border border-input bg-background/40 px-3 text-xs font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {available.map((code) => (
          <option key={code} value={code}>
            {code}
            {code === billing ? " (billed)" : ""}
          </option>
        ))}
      </select>
      {rate !== null ? <span className="tw-num hidden lg:inline">1 {billing} ≈ {(rate / 10 ** (MINOR_DIGITS[shown] ?? 2)).toLocaleString("en-GB", { maximumFractionDigits: 4 })} {shown}</span> : null}
    </label>
  );
}
