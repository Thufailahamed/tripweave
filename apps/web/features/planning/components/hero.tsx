"use client";
import * as React from "react";
import { defineComponent, useTriggerAction } from "@openuidev/react-lang";
import { ArrowRight, CalendarDays, MapPin, Users, Wallet } from "lucide-react";
import { TripHeroSchema } from "@tripweave/planning-contract";
import { BUDGET_SCOPE_LABELS } from "@/features/trips/types";
import { dateRange, mealLabel, money, nightsLabel, titleCase } from "@/lib/utils";
import { resolvePlanningItinerary, usePlanningSnapshot } from "../context";
import { MissingEntity } from "../ui";
import { DestinationPhoto } from "./destination-photo";

const DESCRIPTION = "Editorial cover for the trip: the first destination's photograph, trip title, dates, party, budget and primary next steps. Pass the tripId from CONTEXT and, when it exists, the itineraryId. Use it as the first block for an overview or recommendation.";

export const TripHero = defineComponent({
  name: "TripHero",
  description: DESCRIPTION,
  props: TripHeroSchema,
  component: function TripHeroView({ props }) {
    const snapshot = usePlanningSnapshot();
    const action = useTriggerAction();
    const trip = snapshot.trip;
    if (props.tripId !== trip.id && props.tripId !== trip.ref) return <MissingEntity what="trip" />;
    const itinerary = props.itineraryId ? resolvePlanningItinerary(snapshot, props.itineraryId) : snapshot.itinerary;
    if (props.itineraryId && !itinerary) return <MissingEntity what="itinerary" />;
    const stop = itinerary?.stops[0] ?? null;
    const destination = stop?.destination ?? snapshot.offers[0]?.destination ?? trip.title;
    const totalNights = itinerary?.stops.reduce((sum, item) => sum + item.nights, 0) ?? null;
    const party = `${trip.party.adults} adult${trip.party.adults === 1 ? "" : "s"}${trip.party.children ? `, ${trip.party.children} child${trip.party.children === 1 ? "" : "ren"}` : ""}`;
    return (
      <section aria-label={`Trip cover for ${trip.title}`} className="pl-card overflow-hidden">
        <div className="relative">
          <DestinationPhoto destination={destination} className="h-[260px] w-full sm:h-[320px]" eager imgClassName="scale-[1.01]" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(20,16,10,0.16)_0%,transparent_38%,rgba(20,16,10,0.72)_100%)]" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-5">
            <span className="pl-chip border-white/25 bg-black/25 text-white backdrop-blur-[6px]">
              <MapPin className="size-3" aria-hidden /> {titleCase(trip.status)}
            </span>
            {totalNights !== null ? (
              <span className="pl-chip border-white/25 bg-black/25 text-white backdrop-blur-[6px]">
                {nightsLabel(totalNights)} · {itinerary?.stops.length ?? 1} stop{(itinerary?.stops.length ?? 1) === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <p className="pl-eyebrow text-white/90 [text-shadow:0_1px_14px_rgba(0,0,0,0.6)]">Your trip, composed from live data</p>
            <h3 className="pl-display mt-2 max-w-3xl text-[2.4rem] leading-[0.94] text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.45)] sm:text-[3.4rem]">{trip.title}</h3>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/90 [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
              <span className="tw-num inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden /> {dateRange(trip.arrivalDate, trip.departureDate)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden /> {party}
              </span>
              {itinerary?.stops.length ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden /> {itinerary.stops.map((item) => item.destination).join(" · ")}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--pl-surface)] px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center gap-1.5">
            {trip.budgetAmountMinor !== null ? (
              <span className="pl-chip pl-chip-sage">
                <Wallet className="size-3" aria-hidden /> {money(trip.budgetAmountMinor, trip.budgetCurrency)}
                <span className="opacity-70">· {BUDGET_SCOPE_LABELS[trip.budgetScope] ?? trip.budgetScope}</span>
              </span>
            ) : (
              <span className="pl-chip">Budget not set</span>
            )}
            {trip.preferredHotelCategory ? <span className="pl-chip">{titleCase(trip.preferredHotelCategory)}</span> : null}
            {trip.preferredMealPlan ? <span className="pl-chip">{mealLabel(trip.preferredMealPlan)}</span> : null}
            <span className="pl-chip">
              {trip.party.rooms.length} room{trip.party.rooms.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {itinerary ? (
              <button type="button" className="pl-btn" onClick={() => void action("Open itinerary", undefined, { type: "open_itinerary", params: {} })}>
                View itinerary <ArrowRight className="size-3.5" aria-hidden />
              </button>
            ) : null}
            {snapshot.packages.length > 0 ? (
              <button type="button" className="pl-btn pl-btn-solid" onClick={() => void action("Open packages", undefined, { type: "open_packages", params: {} })}>
                Open packages <ArrowRight className="size-3.5" aria-hidden />
              </button>
            ) : snapshot.permissions.canRunOptimisation ? (
              <button type="button" className="pl-btn pl-btn-solid" onClick={() => void action("Configure optimisation", undefined, { type: "open_optimise", params: {} })}>
                Optimise stay <ArrowRight className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </section>
    );
  },
});
