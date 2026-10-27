"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Layers, Play, Wand2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ALL_OBJECTIVES, HOTEL_CATEGORIES, MEAL_PLANS, MEAL_PLAN_LABELS, OBJECTIVE_LABELS, SUPPORTED_CURRENCIES, optimisationRequestSchema, type OptimisationObjective } from "@tripweave/shared";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, MoneyInput, Select, Switch } from "@/components/ui/form";
import { ApiError, apiGet, apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { cn, formatDateTime, mealLabel, money, titleCase } from "@/lib/utils";
import { stageLabel, tripKeys, useItineraryView, useJob, useJobs, useTrip } from "@/features/trips/hooks";
import { FunnelTable, InfeasibilityPanel, ProviderOutcomes } from "@/features/trips/job-results";
import { TagInput } from "@/features/trips/tag-input";
import { BUDGET_SCOPE_LABELS, type JobDetail } from "@/features/trips/types";

const OBJECTIVE_HELP: Record<OptimisationObjective, string> = {
  budget_explorer: "The cheapest combination that still meets every hard requirement. Price carries most of the weight.",
  best_value: "The best balance of quality, location and amenities for the price.",
  comfort_journey: "Favours well-rated, well-located hotels and shorter transfers over price.",
  premium_experience: "Favours the highest quality and amenities; price matters least.",
  company_preferred: "Favours preferred-partner and company-managed hotels, subject to your requirements.",
};

interface FormState {
  objectives: OptimisationObjective[];
  strictBudget: boolean;
  override: boolean;
  overrideMinor: number | null;
  overrideCurrency: string;
  maxLeg: string;
  minCategory: string;
  requiredAmenities: string[];
  preferredAmenities: string[];
  requiredMeals: string[];
  freeCancellation: boolean;
  confirmedOnly: boolean;
  allowUnconfirmedMeals: boolean;
  external: boolean;
  mock: boolean;
  beam: string;
  limit: string;
}

interface IntegrationsResponse {
  settings: { mockProvider: boolean; externalProviders: { hotelbeds: boolean; amadeus?: boolean } };
  platform: { mockProviderAllowed: boolean };
}

function Constraints({ job, currency }: { job: JobDetail; currency: string }) {
  const c = job.constraints as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) && v.length ? v.join(", ") : "none");
  const rows: [string, string][] = [
    ["Budget", typeof c.budgetMinor === "number" ? money(c.budgetMinor, currency) : "none applied"],
    ["Strict budget", c.strictBudget ? "Yes: over-budget packages are excluded" : "No: over-budget packages may appear"],
    ["Max drive between stops", typeof c.maxLegDurationMinutes === "number" ? `${c.maxLegDurationMinutes} min` : "no limit"],
    ["Minimum category", c.minimumCategory ? titleCase(String(c.minimumCategory)) : "none"],
    ["Required amenities", list(c.requiredAmenities)],
    ["Meal plans accepted", Array.isArray(c.requiredMealPlans) && c.requiredMealPlans.length ? (c.requiredMealPlans as string[]).map(mealLabel).join(", ") : "any"],
    ["Free cancellation", c.requireFreeCancellation ? "Required" : "Not required"],
    ["Confirmed availability", c.requireConfirmedAvailability ? "Required" : "Not required"],
    ["Unpublished meal plans", c.allowUnconfirmedMealPlans ? "Allowed (confirm before quoting)" : "Excluded when a meal plan is required"],
  ];
  return (
    <details className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold">Constraints this run used (trip requirements plus your choices)</summary>
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function JobPanel({ jobId, tripId, currency, onRelax, canRun }: { jobId: string; tripId: string; currency: string; onRelax: () => void; canRun: boolean }) {
  const qc = useQueryClient();
  const job = useJob(jobId);
  const status = job.data?.status;

  const prevStatus = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (status && prevStatus.current && prevStatus.current !== status && status !== "queued" && status !== "running") {
      qc.invalidateQueries({ queryKey: tripKeys.jobs(tripId) });
      qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      qc.invalidateQueries({ queryKey: ["trips", "packages", tripId] });
      if (status === "succeeded") toast.success("Packages are ready");
    }
    prevStatus.current = status;
  }, [status, qc, tripId]);

  const cancel = useMutation({
    mutationFn: () => apiPost(`/optimisations/${jobId}/cancel`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.job(jobId) });
      qc.invalidateQueries({ queryKey: tripKeys.jobs(tripId) });
      toast.success("Optimisation cancelled");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (job.isLoading) return <LoadingBlock label="Loading run" rows={2} />;
  if (job.isError) return <ErrorState error={job.error} onRetry={() => job.refetch()} title="Could not load this run" />;
  const j = job.data!;
  const running = j.status === "queued" || j.status === "running";
  const stopNames = new Map((j.result?.funnel ?? []).map((f) => [f.stopId, f.destination]));

  return (
    <Card aria-labelledby="run-h">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>
            <span id="run-h">Run from {formatDateTime(j.createdAt)}</span>
          </CardTitle>
          <CardDescription>Algorithm {j.algorithmVersion}{j.attempt > 1 ? ` · attempt ${j.attempt}` : ""}</CardDescription>
        </div>
        <StatusBadge status={j.status} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {running ? (
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <p role="status" aria-live="polite" className="font-semibold">
                {stageLabel(j.stage, j.status)}…
              </p>
              <span className="tw-num text-muted-foreground">{j.progress}%</span>
            </div>
            <div role="progressbar" aria-label="Optimisation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={j.progress} className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.max(3, j.progress)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">This page updates automatically. You can leave and come back; the run continues on the server.</p>
            {canRun ? (
              <Button className="mt-3" variant="outline" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel run
              </Button>
            ) : null}
          </div>
        ) : null}

        {j.status === "failed" ? (
          <Alert tone="danger" title="The optimisation failed">
            {j.errorSummary ?? "An unexpected error occurred."}
            {j.errorCode ? <span className="block text-xs opacity-80">Code: {j.errorCode}</span> : null}
            <Button size="sm" variant="outline" className="mt-2 bg-card" onClick={onRelax}>
              Adjust settings and try again
            </Button>
          </Alert>
        ) : null}
        {j.status === "cancelled" ? <Alert tone="info">This run was cancelled.</Alert> : null}

        {j.status === "succeeded" ? (
          <Alert tone="success" title="Packages generated">
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Button asChild size="sm">
                <Link href={`/trips/${tripId}/packages`}>
                  <Layers /> View and compare packages
                </Link>
              </Button>
              {j.result?.stats ? (
                <span className="tw-num text-xs">
                  {j.result.stats.combinationsEvaluated.toLocaleString()} combinations evaluated in {Math.round(j.result.stats.durationMs)} ms{j.result.stats.timedOut ? " (search timed out; results may be partial)" : ""}
                </span>
              ) : null}
            </div>
          </Alert>
        ) : null}

        {j.status === "infeasible" ? (
          <div className="flex flex-col gap-3">
            <Alert tone="warning" title="No feasible package">
              No combination of hotels satisfied every mandatory requirement, so nothing was generated.
            </Alert>
            <InfeasibilityPanel infeasible={j.result?.infeasible} funnel={j.result?.funnel} currency={currency} />
            <div>
              <Button onClick={onRelax}>Back to constraints to relax them</Button>
            </div>
          </div>
        ) : null}

        {(j.result?.omittedObjectives ?? []).map((o) => (
          <Alert key={o.objective} tone="info" title={`${OBJECTIVE_LABELS[o.objective]} was not produced`}>
            {o.reason}
          </Alert>
        ))}
        {(j.result?.warnings ?? []).map((w) => (
          <Alert key={w} tone="warning">
            {w}
          </Alert>
        ))}
        {(j.result?.notes ?? []).map((n) => (
          <Alert key={n} tone="info">
            {n}
          </Alert>
        ))}

        {j.status !== "queued" && j.status !== "running" ? <Constraints job={j} currency={currency} /> : null}

        {j.status === "succeeded" && (j.result?.funnel?.length ?? 0) > 0 ? (
          <details className="rounded-lg border border-border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold">Hotel funnel by stop</summary>
            <div className="mt-2">
              <FunnelTable funnel={j.result!.funnel!} />
            </div>
          </details>
        ) : null}

        {j.result?.providers ? (
          <section aria-label="Supplier results">
            <h4 className="mb-2 text-sm font-semibold">Supplier results{j.result.dropped ? ` (${j.result.dropped} invalid offer${j.result.dropped === 1 ? "" : "s"} discarded)` : ""}</h4>
            <ProviderOutcomes providers={j.result.providers} stopName={(id) => stopNames.get(id)} />
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function OptimisePage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const qc = useQueryClient();
  const trip = useTrip(id);
  const itin = useItineraryView(id);
  const jobs = useJobs(id);
  const integrations = useQuery({ queryKey: tripKeys.integrations, queryFn: () => apiGet<IntegrationsResponse>("/organization/integrations"), enabled: can("settings:integrations"), retry: false });
  const mockAllowed = !!integrations.data && integrations.data.settings.mockProvider && integrations.data.platform.mockProviderAllowed;

  const [form, setForm] = React.useState<FormState>({
    objectives: [...ALL_OBJECTIVES], strictBudget: true, override: false, overrideMinor: null, overrideCurrency: "USD", maxLeg: "", minCategory: "", requiredAmenities: [], preferredAmenities: [],
    requiredMeals: [], freeCancellation: false, confirmedOnly: false, allowUnconfirmedMeals: false, external: true, mock: false, beam: "25", limit: "12",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [topError, setTopError] = React.useState<string | null>(null);
  const [activeJob, setActiveJob] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLHeadingElement>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Show the latest run by default (and resume polling if it is still going).
  const firstJob = jobs.data?.[0]?.id ?? null;
  const picked = React.useRef(false);
  React.useEffect(() => {
    if (!picked.current && firstJob) {
      picked.current = true;
      setActiveJob(firstJob);
    }
  }, [firstJob]);
  const tripCurrency = trip.data?.trip.budgetCurrency;
  React.useEffect(() => {
    if (tripCurrency) setForm((f) => ({ ...f, overrideCurrency: tripCurrency }));
  }, [tripCurrency]);

  const start = useMutation({
    mutationFn: (body: unknown) => apiPost<{ jobId: string; status: string }>(`/trips/${id}/optimisations`, body, { "Idempotency-Key": crypto.randomUUID() }),
    onSuccess: (r) => {
      picked.current = true;
      setActiveJob(r.jobId);
      setTopError(null);
      qc.invalidateQueries({ queryKey: tripKeys.jobs(id) });
      qc.invalidateQueries({ queryKey: tripKeys.detail(id) });
      toast.success("Optimisation started");
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      setTopError(errorMessage(e));
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTopError(null);
    const body = {
      objectives: form.objectives,
      constraints: {
        strictBudget: form.strictBudget,
        ...(form.override && form.overrideMinor !== null ? { budgetAmountMinor: form.overrideMinor, budgetCurrency: form.overrideCurrency } : {}),
        maxLegDurationMinutes: form.maxLeg.trim() === "" ? null : Number(form.maxLeg),
        minimumCategory: form.minCategory || null,
        requiredAmenities: form.requiredAmenities,
        preferredAmenities: form.preferredAmenities,
        requiredMealPlans: form.requiredMeals,
        requireFreeCancellation: form.freeCancellation,
        requireConfirmedAvailability: form.confirmedOnly,
        allowUnconfirmedMealPlans: form.allowUnconfirmedMeals,
        includeExternalProviders: form.external,
        includeMockProvider: form.mock && mockAllowed,
      },
      beamWidth: Number(form.beam),
      candidateLimitPerStop: Number(form.limit),
    };
    if (form.override && form.overrideMinor === null) {
      setErrors({ "constraints.budgetAmountMinor": "Enter the budget amount to use, or turn the override off." });
      return;
    }
    const r = optimisationRequestSchema.safeParse(body);
    if (!r.success) {
      const errs: Record<string, string> = {};
      for (const i of r.error.issues) if (!(i.path.join(".") in errs)) errs[i.path.join(".")] = i.message;
      setErrors(errs);
      setTopError("Some settings need attention.");
      return;
    }
    setErrors({});
    start.mutate(r.data);
  };

  const relax = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    formRef.current?.focus();
  };

  const base = `/trips/${id}`;
  const header = (
    <PageHeader
      eyebrow={<Link href={base} className="hover:underline">{trip.data?.trip.title ?? "Trip"}</Link>}
      title="Generate packages"
      icon={Wand2}
      description="The optimiser searches hotels for every stop and builds combinations that respect your hard constraints. It never relaxes a hard constraint silently."
    />
  );

  if (trip.isLoading || itin.isLoading) return <div>{header}<LoadingBlock label="Loading trip" /></div>;
  if (trip.isError) return <div>{header}<ErrorState error={trip.error} onRetry={() => trip.refetch()} /></div>;
  const t = trip.data!.trip;
  const itinerary = itin.data?.itinerary ?? null;
  const s = t.specialRequirements ?? {};
  const running = jobs.data?.some((j) => j.status === "queued" || j.status === "running");
  const err = (k: string) => errors[k] ?? null;
  const toggleObjective = (o: OptimisationObjective) => set("objectives", form.objectives.includes(o) ? form.objectives.filter((x) => x !== o) : [...form.objectives, o]);
  const toggleMeal = (m: string) => set("requiredMeals", form.requiredMeals.includes(m) ? form.requiredMeals.filter((x) => x !== m) : [...form.requiredMeals, m]);

  return (
    <div>
      {header}
      {topError ? <Alert tone="danger" className="mb-4">{topError}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="flex flex-col gap-6 xl:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>What will be optimised</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {!itinerary ? (
                <Alert tone="warning" title="No itinerary yet">
                  Optimisation needs overnight stops. <Link className="font-semibold underline" href={`${base}/itinerary`}>Build the itinerary</Link> first.
                </Alert>
              ) : (
                <>
                  {itinerary.status !== "confirmed" ? (
                    <Alert tone="warning" title={`The itinerary is still a ${itinerary.status}`}>
                      Packages will be built on these stops. <Link className="font-semibold underline" href={`${base}/itinerary`}>Review and confirm it</Link> to be sure.
                    </Alert>
                  ) : null}
                  <ol className="flex flex-wrap gap-2">
                    {itinerary.stops.map((st) => (
                      <li key={st.id} className="rounded-full bg-muted px-3 py-1">
                        {st.sequence}. {st.destination} <span className="tw-num text-xs text-muted-foreground">({st.nights}n)</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Guests</dt>
                  <dd className="tw-num">{t.party.adults} adults, {t.party.children} children, {t.party.rooms.length} rooms</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Trip budget</dt>
                  <dd className="tw-num">{t.budgetAmountMinor === null ? "None" : `${money(t.budgetAmountMinor, t.budgetCurrency)} (${BUDGET_SCOPE_LABELS[t.budgetScope] ?? t.budgetScope})`}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Minimum meal plan</dt>
                  <dd>{t.preferredMealPlan ? `${mealLabel(t.preferredMealPlan)} or richer` : "None"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Trip requirements always applied</dt>
                  <dd>{[s.requiredAmenities?.length ? `amenities: ${s.requiredAmenities.join(", ")}` : null, s.requireFreeCancellation ? "free cancellation" : null, s.maxLegDurationMinutes ? `max drive ${s.maxLegDurationMinutes} min` : null].filter(Boolean).join("; ") || "None"}</dd>
                </div>
              </dl>
              {t.budgetAmountMinor !== null && t.budgetScope === "all_inclusive_trip" ? (
                <Alert tone="info">The budget covers the whole trip, so it is not used to limit hotels on its own. Use the budget override below if you want to cap the accommodation cost.</Alert>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Change these on the <Link className="font-semibold text-primary hover:underline" href={base}>trip page</Link>.
              </p>
            </CardContent>
          </Card>

          {can("optimisation:run") ? (
            <form onSubmit={submit} noValidate className="flex flex-col gap-6" aria-labelledby="opt-form-h">
              <h2 id="opt-form-h" ref={formRef} tabIndex={-1} className="font-display text-xl font-semibold outline-none">
                Objectives and constraints
              </h2>
              <Card>
                <CardHeader>
                  <CardTitle>Objectives</CardTitle>
                  <CardDescription>Each objective produces its own package, ranked by different priorities. Pick at least one.</CardDescription>
                </CardHeader>
                <CardContent>
                  <fieldset className="grid gap-2 sm:grid-cols-2">
                    <legend className="sr-only">Objectives</legend>
                    {ALL_OBJECTIVES.map((o) => (
                      <label key={o} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 focus-within:outline-2 focus-within:outline-ring", form.objectives.includes(o) ? "border-primary bg-primary-soft" : "border-input bg-card hover:bg-muted")}>
                        <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={form.objectives.includes(o)} onChange={() => toggleObjective(o)} />
                        <span>
                          <span className="block text-sm font-semibold">{OBJECTIVE_LABELS[o]}</span>
                          <span className="block text-xs text-muted-foreground">{OBJECTIVE_HELP[o]}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  {err("objectives") ? <p role="alert" className="mt-2 text-xs font-medium text-destructive">{err("objectives")}</p> : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Hard constraints</CardTitle>
                  <CardDescription>A hotel or package that breaks one of these is never produced. They are added to the trip requirements above.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div>
                    <Switch checked={form.strictBudget} onCheckedChange={(v) => set("strictBudget", v)} label="Strict budget" />
                    <p className="mt-1 text-xs text-muted-foreground">On: packages above the budget are excluded. Off: over-budget packages can appear, clearly marked as over budget.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Switch checked={form.override} onCheckedChange={(v) => set("override", v)} label="Override the budget for this run" />
                    {form.override ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Accommodation budget" htmlFor="o-budget" error={err("constraints.budgetAmountMinor")} hint="Compared with the accommodation selling price.">
                          <MoneyInput id="o-budget" valueMinor={form.overrideMinor} onMinorChange={(v) => set("overrideMinor", v)} currency={form.overrideCurrency} invalid={!!err("constraints.budgetAmountMinor")} />
                        </Field>
                        <Field label="Currency" htmlFor="o-cur">
                          <Select id="o-cur" value={form.overrideCurrency} onChange={(e) => set("overrideCurrency", e.target.value)}>
                            {SUPPORTED_CURRENCIES.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Max drive between stops (minutes)" htmlFor="o-leg" error={err("constraints.maxLegDurationMinutes")} hint="Blank uses the trip's limit, if any.">
                      <Input id="o-leg" type="number" min={15} max={1440} step={15} value={form.maxLeg} onChange={(e) => set("maxLeg", e.target.value)} />
                    </Field>
                    <Field label="Minimum hotel category" htmlFor="o-cat" error={err("constraints.minimumCategory")}>
                      <Select id="o-cat" value={form.minCategory} onChange={(e) => set("minCategory", e.target.value)}>
                        <option value="">No minimum</option>
                        {HOTEL_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {titleCase(c)} or above
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Additional required amenities" htmlFor="o-req" error={err("constraints.requiredAmenities")} hint="Added to the trip's own required amenities.">
                    <TagInput id="o-req" label="Additional required amenities" value={form.requiredAmenities} onChange={(v) => set("requiredAmenities", v)} placeholder="e.g. pool" />
                  </Field>
                  <Field label="Preferred amenities" htmlFor="o-pref" hint="Improve the score; never exclude a hotel.">
                    <TagInput id="o-pref" label="Preferred amenities" value={form.preferredAmenities} onChange={(v) => set("preferredAmenities", v)} placeholder="e.g. spa" />
                  </Field>
                  <fieldset>
                    <legend className="mb-1 text-xs font-medium text-muted-foreground">Accepted meal plans</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {MEAL_PLANS.map((m) => (
                        <Checkbox key={m} label={`${MEAL_PLAN_LABELS[m]} (${m})`} checked={form.requiredMeals.includes(m)} onChange={() => toggleMeal(m)} />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Leave all unticked to use the trip's minimum meal plan{t.preferredMealPlan ? ` (${mealLabel(t.preferredMealPlan)} or richer)` : " (none set, so any plan is accepted)"}. Ticking plans here replaces that minimum.</p>
                  </fieldset>
                  <div className="flex flex-col gap-3">
                    <Switch checked={form.freeCancellation} onCheckedChange={(v) => set("freeCancellation", v)} label="Require free cancellation" />
                    <Switch checked={form.confirmedOnly} onCheckedChange={(v) => set("confirmedOnly", v)} label="Require confirmed availability" />
                    <div>
                      <Switch checked={form.allowUnconfirmedMeals} onCheckedChange={(v) => set("allowUnconfirmedMeals", v)} label="Include hotels with an unpublished meal plan" />
                      <p className="mt-1 text-xs text-muted-foreground">When a meal plan is required, discovery and aggregator listings that do not publish a board basis are excluded. Allow them to see every property found; each package then states that the meal plan must be confirmed before quoting.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Rate sources</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div>
                    <Switch checked={form.external} onCheckedChange={(v) => set("external", v)} label="Include external providers" />
                    <p className="mt-1 text-xs text-muted-foreground">Your own contracted rates are always searched. External suppliers are used only if your organisation has enabled them.</p>
                  </div>
                  <div>
                    <Switch checked={form.mock && mockAllowed} onCheckedChange={(v) => set("mock", v)} disabled={!mockAllowed} label="Include illustrative (mock) provider" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Mock data is illustrative only and can never be quoted. {mockAllowed ? "Use it to try the workflow without real suppliers." : integrations.isLoading ? "Checking whether your organisation allows it…" : "It is off because your organisation's integration settings do not allow it, or your role cannot view those settings."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <details className="rounded-lg border border-border bg-card px-5 py-3">
                <summary className="cursor-pointer text-sm font-semibold">Advanced</summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Beam width" htmlFor="o-beam" error={err("beamWidth")} hint="How many partial combinations are kept while searching (1 to 200). Higher is slower and more thorough.">
                    <Input id="o-beam" type="number" min={1} max={200} value={form.beam} onChange={(e) => set("beam", e.target.value)} />
                  </Field>
                  <Field label="Candidates per stop" htmlFor="o-limit" error={err("candidateLimitPerStop")} hint="Hotels considered per stop (1 to 100).">
                    <Input id="o-limit" type="number" min={1} max={100} value={form.limit} onChange={(e) => set("limit", e.target.value)} />
                  </Field>
                </div>
              </details>

              <div className="flex flex-wrap items-center justify-end gap-3">
                {running ? <p className="text-xs text-muted-foreground">A run is already in progress; starting another creates a separate run.</p> : null}
                <Button type="submit" size="lg" loading={start.isPending} disabled={!itinerary}>
                  <Play /> Generate packages
                </Button>
              </div>
            </form>
          ) : (
            <Alert tone="info">Your role cannot start optimisations. You can still view past runs and packages.</Alert>
          )}
        </div>

        <div className="flex flex-col gap-6 xl:col-span-2">
          {activeJob ? <JobPanel key={activeJob} jobId={activeJob} tripId={id} currency={form.override ? form.overrideCurrency : t.budgetCurrency} onRelax={relax} canRun={can("optimisation:run")} /> : null}

          <Card>
            <CardHeader>
              <CardTitle>Run history</CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.isLoading ? (
                <LoadingBlock label="Loading runs" rows={2} />
              ) : jobs.isError ? (
                <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />
              ) : jobs.data!.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet. Your first run will appear here.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {jobs.data!.map((j) => (
                    <li key={j.id}>
                      <button type="button" onClick={() => setActiveJob(j.id)} aria-current={j.id === activeJob} className={cn("flex w-full flex-col gap-1 rounded-lg border p-3 text-left hover:bg-muted/50", j.id === activeJob ? "border-primary bg-primary-soft/40" : "border-border")}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="tw-num text-sm font-semibold">{formatDateTime(j.createdAt)}</span>
                          <StatusBadge status={j.status} />
                        </span>
                        {j.status === "failed" && j.errorSummary ? (
                          <span className="flex items-start gap-1 text-xs text-destructive">
                            <XCircle className="mt-0.5 size-3 shrink-0" /> {j.errorSummary}
                          </span>
                        ) : j.status === "succeeded" ? (
                          <span className="flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="size-3" /> Packages generated
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{stageLabel(j.stage, j.status)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {jobs.data?.some((j) => j.status === "succeeded") ? (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={`${base}/packages`}>Open packages</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
