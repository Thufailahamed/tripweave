/**
 * Decimal-safe money handling. All amounts are integer minor units (e.g. cents).
 * Intermediate maths uses BigInt so that large LKR amounts never lose precision.
 */

export const SUPPORTED_CURRENCIES = ["LKR", "USD", "EUR", "GBP"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

const EXPONENTS: Record<string, number> = { LKR: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0 };

export function currencyExponent(currency: string): number {
  const e = EXPONENTS[currency.toUpperCase()];
  if (e === undefined) throw new Error(`Unsupported currency: ${currency}`);
  return e;
}

export function isSupportedCurrency(value: string): value is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export type RoundingMode = "half_up" | "ceil" | "floor";

/** Computes round(a * b / c) for integers using BigInt. c must be > 0. */
export function mulDiv(a: number, b: number, c: number, mode: RoundingMode = "half_up"): number {
  if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c)) {
    throw new Error("mulDiv requires integer operands");
  }
  if (c <= 0) throw new Error("mulDiv divisor must be positive");
  const A = BigInt(a);
  const B = BigInt(b);
  const C = BigInt(c);
  const num = A * B;
  const neg = num < 0n;
  const abs = neg ? -num : num;
  let q = abs / C;
  const r = abs % C;
  if (r !== 0n) {
    if (mode === "ceil") q += neg ? 0n : 1n;
    else if (mode === "floor") q += neg ? 1n : 0n;
    else if (r * 2n >= C) q += 1n;
  }
  const out = neg ? -q : q;
  if (out > BigInt(Number.MAX_SAFE_INTEGER) || out < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("Money overflow");
  }
  return Number(out);
}

/** Basis-point percentage of an amount (1 bp = 0.01%). */
export function percentOf(amountMinor: number, basisPoints: number, mode: RoundingMode = "half_up"): number {
  return mulDiv(amountMinor, basisPoints, 10_000, mode);
}

export interface FxRate {
  base: string;
  quote: string;
  /** Decimal string, e.g. "301.2500". 1 base = rate quote. */
  rate: string;
  asOf: string;
  source: string;
}

const FX_SCALE_DIGITS = 8;

/** Parses a decimal string into a scaled integer (10^8). */
export function parseScaledDecimal(value: string): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid decimal: ${value}`);
  const whole = m[1] ?? "0";
  const frac = (m[2] ?? "").padEnd(FX_SCALE_DIGITS, "0").slice(0, FX_SCALE_DIGITS);
  const scaled = BigInt(whole) * 10n ** BigInt(FX_SCALE_DIGITS) + BigInt(frac);
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("FX rate too large");
  return Number(scaled);
}

/** Converts minor units from one currency to another using a direct rate (1 from = rate to). */
export function convertMinor(amountMinor: number, from: string, to: string, rate: string): number {
  if (from === to) return amountMinor;
  const scaled = parseScaledDecimal(rate);
  const eFrom = currencyExponent(from);
  const eTo = currencyExponent(to);
  // major_to = major_from * rate  =>  minor_to = minor_from * rate * 10^eTo / 10^eFrom
  const scale = 10 ** FX_SCALE_DIGITS;
  if (eTo >= eFrom) return mulDiv(amountMinor, scaled * 10 ** (eTo - eFrom), scale);
  return mulDiv(amountMinor, scaled, scale * 10 ** (eFrom - eTo));
}

/**
 * A snapshot of exchange rates relative to a pivot currency. Any pair is derived via the pivot
 * (or inverted/direct) so a quotation can be fully reproduced later.
 */
export interface FxSnapshot {
  pivot: string;
  /** rates[c] = how many units of c per 1 pivot (decimal string). */
  rates: Record<string, string>;
  asOf: string;
  source: string;
}

export function fxRateBetween(snapshot: FxSnapshot, from: string, to: string): string | null {
  if (from === to) return "1";
  const rateOf = (c: string): number | null => {
    if (c === snapshot.pivot) return 1 * 10 ** FX_SCALE_DIGITS;
    const r = snapshot.rates[c];
    return r === undefined ? null : parseScaledDecimal(r);
  };
  const rFrom = rateOf(from);
  const rTo = rateOf(to);
  if (rFrom === null || rTo === null || rFrom === 0) return null;
  // 1 from = (1/rFrom) pivot = rTo/rFrom to
  const scale = 10 ** FX_SCALE_DIGITS;
  const scaled = mulDiv(rTo, scale, rFrom);
  const whole = Math.floor(scaled / scale);
  const frac = String(scaled % scale).padStart(FX_SCALE_DIGITS, "0");
  return `${whole}.${frac}`;
}

export function convertWithSnapshot(
  amountMinor: number,
  from: string,
  to: string,
  snapshot: FxSnapshot,
): number | null {
  if (from === to) return amountMinor;
  const rate = fxRateBetween(snapshot, from, to);
  if (rate === null) return null;
  return convertMinor(amountMinor, from, to, rate);
}

/** Splits `total` across weights using the largest-remainder method so the parts always sum to total. */
export function allocateProportional(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) {
    const even = Math.floor(total / weights.length);
    const out = weights.map(() => even);
    let rem = total - even * weights.length;
    for (let i = 0; rem > 0; i = (i + 1) % out.length, rem--) out[i] = (out[i] ?? 0) + 1;
    return out;
  }
  const raw = weights.map((w) => mulDiv(total, w, sum, "floor"));
  let rem = total - raw.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, frac: Number((BigInt(total) * BigInt(w)) % BigInt(sum)) / sum }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0; k = (k + 1) % order.length, rem--) {
    const idx = order[k]!.i;
    raw[idx] = (raw[idx] ?? 0) + 1;
  }
  return raw;
}

export function formatMoney(amountMinor: number, currency: string, locale = "en-US"): string {
  const e = currencyExponent(currency);
  const major = amountMinor / 10 ** e;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: e,
    maximumFractionDigits: e,
  }).format(major);
}

/** Parses a user-entered decimal amount (e.g. "1,250.50") into minor units. */
export function toMinorUnits(input: string | number, currency: string): number {
  const e = currencyExponent(currency);
  const s = typeof input === "number" ? input.toFixed(e) : input.replace(/,/g, "").trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Invalid amount: ${input}`);
  const frac = (m[3] ?? "").padEnd(e, "0");
  const roundUp = frac.length > e && Number(frac[e]) >= 5 ? 1 : 0;
  const minor = Number(m[2]) * 10 ** e + Number(frac.slice(0, e) || "0") + roundUp;
  return m[1] === "-" ? -minor : minor;
}

export function basisPointsToPercentString(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`;
}
