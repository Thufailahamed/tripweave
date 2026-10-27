#!/usr/bin/env node
/**
 * Keyless Google Hotels search scraper (feasibility spike).
 *
 * Google Hotels ignores checkin/checkout/currency URL parameters. The `ts`
 * parameter is a base64url protobuf that carries the stay, occupancy and
 * currency. This module encodes that protobuf, fetches the server-rendered
 * search page and parses the first page of property cards.
 *
 * No API key, no headless browser. Google can still change its HTML or rate
 * limit/consent-wall the request, so callers must treat failures as expected.
 */
import { writeFile } from "node:fs/promises";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const OTA_NAMES = [
  "Booking.com",
  "Expedia",
  "Agoda",
  "Hotels.com",
  "Trip.com",
  "Vio.com",
  "Skyscanner",
  "Kayak",
  "Priceline",
  "Orbitz",
  "Travelocity",
  "HotelsCombined",
  "Trivago",
];

/* ------------------------------------------------------------------ */
/* protobuf encoder                                                    */
/* ------------------------------------------------------------------ */

function varint(n) {
  const out = [];
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

function field(num, wire, payload) {
  const tag = (num << 3) | wire;
  if (wire === 0) return concat(varint(tag), varint(payload));
  if (wire === 2) return concat(varint(tag), varint(payload.length), payload);
  throw new Error(`unsupported wire type ${wire}`);
}

function concat(...parts) {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const msg = (num, ...payloads) => field(num, 2, concat(...payloads));
const v = (num, n) => field(num, 0, n);

function dateField(date) {
  return concat(v(1, date.getUTCFullYear()), v(2, date.getUTCMonth() + 1), v(3, date.getUTCDate()));
}

/**
 * Builds the Google Hotels `ts` parameter.
 * Confirmed against Google's own 2026-07 sample and live results.
 */
export function encodeGoogleHotelsTs({ checkIn, checkOut, adults = 2, childAges = [], rooms = 1, currency = "USD" }) {
  const ci = new Date(`${checkIn}T00:00:00Z`);
  const co = new Date(`${checkOut}T00:00:00Z`);
  const nights = Math.round((co - ci) / 86_400_000);
  if (!Number.isFinite(nights) || nights <= 0) throw new Error("checkOut must be after checkIn");

  const travelers = [];
  for (let i = 0; i < adults; i++) travelers.push(msg(1, v(1, 3)));
  for (const age of childAges) travelers.push(msg(1, v(1, 2), v(2, age)));
  // Google's own sample uses 0 here for one room; the room count is confirmed
  // in search.field6. Keep the same convention rather than guessing an offset.
  travelers.push(v(2, Math.max(0, rooms - 1)));

  const place = msg(1, msg(3, new Uint8Array()));
  const stayDates = concat(
    msg(1, dateField(ci)),
    msg(2, dateField(co)),
    v(3, nights),
  );
  const stay = concat(msg(2, stayDates), msg(6, v(1, rooms)));
  const search = concat(msg(1, place), msg(2, stay));
  const filters = concat(msg(1, msg(7, new TextEncoder().encode(currency))), msg(3, new Uint8Array()));

  const root = concat(
    v(1, 1),
    msg(2, concat(...travelers)),
    msg(3, search),
    msg(5, filters),
  );
  return Buffer.from(root).toString("base64url");
}

/* ------------------------------------------------------------------ */
/* HTML parsing                                                        */
/* ------------------------------------------------------------------ */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

function visibleText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMoney(text) {
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
  const amount = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(amount) ? { amount, currency } : null;
}

function parseCard(content, { nights, currency }) {
  const anchorEnd = content.indexOf(">");
  if (anchorEnd < 0) return null;
  const anchor = content.slice(0, anchorEnd);
  const nameMatch = anchor.match(/aria-label="([^"]+)"/);
  if (!nameMatch) return null;
  const name = decodeEntities(nameMatch[1]);
  if (!name || name.length < 2) return null;

  const tokenMatch =
    anchor.match(/data-href="\/entity\/([^"]+)"/) ??
    anchor.match(/href="\/travel\/hotels\/entity\/([^"?]+)/);
  const token = tokenMatch?.[1] ?? null;

  // Only the first chunk of the card's own markup; the last card on the page
  // can be followed by sponsored cards with unrelated OTA names.
  const body = content.slice(anchorEnd + 1, anchorEnd + 25_000);
  const text = visibleText(body);

  const totalMatch = body.match(
    /class="CQYfx UDzrdc">([^<]+)<\/div><div class="CQYfx">([^<]+)<\/div>/,
  );
  let total = totalMatch ? parseMoney(totalMatch[1]) : null;
  let totalBasis = totalMatch ? decodeEntities(totalMatch[2]) : null;

  const priceLabel = body.match(
    new RegExp(`aria-label="Prices starting from ([^"]+), ${escapeRe(name)}`),
  );
  const fromPrice = priceLabel ? parseMoney(priceLabel[1]) : null;

  if (!total && fromPrice) {
    // The "from" price is nightly; the tooltip is normally present and authoritative.
    total = { amount: Math.round(fromPrice.amount * nights), currency: fromPrice.currency ?? currency };
    totalBasis = `${nights} nights (derived from nightly price)`;
  }
  if (!total) return null;

  const ratingMatch = body.match(
    new RegExp(`aria-label="([\\d.]+) out of 5 stars from ([\\d,]+) reviews?, ${escapeRe(name)}`),
  );
  const rating = ratingMatch ? Number(ratingMatch[1]) : null;
  const reviews = ratingMatch ? Number(ratingMatch[2].replace(/,/g, "")) : null;

  const starMatch = text.match(/(\d)-star hotel/);
  const stars = starMatch ? Number(starMatch[1]) : null;

  const amenityMatch = body.match(
    new RegExp(`Amenities for ${escapeRe(name)}(?:, a \\d-star hotel)?\\.?: ([^<]+)`),
  );
  const amenities = amenityMatch
    ? decodeEntities(amenityMatch[1]).split(",").map((a) => a.trim()).filter(Boolean)
    : [];

  const breakfast = amenities.some((a) => /free breakfast|breakfast included/i.test(a))
    ? "free"
    : amenities.some((a) => /breakfast/i.test(a))
      ? "paid"
      : "unknown";

  const cardText = text.includes("Sponsored") ? text.slice(0, text.indexOf("Sponsored")) : text;
  const sources = OTA_NAMES.filter(
    (s) => cardText.includes(s) || body.slice(0, 12_000).includes(`alt="${s}"`),
  );

  const dealMatch = text.match(/(\d+)% less than usual/);
  const datesMatch = body.match(/class="DPNIGe PN0Hcb"[^>]*>([^<]+)<\/div>/);

  return {
    name,
    token,
    entityUrl: token ? `https://www.google.com/travel/hotels/entity/${token}` : null,
    type: /VACATION RENTAL/i.test(text) ? "vacation_rental" : "hotel",
    total: total.amount,
    nightly: Math.round((total.amount / nights) * 100) / 100,
    currency: total.currency ?? currency,
    totalBasis,
    rating,
    reviews,
    stars,
    amenities,
    breakfast,
    sources: sources.length ? sources : ["Google Hotels"],
    dealPercent: dealMatch ? Number(dealMatch[1]) : null,
    dates: datesMatch ? decodeEntities(datesMatch[1]) : null,
  };
}

