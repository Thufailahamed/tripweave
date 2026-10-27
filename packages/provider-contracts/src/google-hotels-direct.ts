import type { FetchLike } from "./resilience";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CURRENCY_CODES = new Set([
  "ALL", "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "JPY", "INR", "LKR",
  "SGD", "HKD", "CHF", "THB", "MYR", "IDR", "VND", "PHP", "KRW", "CNY",
  "TWD", "AED", "SAR", "QAR", "BRL", "MXN", "ZAR", "TRY", "RUB", "PLN",
  "SEK", "NOK", "DKK", "CZK", "HUF", "RON", "BGN", "HRK", "ISK", "ILS",
  "EGP", "PKR", "BDT", "NPR", "MMK", "KHR", "LAK", "MNT", "KZT", "UZS",
  "GEL", "AMD", "AZN", "BYN", "UAH", "RSD", "MKD",
]);

export type GoogleHotelsBreakfast = "included" | "not_included" | "paid" | "unknown";

export interface GoogleHotelsEntityRate {
  source: string;
  room: string | null;
  guests: number | null;
  breakfast: GoogleHotelsBreakfast;
  cancellation: string | null;
  nightly: number | null;
  total: number;
  currency: string | null;
  link: string | null;
  kind: "room" | "provider" | "compact";
}

export interface GoogleHotelsEntity {
  name: string | null;
  token: string | null;
  coords: [number, number] | null;
  address: string | null;
  stars: number | null;
  rating: number | null;
  reviews: number | null;
  description: string | null;
  rates: GoogleHotelsEntityRate[];
}

export interface GoogleHotelsEntityFetchResult extends GoogleHotelsEntity {
  token: string;
  url: string;
  fetchedAt: string;
  latencyMs: number;
  attempts: number;
}

export class GoogleHotelsDirectError extends Error {
  constructor(
    message: string,
    readonly code: "consent" | "parse" | "timeout" | "network" | "http",
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleHotelsDirectError";
  }
}

export class GoogleHotelsConsentError extends GoogleHotelsDirectError {
  constructor(message = "Google returned a consent wall instead of an entity page") {
    super(message, "consent");
    this.name = "GoogleHotelsConsentError";
  }
}

export class GoogleHotelsParseError extends GoogleHotelsDirectError {
  constructor(message: string) {
    super(message, "parse");
    this.name = "GoogleHotelsParseError";
  }
}

/* ------------------------------------------------------------------ */
/* protobuf encoder                                                    */
/* ------------------------------------------------------------------ */

