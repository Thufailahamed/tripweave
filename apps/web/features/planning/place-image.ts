"use client";
import * as React from "react";
import { apiPost } from "@/lib/api";
import type { PlaceInfo } from "@tripweave/planning-contract";

/**
 * Public reference data for places named in a planning reply (photograph, description, coordinates).
 *
 * The browser never calls Wikipedia. Names are batched into one request to the API, which resolves
 * each place once for every organisation and returns only Wikimedia-hosted images. Results are cached
 * for the page session. A failed or busy lookup is not cached, so a later view retries it.
 */
export const PLACE_NAME_LIMIT = 80;
const BATCH_DELAY_MS = 30;
const BATCH_SIZE = 12;

const cache = new Map<string, PlaceInfo | null>();
const inflight = new Map<string, Promise<PlaceInfo | null>>();
let queue: { name: string; key: string; resolve: (value: PlaceInfo | null) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Trims, collapses whitespace and bounds the length so every name matches what the API accepts. */
export function displayPlaceName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim().slice(0, PLACE_NAME_LIMIT);
}

export function placeKey(name: string | null | undefined): string {
  return displayPlaceName(name).toLowerCase();
}

async function flush(): Promise<void> {
  timer = null;
  const batch = queue.splice(0, BATCH_SIZE);
  if (queue.length > 0) timer = setTimeout(() => void flush(), BATCH_DELAY_MS);
  let results: Record<string, PlaceInfo | null> = {};
  try {
    const body = await apiPost<{ places: Record<string, PlaceInfo | null> }>("/planning/places", { names: batch.map((item) => item.name) });
    results = body.places ?? {};
  } catch {
    results = {};
  }
  for (const item of batch) {
    const known = Object.prototype.hasOwnProperty.call(results, item.name);
    if (known) cache.set(item.key, results[item.name] ?? null);
    inflight.delete(item.key);
    item.resolve(known ? (results[item.name] ?? null) : null);
  }
}

/** Resolves one place. Names are coalesced into batches of at most twelve per request. */
export function lookupPlace(name: string): Promise<PlaceInfo | null> {
  const display = displayPlaceName(name);
  if (display.length < 2) return Promise.resolve(null);
  const key = display.toLowerCase();
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = new Promise<PlaceInfo | null>((resolve) => {
    queue.push({ name: display, key, resolve });
  });
  inflight.set(key, promise);
  if (!timer) timer = setTimeout(() => void flush(), BATCH_DELAY_MS);
  return promise;
}

export interface PlaceInfos {
  /** True until every requested place has been looked up. */
  loading: boolean;
  /** Lookup results keyed by lower-case place name; `null` means no public article was found. */
  byKey: Record<string, PlaceInfo | null>;
}

/** Looks up several places together. Pass the list the block was given; it may still be streaming. */
export function usePlaceInfos(names: readonly string[]): PlaceInfos {
  const signature = [...new Set(names.map(placeKey).filter((key) => key.length >= 2))].join("\u0001");
  const [settled, setSettled] = React.useState<{ signature: string; byKey: Record<string, PlaceInfo | null> } | null>(null);

  React.useEffect(() => {
    if (!signature) return;
    let active = true;
    const keys = signature.split("\u0001");
    void Promise.all(keys.map(async (key) => [key, await lookupPlace(key)] as const)).then((entries) => {
      if (active) setSettled({ signature, byKey: Object.fromEntries(entries) });
    });
    return () => {
      active = false;
    };
  }, [signature]);

  if (!signature) return { loading: false, byKey: {} };
  if (settled?.signature !== signature) return { loading: true, byKey: {} };
  return { loading: false, byKey: settled.byKey };
}

/** One place: `undefined` while looking up, then the result or `null` when no article was found. */
export function usePlaceImage(name: string | null | undefined): PlaceInfo | null | undefined {
  const key = placeKey(name);
  const infos = usePlaceInfos(key ? [key] : []);
  if (!key) return null;
  if (infos.loading) return undefined;
  return infos.byKey[key] ?? null;
}
