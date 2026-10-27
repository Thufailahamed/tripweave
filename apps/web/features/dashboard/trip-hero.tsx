"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarClock, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton, StatusBadge } from "@/components/ui/card";
import { IMAGES, Photo, type MarketingImage } from "@/features/marketing/imagery";
import { statusLabel } from "@/features/quotes/helpers";
import type { TripDetail } from "@/features/trips/types";
import { cn, nightsLabel } from "@/lib/utils";

export interface UpcomingTrip {
  id: string;
  title: string;
  arrivalDate: string | null;
  customerName: string | null;
  status: string;
}

/** Atmospheric backdrops; picked per trip so each one keeps the same photo. They do not depict the trip's destination. */
const BACKDROPS: MarketingImage[] = [IMAGES.hero, IMAGES.flow, IMAGES.operators, IMAGES.hotels, IMAGES.footer, IMAGES.features, IMAGES.auth];
export function backdropFor(id: string): MarketingImage {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BACKDROPS[h % BACKDROPS.length]!;
}

/** Whole days from today (UTC) to a YYYY-MM-DD date. */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const now = new Date();
  return Math.round((t - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
}

function countdown(days: number | null): string {
  if (days === null) return "Date to be confirmed";
  if (days === 0) return "Arrives today";
  if (days === 1) return "Arrives tomorrow";
  return days > 0 ? `Arrives in ${days} days` : `Arrived ${-days} days ago`;
}

/** Nearest-arrival hero: photo backdrop, trip title, route stops and arrows to cycle through upcoming arrivals. */
export function TripHero({ trips, index, onIndex, detail, loading, canCreate }: { trips: UpcomingTrip[]; index: number; onIndex: (i: number) => void; detail?: TripDetail; loading: boolean; canCreate: boolean }) {
  const trip = trips[index];
  if (!trip) {
    return (
      <div className="tw-surface relative isolate flex h-full min-h-[320px] flex-col justify-end overflow-hidden rounded-2xl border border-border p-7">
        <div className="absolute inset-0 -z-10">
          <Photo image={IMAGES.flow} decorative sizes="(min-width: 1280px) 50vw, 100vw" className="size-full opacity-60" />
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-card via-card/70 to-card/20" />
        <p className="tw-eyebrow">Nearest arrival</p>
        <h2 className="mt-3 max-w-md text-4xl font-semibold leading-[1] tracking-[-0.06em]">No upcoming arrivals</h2>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">Trips with a future arrival date appear here with their route.</p>
        {canCreate ? (
          <Button asChild className="mt-6 self-start">
            <Link href="/trips/new">
              <Plus /> New trip request
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }
  const stops = detail?.itinerary?.stops ?? [];
  const days = daysUntil(trip.arrivalDate);
  const many = trips.length > 1;

  return (
    <section aria-label="Nearest arrival" className="tw-surface group relative isolate flex h-full min-h-[340px] flex-col overflow-hidden rounded-2xl border border-border">
      <div key={trip.id} className="tw-swap absolute inset-0 -z-20 overflow-hidden">
        <Photo image={backdropFor(trip.id)} decorative priority sizes="(min-width: 1280px) 55vw, 100vw" className="size-full transition-[scale] duration-[1800ms] ease-out group-hover:scale-[1.06]" />
      </div>
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-card via-card/70 to-transparent" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-card/80 via-transparent to-transparent" />

      <div className="flex flex-1 flex-col p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="tw-eyebrow">Nearest arrival</p>
          {many ? (
            <span className="tw-num text-xs text-foreground/60">
              {String(index + 1).padStart(2, "0")} <span className="text-foreground/30">/ {String(trips.length).padStart(2, "0")}</span>
            </span>
          ) : null}
        </div>

        <div key={trip.id} className="tw-rise mt-5 max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-accent-foreground">
            <CalendarClock className="size-3.5" aria-hidden />
            {countdown(days)}
          </span>
          <h2 className="mt-4 line-clamp-2 text-[40px] font-semibold leading-[0.98] tracking-[-0.065em] md:text-[56px]">{trip.title}</h2>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-foreground/70">
            {trip.customerName ?? "No customer"}
            <span className="text-foreground/25">·</span>
            <StatusBadge status={trip.status} label={statusLabel(trip.status)} />
          </p>
          <ol aria-label="Route" className="mt-5 flex flex-wrap items-center gap-1.5">
            {loading ? (
              <>
                <Skeleton className="h-7 w-24 rounded-full" />
                <Skeleton className="h-7 w-28 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
              </>
            ) : stops.length === 0 ? (
              <li className="text-xs text-muted-foreground">No itinerary stops yet.</li>
            ) : (
              stops.map((s, i) => (
                <li key={s.id} className="tw-row-in flex items-center gap-1.5" style={{ "--i": i } as React.CSSProperties}>
                  {i > 0 ? <ArrowRight className="size-3 text-foreground/30" aria-hidden /> : null}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background/50 px-3 py-1 text-xs font-medium backdrop-blur-md">
                    {i === 0 ? <MapPin className="size-3 text-accent" aria-hidden /> : null}
                    {s.destination}
                    <span className="text-foreground/45">{nightsLabel(s.nights)}</span>
                  </span>
                </li>
              ))
            )}
          </ol>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-8">
          {many ? (
            <>
              <button
                type="button"
                onClick={() => onIndex((index - 1 + trips.length) % trips.length)}
                aria-label="Previous arrival"
                className="flex size-11 items-center justify-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-[background-color,scale] duration-300 hover:bg-background/70 active:scale-95"
              >
                <ArrowLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onIndex((index + 1) % trips.length)}
                aria-label="Next arrival"
                className="flex size-11 items-center justify-center rounded-full bg-foreground text-background transition-[scale,box-shadow] duration-300 hover:shadow-[0_0_0_6px_color-mix(in_oklab,var(--foreground)_12%,transparent)] active:scale-95"
              >
                <ArrowRight className="size-4" />
              </button>
            </>
          ) : null}
          <Link href={`/trips/${trip.id}`} className={cn("group/open ml-auto inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-background/40 py-2 pl-4 pr-3 text-sm font-semibold backdrop-blur-md transition-colors hover:bg-foreground hover:text-background")}>
            Open trip <ArrowUpRight className="size-4 transition-transform duration-300 group-hover/open:-translate-y-0.5 group-hover/open:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
