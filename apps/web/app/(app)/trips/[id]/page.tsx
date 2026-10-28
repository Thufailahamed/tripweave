"use client";
import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Circle, Layers, Map, Route, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, Badge, EmptyState, ErrorState, IconTile, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { SectionHeading } from "@/features/trips/dossier";
import { OptimisationCard, RequirementsBrief, RouteCard } from "@/features/trips/trip-brief";
import { QuotesShelf, StatusTimeline } from "@/features/trips/trip-records";
import { TripCover } from "@/features/trips/trip-cover";
import { ApiError, apiPatch, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDateTime, titleCase } from "@/lib/utils";
import { tripKeys, useTrip } from "@/features/trips/hooks";
import { ParsePanel } from "@/features/trips/parse-panel";
import { RequirementsGlance, tripToForm, TripFormFields, validateTripForm, type TripFormState } from "@/features/trips/trip-form";
import type { Trip, TripDetail } from "@/features/trips/types";

const PlanningPanel = dynamic(() => import("@/features/planning/planning-panel").then((module) => module.PlanningPanel), {
  ssr: false,
  loading: () => <LoadingBlock label="Loading AI planner" />,
});

function Step({ n, icon: Icon, title, state, text, href, cta, disabled }: { n: number; icon: React.ComponentType<{ className?: string }>; title: string; state: "done" | "todo" | "current"; text: string; href: string; cta: string; disabled?: boolean }) {
  return (
    <li
      className={`tw-row-in tw-surface tw-lift group relative flex flex-col gap-3 overflow-hidden rounded-xl border p-5 ${state === "current" ? "border-accent/50 shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_8%,transparent)]" : "border-border"}`}
      style={{ "--i": n } as React.CSSProperties}
    >
      <span aria-hidden className={`absolute inset-x-0 top-0 h-px ${state === "done" ? "bg-success/60" : state === "current" ? "bg-accent" : "bg-transparent"}`} />
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden className={`tw-trip-display tw-num text-6xl leading-none tracking-[-0.04em] text-transparent [-webkit-text-stroke:1px_color-mix(in_oklab,var(--foreground)_22%,transparent)] ${state === "current" ? "[-webkit-text-stroke:1px_var(--accent)]" : ""}`}>
          {String(n).padStart(2, "0")}
        </span>
        <IconTile icon={Icon} tone={state === "done" ? "success" : state === "current" ? "accent" : "primary"} size="md" />
      </div>
      <div className="flex items-center gap-2">
        {state === "done" ? <CheckCircle2 className="size-4 text-success" aria-label="Done" /> : <Circle className={`size-4 ${state === "current" ? "text-accent" : "text-muted-foreground"}`} aria-label={state === "current" ? "Next step" : "To do"} />}
        <p className="tw-trip-display text-[1.45rem] leading-none">{title}</p>
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

function Overview({ detail, onEditRequirements }: { detail: TripDetail; onEditRequirements: () => void }) {
  const { trip, itinerary, latestJob, quotes } = detail;
  const can = useCan();
  const itineraryConfirmed = itinerary?.status === "confirmed";
  const jobDone = latestJob?.status === "succeeded";
  const base = `/trips/${trip.id}`;
  const firstTodo = !itinerary || !itineraryConfirmed ? 1 : !jobDone ? 2 : 3;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="steps-h">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 id="steps-h" className="tw-trip-display text-[2rem] leading-none">
            Next steps
          </h2>
          <p className="text-[11px] text-muted-foreground">The shortest path from enquiry to quotation</p>
        </div>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <RequirementsBrief trip={trip} onEdit={onEditRequirements} />
        <div className="flex flex-col gap-4 lg:pt-[52px]">
          <RouteCard tripId={trip.id} itinerary={itinerary} />
          <OptimisationCard tripId={trip.id} job={latestJob} />
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
  const dirty = JSON.stringify(form) !== JSON.stringify(tripToForm(trip));
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <RequirementsGlance
        form={form}
        note={
          <>
            {dirty ? <span className="tw-hand block text-[1.15rem]">remember to save</span> : null}
            Changing dates or guests does not change an existing itinerary or packages. Re-check the itinerary and run the optimisation again afterwards.
          </>
        }
      />
    <form
      noValidate
      className="flex min-w-0 flex-col gap-6"
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
      <SectionHeading title="Requirements" note="what the optimiser works from" />
      {top ? <Alert tone="danger">{top}</Alert> : null}
      <TripFormFields value={form} onChange={setForm} errors={errors} />
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-[0_18px_40px_-24px_rgba(40,32,20,0.55)] backdrop-blur">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {dirty ? <span className="tw-hand text-[1.15rem]">unsaved changes</span> : "All changes saved"}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setForm(tripToForm(trip))} disabled={save.isPending || !dirty}>
            Discard changes
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save requirements
          </Button>
        </div>
      </div>
    </form>
    </div>
  );
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useTrip(id);
  const [tab, setTab] = React.useState("overview");
  const tabsRef = React.useRef<HTMLDivElement | null>(null);

  if (q.isLoading) return <LoadingBlock label="Loading trip" />;
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return notFound ? <EmptyState icon={Map} title="Trip not found" description="It may belong to a different organisation or have been removed." action={<Button asChild variant="outline"><Link href="/trips">Back to trips</Link></Button>} /> : <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load this trip" />;
  }
  const d = q.data!;
  const { trip } = d;
  const showRequirements = () => {
    setTab("requirements");
    requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  return (
    <div className="tw-trip p-3 sm:p-5 lg:p-7">
      <TripCover trip={trip} itinerary={d.itinerary} quoteCount={d.quotes.length} />
      <Tabs ref={tabsRef} value={tab} onValueChange={setTab} className="mt-7 scroll-mt-20">
        <TabsList className="mb-6 w-full justify-start gap-0 overflow-x-auto rounded-none border-x-0 border-t-0 border-b border-border bg-transparent p-0">
          <TabsTrigger className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-[13px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground sm:px-4" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-[13px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground sm:px-4" value="requirements">Requirements</TabsTrigger>
          <TabsTrigger className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-[13px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground sm:px-4" value="parse">
            Enquiry extraction {trip.parseResult?.parsed?.clarifyingQuestions?.length ? <Badge tone="warning" className="ml-1">{trip.parseResult.parsed.clarifyingQuestions.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-[13px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground sm:px-4" value="planning">AI planner</TabsTrigger>
          <TabsTrigger className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-[13px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground sm:px-4" value="quotes">Quotes ({d.quotes.length})</TabsTrigger>
          <TabsTrigger className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-[13px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground sm:px-4" value="history">Status history</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview detail={d} onEditRequirements={showRequirements} />
        </TabsContent>
        <TabsContent value="requirements">
          <EditRequirements trip={trip} />
        </TabsContent>
        <TabsContent value="parse">
          <ParsePanel trip={trip} />
        </TabsContent>
        <TabsContent value="planning">
          <PlanningPanel tripId={trip.id} />
        </TabsContent>
        <TabsContent value="quotes">
          <QuotesShelf tripId={trip.id} quotes={d.quotes} />
        </TabsContent>
        <TabsContent value="history">
          <StatusTimeline history={d.statusHistory} currentStatus={trip.status} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
