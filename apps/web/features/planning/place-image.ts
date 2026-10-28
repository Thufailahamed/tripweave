"use client";
import * as React from "react";

/**
 * Photographs and short descriptions for places named in a generated reply.
 *
 * The model supplies only a place name, which is looked up in the browser through Wikipedia's search
 * API (CORS-enabled). The returned image host is checked, the photograph is credited to its article,
 * and a miss returns null so the caller shows generated postcard artwork instead. Results are cached
 * per name for the life of the page; network failures are not cached so a later view can retry.
 */
export interface PlaceImage {
  /** Wikimedia-hosted thumbnail, or null when the article has no free image. */
  src: string | null;
  /** Article title, used as the caption and alt text. */
  title: string;
  /** Link to the Wikipedia article that credits the photograph. */
  pageUrl: string;
  /** Opening paragraph of the article, plain text, or null. */
  extract: string | null;
}

const SEARCH_ENDPOINT = "https://en.wikipedia.org/w/api.php";
const MAX_NAME_LENGTH = 80;
const cache = new Map<string, Promise<PlaceImage | null>>();

function isWikimediaImage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "upload.wikimedia.org" || url.hostname.endsWith(".wikimedia.org"));
  } catch {
    return false;
  }
}

interface SearchPage {
  title?: string;
  fullurl?: string;
  extract?: string;
  thumbnail?: { source?: string };
}

async function lookup(name: string): Promise<PlaceImage | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: name,
    gsrlimit: "1",
    gsrnamespace: "0",
    prop: "pageimages|extracts|info",
    piprop: "thumbnail",
    pithumbsize: "960",
    exintro: "1",
    explaintext: "1",
    exchars: "420",
    inprop: "url",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Place lookup returned ${response.status}`);
  const body = (await response.json()) as { query?: { pages?: SearchPage[] } };
  const page = body.query?.pages?.[0];
  if (!page?.title || !page.fullurl) return null;
  const source = page.thumbnail?.source ?? null;
  return {
    src: source && isWikimediaImage(source) ? source : null,
    title: page.title,
    pageUrl: page.fullurl,
    extract: page.extract?.trim() || null,
  };
}

/** Looks up a place once per page session. Callers should treat null as "no photograph available". */
export function fetchPlaceImage(name: string): Promise<PlaceImage | null> {
  const query = name.trim().slice(0, MAX_NAME_LENGTH);
  if (query.length < 2) return Promise.resolve(null);
  const key = query.toLowerCase();
  let pending = cache.get(key);
  if (!pending) {
    pending = lookup(query).catch(() => {
      cache.delete(key);
      return null;
    });
    cache.set(key, pending);
  }
  return pending;
}

/**
 * `undefined` while the lookup is in flight, then the place or null. Pass null to skip the lookup,
 * for example when a curated or uploaded photograph already exists.
 */
export function usePlaceImage(name: string | null | undefined): PlaceImage | null | undefined {
  const key = (name ?? "").trim().slice(0, MAX_NAME_LENGTH);
  const [settled, setSettled] = React.useState<{ key: string; value: PlaceImage | null } | null>(null);

  React.useEffect(() => {
    if (key.length < 2) return;
    let active = true;
    void fetchPlaceImage(key).then((value) => {
      if (active) setSettled({ key, value });
    });
    return () => {
      active = false;
    };
  }, [key]);

  if (key.length < 2) return null;
  return settled?.key === key ? settled.value : undefined;
}
