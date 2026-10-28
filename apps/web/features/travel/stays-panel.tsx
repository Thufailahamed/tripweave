"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BedDouble, Check, CheckCircle2, Clock, MapPin, Search, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Alert, Badge, EmptyState, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiPost, apiPut, errorMessage } from "@/lib/api";
import { tripKeys, useItineraryView, useJob, useJobs, usePackages, useTrip } from "@/features/trips/hooks";
import type { JobDetail, PackageView } from "@/features/trips/types";
import { dateRange, money, nightsLabel, titleCase } from "@/lib/utils";
import { travelKeys } from "./hooks";
import { packageStayEstimate } from "./lib";

function stayNights(pkg: PackageView): number {
  return pkg.package.selections.reduce((sum, selection) => sum + (selection.offer.nights || 0), 0);
}

function VerificationLine({ pkg }: { pkg: PackageView }) {
  if (pkg.package.selections.some((selection) => selection.offer.isMock)) return <Badge tone="danger">Illustrative</Badge>;
  if (pkg.verification?.allVerified) return <Badge tone="success">Prices checked</Badge>;
  if (pkg.package.unverified.length > 0) return <Badge tone="warning">Some details to confirm</Badge>;
  return <Badge tone="outline">Indicative</Badge>;
}

function StayCard({ pkg, tripId, budgetCurrency }: { pkg: PackageView; tripId: string; budgetCurrency: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = React.useState(false);
  const estimate = packageStayEstimate(pkg);
  const mismatch = !!estimate && estimate.currency !== budgetCurrency;
  const nights = stayNights(pkg);
  const perNight = pkg.pricing && nights > 0 ? Math.round(pkg.pricing.sellingPriceMinor / nights) : null;

  const addToBudget = async () => {
    if (!estimate) return;
    if (mismatch) {
      toast.error(`This stay is priced in ${estimate.currency}, but the trip budget is in ${budgetCurrency}.`);
      return;
    }
    setAdding(true);
    try {
      await apiPost(`/traveler/trips/${tripId}/budget`, { label: estimate.label, category: "stay", amountMinor: estimate.amountMinor, currency: estimate.currency });
      qc.invalidateQueries({ queryKey: travelKeys.budget(tripId) });
      toast.success("Stay estimate added to the budget");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAdding(false);
    }
  };

  return (
    <article className="tw-travel-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="tw-travel-eyebrow">Option {pkg.number}</p>
            <VerificationLine pkg={pkg} />
            {pkg.package.withinBudget === true ? <Badge tone="success">Within budget</Badge> : pkg.package.withinBudget === false ? <Badge tone="warning">Over budget</Badge> : null}
          </div>
          <h3 className="tw-travel-display mt-2 text-3xl leading-none tracking-[-0.03em]">{titleCase(pkg.objective)}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{pkg.package.selections.map((selection) => selection.destination).join(" → ")}</p>
        </div>
        <div className="text-right">
          <p className="tw-num text-2xl font-semibold">{pkg.pricing ? money(pkg.pricing.sellingPriceMinor, pkg.pricing.currency) : "Price unavailable"}</p>
          {perNight !== null ? <p className="text-[11px] text-muted-foreground">{money(perNight, pkg.pricing!.currency)} per night</p> : null}
          <p className="text-[11px] text-muted-foreground">{nightsLabel(nights)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {pkg.package.selections.map((selection) => (
          <div key={selection.stopId} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{selection.offer.property.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {selection.destination}</span>
                {selection.offer.property.reviewScore !== null ? <span>{selection.offer.property.reviewScore.toFixed(1)}/10</span> : null}
                <span>{selection.offer.roomType.name}</span>
                <span>{selection.offer.mealPlan}</span>
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground">{dateRange(selection.offer.stayStart, selection.offer.stayEnd)}</span>
          </div>
        ))}
      </div>

      {pkg.package.unverified.length > 0 ? (
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-warning"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {pkg.package.unverified.slice(0, 3).join(" · ")}</p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
        <Button size="sm" variant="outline" onClick={() => void addToBudget()} loading={adding} disabled={!estimate || mismatch}>
          <Wallet className="size-4" /> Add stay estimate
        </Button>
        <span className={`text-[11px] ${mismatch ? "text-warning" : "text-muted-foreground"}`}>{!estimate ? "No selling price to add" : mismatch ? `Priced in ${estimate.currency}; budget uses ${budgetCurrency}` : `Budget line in ${estimate.currency}`}</span>
      </div>
    </article>
  );
}

export function TravelStaysPanel() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const tripQuery = useTrip(id);
  const itineraryQuery = useItineraryView(id);
  const jobsQuery = useJobs(id);
  const packagesQuery = usePackages(id);
  const [activeJob, setActiveJob] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const jobQuery = useJob(activeJob);
  const previousStatus = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (activeJob) return;
    const latest = jobsQuery.data?.find((job) => job.status === "queued" || job.status === "running") ?? jobsQuery.data?.[0];
    if (latest) setActiveJob(latest.id);
  }, [activeJob, jobsQuery.data]);

  React.useEffect(() => {
    const status = jobQuery.data?.status;
    if (!status) return;
    const before = previousStatus.current;
    previousStatus.current = status;
    if (!before) return;
    if (before !== status && status !== "queued" && status !== "running") {
      qc.invalidateQueries({ queryKey: tripKeys.jobs(id) });
      qc.invalidateQueries({ queryKey: tripKeys.packages(id) });
      qc.invalidateQueries({ queryKey: tripKeys.detail(id) });
      if (status === "succeeded") toast.success("Stay options are ready");
    }
  }, [jobQuery.data?.status, id, qc]);

  if (tripQuery.isLoading || itineraryQuery.isLoading) return <LoadingBlock label="Loading your route" />;
  if (!tripQuery.data) return null;
  const trip = tripQuery.data.trip;
  const itinerary = itineraryQuery.data?.itinerary ?? null;
  const issues = itineraryQuery.data?.issues ?? [];
  const blocking = issues.filter((issue) => issue.severity === "error");
  const confirmed = itinerary?.status === "confirmed";
  const packages = packagesQuery.data?.packages ?? [];
  const job = jobQuery.data ?? null;
  const running = job?.status === "queued" || job?.status === "running";

  const confirmRoute = async () => {
    if (!itinerary) return;
    setConfirming(true);
    setError(null);
    try {
      await apiPut(`/trips/${id}/itinerary`, {
        title: itinerary.title,
        summary: itinerary.summary,
        confirm: true,
        stops: itinerary.stops.map((stop) => ({ id: stop.id, destination: stop.destination, latitude: stop.latitude, longitude: stop.longitude, arrivalDate: stop.arrivalDate, departureDate: stop.departureDate, activities: stop.activities, notes: stop.notes ?? null })),
      });
      qc.invalidateQueries({ queryKey: tripKeys.itinerary(id) });
      qc.invalidateQueries({ queryKey: tripKeys.detail(id) });
      toast.success("Route confirmed");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConfirming(false);
    }
  };

  const findStays = async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await apiPost<{ jobId: string }>(`/trips/${id}/optimisations`, {
        itineraryId: itinerary?.id,
        objectives: ["best_value", "budget_explorer"],
        constraints: {
          strictBudget: false,
          maxLegDurationMinutes: null,
          minimumCategory: null,
          requiredAmenities: trip.specialRequirements.requiredAmenities ?? [],
          preferredAmenities: trip.specialRequirements.preferredAmenities ?? [],
          requiredMealPlans: trip.specialRequirements.requiredMealPlans ?? [],
          requireFreeCancellation: !!trip.specialRequirements.requireFreeCancellation,
          requireConfirmedAvailability: false,
          allowUnconfirmedMealPlans: true,
          includeExternalProviders: true,
          includeMockProvider: false,
        },
        beamWidth: 25,
        candidateLimitPerStop: 12,
      }, { "Idempotency-Key": crypto.randomUUID() });
      setActiveJob(result.jobId);
      previousStatus.current = null;
      qc.invalidateQueries({ queryKey: tripKeys.jobs(id) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tw-travel-eyebrow">Stays</p>
          <h2 className="tw-travel-display mt-2 text-4xl leading-none tracking-[-0.04em]">Somewhere to come back to.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Stay ideas along the confirmed route. Prices come from the supplier or are labelled indicative; nothing here is a booking.</p>
        </div>
        {confirmed ? <Button onClick={() => void findStays()} loading={starting} disabled={running}><Search className="size-4" /> {packages.length > 0 ? "Search again" : "Find stay ideas"}</Button> : null}
      </header>

      {error ? <Alert tone="danger" title="Stay search">{error}</Alert> : null}

      {!itinerary ? (
        <EmptyState icon={MapPin} title="Build the route first" description="Stay search needs at least one stop with dates. Add your places, then come back." action={<Button asChild><Link href={`/travel/trips/${id}/itinerary`}>Open itinerary <ArrowRight className="size-4" /></Link></Button>} />
      ) : !confirmed ? (
        <section className="tw-travel-card flex flex-col gap-4 p-6 md:p-8">
          <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent"><Clock className="size-5" /></span>
          <h3 className="tw-travel-display text-3xl leading-none tracking-[-0.03em]">Confirm the route before we search.</h3>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">The search needs settled dates and stops. Your route is currently <strong>{itinerary.status}</strong>. Review it, then confirm when the days look right.</p>
          {blocking.length > 0 ? <Alert tone="warning" title="The route still has issues">{blocking.slice(0, 4).map((issue) => issue.message).join(" ")}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href={`/travel/trips/${id}/itinerary`}>Review itinerary</Link></Button>
            <Button onClick={() => void confirmRoute()} loading={confirming} disabled={blocking.length > 0}><Check className="size-4" /> Confirm route</Button>
          </div>
        </section>
      ) : (
        <>
          {job ? <JobStatus job={job} /> : null}
          {!job && !running && packages.length === 0 ? (
            <section className="tw-travel-card flex flex-col gap-4 p-6 md:p-8">
              <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent"><BedDouble className="size-5" /></span>
              <h3 className="tw-travel-display text-3xl leading-none tracking-[-0.03em]">No stay options yet.</h3>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">Run a search along the route. We look at the places that fit the party, dates and preferences, then compare the combinations.</p>
              <Button onClick={() => void findStays()} loading={starting} className="self-start"><Search className="size-4" /> Find stay ideas</Button>
            </section>
          ) : null}
          {packages.length > 0 ? (
            <div className="grid gap-5 xl:grid-cols-2">
              {packages.map((pkg) => <StayCard key={pkg.id} pkg={pkg} tripId={id} budgetCurrency={trip.budgetCurrency} />)}
            </div>
          ) : job?.status === "infeasible" ? (
            <Alert tone="warning" title="No stay matched every requirement">
              {job.result?.infeasible?.suggestions?.slice(0, 3).join(" ") ?? "Try widening the budget or relaxing a hotel preference, then search again."}
            </Alert>
          ) : job?.status === "failed" ? (
            <Alert tone="danger" title="The stay search did not finish">{job.errorSummary ?? "An unexpected error occurred. Try again in a moment."}</Alert>
          ) : null}
          <p className="text-xs leading-relaxed text-muted-foreground">Prices and availability are supplied by the hotel provider and may change. Nothing on this page reserves a room. The budget line is your own estimate, not a payment.</p>
        </>
      )}
    </div>
  );
}

function JobStatus({ job }: { job: JobDetail }) {
  const running = job.status === "queued" || job.status === "running";
  if (running) {
    return (
      <div className="tw-travel-card p-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-accent" /> {job.stage ? titleCase(job.stage) : job.status === "queued" ? "Waiting to start" : "Searching"}</p>
          <span className="tw-num text-muted-foreground">{job.progress}%</span>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress} aria-label="Stay search progress" className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.max(3, job.progress)}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">The search continues on the server. You can leave this page and come back.</p>
      </div>
    );
  }
  if (job.status === "succeeded") {
    return <Alert tone="success" title="Stay options ready"><span className="inline-flex items-center gap-1"><CheckCircle2 className="size-4" /> Compare the options below, then add an estimate to the budget if one fits.</span></Alert>;
  }
  return null;
}
