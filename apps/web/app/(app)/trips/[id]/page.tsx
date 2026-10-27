"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Circle, FileText, Layers, ListChecks, Map, Route, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { MEAL_PLAN_LABELS, type MealPlan } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, IconTile, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { IMAGES } from "@/features/marketing/imagery";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { ApiError, apiPatch, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { dateRange, formatDate, formatDateTime, money, nightsLabel, titleCase } from "@/lib/utils";
import { stageLabel, tripKeys, useTrip } from "@/features/trips/hooks";
import { ParsePanel } from "@/features/trips/parse-panel";
import { tripToForm, TripFormFields, validateTripForm, type TripFormState } from "@/features/trips/trip-form";
import { BUDGET_SCOPE_LABELS, TRIP_STATUSES, type Trip, type TripDetail } from "@/features/trips/types";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function RequirementsSummary({ trip }: { trip: Trip }) {
  const s = trip.specialRequirements ?? {};
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Item label="Dates">{trip.arrivalDate || trip.departureDate ? <span className="tw-num">{dateRange(trip.arrivalDate, trip.departureDate)}</span> : dash}</Item>
      <Item label="Guests">
        <span className="tw-num">
          {trip.party.adults} adult{trip.party.adults === 1 ? "" : "s"}
          {trip.party.children ? `, ${trip.party.children} child${trip.party.children === 1 ? "" : "ren"}` : ""} · {trip.party.rooms.length} room{trip.party.rooms.length === 1 ? "" : "s"}
        </span>
      </Item>
      <Item label="Budget">
        {trip.budgetAmountMinor === null ? (
          dash
        ) : (
          <span className="tw-num">
            {money(trip.budgetAmountMinor, trip.budgetCurrency)} <span className="text-xs text-muted-foreground">({BUDGET_SCOPE_LABELS[trip.budgetScope] ?? trip.budgetScope})</span>
          </span>
        )}
      </Item>
      <Item label="Preferred category">{trip.preferredHotelCategory ? titleCase(trip.preferredHotelCategory) : dash}</Item>
      <Item label="Minimum meal plan">{trip.preferredMealPlan ? MEAL_PLAN_LABELS[trip.preferredMealPlan as MealPlan] ?? trip.preferredMealPlan : dash}</Item>
      <Item label="Free cancellation">{s.requireFreeCancellation ? "Required" : "Not required"}</Item>
      <Item label="Required amenities">{s.requiredAmenities?.length ? s.requiredAmenities.join(", ") : dash}</Item>
      <Item label="Preferred amenities">{s.preferredAmenities?.length ? s.preferredAmenities.join(", ") : dash}</Item>
      <Item label="Max drive between stops">{s.maxLegDurationMinutes ? `${s.maxLegDurationMinutes} min` : dash}</Item>
      {s.accessibility?.length ? <Item label="Accessibility">{s.accessibility.join(", ")}</Item> : null}
      {s.other ? <Item label="Other">{s.other}</Item> : null}
    </dl>
  );
}

