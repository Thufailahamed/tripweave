export interface GoogleLiveRate {
  source: string;
  room: string | null;
  guests: number | null;
  totalMinor: number;
  nightlyMinor: number | null;
  breakfast: "included" | "not_included" | "unknown";
  freeCancellation: boolean | null;
  inclusions: string[];
}

interface Money {
  extracted_lowest?: number;
  extracted_before_taxes_fees?: number;
  extracted_after_taxes_fees?: number;
}

interface PropertyPrice {
  source?: string;
  num_guests?: number;
  total_rate?: Money;
  rate_per_night?: Money;
  rooms?: PropertyRoom[];
  inclusions?: string[];
  free_cancellation?: boolean;
}

interface PropertyRoom {
  name?: string;
  num_guests?: number;
  total_rate?: Money;
  rate_per_night?: Money;
  rates?: PropertyRate[];
  inclusions?: string[];
  free_cancellation?: boolean;
}

interface PropertyRate {
  num_guests?: number;
  total_rate?: Money;
  rate_per_night?: Money;
  inclusions?: string[];
  free_cancellation?: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const integer = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * The amount a Google money field gives for a stay. The after-tax-and-fee figure is the complete price, so
 * it is preferred. The plain figure is the displayed price, whose tax basis Google does not state; it is
 * used with the tax treatment unknown. A before-tax figure on its own is not a price the company can pay,
 * so it is never used. Search and live checks share this rule so their prices stay comparable.
 */
export function googleAmount(value: unknown): { amount: number; taxesIncluded: boolean | null } | null {
  if (!isRecord(value)) return null;
  const after = integer(value.extracted_after_taxes_fees);
  if (after !== null && after > 0) return { amount: after, taxesIncluded: true };
  const lowest = integer(value.extracted_lowest);
  if (lowest !== null && lowest > 0) return { amount: lowest, taxesIncluded: null };
  return null;
}

function totalFrom(value: unknown): { totalMinor: number; nightlyMinor: number | null } | null {
  const amount = googleAmount(value);
  if (!amount) return null;
  const nightly = integer((value as Record<string, unknown>).extracted_lowest);
  return { totalMinor: Math.round(amount.amount * 100), nightlyMinor: nightly !== null ? Math.round(nightly * 100) : null };
}

function breakfastFromInclusions(inclusions: string[]): GoogleLiveRate["breakfast"] {
  const joined = inclusions.join(" | ").toLowerCase();
  if (!joined) return "unknown";
  if (/breakfast\s*\(\$\)|breakfast[^|]*(extra|fee|not included)/.test(joined)) return "not_included";
  if (/free breakfast|breakfast included|breakfast is included|includes breakfast/.test(joined)) return "included";
  return "unknown";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Parses the SerpApi Google Hotels property-details response into one row per seller/room/rate.
 * The endpoint prices one room, so totals are multiplied by the number of rooms the party needs.
 */
export function parseGooglePropertyRates(body: unknown, { rooms }: { rooms: number }): GoogleLiveRate[] {
  if (!isRecord(body)) return [];
  const prices = Array.isArray(body.featured_prices) ? body.featured_prices : Array.isArray(body.prices) ? body.prices : [];
  const roomCount = Math.max(1, rooms);
  const out: GoogleLiveRate[] = [];

  const add = (price: PropertyPrice, room: string | null, guests: number | null, money: { totalMinor: number; nightlyMinor: number | null }, inclusions: string[], cancellation: boolean | null) => {
    out.push({
      source: text(price.source) ?? "Google Hotels",
      room,
      guests,
      totalMinor: money.totalMinor * roomCount,
      nightlyMinor: money.nightlyMinor,
      breakfast: breakfastFromInclusions(inclusions),
      freeCancellation: cancellation,
      inclusions,
    });
  };

  for (const rawPrice of prices) {
    if (!isRecord(rawPrice)) continue;
    const price = rawPrice as PropertyPrice;
    const priceInclusions = stringList(price.inclusions);
    const priceCancellation = typeof price.free_cancellation === "boolean" ? price.free_cancellation : priceInclusions.some((v) => /free cancellation/i.test(v)) ? true : null;
    const propertyRooms = Array.isArray(price.rooms) ? price.rooms : [];
    let found = false;

    for (const rawRoom of propertyRooms) {
      if (!isRecord(rawRoom)) continue;
      const room = rawRoom as PropertyRoom;
      const roomName = text(room.name);
      const roomInclusions = [...priceInclusions, ...stringList(room.inclusions)];
      const roomCancellation = typeof room.free_cancellation === "boolean" ? room.free_cancellation : roomInclusions.some((v) => /free cancellation/i.test(v)) ? true : priceCancellation;
      const roomRates = Array.isArray(room.rates) ? room.rates : [];

      if (roomRates.length > 0) {
        for (const rawRate of roomRates) {
          if (!isRecord(rawRate)) continue;
          const rate = rawRate as PropertyRate;
          const money = totalFrom(rate.total_rate) ?? totalFrom(room.total_rate) ?? totalFrom(price.total_rate);
          if (!money) continue;
          const inclusions = [...roomInclusions, ...stringList(rate.inclusions)];
          const cancellation = typeof rate.free_cancellation === "boolean" ? rate.free_cancellation : inclusions.some((v) => /free cancellation/i.test(v)) ? true : roomCancellation;
          add(price, roomName, integer(rate.num_guests) ?? integer(room.num_guests) ?? integer(price.num_guests), money, inclusions, cancellation);
          found = true;
        }
        continue;
      }

      const money = totalFrom(room.total_rate) ?? totalFrom(price.total_rate);
      if (!money) continue;
      add(price, roomName, integer(room.num_guests) ?? integer(price.num_guests), money, roomInclusions, roomCancellation);
      found = true;
    }

    if (!found) {
      const money = totalFrom(price.total_rate);
      if (!money) continue;
      add(price, null, integer(price.num_guests), money, priceInclusions, priceCancellation);
    }
  }

  const seen = new Set<string>();
  return out
    .filter((rate) => {
      const key = [rate.source, rate.room ?? "", rate.guests ?? "", rate.totalMinor, rate.breakfast].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.totalMinor - b.totalMinor || a.source.localeCompare(b.source));
}

/** Chooses the cheapest live rate that fits the room party and, when required, includes breakfast. */
export function chooseGoogleLiveRate(rates: GoogleLiveRate[], { requireBreakfast, partySize }: { requireBreakfast: boolean; partySize: number }): GoogleLiveRate | null {
  const candidates = rates.filter((rate) => {
    if (!Number.isFinite(rate.totalMinor) || rate.totalMinor <= 0) return false;
    if (rate.guests === null || rate.guests < partySize) return false;
    if (requireBreakfast && rate.breakfast !== "included") return false;
    return true;
  });
  candidates.sort((a, b) => a.totalMinor - b.totalMinor);
  return candidates[0] ?? null;
}
