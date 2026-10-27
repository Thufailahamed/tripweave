import { addDays, nightsBetween, type ItineraryStop, type RouteLeg } from "@tripweave/shared";
import { findPlace } from "./gazetteer";

/* ---------- geo ---------- */

export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Road-factor / average-speed assumptions used ONLY for clearly labelled estimates. */
export const ESTIMATE_ROAD_FACTOR = 1.4;
export const ESTIMATE_AVG_KMH = 38;

type Point = { latitude: number | null; longitude: number | null };

export function estimateLeg(fromId: string, toId: string, from: Point, to: Point): RouteLeg {
  if (from.latitude === null || from.longitude === null || to.latitude === null || to.longitude === null) {
    return { fromStopId: fromId, toStopId: toId, distanceKm: null, durationMinutes: null, source: "unavailable" };
  }
  const km = haversineKm(
    { latitude: from.latitude, longitude: from.longitude },
    { latitude: to.latitude, longitude: to.longitude },
  ) * ESTIMATE_ROAD_FACTOR;
  return {
    fromStopId: fromId,
    toStopId: toId,
    distanceKm: Math.round(km * 10) / 10,
    durationMinutes: Math.round((km / ESTIMATE_AVG_KMH) * 60),
    source: "estimated",
  };
}

/** Looks up a leg in a (possibly provider-supplied) lookup, falling back to a labelled estimate. */
export function buildLegs(
  stops: Pick<ItineraryStop, "id" | "latitude" | "longitude">[],
  lookup?: (fromId: string, toId: string) => RouteLeg | null,
  endpoints?: { origin?: Point | null; destination?: Point | null },
): RouteLeg[] {
  const legs: RouteLeg[] = [];
  const first = stops[0];
  if (endpoints?.origin && first) legs.push(lookup?.("origin", first.id) ?? estimateLeg("origin", first.id, endpoints.origin, first));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    legs.push(lookup?.(a.id, b.id) ?? estimateLeg(a.id, b.id, a, b));
  }
  const last = stops.at(-1);
  if (endpoints?.destination && last)
    legs.push(lookup?.(last.id, "destination") ?? estimateLeg(last.id, "destination", last, endpoints.destination));
  return legs;
}

/* ---------- construction ---------- */

