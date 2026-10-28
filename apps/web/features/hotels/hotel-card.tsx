"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Hotel, MapPin, Star } from "lucide-react";
import { Badge, Card, StatusBadge } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "./lib";
import type { Access, Property } from "./types";

export function mediaUrl(imageId: string): string {
  return `/api/v1/media/${imageId}`;
}

export function AccessBadge({ access, className }: { access?: Access; className?: string }) {
  if (access === "owner") return <Badge tone="primary" className={className}>Owned</Badge>;
  if (access === "shared") return <Badge tone="info" className={className}>Shared by partner</Badge>;
  if (access === "provider") return <Badge tone="accent" className={className}>Provider</Badge>;
  return null;
}

/** Two initials from a property name, used by the no-photo treatment. */
function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const first = words[0] ?? "H";
  return (words[1] ? `${first[0]}${words[1][0]}` : first.slice(0, 2)).toUpperCase();
}

/**
 * Property photograph. Missing or broken images get a designed placeholder rather than a blank
 * rectangle: a monogram and "No photo" for cards, a single hotel mark for thumbnails.
 */
export function CoverImage({ imageId, alt, className, variant = "compact" }: { imageId?: string | null; alt: string; className?: string; variant?: "compact" | "card" }) {
  const [failed, setFailed] = React.useState(false);
  if (imageId && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={mediaUrl(imageId)} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn("object-cover", className)} />
    );
  }
  const base = "relative flex overflow-hidden bg-[radial-gradient(120%_100%_at_18%_0%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_58%),linear-gradient(145deg,var(--muted),var(--card))] text-foreground/25";
  const accessibility = alt ? { role: "img" as const, "aria-label": `${alt} (no photo)` } : { "aria-hidden": true as const };
  if (variant === "compact") {
    return (
      <div className={cn(base, "items-center justify-center", className)} {...accessibility}>
        <span aria-hidden className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:24px_24px]" />
        <Hotel className="relative size-5" strokeWidth={1.4} aria-hidden />
      </div>
    );
  }
  return (
    <div className={cn(base, "select-none p-4", className)} {...accessibility}>
      <span aria-hidden className="absolute -right-12 -top-16 size-44 rounded-full border border-foreground/10" />
      <span aria-hidden className="absolute -right-20 top-6 size-64 rounded-full border border-foreground/[0.07]" />
      <span aria-hidden className="absolute -bottom-16 -left-10 size-40 rounded-full bg-accent/[0.07] blur-2xl" />
      <span aria-hidden className="absolute inset-0 opacity-[0.045] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:26px_26px]" />
      <span aria-hidden className="absolute inset-0 grid place-items-center font-display text-[2.5rem] font-semibold leading-none tracking-[-0.07em] text-foreground/35">{initials(alt)}</span>
      <span className="absolute inset-x-4 bottom-3.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/45">No photo</span>
        <Hotel className="size-4 text-foreground/35" strokeWidth={1.4} aria-hidden />
      </span>
    </div>
  );
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
    <Card className="group relative flex h-full w-full flex-col overflow-hidden transition-[border-color,translate,box-shadow] duration-300 focus-within:outline-2 focus-within:outline-ring hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_22px_44px_-28px_rgba(40,32,20,0.35)]">
      <div className="relative shrink-0 overflow-hidden">
        <CoverImage
          imageId={hotel.coverImageId}
          alt={hotel.name}
          variant="card"
          className="aspect-[16/9] w-full transition-[scale] duration-700 ease-out group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <AccessBadge access={hotel.access} className="bg-card/90 shadow-sm ring-1 ring-card/60 backdrop-blur-md" />
          {hotel.preferredPartner ? (
            <Badge tone="accent" className="bg-card/90 shadow-sm ring-1 ring-card/60 backdrop-blur-md">
              <Star className="size-3 fill-current" aria-hidden /> Preferred
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
        <div className="flex min-h-5 flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{CATEGORY_LABEL[hotel.category] ?? hotel.category}</Badge>
          {hotel.status !== "active" ? <StatusBadge status={hotel.status} /> : null}
          {hotel.starClassification ? <span className="tw-num text-[11px] text-muted-foreground">{hotel.starClassification}-star</span> : null}
        </div>

        <h2 className="line-clamp-2 font-display text-base font-semibold leading-snug tracking-[-0.04em] transition-colors group-hover:text-accent">
          <Link href={`/hotels/${hotel.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {hotel.name}
          </Link>
        </h2>

        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {hotel.city}
            {hotel.region ? `, ${hotel.region}` : ""}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ReviewScore score={hotel.reviewScore} />
          {hotel.source === "provider" ? <span className="text-[11px] text-muted-foreground">Imported listing</span> : null}
        </div>

        <AmenityChips amenities={hotel.amenities} max={3} />

        <div className="mt-auto flex items-center justify-end border-t border-border/70 pt-3">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
            View property <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </Card>
  );
}
