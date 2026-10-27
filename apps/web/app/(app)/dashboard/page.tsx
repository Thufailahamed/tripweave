"use client";
import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, CheckCircle2, FilePen, Inbox, Map as MapIcon, Plus, Send, ShieldCheck, TrendingUp, XCircle } from "lucide-react";
import { Alert, Card, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, Skeleton, Stat, StatGrid, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { apiGet } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import { percentFromBp, relativeTime } from "@/lib/utils";
import { TripHero, type UpcomingTrip } from "@/features/dashboard/trip-hero";
import { ActivityTimeline, ArrivalsTable, MonthCalendar, PipelineBubbles, TripFacts, TripPipeline, type ActivityItem } from "@/features/dashboard/widgets";
import { useTrip } from "@/features/trips/hooks";

const ItineraryMap = dynamic(() => import("@/features/trips/itinerary-map"), { ssr: false, loading: () => <Skeleton className="size-full rounded-none" /> });

interface DashboardData {
  totals: { enquiries: number; quotesInProgress: number; quotesSent: number; accepted: number; rejected: number; conversionBp: number };
  tripsByStatus: Record<string, number>;
  quotesByStatus: Record<string, number>;
  upcomingTrips: UpcomingTrip[];
  recentActivity: ActivityItem[];
  warnings: { kind: string; message: string; link?: string }[];
  jobsNeedingAttention: { id: string; tripRequestId: string; status: string; errorSummary: string | null; createdAt: string }[];
}

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Panel title row shared by the dashboard cards. */
function PanelTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.05em]">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Everything that depends on the trip currently shown in the hero (one detail fetch, shared). */
function SelectedTrip({ trips, index, onIndex, canCreate, children }: { trips: UpcomingTrip[]; index: number; onIndex: (i: number) => void; canCreate: boolean; children: (parts: { hero: React.ReactNode; facts: React.ReactNode; map: React.ReactNode }) => React.ReactNode }) {
  const trip = trips[index];
  const detail = useTrip(trip?.id ?? "", { enabled: !!trip });
  const d = trip ? detail.data : undefined;
  const loading = !!trip && detail.isLoading;
  const stops = (d?.itinerary?.stops ?? []).map((s) => ({ key: s.id, destination: s.destination, latitude: s.latitude, longitude: s.longitude }));
  return (
    <>
      {children({
        hero: <TripHero trips={trips} index={index} onIndex={onIndex} detail={d} loading={loading} canCreate={canCreate} />,
        facts: trip ? <TripFacts trip={trip} detail={d} loading={loading} /> : null,
        map: trip ? (
          <div className="relative size-full">
            {stops.length > 0 ? <ItineraryMap key={trip.id} stops={stops} compact /> : <div className="flex size-full items-center justify-center p-6 text-center text-xs text-muted-foreground">{loading ? "Loading route…" : "No itinerary stops to map yet."}</div>}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[450] bg-gradient-to-t from-card via-card/80 to-transparent p-4 pt-10">
              <p className="text-xs text-muted-foreground">Route</p>
              <p className="truncate text-sm font-semibold tracking-[-0.03em]">{stops.length ? stops.map((s) => s.destination).join(" → ") : trip.title}</p>
            </div>
          </div>
        ) : null,
      })}
    </>
  );
}

