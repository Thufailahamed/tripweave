"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Layers, Wand2 } from "lucide-react";
import { OBJECTIVE_LABELS } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { useCan } from "@/lib/session";
import { cn, formatDateTime, money, titleCase } from "@/lib/utils";
import { PackageCard } from "@/features/trips/package-card";
import { InfeasibilityPanel, ProviderOutcomes } from "@/features/trips/job-results";
import { useJobs, usePackages, useTrip } from "@/features/trips/hooks";

export default function PackagesPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const [jobId, setJobId] = React.useState<string | null>(null);
  const trip = useTrip(id);
  const jobs = useJobs(id);
  const q = usePackages(id, jobId);

  const base = `/trips/${id}`;
  const tripTitle = trip.data?.trip.title ?? "Trip";

  const header = (
    <PageHeader
      eyebrow={<Link href={base} className="hover:underline">{tripTitle}</Link>}
      title="Package comparison"
      icon={Layers}
      description="Compare the hotel combinations generated for this itinerary. Prices come from the server; verification badges show how fresh each rate is."
      actions={
        can("optimisation:run") ? (
          <Button asChild variant="outline">
            <Link href={`${base}/optimise`}>
              <Wand2 /> New optimisation
            </Link>
          </Button>
        ) : null
      }
    />
  );

  if (q.isLoading) return <div>{header}<LoadingBlock label="Loading packages" /></div>;
  if (q.isError) return <div>{header}<ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load packages" /></div>;

  const { job, packages } = q.data!;
  const byId = new Map(packages.map((p) => [p.id, p]));
  const completedJobs = (jobs.data ?? []).filter((j) => j.status === "succeeded" || j.status === "infeasible");
  const currencyOf = (p: (typeof packages)[number]) => p.pricing?.currency ?? p.package.currency;

  return (
    <div>
      {header}
      {completedJobs.length > 1 ? (
        <div className="mb-4 max-w-sm">
          <Field label="Optimisation run" htmlFor="pk-job">
            <Select id="pk-job" value={jobId ?? job?.id ?? ""} onChange={(e) => setJobId(e.target.value)}>
              {completedJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {formatDateTime(j.createdAt)} · {titleCase(j.status)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

      {!job ? (
        <EmptyState icon={Layers} title="No packages yet" description="Confirm the itinerary, then run an optimisation to generate hotel packages." action={<div className="flex gap-2"><Button asChild variant="outline"><Link href={`${base}/itinerary`}>Itinerary</Link></Button>{can("optimisation:run") ? <Button asChild><Link href={`${base}/optimise`}>Optimise</Link></Button> : null}</div>} />
      ) : (
        <div className="flex flex-col gap-6">
          {job.status === "infeasible" || packages.length === 0 ? (
            <div className="flex flex-col gap-4">
              <Alert tone="warning" title="No feasible package was found for this run">
                No hotel combination satisfied every mandatory requirement. Relax a constraint and run again.
              </Alert>
              <InfeasibilityPanel infeasible={job.infeasible} funnel={job.funnel} currency={trip.data?.trip.budgetCurrency ?? "USD"} />
              <Button asChild className="self-start">
                <Link href={`${base}/optimise`}>Relax constraints and re-run</Link>
              </Button>
            </div>
          ) : (
            <>
              {job.warnings.length > 0 || job.notes.length > 0 || job.omittedObjectives.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {job.warnings.map((w) => (
                    <Alert key={w} tone="warning">{w}</Alert>
                  ))}
                  {job.notes.map((n) => (
                    <Alert key={n} tone="info">{n}</Alert>
                  ))}
                  {job.omittedObjectives.map((o) => (
                    <Alert key={o.objective} tone="info" title={`${OBJECTIVE_LABELS[o.objective]} not shown`}>{o.reason}</Alert>
                  ))}
                </div>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>At a glance</CardTitle>
                </CardHeader>
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <caption className="sr-only">Packages compared by price, budget difference and score</caption>
                    <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-2">Package</th>
                        <th scope="col" className="px-4 py-2 text-right">Selling price</th>
                        <th scope="col" className="px-4 py-2 text-right">Vs budget</th>
                        <th scope="col" className="px-4 py-2 text-right">Score</th>
                        <th scope="col" className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packages.map((p) => {
                        const d = p.package.budgetDifferenceMinor;
                        return (
                          <tr key={p.id} className="border-t border-border">
                            <th scope="row" className="px-4 py-2 text-left font-semibold">
                              <a href={`#pkgcard-${p.id}`} className="text-primary hover:underline">{OBJECTIVE_LABELS[p.objective]} #{p.number}</a>
                            </th>
                            <td className="tw-num px-4 py-2 text-right">{p.pricing ? money(p.pricing.sellingPriceMinor, currencyOf(p)) : "Unavailable"}</td>
                            <td className={cn("tw-num px-4 py-2 text-right font-semibold", d === null ? "text-muted-foreground" : d >= 0 ? "text-success" : "text-destructive")}>
                              {d === null ? "No budget" : d >= 0 ? `${money(d, p.package.currency)} under` : `${money(-d, p.package.currency)} over`}
                            </td>
                            <td className="tw-num px-4 py-2 text-right">{Math.round(p.package.score)}</td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-1">
                                {p.package.selections.some((s) => s.offer.isMock) ? <Badge tone="danger">Illustrative data</Badge> : null}
                                {p.parentId ? <Badge tone="accent">{p.manuallyModified ? "Modified" : "Re-priced"}</Badge> : null}
                                {!p.parentId ? <Badge tone="neutral">Generated</Badge> : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {packages.map((p) => {
                  const parent = p.parentId ? byId.get(p.parentId) : undefined;
                  return (
                    <div key={p.id} id={`pkgcard-${p.id}`} className="scroll-mt-20">
                      <PackageCard pkg={p} tripId={id} parentLabel={parent ? `${OBJECTIVE_LABELS[parent.objective]} #${parent.number}` : p.parentId ? "an earlier package" : null} />
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {job.providers.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Supplier results for this run</CardTitle>
              </CardHeader>
              <CardContent>
                <ProviderOutcomes providers={job.providers} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
