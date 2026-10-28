"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { Accessibility, Baby, CalendarDays, Car, FileSearch, Hotel, ShieldCheck, Sparkles, Users, UtensilsCrossed, Wallet, Waves } from "lucide-react";
import { TripRequirementSummarySchema } from "@tripweave/planning-contract";
import { BUDGET_SCOPE_LABELS } from "@/features/trips/types";
import { dateRange, formatDate, mealLabel, money, titleCase } from "@/lib/utils";
import { usePlanningSnapshot } from "../context";
import { MissingEntity, SectionHeader, StatTile } from "../ui";

const DESCRIPTION = "Authoritative requirement summary for this trip: dates, party, budget, preferences and what is still missing. Pass the tripId from CONTEXT.";

export const TripRequirementSummary = defineComponent({
  name: "TripRequirementSummary",
  description: DESCRIPTION,
  props: TripRequirementSummarySchema,
  component: function TripRequirementSummaryView({ props }) {
    const snapshot = usePlanningSnapshot();
    const trip = snapshot.trip;
    if (props.tripId !== trip.id && props.tripId !== trip.ref) return <MissingEntity what="trip" />;
    const s = trip.specialRequirements;
    const showMissing = props.focus !== "preferences" && snapshot.missingFields.length > 0;
    const engine = snapshot.sources.engine === "rules" ? "Rules-assisted extraction" : snapshot.sources.engine === "none" ? "Server data" : "AI-assisted extraction";

    // Only facts the trip actually states become tiles. Everything else is listed once, so the grid never fills with "Not stated" boxes.
    const facts: { label: string; icon: React.ComponentType<{ className?: string }>; value: React.ReactNode; tone?: "accent" | "sage" }[] = [
      {
        label: "Dates",
        icon: CalendarDays,
        value: trip.arrivalDate || trip.departureDate ? <span className="tw-num">{dateRange(trip.arrivalDate, trip.departureDate)}</span> : null,
      },
      {
        label: "Guests",
        icon: Users,
        value: (
          <span className="tw-num">
            {trip.party.adults} adult{trip.party.adults === 1 ? "" : "s"}
            {trip.party.children ? `, ${trip.party.children} child${trip.party.children === 1 ? "" : "ren"}` : ""} · {trip.party.rooms.length} room{trip.party.rooms.length === 1 ? "" : "s"}
          </span>
        ),
      },
      {
        label: "Budget",
        icon: Wallet,
        tone: "sage",
        value:
          trip.budgetAmountMinor === null ? null : (
            <span className="tw-num">
              {money(trip.budgetAmountMinor, trip.budgetCurrency)} <span className="text-[11px] text-[var(--pl-muted)]">({BUDGET_SCOPE_LABELS[trip.budgetScope] ?? trip.budgetScope})</span>
            </span>
          ),
      },
      { label: "Hotel category", icon: Hotel, value: trip.preferredHotelCategory ? titleCase(trip.preferredHotelCategory) : null },
      { label: "Meal plan", icon: UtensilsCrossed, value: trip.preferredMealPlan ? mealLabel(trip.preferredMealPlan) : null },
      { label: "Cancellation", icon: ShieldCheck, tone: "sage", value: s.requireFreeCancellation ? "Free cancellation required" : null },
      { label: "Required amenities", icon: Sparkles, value: s.requiredAmenities?.length ? s.requiredAmenities.join(", ") : null },
      { label: "Preferred amenities", icon: Waves, value: s.preferredAmenities?.length ? s.preferredAmenities.join(", ") : null },
      { label: "Max drive between stops", icon: Car, value: s.maxLegDurationMinutes ? `${s.maxLegDurationMinutes} minutes` : null },
      { label: "Children's ages", icon: Baby, value: trip.party.childAges.length ? trip.party.childAges.join(", ") : null },
      { label: "Accessibility", icon: Accessibility, value: s.accessibility?.length ? s.accessibility.join(", ") : null },
      { label: "Other requirements", icon: FileSearch, value: s.other || null },
    ];
    const stated = facts.filter((fact) => Boolean(fact.value));
    const open = facts.filter((fact) => !fact.value).map((fact) => fact.label);

    return (
      <section aria-label="Trip requirements" className="flex flex-col gap-4">
        <SectionHeader
          icon={FileSearch}
          eyebrow="The brief"
          title="What we know"
          meta={<span className="pl-chip pl-chip-sage">{engine}</span>}
        />

        {showMissing ? (
          <div className="rounded-2xl border border-dashed border-[color-mix(in_oklab,var(--pl-accent)_40%,var(--pl-line))] bg-[var(--pl-accent-soft)] px-4 py-3">
            <p className="pl-hand">a few things are still open</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {snapshot.missingFields.slice(0, 6).map((field) => (
                <li key={field}>
                  <span className="pl-chip border-[color-mix(in_oklab,var(--pl-accent)_30%,var(--pl-line))] bg-[var(--pl-surface)]">{field}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {stated.map((fact) => (
            <StatTile key={fact.label} icon={fact.icon} label={fact.label} tone={fact.tone}>
              {fact.value}
            </StatTile>
          ))}
        </dl>

        {open.length > 0 ? (
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--pl-muted)]">
            <span className="font-semibold text-[var(--pl-ink)]">Not stated:</span> {open.join(" · ")}
          </p>
        ) : null}

        {trip.parseResult?.warnings.length ? (
          <ul className="flex flex-col gap-1">
            {trip.parseResult.warnings.slice(0, 3).map((warning) => (
              <li key={warning} className="rounded-lg border border-[var(--pl-line)] px-3 py-1.5 text-[11px] text-[var(--pl-muted)]">
                {warning}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-[10px] text-[var(--pl-muted)]">
          Last extraction: {trip.parseResult?.parsedAt ? formatDate(trip.parseResult.parsedAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "not run"}.
          {trip.parseResult ? ` Engine: ${trip.parseResult.engine}.` : ""}
        </p>
      </section>
    );
  },
});
