import { buildLegs } from "@tripweave/itinerary-engine";
import { ops, type Db } from "@tripweave/database";
import type { ItineraryStop, RouteLeg } from "@tripweave/shared";
import type { Deps, Env } from "../env";
import { log } from "../middleware/core";

export interface RoutePoint {
  id: string;
  latitude: number;
  longitude: number;
}

export interface RoutingProvider {
  readonly key: string;
  /** 0 disables persistent caching (required by some providers' terms of service). */
  readonly cacheTtlHours: number;
  /** Driving legs for consecutive point pairs (points[i] -> points[i+1]). Null entries = no route found. */
  legs(points: RoutePoint[]): Promise<({ distanceKm: number; durationMinutes: number } | null)[]>;
}

/**
 * Google Routes API (computeRouteMatrix, one batched request). Google's terms prohibit storing route
 * results, so cacheTtlHours is 0: results live only for the duration of one optimisation job.
 */
export class GoogleRoutesProvider implements RoutingProvider {
  readonly key = "google";
  readonly cacheTtlHours = 0;
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch) {}
  async legs(points: RoutePoint[]) {
    if (points.length < 2) return [];
    const wp = (p: RoutePoint) => ({ waypoint: { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } } });
    const res = await this.fetchImpl("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
        "x-goog-fieldmask": "originIndex,destinationIndex,duration,distanceMeters,status,condition",
      },
      body: JSON.stringify({
        origins: points.slice(0, -1).map(wp),
        destinations: points.slice(1).map(wp),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });
    if (!res.ok) throw new Error(`Routes API returned ${res.status}`);
    const elements = (await res.json()) as { originIndex?: number; destinationIndex?: number; duration?: string; distanceMeters?: number; condition?: string }[];
    return points.slice(0, -1).map((_, i) => {
      const e = elements.find((x) => (x.originIndex ?? 0) === i && (x.destinationIndex ?? 0) === i);
      if (!e || e.condition !== "ROUTE_EXISTS" || !e.duration || e.distanceMeters === undefined) return null;
      return { distanceKm: Math.round(e.distanceMeters / 100) / 10, durationMinutes: Math.round(parseFloat(e.duration) / 60) };
    });
  }
}

/** OSRM-compatible (self-hosted) routing; results may be cached because the service is ours. */
export class OsrmProvider implements RoutingProvider {
  readonly key = "osrm";
  readonly cacheTtlHours = 24 * 7;
  constructor(private readonly baseUrl: string, private readonly fetchImpl: typeof fetch) {}
  async legs(points: RoutePoint[]) {
    const out: ({ distanceKm: number; durationMinutes: number } | null)[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const res = await this.fetchImpl(`${this.baseUrl}/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?overview=false`);
      if (!res.ok) throw new Error(`OSRM returned ${res.status}`);
      const body = (await res.json()) as { routes?: { distance: number; duration: number }[] };
      const r = body.routes?.[0];
      out.push(r ? { distanceKm: Math.round(r.distance / 100) / 10, durationMinutes: Math.round(r.duration / 60) } : null);
    }
    return out;
  }
}

export function buildRouting(env: Env, deps: Deps): RoutingProvider | null {
  if (env.ROUTING_PROVIDER === "google" && env.GOOGLE_MAPS_API_KEY) return new GoogleRoutesProvider(env.GOOGLE_MAPS_API_KEY, deps.fetch);
  if (env.ROUTING_PROVIDER === "osrm" && env.OSRM_BASE_URL) return new OsrmProvider(env.OSRM_BASE_URL, deps.fetch);
  return null;
}

const cacheKey = (provider: string, a: RoutePoint, b: RoutePoint) =>
  `${provider}:${a.latitude.toFixed(3)},${a.longitude.toFixed(3)}>${b.latitude.toFixed(3)},${b.longitude.toFixed(3)}`;

export interface LegResult {
  legs: RouteLeg[];
  /** Human-readable notes, e.g. that estimates were used. */
  warnings: string[];
  source: string;
}

/**
 * Computes the legs between consecutive stops. Real routing data is preferred; if the provider is
 * missing or fails, legs fall back to clearly labelled estimates (never presented as precise).
 */
export async function computeStopLegs(
  env: Env,
  db: Db,
  deps: Deps,
  stops: Pick<ItineraryStop, "id" | "latitude" | "longitude">[],
): Promise<LegResult> {
  const warnings: string[] = [];
  const provider = buildRouting(env, deps);
  const known = new Map<string, RouteLeg>();
  const chain: RoutePoint[] = [];
  for (const s of stops) if (s.latitude !== null && s.longitude !== null) chain.push({ id: s.id, latitude: s.latitude, longitude: s.longitude });

  if (provider && chain.length > 1) {
    let needsCall = false;
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i]!;
      const b = chain[i + 1]!;
      const cached = provider.cacheTtlHours > 0 ? await ops.getCachedRoute(db, cacheKey(provider.key, a, b)) : null;
      if (cached && cached.durationMinutes !== null) {
        known.set(`${a.id}>${b.id}`, { fromStopId: a.id, toStopId: b.id, distanceKm: cached.distanceKm, durationMinutes: cached.durationMinutes, source: "routing_api" });
      } else needsCall = true;
    }
    if (needsCall) {
      const started = Date.now();
      try {
        // One batched request for the whole chain (matrix diagonal = consecutive legs).
        const res = await provider.legs(chain);
        for (let i = 0; i < chain.length - 1; i++) {
          const a = chain[i]!;
          const b = chain[i + 1]!;
          const r = res[i];
          if (!r) continue;
          known.set(`${a.id}>${b.id}`, { fromStopId: a.id, toStopId: b.id, distanceKm: r.distanceKm, durationMinutes: r.durationMinutes, source: "routing_api" });
          if (provider.cacheTtlHours > 0) await ops.putCachedRoute(db, cacheKey(provider.key, a, b), provider.key, r.distanceKm, r.durationMinutes, provider.cacheTtlHours);
        }
        await ops.recordProviderCall(db, { organizationId: null, providerKey: `routing:${provider.key}`, operation: "legs", status: "ok", latencyMs: Date.now() - started });
      } catch (e) {
        await ops.recordProviderCall(db, { organizationId: null, providerKey: `routing:${provider.key}`, operation: "legs", status: "error", latencyMs: Date.now() - started, errorCode: "routing_failed" });
        log("warn", "routing_failed", { provider: provider.key, error: String((e as Error).message).slice(0, 200) });
        warnings.push("The routing provider failed; travel times are estimates.");
      }
    }
  } else if (!provider && stops.length > 1) {
    warnings.push("No routing provider is configured; travel times are estimates.");
  }
  const legs = buildLegs(stops, (from, to) => known.get(`${from}>${to}`) ?? null);
  if (legs.some((l) => l.source === "estimated") && warnings.length === 0) warnings.push("Some travel times are estimates.");
  return { legs, warnings, source: provider?.key ?? "estimate" };
}
