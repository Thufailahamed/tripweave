import type { NormalisedOffer } from "@tripweave/shared";
import { normalizeHotelName, OSM_DISCOVERY_PROVIDER_KEY } from "./discovery";

function distanceKm(a: NormalisedOffer["property"], b: NormalisedOffer["property"]): number | null {
  if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6_371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nameKey(p: NormalisedOffer["property"]): string {
  const name = normalizeHotelName(p.name);
  // Listings often append the city ("Lakeside Heritage Kandy") while the catalogue does not.
  const place = new Set(normalizeHotelName(p.destination).split(" ").filter(Boolean));
  const stripped = name.split(" ").filter((t) => !place.has(t)).join(" ");
  return stripped || name;
}

function sameHotel(a: NormalisedOffer["property"], b: NormalisedOffer["property"]): boolean {
  if (nameKey(a) !== nameKey(b)) return false;
  const distance = distanceKm(a, b);
  if (distance !== null) return distance <= 2;
  return a.destination.trim().toLowerCase() === b.destination.trim().toLowerCase();
}

/**
 * Discovery listings are a fallback, not a second catalogue. Drop any OpenStreetMap listing that
 * duplicates a hotel already returned by the company catalogue or a live supplier, and collapse
 * duplicate OSM entries themselves. Offers from different providers for the same hotel are kept
 * when they are genuinely different prices (the optimiser can choose between them).
 */
export function mergeDiscoveredOffers(offers: NormalisedOffer[]): { offers: NormalisedOffer[]; duplicates: number } {
  const known = offers.filter((o) => o.providerKey !== OSM_DISCOVERY_PROVIDER_KEY);
  const discovered = offers.filter((o) => o.providerKey === OSM_DISCOVERY_PROVIDER_KEY);
  const kept: NormalisedOffer[] = [];
  let duplicates = 0;
  for (const offer of discovered) {
    if (known.some((k) => sameHotel(k.property, offer.property)) || kept.some((k) => sameHotel(k.property, offer.property))) {
      duplicates++;
      continue;
    }
    kept.push(offer);
  }
  return { offers: [...known, ...kept], duplicates };
}