function varint(n: number): Uint8Array {
  const out: number[] = [];
  while (true) {
    const b = n & 0x7f;
    n >>>= 7;
    if (n) out.push(b | 0x80);
    else {
      out.push(b);
      return Uint8Array.from(out);
    }
  }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function field(num: number, wire: 0 | 2, payload: Uint8Array | number): Uint8Array {
  const tag = (num << 3) | wire;
  if (wire === 0) return concat(varint(tag), varint(payload as number));
  return concat(varint(tag), varint((payload as Uint8Array).length), payload as Uint8Array);
}

const msg = (num: number, ...payloads: Uint8Array[]) => field(num, 2, concat(...payloads));
const v = (num: number, n: number) => field(num, 0, n);

function dateField(date: Date): Uint8Array {
  return concat(v(1, date.getUTCFullYear()), v(2, date.getUTCMonth() + 1), v(3, date.getUTCDate()));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Builds the Google Hotels `ts` parameter. Google ignores check-in, check-out, occupancy and
 * currency URL parameters; this encoded protobuf carries the stay, party and currency instead.
 */
export function encodeGoogleHotelsTs({
  checkIn,
  checkOut,
  adults = 2,
  childAges = [],
  rooms = 1,
  currency = "USD",
}: {
  checkIn: string;
  checkOut: string;
  adults?: number;
  childAges?: number[];
  rooms?: number;
  currency?: string;
}): string {
  const ci = new Date(`${checkIn}T00:00:00Z`);
  const co = new Date(`${checkOut}T00:00:00Z`);
  const nights = Math.round((co.getTime() - ci.getTime()) / 86_400_000);
  if (!Number.isFinite(nights) || nights <= 0) throw new Error("checkOut must be after checkIn");

  const travelers: Uint8Array[] = [];
  for (let i = 0; i < adults; i++) travelers.push(msg(1, v(1, 3)));
  for (const age of childAges) travelers.push(msg(1, v(1, 2), v(2, age)));
  travelers.push(v(2, Math.max(0, rooms - 1)));

  const place = msg(1, msg(3, new Uint8Array()));
  const stayDates = concat(msg(1, dateField(ci)), msg(2, dateField(co)), v(3, nights));
  const stay = concat(msg(2, stayDates), msg(6, v(1, rooms)));
  const search = concat(msg(1, place), msg(2, stay));
  const filters = concat(msg(1, msg(7, new TextEncoder().encode(currency))), msg(3, new Uint8Array()));
  const root = concat(v(1, 1), msg(2, concat(...travelers)), msg(3, search), msg(5, filters));
  return toBase64Url(root);
}

/* ------------------------------------------------------------------ */
/* HTML parsing                                                        */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function parseMoney(text: string): { amount: number; currency: string | null } | null {
  const t = text.trim();
  const currency =
    t.includes("US$") ? "USD" :
    t.includes("CA$") ? "CAD" :
    t.includes("AU$") ? "AUD" :
    t.includes("NZ$") ? "NZD" :
    t.includes("HK$") ? "HKD" :
    t.includes("S$") ? "SGD" :
    t.includes("$") ? "USD" :
    t.includes("€") ? "EUR" :
    t.includes("£") ? "GBP" :
    t.includes("₹") ? "INR" :
    t.includes("¥") ? "JPY" :
    t.includes("LKR") ? "LKR" :
    null;
  const m = t.match(/-?[\d][\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const amount = Number(m[0]!.replace(/,/g, ""));
  return Number.isFinite(amount) ? { amount, currency } : null;
}

function isProviderName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const value = name.trim();
  if (value.length < 2 || value.length > 80) return false;
  if (CURRENCY_CODES.has(value.toUpperCase())) return false;
  if (/^(google|google hotels|sponsored)$/i.test(value)) return false;
  if (/^[0-9a-f_-]{16,}$/i.test(value)) return false;
  return /[a-z]/i.test(value);
}

function findJsonArrayEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length && /\s/.test(text[i]!)) i++;
  if (text[i] !== "[") return -1;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

export function extractGoogleHotelsEntityData(html: string): unknown {
  const match = html.match(/AF_initDataCallback\(\{key:\s*'ds:1'[\s\S]*?data:/);
  if (!match || match.index === undefined) throw new GoogleHotelsParseError("Entity page did not contain the ds:1 rate payload");
  const start = match.index + match[0].length;
  const end = findJsonArrayEnd(html, start);
  if (end < 0) throw new GoogleHotelsParseError("Entity rate payload was truncated");
  try {
    return JSON.parse(html.slice(start, end));
  } catch (err) {
    throw new GoogleHotelsParseError(`Entity rate payload was not valid JSON: ${(err as Error).message}`);
  }
}

function parseEntityPrice(value: unknown): { total: number; nightly: number | null; currency: string | null } | null {
  if (!Array.isArray(value)) return null;
  const totalRaw = value[2] ?? value[4] ?? value[0];
  const nightlyRaw = value[0] ?? value[3];
  const total = typeof totalRaw === "number" ? totalRaw : parseMoney(String(totalRaw ?? ""))?.amount ?? null;
  if (!Number.isFinite(total)) return null;
  const nightly = typeof nightlyRaw === "number" ? nightlyRaw : parseMoney(String(nightlyRaw ?? ""))?.amount ?? null;
  return {
    // Google's payload keeps an unrounded internal amount alongside the displayed
    // whole-unit price; fractional cents should not leak through.
    total: Math.round(total as number),
    nightly: Number.isFinite(nightly) ? Math.round(nightly as number) : null,
    currency: parseMoney(String(totalRaw ?? ""))?.currency ?? null,
  };
}

function parseGuests(details: string[]): number | null {
  for (const detail of details) {
    const match = detail.match(/(?:^|\D)(\d+)\s+guests?\b/i) ?? detail.match(/sleeps\s+(\d+)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function breakfastFromDetails(details: string[], { absentMeansNotIncluded = false } = {}): GoogleHotelsBreakfast {
  const text = details.join(" | ").toLowerCase();
  if (/breakfast\s*\(\$\)|breakfast[^|]*(extra|fee|not included)/.test(text)) return "paid";
  if (/free breakfast|breakfast included|\bbreakfast\b/.test(text)) return "included";
  return absentMeansNotIncluded ? "not_included" : "unknown";
}

function cancellationFromDetails(details: string[]): string | null {
  const found = details.find((detail) => /free cancellation/i.test(detail));
  return found ? decodeEntities(found).replace(/\s+/g, " ").trim() : null;
}

function compactCancellation(meta: unknown): string | null {
  if (!Array.isArray(meta)) return null;
  const until = meta.find((part) => Array.isArray(part) && typeof part[1] === "string" && /^[A-Z][a-z]{2}\b/.test(part[1]));
  return until ? `Free cancellation until ${until[1]}` : null;
}

function isFullOffer(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length < 25) return false;
  const price = parseEntityPrice(value[19]);
  return (
    isProviderName(value[0]) &&
    typeof value[1] === "string" &&
    /travel-hotels\/branding|^\/\//.test(value[1]) &&
    Array.isArray(value[18]) &&
    Array.isArray(value[19]) &&
    price !== null &&
    typeof value[40] === "number"
  );
}

function isCompactOffer(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length < 13) return false;
  const total = parseEntityPrice(Array.isArray(value[12]) ? value[12][5] : null);
  return (
    Array.isArray(value[0]) &&
    isProviderName(value[0][0]) &&
    Array.isArray(value[12]) &&
    Array.isArray(value[12][4]) &&
    Array.isArray(value[12][5]) &&
    total !== null
  );
}

function ratesFromFullOffer(offer: unknown[], { currency }: { currency: string }): GoogleHotelsEntityRate[] {
  const source = String(offer[0]).trim();
  const providerDetails = (offer[18] as unknown[]).filter((detail): detail is string => typeof detail === "string");
  const providerPrice = parseEntityPrice(offer[19]);
  const providerGuests = parseGuests(providerDetails);
  const providerCancellation = cancellationFromDetails(providerDetails);
  const providerBreakfast = breakfastFromDetails(providerDetails);
  const rates: GoogleHotelsEntityRate[] = [];

  for (const room of Array.isArray(offer[24]) ? offer[24] : []) {
    if (!Array.isArray(room) || typeof room[0] !== "string" || !Array.isArray(room[1]) || !Array.isArray(room[3])) continue;
    const roomDetails = room[1].filter((detail): detail is string => typeof detail === "string");
    const price = parseEntityPrice(room[3]);
    if (!price) continue;
    rates.push({
      source,
      room: room[0].trim(),
      guests: parseGuests(roomDetails) ?? providerGuests,
      breakfast: breakfastFromDetails(roomDetails, { absentMeansNotIncluded: true }),
      cancellation: cancellationFromDetails(roomDetails) ?? providerCancellation,
      nightly: price.nightly,
      total: price.total,
      currency: price.currency ?? currency,
      link: typeof room[4] === "string" ? room[4] : null,
      kind: "room",
    });
  }

  if (rates.length === 0 && providerPrice) {
    rates.push({
      source,
      room: null,
      guests: providerGuests,
      breakfast: providerBreakfast,
      cancellation: providerCancellation,
      nightly: providerPrice.nightly,
      total: providerPrice.total,
      currency: providerPrice.currency ?? currency,
      link: typeof offer[8] === "string" ? offer[8] : null,
      kind: "provider",
    });
  }

  return rates;
}

function rateFromCompactOffer(offer: unknown[], { currency }: { currency: string }): GoogleHotelsEntityRate | null {
  const values = offer[12] as unknown[];
  const total = parseEntityPrice(values[5]);
  if (!total) return null;
  const nightlyPrice = parseEntityPrice(values[4]);
  return {
    source: String((offer[0] as unknown[])[0]).trim(),
    room: null,
    guests: null,
    breakfast: "unknown",
    cancellation: compactCancellation(values[12]),
    nightly: nightlyPrice?.total ?? null,
    total: total.total,
    currency: total.currency ?? currency,
    link: typeof (offer[0] as unknown[])[2] === "string" ? ((offer[0] as unknown[])[2] as string) : null,
    kind: "compact",
  };
}

function rateKey(rate: GoogleHotelsEntityRate): string {
  return [rate.source, rate.room ?? "", rate.guests ?? "", rate.breakfast, rate.total, rate.cancellation ?? ""].join("|");
}

function collectEntityRates(section: unknown, { currency }: { currency: string }): GoogleHotelsEntityRate[] {
  const fullRates: GoogleHotelsEntityRate[] = [];
  const compactRates: GoogleHotelsEntityRate[] = [];
  const fullKeys = new Set<string>();
  const compactKeys = new Set<string>();
  const stack: unknown[] = [section];

  while (stack.length) {
    const value = stack.pop();
    if (!Array.isArray(value)) continue;

    if (isFullOffer(value)) {
      for (const rate of ratesFromFullOffer(value, { currency })) {
        const key = rateKey(rate);
        if (fullKeys.has(key)) continue;
        fullKeys.add(key);
        fullRates.push(rate);
      }
      continue;
    }

    if (isCompactOffer(value)) {
      const rate = rateFromCompactOffer(value, { currency });
      if (!rate) continue;
      const key = `${rate.source}|${rate.total}`;
      if (compactKeys.has(key)) continue;
      compactKeys.add(key);
      compactRates.push(rate);
      continue;
    }

    for (const child of value) {
      if (Array.isArray(child)) stack.push(child);
    }
  }

  // A compact card carries no room or board detail, so when the same source lists
  // the same total as a full offer it is a duplicate of that offer.
  const fullSourceTotals = new Set(fullRates.map((rate) => `${rate.source}|${rate.total}`));
  const uniqueCompact = compactRates.filter((rate) => !fullSourceTotals.has(`${rate.source}|${rate.total}`));
  return [...fullRates, ...uniqueCompact].sort((a, b) => a.total - b.total);
}

export function parseGoogleHotelsEntity(html: string, { nights, currency = "USD" }: { nights: number; currency?: string }): GoogleHotelsEntity {
  void nights;
  const data = extractGoogleHotelsEntityData(html);
  const root = Array.isArray(data) ? data[0] : null;
  if (!Array.isArray(root)) throw new GoogleHotelsParseError("Entity payload had an unexpected shape");

  const section = root[6];
  const rates = Array.isArray(section) ? collectEntityRates(section, { currency }) : [];
  const rating = Array.isArray(root[7]) && Array.isArray(root[7][0]) ? root[7][0] : null;
  const coordsRaw = Array.isArray(root[2]) && Array.isArray(root[2][0]) ? root[2][0] : null;
  const coords =
    Array.isArray(coordsRaw) && typeof coordsRaw[0] === "number" && typeof coordsRaw[1] === "number"
      ? ([coordsRaw[0], coordsRaw[1]] as [number, number])
      : null;

  return {
    name: typeof root[1] === "string" ? root[1] : null,
    token: typeof root[20] === "string" ? root[20] : null,
    coords,
    address:
      Array.isArray(root[2]) && Array.isArray(root[2][1]) && Array.isArray(root[2][1][0]) && typeof root[2][1][0][0] === "string"
        ? root[2][1][0][0]
        : null,
    stars: Array.isArray(root[3]) && typeof root[3][1] === "number" ? root[3][1] : null,
    rating: rating && typeof rating[0] === "number" ? rating[0] : null,
    reviews: rating && typeof rating[1] === "number" ? rating[1] : null,
    description: Array.isArray(root[11]) && typeof root[11][0] === "string" ? root[11][0] : null,
    rates,
  };
}

export function chooseGoogleHotelsEntityRate(
  rates: GoogleHotelsEntityRate[],
  {
    requireBreakfast = false,
    partySize = 1,
    allowUnknownBreakfast = false,
    allowUnknownOccupancy = false,
  }: {
    requireBreakfast?: boolean;
    partySize?: number;
    allowUnknownBreakfast?: boolean;
    allowUnknownOccupancy?: boolean;
  } = {},
): GoogleHotelsEntityRate | null {
  const candidates = rates.filter((rate) => {
    if (!Number.isFinite(rate.total) || rate.total <= 0) return false;
    if (requireBreakfast) {
      const allowed = rate.breakfast === "included" || (allowUnknownBreakfast && rate.breakfast === "unknown");
      if (!allowed) return false;
    }
    if (rate.guests === null) return allowUnknownOccupancy;
    return rate.guests >= partySize;
  });
  candidates.sort((a, b) => a.total - b.total);
  return candidates[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* fetch                                                               */
/* ------------------------------------------------------------------ */

export interface FetchGoogleHotelsEntityOptions {
  token: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  childAges?: number[];
  rooms?: number;
  currency?: string;
  fetchImpl?: FetchLike;
  retries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchGoogleHotelsEntity({
  token,
  destination,
  checkIn,
  checkOut,
  adults = 1,
  childAges = [],
  rooms = 1,
  currency = "USD",
  fetchImpl = (input, init) => fetch(input, init),
  retries = 2,
  timeoutMs = 15_000,
  sleep = defaultSleep,
  now = () => new Date(),
}: FetchGoogleHotelsEntityOptions): Promise<GoogleHotelsEntityFetchResult> {
  if (!token) throw new GoogleHotelsDirectError("token is required", "parse");
  const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
  if (!Number.isFinite(nights) || nights <= 0) throw new GoogleHotelsDirectError("checkOut must be after checkIn", "parse");

  const ts = encodeGoogleHotelsTs({ checkIn, checkOut, adults, childAges, rooms, currency });
  const url = new URL(`https://www.google.com/travel/hotels/entity/${token}`);
  url.searchParams.set("q", `Hotels in ${destination}`);
  url.searchParams.set("ts", ts);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        headers: {
          "user-agent": USER_AGENT,
          "accept-language": "en-US,en;q=0.9",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "cache-control": "no-cache",
        },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = (err as { name?: string }).name === "AbortError";
      lastError = new GoogleHotelsDirectError(
        timedOut ? `Google Hotels entity request timed out after ${timeoutMs}ms` : `Google Hotels entity network error: ${(err as Error).message}`,
        timedOut ? "timeout" : "network",
      );
      if (attempt < retries) {
        await sleep(750 * 2 ** attempt);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }

    const html = await res.text();
    const latencyMs = Date.now() - started;

    if (res.status === 429 || res.status >= 500) {
      lastError = new GoogleHotelsDirectError(`Google Hotels entity returned HTTP ${res.status}`, "http", res.status);
      if (attempt < retries) {
        await sleep(1_000 * 2 ** attempt);
        continue;
      }
      throw lastError;
    }
    if (!res.ok) throw new GoogleHotelsDirectError(`Google Hotels entity returned HTTP ${res.status}`, "http", res.status);
    if (/consent\.google\.com|Before you continue to Google|We use cookies and data/i.test(html)) {
      throw new GoogleHotelsConsentError();
    }

    const entity = parseGoogleHotelsEntity(html, { nights, currency });
    return {
      ...entity,
      token,
      url: url.toString(),
      fetchedAt: now().toISOString(),
      latencyMs,
      attempts: attempt + 1,
    };
  }

  throw lastError ?? new GoogleHotelsDirectError("Google Hotels entity request failed", "http");
}
