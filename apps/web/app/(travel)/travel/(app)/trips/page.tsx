"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, MapPin, Plus, Sparkles } from "lucide-react";
import { ErrorState, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";
import { TravelTripCard } from "@/features/travel/trip-card";
import { useTravelerTrips } from "@/features/travel/hooks";
import { daysUntil, tripDestination } from "@/features/travel/lib";
import { useSession } from "@/lib/session";
import { dateRange, formatDate } from "@/lib/utils";

export default function TravelTripsPage() {
  const { data: session } = useSession();
  const tripsQuery = useTravelerTrips();
  const router = useRouter();
  const [idea, setIdea] = React.useState("");

  if (tripsQuery.isLoading) return <LoadingBlock label="Gathering your trips" />;
  if (tripsQuery.isError) return <ErrorState error={tripsQuery.error} onRetry={() => tripsQuery.refetch()} title="Could not load your trips" />;

  const today = new Date().toISOString().slice(0, 10);
  const trips = (tripsQuery.data?.items ?? []).filter((trip) => trip.status !== "archived");
  const upcoming = trips
    .filter((trip) => trip.arrivalDate && trip.arrivalDate >= today)
    .sort((a, b) => (a.arrivalDate ?? "").localeCompare(b.arrivalDate ?? ""));
  const nextTrip = upcoming[0] ?? trips[0] ?? null;
  const others = trips.filter((trip) => trip.id !== nextTrip?.id);
  const countdown = daysUntil(nextTrip?.arrivalDate);
  const firstName = session?.user.displayName.split(/\s+/)[0] ?? "traveller";

  const start = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = idea.trim();
    router.push(trimmed ? `/travel/trips/new?idea=${encodeURIComponent(trimmed)}` : "/travel/trips/new");
  };

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tw-travel-eyebrow">Your trips</p>
          <h1 className="tw-travel-display mt-2 text-5xl leading-none tracking-[-0.045em] md:text-6xl">Hello, {firstName}.</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Pick up where you left off, or start with a place you cannot stop thinking about.</p>
        </div>
        <Button asChild variant="outline"><Link href="/travel/trips/new"><Plus className="size-4" /> New trip</Link></Button>
      </header>

      <form onSubmit={start} className="tw-travel-card flex flex-col gap-3 p-5 md:flex-row md:items-center md:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Sparkles className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <label htmlFor="trip-idea" className="text-sm font-semibold">Where to next?</label>
          <input
            id="trip-idea"
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            maxLength={500}
            placeholder="Two weeks in Sri Lanka in December, tea country, trains, a little coast…"
            className="mt-1 w-full border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          />
        </div>
        <Button type="submit" className="shrink-0">Start planning <ArrowRight className="size-4" /></Button>
      </form>

      {nextTrip ? (
        <section aria-labelledby="next-trip" className="grid overflow-hidden rounded-[1.8rem] border border-border bg-card lg:grid-cols-[1.15fr_0.85fr]">
          <div className="tw-travel-photo min-h-72 rounded-none">
            <DestinationPhoto destination={tripDestination({ title: nextTrip.title, parseResult: nextTrip.parseResult })} alt={nextTrip.title} className="size-full" eager />
          </div>
          <div className="flex flex-col justify-between gap-6 p-6 md:p-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="tw-travel-eyebrow">Next up</p>
                {countdown !== null && countdown >= 0 ? <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">{countdown === 0 ? "Today" : `${countdown} days`}</span> : null}
              </div>
              <h2 id="next-trip" className="tw-travel-display mt-3 text-4xl leading-[0.98] tracking-[-0.04em] md:text-5xl">{nextTrip.title}</h2>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" /> {tripDestination({ title: nextTrip.title, parseResult: nextTrip.parseResult })}</span>
                <span>{dateRange(nextTrip.arrivalDate, nextTrip.departureDate)}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{nextTrip.party.adults + nextTrip.party.children} traveller{nextTrip.party.adults + nextTrip.party.children === 1 ? "" : "s"} · {nextTrip.party.rooms.length} room{nextTrip.party.rooms.length === 1 ? "" : "s"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild><Link href={`/travel/trips/${nextTrip.id}`}>Open trip <ArrowRight className="size-4" /></Link></Button>
              <Button asChild variant="outline"><Link href={`/travel/trips/${nextTrip.id}/plan`}>Plan with AI</Link></Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="tw-travel-card flex flex-col items-start gap-4 p-8 md:p-10">
          <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent"><Compass className="size-5" /></span>
          <h2 className="tw-travel-display text-4xl leading-none tracking-[-0.04em]">The first trip is the fun one.</h2>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">Give us a place, a date or a feeling. We will help you shape it into days, stays and a budget you can live with.</p>
          <Button asChild size="lg"><Link href="/travel/trips/new">Start a trip <ArrowRight className="size-4" /></Link></Button>
        </section>
      )}

      {others.length > 0 ? (
        <section aria-labelledby="all-trips">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 id="all-trips" className="tw-travel-display text-3xl tracking-[-0.03em]">All trips</h2>
            <span className="text-xs text-muted-foreground">{formatDate(today)}</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((trip) => <TravelTripCard key={trip.id} trip={trip} />)}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 rounded-[1.5rem] border border-border bg-[#f1eadc]/70 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
        <div>
          <p className="tw-travel-eyebrow">Need a nudge?</p>
          <h2 className="tw-travel-display mt-2 text-3xl leading-none tracking-[-0.03em]">Browse a few places.</h2>
          <p className="mt-2 text-sm text-muted-foreground">Photos and short guides from Wikipedia, with a one-click start into the planner.</p>
        </div>
        <Button asChild variant="outline"><Link href="/travel/discover">Discover places <ArrowRight className="size-4" /></Link></Button>
      </section>
    </div>
  );
}
