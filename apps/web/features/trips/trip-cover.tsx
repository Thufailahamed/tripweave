"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, MapPin, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";
import { destinationImage } from "@/features/planning/imagery";
import { useCan } from "@/lib/session";
import { apiPatch, errorMessage } from "@/lib/api";
import { dateRange, money, nightsLabel, titleCase } from "@/lib/utils";
import { tripKeys } from "@/features/trips/hooks";
import { BUDGET_SCOPE_LABELS, TRIP_STATUSES, type Itinerary, type Trip } from "@/features/trips/types";

function StatusControl({ trip }: { trip: Trip }) {
  const qc = useQueryClient();
  const can = useCan();
  const [status, setStatus] = React.useState(trip.status);
  React.useEffect(() => setStatus(trip.status), [trip.status]);
  const save = useMutation({
    mutationFn: () => apiPatch<Trip>(`/trips/${trip.id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.all });
      toast.success("Status updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can("trips:write")) return null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="trip-status-set" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Status
      </label>
      <select
        id="trip-status-set"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
      >
        {TRIP_STATUSES.map((s) => (
          <option key={s} value={s}>
            {titleCase(s)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={status === trip.status || save.isPending}
        onClick={() => save.mutate()}
        className="rounded-full bg-foreground px-3.5 py-1.5 text-[11px] font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {save.isPending ? "Saving…" : "Apply"}
      </button>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground">{children}</span>;
}

export function TripCover({ trip, itinerary, quoteCount }: { trip: Trip; itinerary: Itinerary | null; quoteCount: number }) {
  const destination = itinerary?.stops[0]?.destination ?? trip.parseResult?.parsed?.destinations?.[0] ?? trip.title;
  const photo = destinationImage(destination);
  const stops = itinerary?.stops ?? [];
  const totalNights = stops.reduce((sum, stop) => sum + stop.nights, 0);
  const destinations = stops.length > 0 ? stops.map((stop) => stop.destination).join(" · ") : trip.parseResult?.parsed?.destinations?.join(" · ") ?? null;
  const party = `${trip.party.adults} adult${trip.party.adults === 1 ? "" : "s"}${trip.party.children ? `, ${trip.party.children} child${trip.party.children === 1 ? "" : "ren"}` : ""}`;
  return (
    <header className="overflow-hidden rounded-[24px] border border-border bg-card" aria-labelledby="trip-cover-title">
      <div className="relative h-[280px] sm:h-[320px] lg:h-[360px]">
        <DestinationPhoto destination={destination} className="absolute inset-0 size-full" eager />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(20,16,10,0.28)_0%,rgba(20,16,10,0.02)_35%,rgba(20,16,10,0.82)_100%)]" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-5 sm:p-6">
          <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
            <span aria-hidden className="size-1.5 rounded-full bg-white/70" /> Trip dossier
          </p>
          <div className="flex flex-wrap justify-end gap-1.5">
            {totalNights > 0 ? (
              <span className="rounded-full border border-white/25 bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-[6px]">
                {nightsLabel(totalNights)} · {stops.length} stop{stops.length === 1 ? "" : "s"}
              </span>
            ) : null}
            <span className="rounded-full border border-white/25 bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-[6px]">{titleCase(trip.status)}</span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <h1 id="trip-cover-title" className="tw-trip-display max-w-4xl text-[2.6rem] text-white [text-shadow:0_2px_30px_rgba(0,0,0,0.45)] sm:text-[3.6rem] lg:text-[4.2rem]">
            {trip.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-white/90 [text-shadow:0_1px_12px_rgba(0,0,0,0.55)]">
            <span className="tw-num inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden /> {dateRange(trip.arrivalDate, trip.departureDate)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden /> {party}
            </span>
            {destinations ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden /> {destinations}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5">
          {trip.customerId ? (
            <Link href={`/customers/${trip.customerId}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-semibold text-primary transition hover:border-accent/40 hover:text-accent">
              {trip.customerName ?? "Customer"}
            </Link>
          ) : (
            <span className="hidden sm:inline-flex">
              <Chip>No customer</Chip>
            </span>
          )}
          {trip.budgetAmountMinor !== null ? (
            <Chip>
              <Wallet className="size-3" aria-hidden /> {money(trip.budgetAmountMinor, trip.budgetCurrency)}
              <span className="hidden opacity-70 sm:inline">· {BUDGET_SCOPE_LABELS[trip.budgetScope] ?? trip.budgetScope}</span>
            </Chip>
          ) : (
            <Chip>Budget not set</Chip>
          )}
          <Chip>
            {quoteCount} quote{quoteCount === 1 ? "" : "s"}
          </Chip>
          {!itinerary ? <Chip>Itinerary not built</Chip> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {photo ? (
            <span className="text-[10px] text-muted-foreground">
              Photo:{" "}
              <a href={photo.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline decoration-border underline-offset-2 hover:text-foreground">
                {photo.credit}
              </a>{" "}
              · {photo.licence}
            </span>
          ) : null}
          <StatusControl trip={trip} />
        </div>
      </div>
    </header>
  );
}
