"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BedDouble, Building2, CalendarDays, Car, Compass, Copy, Heart, HelpCircle, ListChecks, MapPin, NotebookPen, ShieldCheck, Sparkles, Users, UtensilsCrossed, Wallet } from "lucide-react";
import { toast } from "sonner";
import { MEAL_PLAN_LABELS, toMinorUnits, type MealPlan } from "@tripweave/shared";
import { Alert, Badge, EmptyState, type TileTone } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDate, formatDateTime, money, titleCase } from "@/lib/utils";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";
import { FactTile, SectionHeading } from "./dossier";
import { tripKeys } from "./hooks";
import type { ParseResponse, ParseResult, Trip } from "./types";

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

export function EngineBadge({ engine, model }: { engine: string; model?: string | null }) {
  return engine === "rules" ? <Badge tone="neutral">Rules engine (deterministic)</Badge> : <Badge tone="accent">AI-assisted{model ? ` (${model})` : ""}</Badge>;
}

export function ParsePanel({ trip }: { trip: Trip }) {
  const can = useCan();
  const qc = useQueryClient();
  const result: ParseResult | null = trip.parseResult;
  const [text, setText] = React.useState(trip.description ?? "");
  const [last, setLast] = React.useState<ParseResponse | null>(null);
  const [confirmApply, setConfirmApply] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = useMutation({
    mutationFn: (apply: boolean) => apiPost<ParseResponse>(`/trips/${trip.id}/parse`, { text: text.trim(), apply }),
    onSuccess: (r) => {
      setLast(r);
      setError(null);
      setConfirmApply(false);
      qc.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
      qc.invalidateQueries({ queryKey: tripKeys.itinerary(trip.id) });
      toast.success(r.applied ? "Extracted requirements applied to the trip" : "Extraction finished (trip not changed)");
    },
    onError: (e) => {
      setConfirmApply(false);
      setError(errorMessage(e));
    },
  });

  const p = result?.parsed;
  const suggestion = result?.suggestedItinerary ?? null;
  const questions = p?.clarifyingQuestions ?? [];
  const other = p ? [...p.accessibility, ...p.otherRequirements] : [];
  const facts: { label: string; icon: IconType; tone?: TileTone; missing: boolean; value: React.ReactNode }[] = p
    ? [
        { label: "Dates", icon: CalendarDays, tone: "accent", missing: !(p.arrivalDate || p.departureDate), value: <span className="tw-num">{`${formatDate(p.arrivalDate)} to ${formatDate(p.departureDate)}${p.nights ? ` · ${p.nights} nights` : ""}`}</span> },
        { label: "Destinations", icon: MapPin, tone: "accent", missing: p.destinations.length === 0, value: p.destinations.join(", ") },
        { label: "Overnight stops", icon: BedDouble, missing: p.overnightStops.length === 0, value: p.overnightStops.map((s) => `${s.destination} (${s.nights}n)`).join(", ") },
        { label: "Guests", icon: Users, tone: "info", missing: p.adults === null, value: `${p.adults} adult${p.adults === 1 ? "" : "s"}${p.children ? `, ${p.children} children${p.childAges.length ? ` (ages ${p.childAges.join(", ")})` : ""}` : ""}${p.roomCount ? ` · ${p.roomCount} room${p.roomCount === 1 ? "" : "s"}` : ""}` },
        { label: "Budget", icon: Wallet, tone: "success", missing: p.budgetAmount === null, value: p.budgetAmount === null ? null : `${money(toMinorUnits(p.budgetAmount, p.budgetCurrency ?? "USD"), p.budgetCurrency ?? "USD")}${p.budgetScope ? ` · ${p.budgetScope === "all_inclusive_trip" ? "whole trip" : "accommodation only"}` : " · scope not stated"}` },
        { label: "Hotel category", icon: Building2, missing: !p.preferredHotelCategory, value: p.preferredHotelCategory ? titleCase(p.preferredHotelCategory) : null },
        { label: "Meal plans", icon: UtensilsCrossed, missing: p.mealPlans.length === 0, value: p.mealPlans.map((m) => MEAL_PLAN_LABELS[m as MealPlan] ?? m).join(", ") },
        { label: "Required amenities", icon: ListChecks, missing: p.requiredAmenities.length === 0, value: p.requiredAmenities.join(", ") },
        { label: "Preferred amenities", icon: Heart, missing: p.preferredAmenities.length === 0, value: p.preferredAmenities.join(", ") },
        { label: "Max drive", icon: Car, missing: !p.maxLegDurationMinutes, value: `${p.maxLegDurationMinutes} minutes` },
        { label: "Cancellation", icon: ShieldCheck, missing: p.cancellationPreference !== "free_cancellation", value: "Free cancellation wanted" },
        { label: "Activities", icon: Compass, missing: p.activities.length === 0, value: p.activities.join(", ") },
        { label: "Other", icon: NotebookPen, missing: other.length === 0, value: other.join(", ") },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      {last?.assumptions?.length ? (
        <Alert tone="warning" title="Assumptions made while applying the extraction">
          <ul className="list-disc pl-5">
            {last.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {!result || !p ? (
        <EmptyState icon={Sparkles} title="No extraction has been run" description="Paste the enquiry below to extract dates, party, budget and stops. Nothing is applied until you choose to." />
      ) : (
        <>
          <SectionHeading
            title="What the enquiry says"
            note={`${facts.filter((fact) => !fact.missing).length} of ${facts.length} details found`}
            aside={
              <>
                <span className="tw-num">{result.parsedAt ? `Run ${formatDateTime(result.parsedAt)}` : "Latest run"}</span>
                <EngineBadge engine={result.engine} model={result.model} />
              </>
            }
          />
          {result.warnings.length > 0 ? (
            <div className="flex flex-col gap-2">
              {result.warnings.map((w) => (
                <Alert key={w} tone="warning">
                  {w}
                </Alert>
              ))}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <dl className="grid content-start gap-2.5 sm:grid-cols-2" aria-label="Extracted details">
              {facts.map((fact) => (
                <FactTile key={fact.label} icon={fact.icon} label={fact.label} tone={fact.tone} missing={fact.missing} missingLabel="Not stated">
                  {fact.value}
                </FactTile>
              ))}
            </dl>

            <div className="flex flex-col gap-4">
              {questions.length > 0 ? (
                <section aria-labelledby="questions-h" className="tw-surface rounded-2xl border border-warning/40 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="tw-kicker">Ask the customer</p>
                      <h3 id="questions-h" className="tw-trip-display mt-1 text-[1.5rem] leading-none">
                        {questions.length} open question{questions.length === 1 ? "" : "s"}
                      </h3>
                    </div>
                    <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-warning-soft text-warning">
                      <HelpCircle className="size-5" strokeWidth={1.8} />
                    </span>
                  </div>
                  <ol className="mt-4 flex flex-col gap-2">
                    {questions.map((q, i) => (
                      <li key={q} className="flex gap-2.5 text-[13px] leading-relaxed">
                        <span className="tw-num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">{i + 1}</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="tw-hand mt-3 text-[1.15rem]">these were not guessed</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join("\n"))
                        .then(() => toast.success("Questions copied"), () => toast.error("Could not copy the questions"));
                    }}
                  >
                    <Copy /> Copy questions
                  </Button>
                </section>
              ) : (
                <section className="tw-surface rounded-2xl border border-success/40 p-5">
                  <p className="tw-kicker">Ask the customer</p>
                  <p className="tw-trip-display mt-1 text-[1.5rem] leading-none">Nothing left to ask</p>
                  <p className="mt-2 text-xs text-muted-foreground">The enquiry answered everything the extraction looks for.</p>
                </section>
              )}

              {suggestion && suggestion.plan.length > 0 ? (
                <section aria-labelledby="plan-h" className="tw-surface rounded-2xl border border-accent/40 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="tw-kicker">Suggested overnight plan</p>
                    <Badge tone="warning">Needs your confirmation</Badge>
                  </div>
                  <h3 id="plan-h" className="tw-trip-display mt-1.5 text-[1.35rem] leading-tight">
                    {suggestion.question}
                  </h3>
                  <ol className="mt-4 grid grid-cols-3 gap-2">
                    {suggestion.plan.map((stop, i) => (
                      <li key={`${stop.destination}-${i}`} className="min-w-0">
                        <span className="relative block aspect-[4/5] overflow-hidden rounded-xl">
                          <DestinationPhoto destination={stop.destination} className="absolute inset-0 size-full" />
                          <span aria-hidden className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(16,12,8,0.8))] px-2 pb-2 pt-8 text-white">
                            <span className="block truncate text-[12px] font-semibold">{stop.destination}</span>
                            <span className="tw-num block text-[10px] opacity-85">
                              {stop.nights} night{stop.nights === 1 ? "" : "s"}
                            </span>
                          </span>
                        </span>
                        <span className="sr-only">
                          {i + 1}. {stop.destination}, {stop.nights} night{stop.nights === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {suggestion.dayVisitOnly.length ? <p className="mt-3 text-xs text-muted-foreground">Day visits only: {suggestion.dayVisitOnly.join(", ")}</p> : null}
                  <p className="mt-3 text-xs text-muted-foreground">A suggestion, not a decision. Adjust the stops and dates in the itinerary builder, then confirm.</p>
                  <Button asChild variant="accent" size="sm" className="mt-3">
                    <Link href={`/trips/${trip.id}/itinerary?seed=suggestion`}>Review and confirm this plan</Link>
                  </Button>
                </section>
              ) : null}
            </div>
          </div>
        </>
      )}

      {can("trips:write") ? (
        <section aria-labelledby="extract-h" className="tw-surface rounded-2xl border border-border p-5 sm:p-6">
          <SectionHeading
            id="extract-h"
            className="mb-3"
            title={result ? "Run the extraction again" : "Extract requirements"}
            note="nothing changes until you apply it"
          />
          <p className="mb-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">Preview shows what would be extracted without changing the trip. Applying updates dates, party, budget and preferences, and may create a new itinerary draft.</p>
          <div className="flex flex-col gap-3">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="Enquiry text" htmlFor="parse-text" hint="At least 10 characters.">
              <Textarea id="parse-text" rows={5} value={text} maxLength={8000} onChange={(e) => setText(e.target.value)} className="tw-trip-display text-[1.1rem] leading-snug" />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={text.trim().length < 10} loading={run.isPending && run.variables === false} onClick={() => run.mutate(false)}>
                Preview only
              </Button>
              <Button disabled={text.trim().length < 10} loading={run.isPending && run.variables === true} onClick={() => setConfirmApply(true)}>
                <Sparkles /> Extract and apply to trip
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmApply}
        onOpenChange={setConfirmApply}
        title="Apply the extraction to this trip?"
        description="Dates, guests, budget and preferences found in the text will overwrite the current values, and a new itinerary draft may replace the latest one. You can edit everything afterwards."
        confirmLabel="Extract and apply"
        loading={run.isPending}
        onConfirm={() => run.mutate(true)}
      />
    </div>
  );
}
