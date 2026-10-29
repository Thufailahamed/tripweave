/** A safe, public photograph from the provider snapshot. Used only when the catalogue has no stored image. */
export function providerPhoto(metadata: unknown): string | null {
  const images = (metadata as { images?: unknown } | null)?.images;
  if (!Array.isArray(images)) return null;
  for (const image of images) {
    const candidate = image as { thumbnail?: unknown; original?: unknown };
    for (const value of [candidate.thumbnail, candidate.original]) {
      if (typeof value === "string" && value.startsWith("https://")) return value;
    }
  }
  return null;
}

/** Stored catalogue images win; provider photos are the fallback for listings imported from Google Hotels. */
export function stayImageUrl(imageId: string | undefined, metadata: unknown): string | null {
  return imageId ? `/api/v1/media/${imageId}` : providerPhoto(metadata);
}
