"use client";
import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowRight, BedDouble, CalendarDays, CheckCircle2, Map, NotebookPen, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Alert, Badge, LoadingBlock, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";
import { tripKeys, useItineraryView, usePackages, useTrip } from "@/features/trips/hooks";
import { apiPatch, errorMessage } from "@/lib/api";
import { dateRange, formatDate, money, relativeTime } from "@/lib/utils";
import { useBudgetItems, usePackingItems, useTripNotes, travelKeys } from "./hooks";
import { budgetTotals, daysUntil, packingProgress, tripDestination } from "./lib";

const ItineraryMap = dynamic(() => import("@/features/trips/itinerary-map"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" /> });

function OverviewInner() {
  const params = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const tripQuery = useTrip(id);
  const itineraryQuery = useItineraryView(id);
  const budgetQuery = useBudgetItems(id, !!id);
  const packingQuery = usePackingItems(id, !!id);
  const notesQuery = useTripNotes(id, !!id);
  const packagesQuery = usePackages(id);
  const [created, setCreated] = React.useState(params.get("created") === "1");
  const [archiving, setArchiving] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);

  if (tripQuery.isLoading) return <LoadingBlock label="Opening your trip" />;
  if (!tripQuery.data) return null;
  const trip = tripQuery.data.trip;
  const itinerary = itineraryQuery.data?.itinerary ?? tripQuery.data.itinerary;
  const budget = budgetTotals(budgetQuery.data?.items ?? [], trip.budgetCurrency, trip.budgetAmountMinor);
  const packing = packingProgress(packingQuery.data?.items ?? []);
  const latestNote = notesQuery.data?.items[0] ?? null;
  const packages = packagesQuery.data?.packages ?? [];
  const destination = tripDestination({ title: trip.title, parseResult: trip.parseResult, itinerary });
  const countdown = daysUntil(trip.arrivalDate);
  const next = !itinerary
    ? { title: "Draft the route", text: "Add the places and the nights you want, or let the planner suggest a split.", href: `/travel/trips/${trip.id}/itinerary`, label: "Open itinerary" }
    : packages.length === 0
      ? { title: "Find stay ideas", text: "Ask for hotels along the confirmed route and see how they fit the budget.", href: `/travel/trips/${trip.id}/stays`, label: "Find stays" }
      : { title: "Talk it through", text: "Ask the planner for a slower day, a different base or what to do when it rains.", href: `/travel/trips/${trip.id}/plan`, label: "Plan with AI" };

  const archive = async () => {
    setArchiving(true);
    try {
      await apiPatch(`/trips/${trip.id}`, { status: "archived" });
      qc.invalidateQueries({ queryKey: travelKeys.trips });
      qc.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
      toast.success("Trip archived");
      router.push("/travel/trips");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setArchiving(false);
      setConfirmArchive(false);
    }
  };

  const restore = async () => {
    try {
      await apiPatch(`/trips/${trip.id}`, { status: "planning" });
      qc.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
      qc.invalidateQueries({ queryKey: travelKeys.trips });
      toast.success("Trip restored");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {created ? (
        <Alert tone="success" title="Your trip is open">
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span>The plan is a draft. Open the planner for a day-by-day read, or shape the route yourself.</span>
            <Button size="sm" variant="outline" onClick={() => setCreated(false)}>Dismiss</Button>
          </div>
        </Alert>
      ) : null}

      <section className="grid overflow-hidden rounded-[1.6rem] border border-border bg-card lg:grid-cols-[1.15fr_0.85fr]">
        <div className="tw-travel-photo min-h-64 rounded-none lg:max-h-[480px]">
          <DestinationPhoto destination={destination} alt={destination} className="size-full" eager placeholder="art" />
        </div>
        <div className="flex flex-col justify-between gap-6 p-6 md:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="tw-travel-eyebrow">The short version</p>
              {countdown !== null && countdown >= 0 ? <Badge tone="neutral">{countdown === 0 ? "Today" : countdown === 1 ? "Tomorrow" : `${countdown} days to go`}</Badge> : null}
            </div>
            <p className="tw-travel-display mt-3 text-3xl leading-tight tracking-[-0.03em]">{destination}</p>
            <p className="mt-2 text-sm text-muted-foreground">{dateRange(trip.arrivalDate, trip.departureDate)} · {trip.party.adults + trip.party.children} traveller{trip.party.adults + trip.party.children === 1 ? "" : "s"}</p>
            {itinerary ? (
              <p className="mt-4 text-sm leading-relaxed text-foreground/70">
                {itinerary.stops.length} stop{itinerary.stops.length === 1 ? "" : "s"} · {itinerary.status === "confirmed" ? "route confirmed" : "route still a draft"}
              </p>
            ) : <p className="mt-4 text-sm text-muted-foreground">No route yet. Start with the places you already know.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href={next.href}>{next.label} <ArrowRight className="size-4" /></Link></Button>
            <Button asChild variant="outline"><Link href={`/travel/trips/${trip.id}/plan`}><Sparkles className="size-4" /> Ask the planner</Link></Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Trip budget" value={trip.budgetAmountMinor === null ? "Not set" : money(trip.budgetAmountMinor, trip.budgetCurrency)} hint={budget.remainingMinor === null ? "Add a budget to track the gap" : budget.remainingMinor >= 0 ? `${money(budget.remainingMinor, trip.budgetCurrency)} left` : `${money(Math.abs(budget.remainingMinor), trip.budgetCurrency)} over`} bare icon={Wallet} />
        <Stat label="Planned spend" value={money(budget.totalMinor, trip.budgetCurrency)} hint={`${money(budget.paidMinor, trip.budgetCurrency)} paid`} bare icon={CheckCircle2} />
        <Stat label="Packing" value={`${packing.checked}/${packing.total}`} hint={packing.total === 0 ? "Generate a list" : `${packing.percent}% checked`} bare icon={Map} />
        <Stat label="Notes" value={String(notesQuery.data?.items.length ?? 0)} hint={latestNote ? relativeTime(latestNote.createdAt) : "Nothing saved yet"} bare icon={NotebookPen} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="tw-travel-card flex flex-col gap-4 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="tw-travel-eyebrow">Your route</p>
              <h2 className="tw-travel-display mt-1 text-3xl leading-none tracking-[-0.03em]">{itinerary?.title || "A route, once you are ready"}</h2>
            </div>
            <Button asChild size="sm" variant="outline"><Link href={`/travel/trips/${trip.id}/itinerary`}>{itinerary ? "Edit" : "Build"}</Link></Button>
          </div>
          {itinerary ? (
            <>
              <ol className="flex flex-col gap-2">
                {itinerary.stops.map((stop) => (
                  <li key={stop.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="tw-num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{stop.sequence}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{stop.destination}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(stop.arrivalDate, { day: "numeric", month: "short" })} → {formatDate(stop.departureDate, { day: "numeric", month: "short" })} · {stop.nights} night{stop.nights === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    {stop.activities.length > 0 ? <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:block">{stop.activities.join(" · ")}</span> : null}
                  </li>
                ))}
              </ol>
              {itinerary.stops.some((stop) => stop.latitude !== null && stop.longitude !== null) ? (
                <div className="h-56 overflow-hidden rounded-xl"><ItineraryMap stops={itinerary.stops.map((stop) => ({ key: stop.id, destination: stop.destination, latitude: stop.latitude, longitude: stop.longitude }))} compact /></div>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Add places, dates and activities. The map and drive-time checks appear as soon as there are stops.</div>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section className="tw-travel-card flex flex-col gap-3 p-5 md:p-6">
            <p className="tw-travel-eyebrow">Next best thing</p>
            <h2 className="tw-travel-display text-3xl leading-none tracking-[-0.03em]">{next.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{next.text}</p>
            <Button asChild variant="outline" className="self-start"><Link href={next.href}>{next.label} <ArrowRight className="size-4" /></Link></Button>
          </section>

          <section className="tw-travel-card flex flex-col gap-3 p-5 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="tw-travel-eyebrow">Stay ideas</p>
              <Button asChild size="sm" variant="ghost"><Link href={`/travel/trips/${trip.id}/stays`}>See all</Link></Button>
            </div>
            {packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stay options yet. Confirm the route, then ask for hotels along it.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {packages.slice(0, 3).map((pkg) => (
                  <li key={pkg.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{pkg.package.selections.map((selection) => selection.offer.property.name).join(" · ")}</p>
                      <p className="text-xs text-muted-foreground">{pkg.package.selections.map((selection) => selection.destination).join(" → ")}</p>
                    </div>
                    {pkg.pricing ? <span className="tw-num shrink-0 text-sm font-semibold">{money(pkg.pricing.sellingPriceMinor, pkg.pricing.currency)}</span> : <Badge tone="outline">No price</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tw-travel-card flex flex-col gap-3 p-5 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="tw-travel-eyebrow">Latest note</p>
              <Button asChild size="sm" variant="ghost"><Link href={`/travel/trips/${trip.id}/notes`}>Notes</Link></Button>
            </div>
            {latestNote ? (
              <div>
                <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{latestNote.body}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{relativeTime(latestNote.createdAt)}</p>
              </div>
            ) : <p className="text-sm text-muted-foreground">Train times, a restaurant, a name to remember. Keep it here.</p>}
          </section>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-xs text-muted-foreground">Created {formatDate(trip.createdAt)} · last updated {relativeTime(trip.updatedAt)}</p>
        {trip.status === "archived" ? (
          <Button variant="outline" size="sm" onClick={() => void restore()}><Archive className="size-4" /> Restore trip</Button>
        ) : (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmArchive(true)}><Archive className="size-4" /> Archive trip</Button>
        )}
      </div>
      <ConfirmDialog open={confirmArchive} onOpenChange={setConfirmArchive} title="Archive this trip?" description="It leaves the dashboard but the trip, notes, packing and budget stay intact. You can restore it from this page." confirmLabel="Archive" destructive loading={archiving} onConfirm={() => void archive()} />
    </div>
  );
}

export function TravelTripOverview() {
  return <OverviewInner />;
}
