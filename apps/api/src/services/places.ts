import { places as placeRepo, type Db } from "@tripweave/database";
import type { PlaceInfo } from "@tripweave/planning-contract";
import type { AppContext } from "../lib/http";

/**
 * Looks up public reference data for places named in planning replies. Results are shared by every
 * organisation through `place_media`, so each place is searched at most once per cache window. The
 * request identifies the application as Wikimedia's API policy asks; rate limits and server errors are
 * reported as transient and never cached, so the next view retries them.
 */
const SEARCH_ENDPOINT = "https://en.wikipedia.org/w/api.php";
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 3;
const EXTRACT_MAX_LENGTH = 600;

type Outcome = { kind: "found"; info: PlaceInfo } | { kind: "missing" } | { kind: "transient" };

export function placeKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Only HTTPS images on Wikimedia hosts are ever returned to the browser. */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === "https:" && (host === "wikimedia.org" || host.endsWith(".wikimedia.org")) ? url.toString() : null;
  } catch {
    return null;
  }
}

function coordinate(value: unknown, limit: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

interface SearchPage {
  title?: string;
  fullurl?: string;
  extract?: string;
  missing?: boolean;
  thumbnail?: { source?: string };
  coordinates?: { lat?: unknown; lon?: unknown }[];
}

async function searchPlace(ctx: AppContext, name: string): Promise<Outcome> {
  const deps = ctx.get("deps");
  const contact = ctx.env.OSM_CONTACT_EMAIL ?? "ops@tripweave.example";
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: name,
    gsrlimit: "1",
    gsrnamespace: "0",
    prop: "pageimages|extracts|info|coordinates",
    piprop: "thumbnail",
    pithumbsize: "960",
    exintro: "1",
    explaintext: "1",
    exchars: String(EXTRACT_MAX_LENGTH),
    inprop: "url",
    colimit: "1",
    format: "json",
    formatversion: "2",
  });
  let response: Response;
  try {
    response = await deps.fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
      headers: { accept: "application/json", "user-agent": `TripWeave/1.0 (planning; ${contact})` },
    });
  } catch {
    return { kind: "transient" };
  }
  if (response.status === 404) return { kind: "missing" };
  if (!response.ok) return { kind: "transient" };
  let body: { query?: { pages?: SearchPage[] } };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return { kind: "transient" };
  }
  const page = body.query?.pages?.[0];
  if (!page || page.missing || !page.title || !page.fullurl) return { kind: "missing" };
  const coordinates = page.coordinates?.[0];
  const extract = typeof page.extract === "string" ? page.extract.trim().slice(0, EXTRACT_MAX_LENGTH) : "";
  return {
    kind: "found",
    info: {
      name,
      articleTitle: page.title,
      articleUrl: page.fullurl,
      extract: extract || null,
      imageUrl: safeImageUrl(page.thumbnail?.source),
      latitude: coordinate(coordinates?.lat, 90),
      longitude: coordinate(coordinates?.lon, 180),
    },
  };
}

function toInfo(row: { placeName: string; articleTitle: string | null; articleUrl: string | null; extract: string | null; imageUrl: string | null; latitude: number | null; longitude: number | null }): PlaceInfo {
  return {
    name: row.placeName,
    articleTitle: row.articleTitle ?? row.placeName,
    articleUrl: row.articleUrl ?? "https://en.wikipedia.org/",
    extract: row.extract,
    imageUrl: row.imageUrl,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

async function mapWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await task(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Resolves each requested name. Names that could not be resolved because the provider was busy are
 * omitted from the result, so the browser does not cache a failure.
 */
export async function lookupPlaces(ctx: AppContext, names: string[]): Promise<Record<string, PlaceInfo | null>> {
  const db: Db = ctx.get("db");
  const now = ctx.get("deps").now().getTime();
  const displayByKey = new Map<string, string>();
  for (const name of names) if (!displayByKey.has(placeKey(name))) displayByKey.set(placeKey(name), name.trim());
  const keys = [...displayByKey.keys()];
  const cached = new Map((await placeRepo.listPlaceMedia(db, keys)).map((row) => [row.placeKey, row] as const));

  const resolved = new Map<string, PlaceInfo | null>();
  const toFetch: string[] = [];
  for (const key of keys) {
    const row = cached.get(key);
    if (row) {
      const age = now - Date.parse(row.fetchedAt);
      const ttl = row.found ? FOUND_TTL_MS : MISS_TTL_MS;
      if (Number.isFinite(age) && age >= 0 && age < ttl) {
        resolved.set(key, row.found ? toInfo(row) : null);
        continue;
      }
    }
    toFetch.push(key);
  }

  await mapWithConcurrency(toFetch, CONCURRENCY, async (key) => {
    const outcome = await searchPlace(ctx, displayByKey.get(key)!);
    if (outcome.kind === "transient") return;
    const fetchedAt = new Date(now).toISOString();
    if (outcome.kind === "found") {
      await placeRepo.savePlaceMedia(db, {
        placeKey: key,
        placeName: outcome.info.name,
        found: true,
        articleTitle: outcome.info.articleTitle,
        articleUrl: outcome.info.articleUrl,
        extract: outcome.info.extract,
        imageUrl: outcome.info.imageUrl,
        latitude: outcome.info.latitude,
        longitude: outcome.info.longitude,
        fetchedAt,
      });
      resolved.set(key, outcome.info);
    } else {
      await placeRepo.savePlaceMedia(db, {
        placeKey: key,
        placeName: displayByKey.get(key)!,
        found: false,
        articleTitle: null,
        articleUrl: null,
        extract: null,
        imageUrl: null,
        latitude: null,
        longitude: null,
        fetchedAt,
      });
      resolved.set(key, null);
    }
  });

  const result: Record<string, PlaceInfo | null> = {};
  for (const name of names) {
    const key = placeKey(name);
    if (resolved.has(key)) result[name] = resolved.get(key)!;
  }
  return result;
}
