"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { Car, Route, TriangleAlert } from "lucide-react";
import { RouteSummarySchema } from "@tripweave/planning-contract";
import { minutesLabel } from "@/lib/utils";
import { routeSourceLabel } from "@/features/trips/types";
import { resolvePlanningItinerary, resolvePlanningPackage, usePlanningSnapshot } from "../context";
import { IconBadge, MissingEntity } from "../ui";

const DESCRIPTION = "Travel legs and total drive time for the itinerary or a package from CONTEXT. Pass itineraryId, packageId, or both.";

export const RouteSummary = defineComponent({
  name: "RouteSummary",
  description: DESCRIPTION,
  props: RouteSummarySchema,
  component: function RouteSummaryView({ props }) {
    const snapshot = usePlanningSnapshot();
    const pkg = props.packageId ? resolvePlanningPackage(snapshot, props.packageId) : null;
    const itinerary = props.itineraryId ? resolvePlanningItinerary(snapshot, props.itineraryId) : null;
    if (props.packageId && !pkg) return <MissingEntity what="package route" />;
    if (props.itineraryId && !itinerary) return <MissingEntity what="itinerary route" />;
    if (!pkg && !itinerary) {
      if (!snapshot.itinerary) return <MissingEntity what="route" />;
    }
    const legs = pkg ? pkg.package.travel.legs : itinerary?.legs ?? snapshot.itinerary?.legs ?? [];
    const names = new Map<string, string>();
    if (pkg) for (const selection of pkg.package.selections) names.set(selection.stopId, selection.destination);
    if (itinerary) for (const stop of itinerary.stops) names.set(stop.id, stop.destination);
    if (!pkg && snapshot.itinerary) for (const stop of snapshot.itinerary.stops) names.set(stop.id, stop.destination);
    const anyEstimated = pkg ? pkg.package.travel.anyEstimated : snapshot.itinerary?.legSource === "estimated" || legs.some((leg) => leg.source === "estimated");
    const anyUnavailable = pkg ? pkg.package.travel.anyUnavailable : legs.some((leg) => leg.source === "unavailable");
    const warnings = itinerary?.warnings ?? snapshot.itinerary?.warnings ?? [];
    return (
      <section aria-label="Travel between stops" className="pl-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2.5"><IconBadge icon={Route} size="sm" /><p className="pl-eyebrow">On the road</p></div>
            <h3 className="pl-display mt-1 text-[1.9rem] leading-none">Getting between stops</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="pl-chip">
              {legs.length} leg{legs.length === 1 ? "" : "s"}
            </span>
            {anyEstimated ? <span className="pl-chip pl-chip-accent">Estimated drive times</span> : null}
            {anyUnavailable ? <span className="pl-chip pl-chip-accent">Some legs unavailable</span> : null}
          </div>
        </div>

        {pkg && pkg.package.travel.totalDriveMinutes !== null ? (
          <p className="tw-num mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--pl-sage-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-sage)]">
            <Car className="size-3.5" aria-hidden /> {minutesLabel(pkg.package.travel.totalDriveMinutes)} total driving
          </p>
        ) : null}

        {legs.length === 0 ? (
          <p role="status" className="mt-3 text-sm text-[var(--pl-muted)]">
            {pkg || snapshot.itinerary ? "A single stop needs no travel between hotels." : "No route is available yet."}
          </p>
        ) : (
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {legs.map((leg, index) => (
              <li
                key={`${leg.fromStopId}-${leg.toStopId}-${index}`}
                aria-label={`${names.get(leg.fromStopId) ?? leg.fromStopId} to ${names.get(leg.toStopId) ?? leg.toStopId}`}
                className="pl-rise rounded-xl border border-[var(--pl-line)] bg-[var(--pl-surface)] p-3"
                style={{ "--i": index } as React.CSSProperties}
              >
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  <span>{names.get(leg.fromStopId) ?? leg.fromStopId}</span>
                  <span aria-hidden className="h-px flex-1 bg-[repeating-linear-gradient(90deg,var(--pl-line)_0_4px,transparent_4px_8px)]" />
                  <span className="text-[var(--pl-accent)]">→</span>
                  <span>{names.get(leg.toStopId) ?? leg.toStopId}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--pl-muted)]">
                  <span className="tw-num inline-flex items-center gap-1">
                    <Car className="size-3" aria-hidden /> {leg.durationMinutes === null ? "Drive time unavailable" : minutesLabel(leg.durationMinutes)}
                  </span>
                  {leg.distanceKm !== null ? <span className="tw-num">· {leg.distanceKm} km</span> : null}
                  <span className="pl-chip">{routeSourceLabel(leg.source)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}

        {anyEstimated ? <p className="mt-2 text-[10px] text-[var(--pl-muted)]">Estimated routes are approximate and must not be presented as exact travel times.</p> : null}
        {warnings.length > 0 ? (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[var(--pl-muted)]">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--pl-accent)]" aria-hidden /> {warnings.slice(0, 4).join(" · ")}
          </p>
        ) : null}
      </section>
    );
  },
});
