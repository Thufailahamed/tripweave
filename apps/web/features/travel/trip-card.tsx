"use client";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Users } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";
import { dateRange, money, titleCase } from "@/lib/utils";
import type { Trip } from "@/features/trips/types";
import { daysUntil, tripDestination } from "./lib";

export function TravelTripCard({ trip }: { trip: Trip }) {
  const destination = tripDestination({ title: trip.title, parseResult: trip.parseResult });
  const countdown = daysUntil(trip.arrivalDate);
  const active = trip.status !== "archived";
  return (
    <Link href={`/travel/trips/${trip.id}`} className="group flex flex-col overflow-hidden rounded-[1.4rem] border border-border bg-card transition-transform duration-300 hover:-translate-y-1">
      <div className="tw-travel-photo relative aspect-[5/3] rounded-none">
        <DestinationPhoto destination={destination} alt={destination} className="size-full" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-4 pt-12 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">{dateRange(trip.arrivalDate, trip.departureDate)}</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <h3 className="tw-travel-display text-3xl leading-none">{trip.title}</h3>
            <ArrowUpRight className="size-5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
        </div>
        {countdown !== null && countdown >= 0 && countdown <= 365 ? (
          <span className="absolute left-4 top-4 rounded-full bg-[#fffdf8]/90 px-3 py-1 text-xs font-bold text-[#211d17] backdrop-blur">
            {countdown === 0 ? "Today" : countdown === 1 ? "Tomorrow" : `${countdown} days away`}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" /> {dateRange(trip.arrivalDate, trip.departureDate)}</span>
        <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" /> {trip.party.adults + trip.party.children} traveller{trip.party.adults + trip.party.children === 1 ? "" : "s"}</span>
        <span className="ml-auto flex items-center gap-2">
          {trip.budgetAmountMinor !== null ? <span className="tw-num font-semibold text-foreground">{money(trip.budgetAmountMinor, trip.budgetCurrency)}</span> : null}
          <Badge tone={active ? "neutral" : "outline"}>{titleCase(trip.status)}</Badge>
        </span>
      </div>
    </Link>
  );
}