export function parseGoogleHotelsHtml(html, { nights, currency = "USD" }) {
  const parts = html.split('<a class="PVOOXe"').slice(1);
  const cards = [];
  const seen = new Set();
  for (const part of parts) {
    const card = parseCard(part, { nights, currency });
    if (!card) continue;
    const key = card.token ?? card.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
  }
  const countMatch = html.match(/Showing results 1\s*-\s*\d+ of ([\d,]+)/);
  return {
    cards,
    totalResults: countMatch ? Number(countMatch[1].replace(/,/g, "")) : null,
  };
}

/* ------------------------------------------------------------------ */
/* entity page                                                         */
/* ------------------------------------------------------------------ */

const CURRENCY_CODES = new Set([
  "ALL", "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "JPY", "INR", "LKR",
  "SGD", "HKD", "CHF", "THB", "MYR", "IDR", "VND", "PHP", "KRW", "CNY",
  "TWD", "AED", "SAR", "QAR", "BRL", "MXN", "ZAR", "TRY", "RUB", "PLN",
  "SEK", "NOK", "DKK", "CZK", "HUF", "RON", "BGN", "HRK", "ISK", "ILS",
  "EGP", "PKR", "BDT", "NPR", "MMK", "KHR", "LAK", "MNT", "KZT", "UZS",
  "GEL", "AMD", "AZN", "BYN", "UAH", "RSD", "MKD",
]);

