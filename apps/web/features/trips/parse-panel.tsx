"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, ListChecks, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { MEAL_PLAN_LABELS, toMinorUnits, type MealPlan } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDate, formatDateTime, money, titleCase } from "@/lib/utils";
import { tripKeys } from "./hooks";
import type { ParseResponse, ParseResult, Trip } from "./types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-3 sm:gap-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm sm:col-span-2">{children}</dd>
    </div>
  );
}
const none = <span className="text-muted-foreground">Not stated</span>;
const list = (a: string[]) => (a.length ? a.join(", ") : none);

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
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Extraction result</CardTitle>
                <CardDescription>{result.parsedAt ? `Run ${formatDateTime(result.parsedAt)}` : "Latest run"}. Check every value; blank means the enquiry did not say.</CardDescription>
              </div>
              <EngineBadge engine={result.engine} model={result.model} />
            </CardHeader>
            <CardContent>
              {result.warnings.length > 0 ? (
                <div className="mb-3 flex flex-col gap-2">
                  {result.warnings.map((w) => (
                    <Alert key={w} tone="warning">
                      {w}
                    </Alert>
                  ))}
                </div>
              ) : null}
              <dl className="divide-y divide-border">
                <Row label="Dates">{p.arrivalDate || p.departureDate ? `${formatDate(p.arrivalDate)} to ${formatDate(p.departureDate)}` : none}{p.nights ? ` · ${p.nights} nights` : ""}</Row>
                <Row label="Destinations">{list(p.destinations)}</Row>
                <Row label="Overnight stops">{p.overnightStops.length ? p.overnightStops.map((s) => `${s.destination} (${s.nights}n)`).join(", ") : none}</Row>
                <Row label="Guests">{p.adults === null ? none : `${p.adults} adult${p.adults === 1 ? "" : "s"}${p.children ? `, ${p.children} children${p.childAges.length ? ` (ages ${p.childAges.join(", ")})` : ""}` : ""}${p.roomCount ? ` · ${p.roomCount} room${p.roomCount === 1 ? "" : "s"}` : ""}`}</Row>
                <Row label="Budget">{p.budgetAmount === null ? none : `${money(toMinorUnits(p.budgetAmount, p.budgetCurrency ?? "USD"), p.budgetCurrency ?? "USD")}${p.budgetScope ? ` · ${p.budgetScope === "all_inclusive_trip" ? "whole trip" : "accommodation only"}` : " · scope not stated"}`}</Row>
                <Row label="Hotel category">{p.preferredHotelCategory ? titleCase(p.preferredHotelCategory) : none}</Row>
                <Row label="Meal plans">{p.mealPlans.length ? p.mealPlans.map((m) => MEAL_PLAN_LABELS[m as MealPlan] ?? m).join(", ") : none}</Row>
                <Row label="Required amenities">{list(p.requiredAmenities)}</Row>
                <Row label="Preferred amenities">{list(p.preferredAmenities)}</Row>
                <Row label="Max drive">{p.maxLegDurationMinutes ? `${p.maxLegDurationMinutes} minutes` : none}</Row>
                <Row label="Cancellation">{p.cancellationPreference === "free_cancellation" ? "Free cancellation wanted" : none}</Row>
                <Row label="Activities">{list(p.activities)}</Row>
                <Row label="Other">{list([...p.accessibility, ...p.otherRequirements])}</Row>
              </dl>
            </CardContent>
          </Card>

          {questions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="size-4 text-warning" /> Clarifying questions ({questions.length})
                </CardTitle>
                <CardDescription>Ask the customer, then edit the requirements. These were not guessed.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {suggestion && suggestion.plan.length > 0 ? (
            <Card className="border-accent/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="size-4 text-accent" /> Suggested overnight plan
                  <Badge tone="warning">Needs your confirmation</Badge>
                </CardTitle>
                <CardDescription>{suggestion.question}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ol className="grid gap-2 sm:grid-cols-2">
                  {suggestion.plan.map((s, i) => (
                    <li key={`${s.destination}-${i}`} className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                      <span className="font-semibold">
                        {i + 1}. {s.destination}
                      </span>
                      <span className="tw-num text-muted-foreground">
                        {s.nights} night{s.nights === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ol>
                {suggestion.dayVisitOnly.length ? <p className="text-sm text-muted-foreground">Day visits only (no overnight): {suggestion.dayVisitOnly.join(", ")}</p> : null}
                <p className="text-xs text-muted-foreground">This is a suggestion, not a decision. Open it in the itinerary builder to adjust the stops and dates, then confirm.</p>
                <div>
                  <Button asChild variant="accent">
                    <Link href={`/trips/${trip.id}/itinerary?seed=suggestion`}>Review and confirm this plan</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      {can("trips:write") ? (
        <Card>
          <CardHeader>
            <CardTitle>{result ? "Run the extraction again" : "Extract requirements"}</CardTitle>
            <CardDescription>Preview shows what would be extracted without changing the trip. Applying updates dates, party, budget and preferences, and may create a new itinerary draft.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="Enquiry text" htmlFor="parse-text" hint="At least 10 characters.">
              <Textarea id="parse-text" rows={5} value={text} maxLength={8000} onChange={(e) => setText(e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={text.trim().length < 10} loading={run.isPending && run.variables === false} onClick={() => run.mutate(false)}>
                Preview only
              </Button>
              <Button disabled={text.trim().length < 10} loading={run.isPending && run.variables === true} onClick={() => setConfirmApply(true)}>
                <Sparkles /> Extract and apply to trip
              </Button>
            </div>
          </CardContent>
        </Card>
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
