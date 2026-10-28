"use client";
import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, MapPin, Printer, ShieldCheck, Users } from "lucide-react";
import { TRAVELER_BUDGET_CATEGORY_LABELS, type TravelerPublicTripView } from "@tripweave/shared";
import { Alert, ErrorState, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand";
import { DestinationPhoto, PhotoCreditLine } from "@/features/planning/components/destination-photo";
import { ApiError, apiGet } from "@/lib/api";
import { dateRange, formatDate, money, nightsLabel } from "@/lib/utils";

const ItineraryMap = dynamic(() => import("@/features/trips/itinerary-map"), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-2xl bg-muted" /> });

export default function SharedTripPage() {
  const { token } = useParams<{ token: string }>();
  const query = useQuery({ queryKey: ["public-trip", token], queryFn: () => apiGet<TravelerPublicTripView>(`/public/trips/${token}`), retry: false });

  if (query.isLoading) return <div className="mx-auto max-w-4xl px-4 py-16"><LoadingBlock label="Opening the shared trip" /></div>;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <ExpiredLink />;
    return <div className="mx-auto max-w-lg px-4 py-16"><ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not open this trip" /></div>;
  }
  const view = query.data!;
  const destination = view.itinerary?.stops[0]?.destination ?? view.trip.title;
  const mapStops = (view.itinerary?.stops ?? []).filter((stop) => stop.latitude !== null && stop.longitude !== null).map((stop, index) => ({ key: `${index}-${stop.destination}`, destination: stop.destination, latitude: stop.latitude, longitude: stop.longitude }));

  return (
    <div className="min-h-screen bg-background">
      <header className="tw-no-print border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 md:px-8">
          <Logo href="/travel" />
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex"><ShieldCheck className="size-3.5" /> Read-only share</span>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" /> Print / save PDF</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
        <section className="overflow-hidden rounded-[1.8rem] border border-border bg-card">
          <div className="tw-travel-photo relative aspect-[16/8] min-h-64 rounded-none">
            <DestinationPhoto destination={destination} alt={destination} className="size-full" placeholder="art" eager />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/6 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-[#fffdf8] md:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">A shared trip</p>
              <h1 className="tw-travel-display mt-2 max-w-[18ch] text-4xl leading-[0.95] tracking-[-0.045em] md:text-6xl">{view.trip.title}</h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" /> {dateRange(view.trip.arrivalDate, view.trip.departureDate)}</span>
                <span className="inline-flex items-center gap-1.5"><Users className="size-4" /> {view.trip.party.adults + view.trip.party.children} traveller{view.trip.party.adults + view.trip.party.children === 1 ? "" : "s"}</span>
              </p>
            </div>
          </div>
          {view.trip.description ? <p className="max-w-3xl px-6 py-5 text-sm leading-relaxed text-muted-foreground md:px-8">{view.trip.description}</p> : null}
        </section>

        {view.itinerary ? (
          <section aria-labelledby="shared-itinerary" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="tw-travel-eyebrow">The route</p>
                <h2 id="shared-itinerary" className="tw-travel-display mt-1 text-3xl leading-none tracking-[-0.03em] md:text-4xl">{view.itinerary.title || "Day by day"}</h2>
              </div>
              <span className="text-xs text-muted-foreground">{view.itinerary.stops.length} stop{view.itinerary.stops.length === 1 ? "" : "s"}</span>
            </div>
            {view.itinerary.summary ? <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{view.itinerary.summary}</p> : null}
            <div className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-start">
              <ol className="flex flex-col gap-3">
                {view.itinerary.stops.map((stop, index) => (
                  <li key={`${stop.destination}-${index}`} className="tw-travel-card tw-print-avoid p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="tw-num grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{index + 1}</span>
                        <div>
                          <h3 className="tw-travel-display text-2xl leading-none">{stop.destination}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">{formatDate(stop.arrivalDate, { day: "numeric", month: "short" })} → {formatDate(stop.departureDate, { day: "numeric", month: "short" })} · {nightsLabel(stop.nights)}</p>
                        </div>
                      </div>
                      <MapPin className="size-4 text-muted-foreground/50" aria-hidden />
                    </div>
                    {stop.activities.length > 0 ? (
                      <ul className="mt-4 flex flex-wrap gap-1.5">
                        {stop.activities.map((activity) => <li key={activity} className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground">{activity}</li>)}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
              <div className="flex flex-col gap-4 lg:sticky lg:top-6">
                {mapStops.length > 0 ? <div className="tw-travel-card overflow-hidden p-2"><div className="h-72"><ItineraryMap stops={mapStops} compact /></div><p className="px-2 py-2 text-[10px] text-muted-foreground">A straight-line sketch of the stops, not a driving route.</p></div> : null}
                {view.budget ? (
                  <section className="tw-travel-card tw-print-avoid p-5">
                    <p className="tw-travel-eyebrow">Budget shared</p>
                    <p className="tw-num mt-2 text-3xl font-semibold">{money(view.budget.totalMinor, view.budget.currency)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">The traveller's own plan, not a payment or a quote.</p>
                    {view.budget.excludedCurrencies.length > 0 ? (
                      <p className="mt-2 rounded-lg bg-warning-soft px-2.5 py-2 text-[11px] leading-relaxed text-warning">
                        Some lines are kept in {view.budget.excludedCurrencies.join(", ")} and are not included in this {view.budget.currency} total.
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-col gap-2">
                      {view.budget.categories.map((category) => (
                        <div key={category.category}>
                          <div className="flex items-center justify-between gap-2 text-[11px]"><span className="text-muted-foreground">{TRAVELER_BUDGET_CATEGORY_LABELS[category.category]}</span><span className="tw-num font-semibold">{money(category.totalMinor, view.budget!.currency)}</span></div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-accent/70" style={{ width: `${view.budget!.totalMinor > 0 ? Math.round((category.totalMinor / view.budget!.totalMinor) * 100) : 0}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <Alert tone="info" title="No itinerary yet">The trip has been shared before a route was saved.</Alert>
        )}

        <footer className="tw-no-print flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>Shared read-only with TripWeave. Prices and availability are never invented; this is not a booking.</p>
          <Link href="/travel/join" className="font-semibold text-accent hover:underline">Plan your own trip →</Link>
        </footer>
      </main>
      <div className="tw-no-print px-4 pb-8 text-center md:px-8"><PhotoCreditLine destination={destination} /></div>
    </div>
  );
}

function ExpiredLink() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16">
      <div className="tw-travel-card flex flex-col items-start gap-4 p-8">
        <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent"><AlertTriangle className="size-5" /></span>
        <h1 className="tw-travel-display text-4xl leading-none tracking-[-0.04em]">This link has expired.</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">The trip may have been shared again with a new link, or the traveller chose to stop sharing it. Ask them for a fresh link, or start a trip of your own.</p>
        <Button asChild><Link href="/travel">Plan your own trip</Link></Button>
      </div>
    </div>
  );
}
