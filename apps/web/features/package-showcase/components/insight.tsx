"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { ArrowUpRight, Car, CircleHelp, ListChecks } from "lucide-react";
import { PACKAGE_PROP_SCHEMAS, packageShowcaseDescriptions, type PackageShowcaseAction } from "@tripweave/planning-contract";
import { Alert, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { minutesLabel } from "@/lib/utils";
import { routeSourceLabel } from "@/features/trips/types";
import { resolveShowcasePackage } from "../helpers";
import { usePackageShowcase } from "../context";
import { BREAKDOWN_LABELS, MissingEntity, ScoreBar, useHostAction } from "./shared";

export const PackageInsight = defineComponent({
  name: "PackageInsight",
  description: packageShowcaseDescriptions.PackageInsight,
  props: PACKAGE_PROP_SCHEMAS.PackageInsight,
  component: function PackageInsightView({ props }) {
    const { snapshot } = usePackageShowcase();
    const pkg = resolveShowcasePackage(snapshot, props.packageId);
    if (!pkg) return <MissingEntity what="package" />;
    const body = pkg.package;
    const stopName = (stopId: string) => body.selections.find((selection) => selection.stopId === stopId)?.destination ?? "Stop";
    const legs = body.travel.legs;

    return (
      <section aria-label="Why this package" className="grid min-w-0 gap-5 rounded-2xl border border-border/80 bg-card p-5 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <ListChecks className="size-4 text-accent" aria-hidden /> Why this package
          </h3>
          {body.explanation.length > 0 ? (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
              {body.explanation.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">The optimiser gave no reasons for this package.</p>
          )}
          {body.diversityNote ? <p className="text-xs text-muted-foreground">{body.diversityNote}</p> : null}
          <div className="flex flex-col gap-2">
            {BREAKDOWN_LABELS.map((item) => (
              <ScoreBar key={item.key} label={item.label} value={body.breakdown[item.key]} />
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Car className="size-4 text-accent" aria-hidden /> Travel between stops
            </h3>
            {legs.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Single stop, so there is no travel between hotels.</p>
            ) : (
              <>
                <p className="tw-num mt-1 flex flex-wrap items-center gap-2 text-sm">
                  {body.travel.totalDriveMinutes === null ? "Total drive time unavailable" : `Total ${minutesLabel(body.travel.totalDriveMinutes)} driving`}
                  {body.travel.anyEstimated ? <Badge tone="warning">Estimated</Badge> : null}
                  {body.travel.anyUnavailable ? <Badge tone="danger">Some legs unavailable</Badge> : null}
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                  {legs.map((leg, index) => (
                    <li key={index} className="tw-num">
                      {stopName(leg.fromStopId)} → {stopName(leg.toStopId)}: {leg.durationMinutes === null ? "time unavailable" : minutesLabel(leg.durationMinutes)}
                      {leg.distanceKm !== null ? `, ${leg.distanceKm} km` : ""} ({routeSourceLabel(leg.source).toLowerCase()})
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {body.assumptions.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Assumptions</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                {body.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {body.unverified.length > 0 ? (
            <Alert tone="warning" title="Not yet verified">
              <ul className="list-disc pl-4">
                {body.unverified.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CircleHelp className="size-3.5" aria-hidden /> Nothing in this package is marked unverified.
            </p>
          )}
        </div>
      </section>
    );
  },
});

export const NextSteps = defineComponent({
  name: "NextSteps",
  description: packageShowcaseDescriptions.NextSteps,
  props: PACKAGE_PROP_SCHEMAS.NextSteps,
  component: function NextStepsView() {
    const { snapshot } = usePackageShowcase();
    const act = useHostAction();
    const can = (name: PackageShowcaseAction) => snapshot.allowedActions.includes(name);
    return (
      <nav aria-label="Next steps" className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-5">
        {can("open_itinerary") ? (
          <Button variant="outline" onClick={() => act("Review itinerary", "open_itinerary")}>
            Review itinerary <ArrowUpRight />
          </Button>
        ) : null}
        {can("open_optimise") ? (
          <Button variant="outline" onClick={() => act("Run the optimisation again", "open_optimise")}>
            Run the optimisation again <ArrowUpRight />
          </Button>
        ) : null}
      </nav>
    );
  },
});
