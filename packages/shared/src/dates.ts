/**
 * Calendar-date helpers. Travel planning uses local calendar dates (YYYY-MM-DD) which are never
 * converted through timezones; timestamps are UTC ISO strings.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtcMs(date: string): number {
  if (!isIsoDate(date)) throw new Error(`Invalid ISO date: ${date}`);
  const m = DATE_RE.exec(date)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function nightsBetween(start: string, end: string): number {
  return Math.round((toUtcMs(end) - toUtcMs(start)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const dt = new Date(toUtcMs(date) + days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

/** The dates of each night of a stay [start, end): the check-in date through the night before check-out. */
export function eachNight(start: string, end: string): string[] {
  const n = nightsBetween(start, end);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addDays(start, i));
  return out;
}

export function compareDates(a: string, b: string): number {
  return toUtcMs(a) - toUtcMs(b);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Today's calendar date in an IANA timezone. */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export function dateInRange(date: string, start: string, end: string): boolean {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0;
}