export interface OvernightPlanItem {
  destination: string;
  nights: number;
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Builds contiguous stops from an overnight plan. Coordinates come from the gazetteer where known. */
export function buildStops(
  plan: OvernightPlanItem[],
  arrivalDate: string,
  activities: Record<string, string[]> = {},
): ItineraryStop[] {
  let cursor = arrivalDate;
  return plan.map((p, i) => {
    const place = findPlace(p.destination);
    const arrival = cursor;
    cursor = addDays(cursor, p.nights);
    return {
      id: newId(),
      sequence: i + 1,
      destination: place?.name ?? p.destination,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      arrivalDate: arrival,
      departureDate: cursor,
      nights: p.nights,
      activities: activities[p.destination] ?? [],
    };
  });
}

export interface OvernightSuggestion {
  plan: OvernightPlanItem[];
  dayVisitOnly: string[];
  /** Always true: suggestions must be confirmed by a person before being treated as final. */
  needsConfirmation: true;
  question: string;
}

/**
 * Suggests where to sleep when the enquiry names destinations but not overnight stays. This is a
 * deterministic suggestion, never a silent decision; callers must surface `question` to the user.
 */
export function suggestOvernightPlan(destinations: string[], nights: number): OvernightSuggestion {
  const unique = destinations.filter((d, i) => destinations.findIndex((x) => x.toLowerCase() === d.toLowerCase()) === i);
  if (unique.length === 0 || nights < 1) {
    return { plan: [], dayVisitOnly: [], needsConfirmation: true, question: "Which destinations should the guests stay overnight in, and for how many nights?" };
  }
  if (unique.length <= nights) {
    const counts = unique.map(() => 1);
    let extra = nights - unique.length;
    for (let i = 0; extra > 0; i = (i + 1) % counts.length, extra--) counts[i] = (counts[i] ?? 1) + 1;
    return {
      plan: unique.map((d, i) => ({ destination: d, nights: counts[i] ?? 1 })),
      dayVisitOnly: [],
      needsConfirmation: true,
      question:
        extra === 0 && unique.length === nights
          ? `Please confirm one night in each of: ${unique.join(", ")}.`
          : `Please confirm this split of ${nights} nights across ${unique.join(", ")}; tell us if you would prefer a different distribution.`,
    };
  }
  // More destinations than nights: the earliest destinations become en-route day visits.
  const dayVisits = unique.slice(0, unique.length - nights);
  const sleeping = unique.slice(unique.length - nights);
  return {
    plan: sleeping.map((d) => ({ destination: d, nights: 1 })),
    dayVisitOnly: dayVisits,
    needsConfirmation: true,
    question: `${unique.length} destinations cannot all have an overnight stay in ${nights} night${nights === 1 ? "" : "s"}. We suggest visiting ${dayVisits.join(", ")} as a day stop and staying overnight in ${sleeping.join(", ")}. Is that right, or which destinations should have the overnight stays?`,
  };
}

/* ---------- validation ---------- */

export interface ItineraryIssue {
  severity: "error" | "warning" | "info";
  code:
    | "empty"
    | "non_positive_stay"
    | "date_gap"
    | "date_overlap"
    | "start_mismatch"
    | "end_mismatch"
    | "missing_coordinates"
    | "long_leg"
    | "unrealistic_leg"
    | "excessive_detour"
    | "estimated_routes"
    | "route_unavailable"
    | "duplicate_destination";
  message: string;
  stopId?: string;
}

export interface ValidateOptions {
  tripArrival?: string | null;
  tripDeparture?: string | null;
  /** Soft limit per leg (minutes); legs above this raise a warning. */
  comfortableLegMinutes?: number;
  /** Hard realism limit (minutes) for a single driving leg. */
  unrealisticLegMinutes?: number;
  detourRatio?: number;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

export function validateItinerary(stops: ItineraryStop[], legs: RouteLeg[], opts: ValidateOptions = {}): ItineraryIssue[] {
  const issues: ItineraryIssue[] = [];
  const comfort = opts.comfortableLegMinutes ?? 240;
  const unreal = opts.unrealisticLegMinutes ?? 480;
  if (stops.length === 0) return [{ severity: "error", code: "empty", message: "The itinerary has no overnight stops." }];
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);

  ordered.forEach((s, i) => {
    if (nightsBetween(s.arrivalDate, s.departureDate) < 1)
      issues.push({ severity: "error", code: "non_positive_stay", message: `${s.destination}: departure must be after arrival.`, stopId: s.id });
    if (s.latitude === null || s.longitude === null)
      issues.push({ severity: "warning", code: "missing_coordinates", message: `${s.destination} has no coordinates; route and hotel distances cannot be calculated.`, stopId: s.id });
    const prev = ordered[i - 1];
    if (prev) {
      const gap = nightsBetween(prev.departureDate, s.arrivalDate);
      if (gap > 0)
        issues.push({ severity: "error", code: "date_gap", message: `${gap} night(s) between ${prev.destination} and ${s.destination} have no accommodation.`, stopId: s.id });
      if (gap < 0)
        issues.push({ severity: "error", code: "date_overlap", message: `${s.destination} overlaps the stay in ${prev.destination}.`, stopId: s.id });
    }
    if (ordered.findIndex((x) => x.destination.toLowerCase() === s.destination.toLowerCase()) !== i)
      issues.push({ severity: "info", code: "duplicate_destination", message: `${s.destination} appears more than once in the itinerary.`, stopId: s.id });
  });