export default function DashboardPage() {
  const can = useCan();
  const { data: session } = useSession();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<DashboardData>("/dashboard"), refetchInterval: 60_000 });
  const [index, setIndex] = React.useState(0);

  const org = session?.organization?.name;
  const firstName = session?.user.displayName.split(" ")[0] ?? "";
  const now = new Date();
  const header = (
    <PageHeader
      eyebrow={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(now)}
      title={`${greeting(now)}${firstName ? `, ${firstName}` : ""}`}
      description={org ? `Where ${org} stands today: arrivals, quotations and anything that needs attention.` : undefined}
      actions={
        can("trips:write") ? (
          <Button asChild>
            <Link href="/trips/new">
              <Plus /> New trip request
            </Link>
          </Button>
        ) : undefined
      }
    />
  );
  if (q.isLoading) return <div>{header}<LoadingBlock rows={6} label="Loading dashboard" /></div>;
  if (q.error) return <div>{header}<ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load the dashboard" /></div>;
  const d = q.data;
  if (!d) return null;

  const nothingYet = d.totals.enquiries === 0 && Object.values(d.quotesByStatus).every((n) => n === 0);
  const trips = d.upcomingTrips;
  const selected = Math.min(index, Math.max(0, trips.length - 1));

  return (
    <div>
      {header}

      {d.warnings.length > 0 ? (
        <section aria-label="Warnings" className="mb-8 flex flex-col gap-2">
          {d.warnings.map((w, i) => (
            <Alert key={`${w.kind}-${i}`} tone="warning">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>{w.message}</span>
                {w.link ? (
                  <Link href={w.link} className="font-semibold underline">
                    Review
                  </Link>
                ) : null}
              </span>
            </Alert>
          ))}
        </section>
      ) : null}

      {nothingYet ? (
        <EmptyState
          icon={MapIcon}
          title="Create your first trip request"
          description="Capture a tourist enquiry, let TripWeave build optimised hotel packages from your rates, then turn the best one into a client-ready quotation. Your numbers appear here as soon as you do."
          action={
            can("trips:write") ? (
              <Button asChild>
                <Link href="/trips/new">Create your first trip request</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Ask a teammate with edit rights to add the first one.</p>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_330px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* main column */}
          <SelectedTrip trips={trips} index={selected} onIndex={setIndex} canCreate={can("trips:write")}>
            {({ hero, facts, map }) => (
              <div className="flex min-w-0 flex-col gap-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <Reveal>{hero}</Reveal>
                  <Reveal delay={120} className="tw-surface rounded-2xl border border-border p-5">
                    <PipelineBubbles quotesByStatus={d.quotesByStatus} />
                  </Reveal>
                </div>

                {facts ? <section aria-label="Trip at a glance" className="grid grid-cols-1 gap-4 sm:grid-cols-3">{facts}</section> : null}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
                  {map ? (
                    <Reveal variant="clip" className="tw-surface relative h-[300px] overflow-hidden rounded-2xl border border-border lg:h-auto lg:min-h-[340px]">
                      {map}
                    </Reveal>
                  ) : null}
                  <Reveal delay={100} className={map ? "" : "lg:col-span-2"}>
                    <Card className="h-full rounded-2xl">
                      <PanelTitle
                        title="Upcoming arrivals"
                        description="Pick a trip to see it above."
                        action={
                          can("trips:read") ? (
                            <Link href="/trips" className="group inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground">
                              All trips <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                            </Link>
                          ) : undefined
                        }
                      />
                      <div className="mt-2">
                        <ArrivalsTable trips={trips} selected={selected} onSelect={setIndex} />
                      </div>
                    </Card>
                  </Reveal>
                </div>

                <Reveal as="section" aria-label="Trip pipeline" className="tw-surface rounded-2xl border border-border p-6">
                  <div className="mb-5 flex items-baseline justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold tracking-[-0.05em]">Trip pipeline</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">Where every enquiry sits right now.</p>
                    </div>
                    <span className="tw-num text-xs text-muted-foreground">{d.totals.enquiries} enquiries</span>
                  </div>
                  <TripPipeline tripsByStatus={d.tripsByStatus} />
                </Reveal>

                <Reveal as="section" aria-label="Performance">
                  <h2 className="tw-eyebrow mb-4">Performance</h2>
                  <StatGrid className="grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
                    <Stat bare icon={Inbox} iconTone="info" label="Enquiries" value={d.totals.enquiries} hint="Trip requests, all time" />
                    <Stat bare icon={FilePen} iconTone="primary" label="Quotes in progress" value={d.totals.quotesInProgress} hint="Draft, preparing, in review" />
                    <Stat bare icon={Send} iconTone="accent" label="Quotes sent" value={d.totals.quotesSent} hint="Awaiting a client response" />
                    <Stat bare icon={CheckCircle2} iconTone="success" label="Accepted" value={d.totals.accepted} tone="success" hint="Won by the client" />
                    <Stat bare icon={XCircle} iconTone="danger" label="Rejected" value={d.totals.rejected} hint="Declined by the client" />
                    <Stat
                      bare
                      icon={TrendingUp}
                      iconTone="warning"
                      label="Conversion"
                      value={percentFromBp(d.totals.conversionBp)}
                      hint={
                        <span className="flex flex-col gap-2">
                          <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-border">
                            <span className="tw-bar-grow block h-1 rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, d.totals.conversionBp / 100))}%` }} />
                          </span>
                          Accepted of all issued quotes
                        </span>
                      }
                    />
                  </StatGrid>
                </Reveal>
              </div>
            )}
          </SelectedTrip>

          {/* timeline rail */}
          <aside aria-label="Calendar and activity" className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
            <Reveal delay={160} className="tw-surface rounded-2xl border border-border p-5">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold tracking-[-0.06em]">Timeline</h2>
                {can("trips:write") ? (
                  <Button asChild size="sm">
                    <Link href="/trips/new">
                      Add trip <Plus />
                    </Link>
                  </Button>
                ) : null}
              </div>
              <MonthCalendar trips={trips} selected={selected} onSelect={setIndex} />
            </Reveal>

            {d.jobsNeedingAttention.length > 0 ? (
              <Reveal delay={200}>
                <Card className="rounded-2xl border-warning/30">
                  <CardHeader className="flex-row items-center gap-3">
                    <AlertTriangle className="size-4 text-warning" aria-hidden />
                    <div>
                      <CardTitle>Needs attention</CardTitle>
                      <CardDescription>Optimisations that failed or found no feasible plan.</CardDescription>
                    </div>
                  </CardHeader>
                  <ul>
                    {d.jobsNeedingAttention.map((j) => (
                      <li key={j.id} className="border-t border-border first:border-t-0">
                        <Link href={`/trips/${j.tripRequestId}`} className="flex items-center justify-between gap-2 px-6 py-3 transition-colors hover:bg-primary-soft/40">
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{j.errorSummary ?? "No details were recorded for this job."}</span>
                            <span className="block text-xs text-muted-foreground">{relativeTime(j.createdAt)}</span>
                          </span>
                          <StatusBadge status={j.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </Reveal>
            ) : (
              <Reveal delay={200} className="flex items-center gap-3 rounded-2xl border border-success/25 bg-success-soft/60 px-4 py-3 text-sm">
                <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
                <span className="text-foreground/80">All optimisations healthy. Nothing needs attention.</span>
              </Reveal>
            )}

            <Reveal delay={240} className="tw-surface rounded-2xl border border-border p-5">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-base font-semibold tracking-[-0.03em]">Activity</h2>
                <span className="text-xs text-muted-foreground">Latest changes</span>
              </div>
              <ActivityTimeline items={d.recentActivity} />
            </Reveal>
          </aside>
        </div>
      )}
    </div>
  );
}
