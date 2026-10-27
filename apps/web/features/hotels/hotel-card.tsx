"use client";
import * as React from "react";
import Link from "next/link";
import { Hotel, MapPin, Star } from "lucide-react";
import { Badge, Card, StatusBadge } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "./lib";
import type { Access, Property } from "./types";

export function mediaUrl(imageId: string): string {
  return `/api/v1/media/${imageId}`;
}

export function AccessBadge({ access }: { access?: Access }) {
  if (access === "owner") return <Badge tone="primary">Owned</Badge>;
  if (access === "shared") return <Badge tone="info">Shared by partner</Badge>;
  if (access === "provider") return <Badge tone="accent">Provider</Badge>;
  return null;
}

export function CoverImage({ imageId, alt, className }: { imageId?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!imageId || failed)
    return (
      <div className={cn("relative flex items-center justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_30%_0%,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_60%),linear-gradient(180deg,var(--muted),var(--background))] text-foreground/25", className)} role="img" aria-label={`${alt} (no image)`}>
        <span aria-hidden className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:28px_28px]" />
        <Hotel className="relative size-8" strokeWidth={1.25} aria-hidden />
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaUrl(imageId)} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn("object-cover", className)} />;
}

/** Review score is supplied by the owning organisation; unrated properties say so. */
export function ReviewScore({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-xs text-muted-foreground">Unrated</span>;
  return (
    <span className="tw-num inline-flex items-center gap-1 text-xs font-semibold">
      <Star className="size-3.5 fill-accent text-accent" aria-hidden />
      {score.toFixed(1)}
      <span className="sr-only"> out of 10</span>
    </span>
  );
}

export function AmenityChips({ amenities, max = 4 }: { amenities: string[]; max?: number }) {
  if (amenities.length === 0) return <span className="text-xs text-muted-foreground">No amenities listed</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {amenities.slice(0, max).map((a) => (
        <li key={a}>
          <Badge tone="outline">{a}</Badge>
        </li>
      ))}
      {amenities.length > max ? (
        <li>
          <Badge tone="neutral">+{amenities.length - max}</Badge>
        </li>
      ) : null}
    </ul>
  );
}

export function HotelCard({ hotel }: { hotel: Property }) {
  return (
    <Card className="group relative flex flex-col overflow-hidden transition-[border-color,translate] duration-300 focus-within:outline-2 focus-within:outline-ring hover:-translate-y-0.5 hover:border-foreground/20">
      <div className="overflow-hidden">
        <CoverImage imageId={hotel.coverImageId} alt={hotel.name} className="h-44 w-full transition-[scale] duration-700 ease-out group-hover:scale-[1.05]" />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <AccessBadge access={hotel.access} />
          <Badge tone="neutral">{CATEGORY_LABEL[hotel.category] ?? hotel.category}</Badge>
          {hotel.status !== "active" ? <StatusBadge status={hotel.status} /> : null}
          {hotel.preferredPartner ? <Badge tone="accent">Preferred</Badge> : null}
        </div>
        <h2 className="font-display text-lg font-semibold leading-snug tracking-[-0.04em] transition-colors group-hover:text-accent">
          <Link href={`/hotels/${hotel.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {hotel.name}
          </Link>
        </h2>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {hotel.city}
          {hotel.region ? `, ${hotel.region}` : ""}
        </p>
        <div className="flex items-center justify-between">
          <ReviewScore score={hotel.reviewScore} />
          {hotel.starClassification ? <span className="tw-num text-xs text-muted-foreground">{hotel.starClassification}-star</span> : null}
        </div>
        <AmenityChips amenities={hotel.amenities} />
      </div>
    </Card>
  );
}
