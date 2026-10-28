"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, FileText, Map, Route, Wand2 } from "lucide-react";
import type { PlanningSnapshot } from "@tripweave/planning-contract";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dateRange, formatDate, mealLabel, money, nightsLabel } from "@/lib/utils";
import { VerificationBadge } from "./ui";

/**
 * Normal, non-generative view over the same authoritative snapshot. Used when generation is
 * unavailable/invalid, when the renderer throws, or when a reader explicitly asks for standard view.
 */
export function PlanningFallbackView({ snapshot, reason, onRetry, mode = "operator" }: { snapshot: PlanningSnapshot; reason?: "unavailable" | "invalid" | "error" | "manual"; onRetry?: () => void; mode?: "operator" | "traveler" }) {
  const { trip, itinerary, packages } = snapshot;
  const traveler = mode === "traveler";
  const base = traveler ? `/travel/trips/${trip.id}` : `/trips/${trip.id}`;
  const notice =
    reason === "invalid"
      ? "The generated interface did not pass validation. This standard view uses the same server data."
      : reason === "error"
        ? "The planning response could not be generated or rendered. This standard view uses the same server data."
        : reason === "manual"
          ? "Standard view. Every value still comes from the API."
          : "AI generation is unavailable. This standard view uses the same server data.";
  return (
    <div className="flex flex-col gap-4">
      <Alert tone={reason === "manual" ? "info" : "warning"} title={notice}>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/${traveler ? "stays" : "packages"}`}>
              <FileText /> {traveler ? "Stays" : "Packages"}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/itinerary`}>
              <Route /> Itinerary
            </Link>
          </Button>
          {snapshot.permissions.canRunOptimisation ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}/${traveler ? "stays" : "optimise"}`}>
                <Wand2 /> {traveler ? "Find stays" : "Optimise"}
              </Link>
            </Button>
          ) : null}
          {onRetry ? (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              Try AI again
            </Button>
          ) : null}
        </div>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Trip requirements</CardTitle>
          <CardDescription>
            {dateRange(trip.arrivalDate, trip.departureDate)} · {trip.party.adults} adult{trip.party.adults === 1 ? "" : "s"}
            {trip.party.children ? `, ${trip.party.children} child${trip.party.children === 1 ? "" : "ren"}` : ""} · {trip.party.rooms.length} room{trip.party.rooms.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Budget</dt>
              <dd className="tw-num">{trip.budgetAmountMinor === null ? "Not set" : money(trip.budgetAmountMinor, trip.budgetCurrency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Hotel category</dt>
              <dd>{trip.preferredHotelCategory ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Minimum meal plan</dt>
              <dd>{trip.preferredMealPlan ? mealLabel(trip.preferredMealPlan) : "Not set"}</dd>
            </div>
          </dl>
          {snapshot.missingFields.length > 0 ? (
            <Alert tone="warning" title="Still to confirm">
              <ul className="list-disc space-y-0.5 pl-5">
                {snapshot.missingFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {itinerary ? (
        <Card>
          <CardHeader>
            <CardTitle>{itinerary.title || "Itinerary"}</CardTitle>
            <CardDescription>
              {itinerary.stops.length} stop{itinerary.stops.length === 1 ? "" : "s"} · {itinerary.status}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2 text-sm">
              {itinerary.stops.map((stop) => (
                <li key={stop.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2">
                  <span>
                    {stop.sequence}. <span className="font-semibold">{stop.destination}</span>
                  </span>
                  <span className="tw-num text-xs text-muted-foreground">
                    {formatDate(stop.arrivalDate, { day: "numeric", month: "short" })} → {formatDate(stop.departureDate, { day: "numeric", month: "short" })} · {nightsLabel(stop.nights)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {packages.length === 0 ? (
        <EmptyState
          icon={Map}
          title="No packages yet"
          description="The requirements are saved, but optimisation has not produced comparable packages for this trip."
          action={
            snapshot.permissions.canRunOptimisation ? (
              <Button asChild variant="outline">
                <Link href={`${base}/${traveler ? "stays" : "optimise"}`}>{traveler ? "Find stay ideas" : "Configure optimisation"}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {packages.slice(0, 6).map((pkg) => (
            <Card key={pkg.id} className="flex h-full flex-col">
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    {pkg.objective.replace(/_/g, " ")} · #{pkg.number}
                  </CardTitle>
                  <CardDescription>{pkg.package.selections.map((selection) => selection.destination).join(" · ")}</CardDescription>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  <VerificationBadge pkg={pkg} />
                  {pkg.package.selections.some((selection) => selection.offer.isMock) ? <Badge tone="danger">Illustrative</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="tw-num text-xl font-semibold">{pkg.pricing ? money(pkg.pricing.sellingPriceMinor, pkg.pricing.currency) : "Pricing unavailable"}</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {pkg.package.selections.map((selection) => (
                    <li key={selection.stopId} className="flex justify-between gap-2">
                      <span>{selection.offer.property.name}</span>
                      <span className="text-xs text-muted-foreground">{selection.destination}</span>
                    </li>
                  ))}
                </ul>
                {pkg.package.unverified.length > 0 ? (
                  <p className="flex items-start gap-1 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {pkg.package.unverified.length} item{pkg.package.unverified.length === 1 ? "" : "s"} still to confirm
                  </p>
                ) : null}
                <Button asChild size="sm" variant="outline" className="mt-auto self-start">
                  <Link href={`${base}/${traveler ? "stays" : "packages"}`}>{traveler ? "Open stays" : "Open packages"}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