  const first = ordered[0]!;
  const last = ordered.at(-1)!;
  if (opts.tripArrival && opts.tripArrival !== first.arrivalDate)
    issues.push({ severity: "error", code: "start_mismatch", message: `Trip arrives ${opts.tripArrival} but the first stop starts ${first.arrivalDate}.`, stopId: first.id });
  if (opts.tripDeparture && opts.tripDeparture !== last.departureDate)
    issues.push({ severity: "error", code: "end_mismatch", message: `Trip departs ${opts.tripDeparture} but the last stop ends ${last.departureDate}.`, stopId: last.id });

  let estimated = false;
  for (const leg of legs) {
    if (leg.source === "unavailable" || leg.durationMinutes === null) {
      issues.push({ severity: "warning", code: "route_unavailable", message: "Travel time is unavailable for a leg because coordinates are missing.", stopId: leg.toStopId });
      continue;
    }
    if (leg.source === "estimated") estimated = true;
    const label = leg.source === "estimated" ? "an estimated" : "a";
    if (leg.durationMinutes > unreal)
      issues.push({ severity: "error", code: "unrealistic_leg", message: `${label} ${Math.round(leg.durationMinutes / 60 * 10) / 10}h drive is unrealistic for one day.`, stopId: leg.toStopId });
    else if (leg.durationMinutes > comfort)
      issues.push({ severity: "warning", code: "long_leg", message: `${label} ${Math.round(leg.durationMinutes / 60 * 10) / 10}h drive exceeds the comfortable limit.`, stopId: leg.toStopId });
  }
  if (estimated)
    issues.push({ severity: "info", code: "estimated_routes", message: "Some travel times are estimates (no routing data); verify them before quoting." });

  // Detour: compare the current order with the best order of the movable stops (first stop fixed).
  const pts = ordered.filter((s) => s.latitude !== null && s.longitude !== null);
  if (pts.length === ordered.length && ordered.length >= 3 && ordered.length <= 7) {
    const dist = (order: ItineraryStop[]) =>
      order.slice(1).reduce((sum, s, i) => {
        const p = order[i]!;
        return sum + haversineKm({ latitude: p.latitude!, longitude: p.longitude! }, { latitude: s.latitude!, longitude: s.longitude! });
      }, 0);
    const current = dist(ordered);
    const best = Math.min(...permutations(ordered.slice(1)).map((rest) => dist([first, ...rest])));
    if (best > 0 && current / best > (opts.detourRatio ?? 1.3))
      issues.push({
        severity: "warning",
        code: "excessive_detour",
        message: `The stop order drives about ${Math.round((current / best - 1) * 100)}% further than the shortest order of the same stops; consider reordering.`,
      });
  }
  return issues;
}

export function hasBlockingIssues(issues: ItineraryIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** Re-sequences stops and recomputes dates for a new order, preserving each stop's night count. */
export function reorderStops(stops: ItineraryStop[], orderedIds: string[], startDate: string): ItineraryStop[] {
  const byId = new Map(stops.map((s) => [s.id, s]));
  let cursor = startDate;
  return orderedIds.map((id, i) => {
    const s = byId.get(id);
    if (!s) throw new Error(`Unknown stop ${id}`);
    const nights = nightsBetween(s.arrivalDate, s.departureDate);
    const arrival = cursor;
    cursor = addDays(cursor, nights);
    return { ...s, sequence: i + 1, arrivalDate: arrival, departureDate: cursor, nights };
  });
}

export function normaliseStop(s: Omit<ItineraryStop, "nights" | "sequence" | "id"> & { id?: string }, sequence: number): ItineraryStop {
  const place = s.latitude == null || s.longitude == null ? findPlace(s.destination) : null;
  return {
    id: s.id ?? newId(),
    sequence,
    destination: s.destination,
    latitude: s.latitude ?? place?.latitude ?? null,
    longitude: s.longitude ?? place?.longitude ?? null,
    arrivalDate: s.arrivalDate,
    departureDate: s.departureDate,
    nights: nightsBetween(s.arrivalDate, s.departureDate),
    activities: s.activities,
    notes: s.notes ?? null,
  };
}
