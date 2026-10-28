"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { NormalisedOffer } from "@tripweave/shared";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { hotelImageUrl } from "@/features/planning/imagery";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";

/** One hotel photograph: a small version for thumbnails and a large one for heroes. */
export interface HotelPhoto {
  thumbnail: string;
  original: string | null;
}

function isPhoto(value: unknown): value is HotelPhoto {
  return !!value && typeof (value as HotelPhoto).thumbnail === "string" && (value as HotelPhoto).thumbnail.startsWith("https://");
}

/**
 * Google-hosted photo URLs end in a size directive (`=s287-w287-h192…`). Asking for the size the card
 * shows keeps images sharp without downloading the full-resolution original.
 */
export function sizedPhotoUrl(url: string, width: number, height: number): string {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)googleusercontent\.com$|(^|\.)ggpht\.com$/.test(parsed.hostname)) return url;
    return url.replace(/=[swh]\d[^/]*$/, "") + `=w${width}-h${height}-k-no`;
  } catch {
    return url;
  }
}

export function propertyTokenOf(offer: NormalisedOffer): string | null {
  const token = offer.providerMetadata?.propertyToken;
  return typeof token === "string" ? token : null;
}

/**
 * Photos for one stay, best source first: the photos stored on the offer by the search, an image the
 * operator uploaded to the catalogue, then photos looked up later for the same property.
 */
export function hotelPhotosOf(offer: NormalisedOffer, coverImageId: string | null | undefined, lookedUp?: Record<string, HotelPhoto[]>): HotelPhoto[] {
  const stored = Array.isArray(offer.providerMetadata?.images) ? (offer.providerMetadata.images as unknown[]).filter(isPhoto) : [];
  if (stored.length) return stored;
  const uploaded = hotelImageUrl(coverImageId);
  if (uploaded) return [{ thumbnail: uploaded, original: uploaded }];
  const token = propertyTokenOf(offer);
  return token && lookedUp?.[token] ? lookedUp[token]!.filter(isPhoto) : [];
}

/** Google's public rating out of 5 and its review count, when the listing came from Google Hotels. */
export function googleRatingOf(offer: NormalisedOffer): { rating: number; reviews: number | null } | null {
  const rating = offer.providerMetadata?.googleRating;
  const reviews = offer.providerMetadata?.reviews;
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0) return null;
  return { rating, reviews: typeof reviews === "number" && Number.isFinite(reviews) ? reviews : null };
}

/** Looks up photos for the run's Google Hotels stays that were stored without them. */
export function useRunHotelPhotos(tripId: string, jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["trips", "packages", tripId, "photos", jobId],
    queryFn: ({ signal }) => apiGet<{ photos: Record<string, HotelPhoto[]> }>(`/trips/${tripId}/packages/photos`, jobId ? { jobId } : undefined, signal).then((r) => r.photos),
    enabled,
    staleTime: 30 * 60_000,
    retry: false,
  });
}

/**
 * A hotel photograph that falls back to the large size's thumbnail, then to the destination's photo,
 * so a stay never shows a broken image. `place` labels the fallback so it is not mistaken for the hotel.
 */
export function HotelPhotoImage({
  photo,
  alt,
  destination,
  width,
  height,
  className,
  eager,
}: {
  photo: HotelPhoto | null | undefined;
  alt: string;
  destination: string;
  width: number;
  height: number;
  className?: string;
  eager?: boolean;
}) {
  const sources = React.useMemo(() => {
    if (!photo) return [];
    const list = [sizedPhotoUrl(photo.original ?? photo.thumbnail, width, height), sizedPhotoUrl(photo.thumbnail, width, height), photo.thumbnail];
    return [...new Set(list)];
  }, [photo, width, height]);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => setAttempt(0), [sources]);

  if (attempt >= sources.length) return <DestinationPhoto destination={destination} alt={`${destination} (no hotel photo)`} className={cn("size-full", className)} eager={eager} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sources[attempt]}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setAttempt((n) => n + 1)}
      className={cn("size-full object-cover", className)}
    />
  );
}
