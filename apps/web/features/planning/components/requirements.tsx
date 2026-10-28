"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { Accessibility, Baby, CalendarDays, Car, Hotel, Sparkles, Users, UtensilsCrossed, Wallet } from "lucide-react";
import { TripRequirementSummarySchema } from "@tripweave/planning-contract";
import { BUDGET_SCOPE_LABELS } from "@/features/trips/types";
import { dateRange, formatDate, mealLabel, money, titleCase } from "@/lib/utils";
import { usePlanningSnapshot } from "../context";
import { MissingEntity } from "../ui";

const DESCRIPTION = "Authoritative requirement summary for this trip: dates, party, budget, preferences and what is still missing. Pass the tripId from CONTEXT.";

const dash = <span className="text-[var(--pl-muted)]">Not stated</span>;

function Fact({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[var(--pl-line)] bg-[var(--pl-surface)] px-3 py-2.5">
      <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--pl-surface-2)] text-[var(--pl-accent)]">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pl-muted)]">{label}</dt>
        <dd className="mt-0.5 text-[12.5px] leading-snug">{children}</dd>
      </div>
    </div>
  );
}

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
    return (
      <section aria-label="Trip requirements" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="pl-eyebrow">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--pl-accent)]" /> The brief
            </p>
            <h3 className="pl-display mt-1 text-[1.9rem] leading-none">What we know</h3>
          </div>
          <span className="pl-chip pl-chip-sage">{engine}</span>
        </div>

        {showMissing ? (
          <div className="rounded-2xl border border-dashed border-[color-mix(in_oklab,var(--pl-accent)_40%,var(--pl-line))] bg-[var(--pl-accent-soft)] px-4 py-3">
            <p className="pl-hand">a few things are still open</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {snapshot.missingFields.slice(0, 6).map((field) => (
                <li key={field}>
                  <span className="pl-chip border-[color-mix(in_oklab,var(--pl-accent)_30%,var(--pl-line))] bg-[var(--pl-surface)]">{field}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Fact icon={CalendarDays} label="Dates">
            {trip.arrivalDate || trip.departureDate ? <span className="tw-num">{dateRange(trip.arrivalDate, trip.departureDate)}</span> : dash}
          </Fact>
          <Fact icon={Users} label="Guests">
            <span className="tw-num">
              {trip.party.adults} adult{trip.party.adults === 1 ? "" : "s"}
              {trip.party.children ? `, ${trip.party.children} child${trip.party.children === 1 ? "" : "ren"}` : ""} · {trip.party.rooms.length} room{trip.party.rooms.length === 1 ? "" : "s"}
            </span>
          </Fact>
          <Fact icon={Wallet} label="Budget">
            {trip.budgetAmountMinor === null ? (
              dash
            ) : (
              <span className="tw-num">
                {money(trip.budgetAmountMinor, trip.budgetCurrency)} <span className="text-[11px] text-[var(--pl-muted)]">({BUDGET_SCOPE_LABELS[trip.budgetScope] ?? trip.budgetScope})</span>
              </span>
            )}
          </Fact>
          <Fact icon={Hotel} label="Hotel category">{trip.preferredHotelCategory ? titleCase(trip.preferredHotelCategory) : dash}</Fact>
          <Fact icon={UtensilsCrossed} label="Meal plan">{trip.preferredMealPlan ? mealLabel(trip.preferredMealPlan) : dash}</Fact>
          <Fact icon={Sparkles} label="Cancellation">{s.requireFreeCancellation ? "Free cancellation required" : "Not required"}</Fact>
          <Fact icon={Sparkles} label="Required amenities">{s.requiredAmenities?.length ? s.requiredAmenities.join(", ") : dash}</Fact>
          <Fact icon={Sparkles} label="Preferred amenities">{s.preferredAmenities?.length ? s.preferredAmenities.join(", ") : dash}</Fact>
          <Fact icon={Car} label="Max drive between stops">{s.maxLegDurationMinutes ? `${s.maxLegDurationMinutes} minutes` : dash}</Fact>
          <Fact icon={Baby} label="Children's ages">{trip.party.childAges.length ? trip.party.childAges.join(", ") : dash}</Fact>
          {s.accessibility?.length ? (
            <Fact icon={Accessibility} label="Accessibility">
              {s.accessibility.join(", ")}
            </Fact>
          ) : null}
          {s.other ? <Fact icon={Sparkles} label="Other requirements">{s.other}</Fact> : null}
        </dl>

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
