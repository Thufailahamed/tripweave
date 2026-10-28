"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { destinationImage, hotelImageUrl } from "../imagery";
import { usePlaceImage } from "../place-image";

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Generated postcard artwork for destinations with no photograph. Deterministic per name, so the
 * same stop always gets the same palette, and it still looks intentional when Commons is unreachable.
 */
function PostcardArt({ destination, className }: { destination: string; className?: string }) {
  const seed = hash(destination || "trip");
  const coastal = seed % 3 === 0;
  const hue = coastal ? 182 + (seed % 26) : 18 + (seed % 70);
  const sun = coastal ? 42 : 38;
  return (
    <div className={cn("relative size-full overflow-hidden", className)} role="img" aria-label={`${destination || "Destination"} illustration`}>
      <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" className="size-full">
        <defs>
          <linearGradient id={`sky-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${hue} 38% 82%)`} />
            <stop offset="100%" stopColor={`hsl(${hue + 12} 42% 93%)`} />
          </linearGradient>
          <linearGradient id={`hill-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${hue + 150} 24% 46%)`} />
            <stop offset="100%" stopColor={`hsl(${hue + 150} 28% 30%)`} />
          </linearGradient>
        </defs>
        <rect width="400" height="500" fill={`url(#sky-${seed})`} />
        <circle cx={coastal ? 292 : 104} cy="150" r="46" fill={`hsl(${sun} 82% 68%)`} opacity="0.92" />
        {coastal ? (
          <>
            <path d="M0 330 C90 300 130 345 210 322 C290 299 340 330 400 310 L400 500 L0 500 Z" fill={`hsl(${hue} 52% 62%)`} />
            <path d="M0 372 C80 348 150 386 236 366 C310 348 356 370 400 356 L400 500 L0 500 Z" fill={`hsl(${hue} 58% 48%)`} opacity="0.9" />
            <path d="M0 430 C110 404 190 446 300 424 C344 415 376 424 400 418 L400 500 L0 500 Z" fill={`hsl(${hue} 48% 36%)`} opacity="0.72" />
          </>
        ) : (
          <>
            <path d="M0 340 L86 224 L166 340 Z" fill={`hsl(${hue + 150} 22% 52%)`} opacity="0.85" />
            <path d="M120 350 L234 186 L360 350 Z" fill={`url(#hill-${seed})`} />
            <path d="M280 350 L352 246 L400 316 L400 350 Z" fill={`hsl(${hue + 150} 20% 40%)`} opacity="0.8" />
            <path d="M0 352 C80 332 150 362 230 348 C300 336 350 352 400 342 L400 500 L0 500 Z" fill={`hsl(${hue + 145} 26% 32%)`} />
          </>
        )}
        <rect width="400" height="500" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
      </svg>
    </div>
  );
}

export function DestinationPhoto({
  destination,
  imageId,
  alt,
  className,
  imgClassName,
  eager = false,
}: {
  destination: string;
  imageId?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = React.useState(false);
  const source = destinationImage(destination);
  const remote = usePlaceImage(!imageId && !source ? destination : null);
  const src = hotelImageUrl(imageId) ?? source?.src ?? remote?.imageUrl ?? null;
  const label = alt ?? source?.alt ?? remote?.articleTitle ?? destination;

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  const loading = !src && !failed && !imageId && !source && remote === undefined && destination.trim().length > 0;
  if (loading) return <div aria-hidden className={cn("pl-sheen size-full", className)} />;
  if (!src || failed) return <PostcardArt destination={destination} className={className} />;

  return (
    <div className={cn("relative overflow-hidden bg-[var(--pl-surface-2)]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn("size-full object-cover", imgClassName)}
      />
    </div>
  );
}

export function PhotoCreditLine({ destination, imageId }: { destination: string; imageId?: string | null }) {
  const source = destinationImage(destination);
  const remote = usePlaceImage(!imageId && !source ? destination : null);
  if (imageId) return null;
  if (!source) {
    if (!remote?.imageUrl) return null;
    return (
      <span className="text-[10px] text-[var(--pl-muted)]">
        Photo:{" "}
        <a href={remote.articleUrl} target="_blank" rel="noreferrer noopener" className="underline decoration-[var(--pl-line)] underline-offset-2 hover:text-[var(--pl-ink)]">
          {remote.articleTitle} on Wikipedia
        </a>
      </span>
    );
  }
  return (
    <span className="text-[10px] text-[var(--pl-muted)]">
      Photo:{" "}
      <a href={source.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline decoration-[var(--pl-line)] underline-offset-2 hover:text-[var(--pl-ink)]">
        {source.credit}
      </a>{" "}
      · {source.licence}
    </span>
  );
}