function Step({ n, icon: Icon, title, state, text, href, cta, disabled }: { n: number; icon: React.ComponentType<{ className?: string }>; title: string; state: "done" | "todo" | "current"; text: string; href: string; cta: string; disabled?: boolean }) {
  return (
    <li
      className={`tw-row-in tw-surface tw-lift group relative flex flex-col gap-3 overflow-hidden rounded-xl border p-5 ${state === "current" ? "border-accent/50 shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_8%,transparent)]" : "border-border"}`}
      style={{ "--i": n } as React.CSSProperties}
    >
      <span aria-hidden className={`absolute inset-x-0 top-0 h-px ${state === "done" ? "bg-success/60" : state === "current" ? "bg-accent" : "bg-transparent"}`} />
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden className={`tw-num text-5xl font-semibold leading-none tracking-[-0.08em] text-transparent [-webkit-text-stroke:1px_color-mix(in_oklab,var(--foreground)_22%,transparent)] ${state === "current" ? "[-webkit-text-stroke:1px_var(--accent)]" : ""}`}>
          {String(n).padStart(2, "0")}
        </span>
        <IconTile icon={Icon} tone={state === "done" ? "success" : state === "current" ? "accent" : "primary"} size="md" />
      </div>
      <div className="flex items-center gap-2">
        {state === "done" ? <CheckCircle2 className="size-4 text-success" aria-label="Done" /> : <Circle className={`size-4 ${state === "current" ? "text-accent" : "text-muted-foreground"}`} aria-label={state === "current" ? "Next step" : "To do"} />}
        <p className="text-base font-semibold tracking-[-0.03em]">{title}</p>
        {state === "current" ? <span className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">Next</span> : null}
      </div>
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
      {disabled ? (
        <Button size="sm" variant="outline" disabled className="self-start">
          {cta}
        </Button>
      ) : (
        <Button asChild size="sm" variant={state === "current" ? "default" : "outline"} className="group/btn self-start">
          <Link href={href}>
            {cta} <ArrowRight className="transition-transform duration-300 group-hover/btn:translate-x-0.5" />
          </Link>
        </Button>
      )}
    </li>
  );
}

function Overview({ detail }: { detail: TripDetail }) {
  const { trip, itinerary, latestJob, quotes } = detail;
  const can = useCan();
  const itineraryConfirmed = itinerary?.status === "confirmed";
  const jobDone = latestJob?.status === "succeeded";
  const base = `/trips/${trip.id}`;
  const firstTodo = !itinerary || !itineraryConfirmed ? 1 : !jobDone ? 2 : 3;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="steps-h">
        <h2 id="steps-h" className="tw-eyebrow mb-4">Next steps</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          <Step
            n={1}
            icon={Route}
            title="Itinerary"
            state={itineraryConfirmed ? "done" : firstTodo === 1 ? "current" : "todo"}
            text={!itinerary ? "No overnight stops yet. Build the itinerary from the extraction or by hand." : itineraryConfirmed ? `Confirmed: ${itinerary.stops.length} stop${itinerary.stops.length === 1 ? "" : "s"}.` : `A ${itinerary.status} itinerary with ${itinerary.stops.length} stop${itinerary.stops.length === 1 ? "" : "s"} is waiting for your review and confirmation.`}
            href={`${base}/itinerary`}
            cta={itinerary ? "Open itinerary" : "Build itinerary"}
          />
          <Step
            n={2}
            icon={Wand2}
            title="Optimise"
            state={jobDone ? "done" : firstTodo === 2 ? "current" : "todo"}
            text={latestJob ? `Latest run: ${titleCase(latestJob.status)} (${formatDateTime(latestJob.createdAt)}).` : "Generate hotel packages that satisfy the requirements."}
            href={`${base}/optimise`}
            cta="Configure and run"
            disabled={!can("optimisation:run") && !latestJob}
          />
          <Step n={3} icon={Layers} title="Packages" state={firstTodo === 3 ? "current" : "todo"} text={jobDone ? "Compare packages, adjust hotels and create a quotation." : "Available after a successful optimisation."} href={`${base}/packages`} cta="Compare packages" />
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center gap-3">
            <IconTile icon={ListChecks} tone="primary" size="sm" />
            <div>
              <CardTitle>Requirements</CardTitle>
              <CardDescription>Edit these under the Requirements tab.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <RequirementsSummary trip={trip} />
            {trip.description ? (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Notes / original enquiry</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{trip.description}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex-row items-center gap-3">
              <IconTile icon={Wand2} tone="accent" size="sm" />
              <CardTitle>Latest optimisation</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {latestJob ? (
                <>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={latestJob.status} />
                    <span className="text-muted-foreground">{formatDateTime(latestJob.createdAt)}</span>
                  </div>
                  {latestJob.status === "queued" || latestJob.status === "running" ? <p role="status">{stageLabel(latestJob.stage, latestJob.status)} ({latestJob.progress}%)</p> : null}
                  {latestJob.errorSummary ? <p className="text-destructive">{latestJob.errorSummary}</p> : null}
                  <Link className="font-semibold text-primary hover:underline" href={`${base}/optimise`}>
                    View runs
                  </Link>
                </>
              ) : (
                <p className="text-muted-foreground">No optimisation has been run.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center gap-3">
              <IconTile icon={Route} tone="info" size="sm" />
              <CardTitle>Itinerary</CardTitle>
            </CardHeader>
            <CardContent>
              {itinerary ? (
                <ol className="flex flex-col gap-1.5 text-sm">
                  {itinerary.stops.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span className="font-semibold">
                        {s.sequence}. {s.destination}
                      </span>
                      <span className="tw-num text-muted-foreground">
                        {formatDate(s.arrivalDate, { day: "numeric", month: "short" })} · {nightsLabel(s.nights)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No stops yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EditRequirements({ trip }: { trip: Trip }) {
  const qc = useQueryClient();
  const can = useCan();
  const [form, setForm] = React.useState<TripFormState>(() => tripToForm(trip));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [top, setTop] = React.useState<string | null>(null);
  const baseline = React.useRef(trip.updatedAt);
  React.useEffect(() => {
    if (trip.updatedAt !== baseline.current) {
      baseline.current = trip.updatedAt;
      setForm(tripToForm(trip));
    }
  }, [trip]);

  const save = useMutation({
    mutationFn: (payload: unknown) => apiPatch<Trip>(`/trips/${trip.id}`, payload),
    onSuccess: (t) => {
      baseline.current = t.updatedAt;
      qc.invalidateQueries({ queryKey: tripKeys.all });
      toast.success("Requirements saved");
      setErrors({});
      setTop(null);
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      setTop(errorMessage(e));
    },
  });

  if (!can("trips:write")) return <Alert tone="info">You can view but not edit this trip request.</Alert>;
  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setTop(null);
        const r = validateTripForm(form);
        if (!r.ok) {
          setErrors(r.errors);
          setTop("Some fields need attention. Fix the highlighted fields and save again.");
          return;
        }
        setErrors({});
        save.mutate(r.payload);
      }}
    >
      {top ? <Alert tone="danger">{top}</Alert> : null}
      <Alert tone="info">Changing dates or guests does not change an existing itinerary or packages. Re-check the itinerary and run the optimisation again afterwards.</Alert>
      <TripFormFields value={form} onChange={setForm} errors={errors} />
      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-border bg-background/95 px-1 py-3">
        <Button variant="outline" onClick={() => setForm(tripToForm(trip))} disabled={save.isPending}>
          Discard changes
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save requirements
        </Button>
      </div>
    </form>
  );
}

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
    <div className="flex items-end gap-2">
      <Field label="Set status" htmlFor="trip-status-set">
        <Select id="trip-status-set" value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
          {TRIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
      </Field>
      <Button variant="outline" disabled={status === trip.status} loading={save.isPending} onClick={() => save.mutate()}>
        Apply
      </Button>
    </div>
  );
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useTrip(id);

  if (q.isLoading) return <LoadingBlock label="Loading trip" />;
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return notFound ? <EmptyState icon={Map} title="Trip not found" description="It may belong to a different organisation or have been removed." action={<Button asChild variant="outline"><Link href="/trips">Back to trips</Link></Button>} /> : <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load this trip" />;
  }
  const d = q.data!;
  const { trip } = d;

  return (
    <div>
      <PageHeader
        eyebrow={<Link href="/trips" className="hover:underline">Trip requests</Link>}
        title={trip.title}
        icon={Map}
        image={IMAGES.hero}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={trip.status} />
            {trip.customerId ? <Link href={`/customers/${trip.customerId}`} className="font-semibold text-primary hover:underline">{trip.customerName ?? "Customer"}</Link> : <span>No customer</span>}
            <span className="tw-num">· {dateRange(trip.arrivalDate, trip.departureDate)}</span>
          </span>
        }
        actions={<StatusControl trip={trip} />}
      />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="parse">
            Enquiry extraction {trip.parseResult?.parsed?.clarifyingQuestions?.length ? <Badge tone="warning" className="ml-1">{trip.parseResult.parsed.clarifyingQuestions.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="quotes">Quotes ({d.quotes.length})</TabsTrigger>
          <TabsTrigger value="history">Status history</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview detail={d} />
        </TabsContent>
        <TabsContent value="requirements">
          <EditRequirements trip={trip} />
        </TabsContent>
        <TabsContent value="parse">
          <ParsePanel trip={trip} />
        </TabsContent>
        <TabsContent value="quotes">
          {d.quotes.length === 0 ? (
            <EmptyState title="No quotations yet" description="Create a quotation from a package once you have compared them." action={<Button asChild variant="outline"><Link href={`/trips/${trip.id}/packages`}>Go to packages</Link></Button>} />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {d.quotes.map((qt, i) => (
                <li key={qt.id} className="tw-row-in" style={{ "--i": i } as React.CSSProperties}>
                  <Card interactive className="relative flex h-full flex-wrap items-center justify-between gap-4 p-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <IconTile icon={FileText} tone="accent" size="md" />
                      <div className="min-w-0">
                        <Link href={`/quotes/${qt.id}`} className="font-display font-semibold tracking-[-0.03em] after:absolute after:inset-0 after:rounded-xl">
                          {qt.quoteNumber}
                        </Link>
                        <p className="tw-num text-xs text-muted-foreground">version {qt.currentVersion}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tw-num text-sm font-semibold">{money(qt.sellingPriceMinor, qt.currency)}</span>
                      <StatusBadge status={qt.status} />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="history">
          {d.statusHistory.length === 0 ? (
            <EmptyState title="No status changes recorded" />
          ) : (
            <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
              {d.statusHistory.map((h) => (
                <li key={h.id} className="text-sm">
                  <p>
                    {h.from_status ? (
                      <>
                        <StatusBadge status={h.from_status} /> <span aria-label="changed to">→</span>{" "}
                      </>
                    ) : (
                      "Created as "
                    )}
                    <StatusBadge status={h.to_status} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(h.created_at)}
                    {h.changed_by_name ? ` by ${h.changed_by_name}` : " by the system"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