function isProviderName(name) {
  if (typeof name !== "string") return false;
  const value = name.trim();
  if (value.length < 2 || value.length > 80) return false;
  if (CURRENCY_CODES.has(value.toUpperCase())) return false;
  if (/^(google|google hotels|sponsored)$/i.test(value)) return false;
  if (/^[0-9a-f_-]{16,}$/i.test(value)) return false;
  return /[a-z]/i.test(value);
}

function findJsonArrayEnd(text, start) {
  let i = start;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== "[") return -1;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < text.length; i++) {
    const ch = text[i];
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

export function extractGoogleHotelsEntityData(html) {
  const match = html.match(/AF_initDataCallback\(\{key:\s*'ds:1'[\s\S]*?data:/);
  if (!match) throw new ParseError("Entity page did not contain the ds:1 rate payload");
  const start = match.index + match[0].length;
  const end = findJsonArrayEnd(html, start);
  if (end < 0) throw new ParseError("Entity rate payload was truncated");
  try {
    return JSON.parse(html.slice(start, end));
  } catch (err) {
    throw new ParseError(`Entity rate payload was not valid JSON: ${err.message}`);
  }
}

function parseEntityPrice(value) {
  if (!Array.isArray(value)) return null;
  const totalRaw = value[2] ?? value[4] ?? value[0];
  const nightlyRaw = value[0] ?? value[3];
  const total = typeof totalRaw === "number"
    ? totalRaw
    : parseMoney(String(totalRaw ?? ""))?.amount ?? null;
  if (!Number.isFinite(total)) return null;
  const nightly = typeof nightlyRaw === "number"
    ? nightlyRaw
    : parseMoney(String(nightlyRaw ?? ""))?.amount ?? null;
  return {
    // Google's payload keeps an unrounded internal amount alongside the
    // displayed whole-unit price; fractional cents should not leak through.
    total: Math.round(total),
    nightly: Number.isFinite(nightly) ? Math.round(nightly) : null,
    currency: parseMoney(String(totalRaw ?? ""))?.currency ?? null,
  };
}

function parseGuests(details) {
  for (const detail of details) {
    const match =
      String(detail).match(/(?:^|\D)(\d+)\s+guests?\b/i) ??
      String(detail).match(/sleeps\s+(\d+)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function breakfastFromDetails(details, { absentMeansNotIncluded = false } = {}) {
  const text = details.map(String).join(" | ").toLowerCase();
  if (/breakfast\s*\(\$\)|breakfast[^|]*(extra|fee|not included)/.test(text)) return "paid";
  if (/free breakfast|breakfast included|\bbreakfast\b/.test(text)) return "included";
  return absentMeansNotIncluded ? "not_included" : "unknown";
}

function cancellationFromDetails(details) {
  const found = details.find((detail) => /free cancellation/i.test(String(detail)));
  return found ? decodeEntities(String(found)).replace(/\s+/g, " ").trim() : null;
}

function compactCancellation(meta) {
  if (!Array.isArray(meta)) return null;
  const until = meta.find(
    (part) => Array.isArray(part) && typeof part[1] === "string" && /^[A-Z][a-z]{2}\b/.test(part[1]),
  );
  return until ? `Free cancellation until ${until[1]}` : null;
}

function isFullOffer(value) {
  return (
    Array.isArray(value) &&
    value.length >= 25 &&
    isProviderName(value[0]) &&
    typeof value[1] === "string" &&
    /travel-hotels\/branding|^\/\//.test(value[1]) &&
    Array.isArray(value[18]) &&
    Array.isArray(value[19]) &&
    Number.isFinite(parseEntityPrice(value[19])?.total) &&
    typeof value[40] === "number"
  );
}

function isCompactOffer(value) {
  return (
    Array.isArray(value) &&
    value.length >= 13 &&
    Array.isArray(value[0]) &&
    isProviderName(value[0][0]) &&
    Array.isArray(value[12]) &&
    Array.isArray(value[12][4]) &&
    Array.isArray(value[12][5]) &&
    Number.isFinite(parseEntityPrice(value[12][5])?.total)
  );
}

function ratesFromFullOffer(offer, { currency }) {
  const source = offer[0].trim();
  const providerDetails = offer[18].filter((detail) => typeof detail === "string");
  const providerPrice = parseEntityPrice(offer[19]);
  const providerGuests = parseGuests(providerDetails);
  const providerCancellation = cancellationFromDetails(providerDetails);
  const providerBreakfast = breakfastFromDetails(providerDetails);
  const rates = [];

  for (const room of Array.isArray(offer[24]) ? offer[24] : []) {
    if (
      !Array.isArray(room) ||
      typeof room[0] !== "string" ||
      !Array.isArray(room[1]) ||
      !Array.isArray(room[3])
    ) {
      continue;
    }
    const roomDetails = room[1].filter((detail) => typeof detail === "string");
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

function rateFromCompactOffer(offer, { currency }) {
  const total = parseEntityPrice(offer[12][5]);
  if (!total) return null;
  const nightlyPrice = parseEntityPrice(offer[12][4]);
  return {
    source: offer[0][0].trim(),
    room: null,
    guests: null,
    breakfast: "unknown",
    cancellation: compactCancellation(offer[12][12]),
    nightly: nightlyPrice?.total ?? null,
    total: total.total,
    currency: total.currency ?? currency,
    link: typeof offer[0][2] === "string" ? offer[0][2] : null,
    kind: "compact",
  };
}

function rateKey(rate) {
  return [
    rate.source,
    rate.room ?? "",
    rate.guests ?? "",
    rate.breakfast,
    rate.total,
    rate.cancellation ?? "",
  ].join("|");
}

function collectEntityRates(section, { currency }) {
  const fullRates = [];
  const compactRates = [];
  const fullKeys = new Set();
  const compactKeys = new Set();
  const stack = [section];

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

  // A compact card carries no room or board detail, so when the same source
  // lists the same total as a full offer it is a duplicate of that offer.
  const fullSourceTotals = new Set(fullRates.map((rate) => `${rate.source}|${rate.total}`));
  const uniqueCompact = compactRates.filter(
    (rate) => !fullSourceTotals.has(`${rate.source}|${rate.total}`),
  );

  return [...fullRates, ...uniqueCompact].sort((a, b) => a.total - b.total);
}

export function parseGoogleHotelsEntity(html, { nights, currency = "USD" } = {}) {
  const data = extractGoogleHotelsEntityData(html);
  const root = Array.isArray(data) ? data[0] : null;
  if (!Array.isArray(root)) throw new ParseError("Entity payload had an unexpected shape");

  const section = root[6];
  const rates = Array.isArray(section) ? collectEntityRates(section, { currency }) : [];
  const rating = Array.isArray(root[7]) && Array.isArray(root[7][0]) ? root[7][0] : null;

  return {
    name: typeof root[1] === "string" ? root[1] : null,
    token: typeof root[20] === "string" ? root[20] : null,
    coords: Array.isArray(root[2]) && Array.isArray(root[2][0]) ? root[2][0] : null,
    address:
      Array.isArray(root[2]) &&
      Array.isArray(root[2][1]) &&
      Array.isArray(root[2][1][0]) &&
      typeof root[2][1][0][0] === "string"
        ? root[2][1][0][0]
        : null,
    stars:
      Array.isArray(root[3]) && typeof root[3][1] === "number" ? root[3][1] : null,
    rating: rating ? rating[0] : null,
    reviews: rating ? rating[1] : null,
    description:
      Array.isArray(root[11]) && typeof root[11][0] === "string" ? root[11][0] : null,
    rates,
  };
}

export function chooseEntityRate(
  rates,
  {
    requireBreakfast = false,
    partySize = 1,
    allowUnknownBreakfast = false,
    allowUnknownOccupancy = false,
  } = {},
) {
  const candidates = (Array.isArray(rates) ? rates : []).filter((rate) => {
    if (!Number.isFinite(rate.total) || rate.total <= 0) return false;

    if (requireBreakfast) {
      const allowed =
        rate.breakfast === "included" ||
        (allowUnknownBreakfast && rate.breakfast === "unknown");
      if (!allowed) return false;
    }

    if (rate.guests == null) return allowUnknownOccupancy;
    return rate.guests >= partySize;
  });

  candidates.sort((a, b) => a.total - b.total);
  return candidates[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* search                                                              */
/* ------------------------------------------------------------------ */

export class ConsentRequiredError extends Error {
  constructor(message = "Google returned a consent wall; run once in a browser or use a consented cookie jar") {
    super(message);
    this.name = "ConsentRequiredError";
  }
}

export class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ParseError";
  }
}

export async function searchGoogleHotels({
  destination,
  checkIn,
  checkOut,
  adults = 2,
  childAges = [],
  rooms = 1,
  currency = "USD",
  fetchImpl = fetch,
  retries = 2,
  timeoutMs = 30_000,
}) {
  const ts = encodeGoogleHotelsTs({ checkIn, checkOut, adults, childAges, rooms, currency });
  const url = new URL("https://www.google.com/travel/search");
  url.searchParams.set("q", `Hotels in ${destination}`);
  url.searchParams.set("ts", ts);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");

  const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86_400_000);
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    let res;
    try {
      res = await fetchImpl(url, {
        headers: {
          "user-agent": USER_AGENT,
          "accept-language": "en-US,en;q=0.9",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "cache-control": "no-cache",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 750 * 2 ** attempt));
        continue;
      }
      throw err;
    }

    const html = await res.text();
    const latencyMs = Date.now() - started;

    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`Google Hotels returned HTTP ${res.status}`);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
        continue;
      }
      throw lastError;
    }
    if (!res.ok) throw new Error(`Google Hotels returned HTTP ${res.status}`);

    if (/consent\.google\.com|Before you continue to Google|We use cookies and data/i.test(html)) {
      throw new ConsentRequiredError();
    }

    const parsed = parseGoogleHotelsHtml(html, { nights, currency });
    if (parsed.cards.length === 0) {
      throw new ParseError(
        `No property cards parsed (status ${res.status}, ${html.length} bytes). Google may have changed its markup or served a variant page.`,
      );
    }

    return {
      query: { destination, checkIn, checkOut, adults, childAges, rooms, currency, nights },
      ts,
      url: url.toString(),
      fetchedAt: new Date().toISOString(),
      latencyMs,
      attempts: attempt + 1,
      totalResults: parsed.totalResults,
      cards: parsed.cards,
    };
  }

  throw lastError ?? new Error("Google Hotels request failed");
}

export async function fetchGoogleHotelsEntity({
  token,
  destination,
  checkIn,
  checkOut,
  adults = 1,
  childAges = [],
  rooms = 1,
  currency = "USD",
  fetchImpl = fetch,
  retries = 2,
  timeoutMs = 30_000,
}) {
  if (!token) throw new Error("token is required");
  const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86_400_000);
  const ts = encodeGoogleHotelsTs({ checkIn, checkOut, adults, childAges, rooms, currency });
  const url = new URL(`https://www.google.com/travel/hotels/entity/${token}`);
  url.searchParams.set("q", `Hotels in ${destination}`);
  url.searchParams.set("ts", ts);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    let res;
    try {
      res = await fetchImpl(url, {
        headers: {
          "user-agent": USER_AGENT,
          "accept-language": "en-US,en;q=0.9",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "cache-control": "no-cache",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
        continue;
      }
      throw err;
    }

    const html = await res.text();
    const latencyMs = Date.now() - started;

    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`Google Hotels entity returned HTTP ${res.status}`);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
        continue;
      }
      throw lastError;
    }
    if (!res.ok) throw new Error(`Google Hotels entity returned HTTP ${res.status}`);
    if (/consent\.google\.com|Before you continue to Google|We use cookies and data/i.test(html)) {
      throw new ConsentRequiredError();
    }

    const entity = parseGoogleHotelsEntity(html, { nights, currency });
    return {
      ...entity,
      token,
      url: url.toString(),
      fetchedAt: new Date().toISOString(),
      latencyMs,
      attempts: attempt + 1,
    };
  }

  throw lastError ?? new Error("Google Hotels entity request failed");
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.destination || !args.checkin || !args.checkout) {
    console.error(
      "Usage: node scripts/google-hotels-direct.mjs --destination=Kandy --checkin=2027-03-05 --checkout=2027-03-09 [--adults=1] [--children=8,11] [--rooms=1] [--currency=USD] [--out=/tmp/x.json]",
    );
    process.exit(1);
  }
  const childAges = (args.children ?? "").split(",").filter(Boolean).map(Number);
  const result = await searchGoogleHotels({
    destination: args.destination,
    checkIn: args.checkin,
    checkOut: args.checkout,
    adults: Number(args.adults ?? 1),
    childAges,
    rooms: Number(args.rooms ?? 1),
    currency: args.currency ?? "USD",
  });

  if (args.out) await writeFile(args.out, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        query: result.query,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
        totalResults: result.totalResults,
        parsed: result.cards.length,
        cards: result.cards,
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`${err.name}: ${err.message}`);
    process.exit(1);
  });
}
