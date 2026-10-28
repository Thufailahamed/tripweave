"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { PACKAGE_PROP_SCHEMAS, packageShowcaseDescriptions, type PackageShowcaseAction } from "@tripweave/planning-contract";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatDate, mealLabel, money, nightsLabel } from "@/lib/utils";
import { CoverImage } from "@/features/hotels/hotel-card";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";
import { budgetPosition, needsLiveCheck, nightsOf, resolveShowcasePackage, sellingPriceOf, travellerCount } from "../helpers";
import { usePackageShowcase } from "../context";
import { MissingEntity, Meter, ScoreRing, budgetText, objectiveLabel, shortCancellation, useHostAction } from "./shared";
import { LiveBadge } from "./live";

export const PackageCard = defineComponent({
  name: "PackageCard",
  description: packageShowcaseDescriptions.PackageCard,
  props: PACKAGE_PROP_SCHEMAS.PackageCard,
  component: function PackageCardView({ props }) {
    const { snapshot, pending } = usePackageShowcase();
    const act = useHostAction();
    const headingId = React.useId();
    const pkg = resolveShowcasePackage(snapshot, props.packageId);
    if (!pkg) return <MissingEntity what="package" />;

    const price = sellingPriceOf(pkg);
    const currency = pkg.pricing?.currency ?? pkg.package.currency;
    const nights = nightsOf(pkg);
    const travellers = travellerCount(snapshot.trip);
    const blocked = needsLiveCheck(pkg);
    const budget = budgetPosition(pkg, snapshot.trip);
    const lead = props.emphasis === "lead";
    const anyMock = pkg.package.selections.some((selection) => selection.offer.isMock);
    const hero = pkg.package.selections.find((selection) => selection.coverImageId) ?? pkg.package.selections[0];
    const can = (action: PackageShowcaseAction) => snapshot.allowedActions.includes(action);
    const stops = pkg.package.selections.map((selection) => selection.destination).join(" · ");
    const budgetTone = budget.difference === null ? "text-muted-foreground" : budget.difference >= 0 ? "text-success" : "text-destructive";

    return (
      <article
        aria-labelledby={headingId}
        data-package-ref={pkg.ref}
        className={cn(
          "relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(20,26,45,0.04),0_18px_44px_-24px_rgba(20,26,45,0.18)]",
          lead ? "border-accent/50 ring-1 ring-accent/40" : "border-border/80",
          anyMock && "border-destructive/50",
        )}
      >
        <div className="relative h-48 overflow-hidden bg-muted">
          <DestinationPhoto destination={hero?.destination ?? snapshot.trip.title} imageId={hero?.coverImageId} className="absolute inset-0 size-full" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {lead ? <Badge tone="accent">Recommended</Badge> : null}
            <Badge tone="outline" className="bg-white/90">
              Package #{pkg.number}
            </Badge>
            {anyMock ? <Badge tone="danger">Illustrative</Badge> : null}
          </div>
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">Selling price</p>
            <p className="tw-num mt-1 font-display text-[30px] font-semibold leading-none">{price === null ? "Unavailable" : money(price, currency)}</p>
            <p className="mt-1.5 text-xs text-white/80">
              {objectiveLabel(pkg.objective)} · {nightsLabel(nights)} · {travellers} traveller{travellers === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id={headingId} className="font-display text-lg font-semibold leading-snug tracking-[-0.02em]">
                {stops}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Score {Math.round(pkg.package.score)} out of 100</p>
            </div>
            <ScoreRing score={pkg.package.score} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-background/50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Budget</p>
              <p className={cn("mt-1 text-sm font-semibold", budgetTone)}>{budgetText(budget.difference, currency)}</p>
              {budget.meterFraction !== null ? <Meter label="Share of the trip budget" fraction={budget.meterFraction} className="mt-2" /> : null}
            </div>
            <div className="rounded-xl border border-border/70 bg-background/50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Live prices</p>
              <div className="mt-1">
                <LiveBadge pkg={pkg} />
              </div>
            </div>
          </div>

          <ul aria-label="Hotels in this package" className="flex flex-col gap-2">
            {pkg.package.selections.map((selection) => (
              <li key={selection.stopId} className="flex min-w-0 gap-3 rounded-xl border border-border/70 bg-background/40 p-3">
                <CoverImage imageId={selection.coverImageId} alt={selection.offer.property.name} className="size-14 shrink-0 overflow-hidden rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {selection.destination} · {nightsLabel(selection.offer.nights)} · {formatDate(selection.offer.stayStart)} → {formatDate(selection.offer.stayEnd)}
                  </p>
                  <p className="truncate font-semibold">{selection.offer.property.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selection.offer.roomType.name} · {mealLabel(selection.offer.mealPlan)}
                    {selection.offer.mealPlanStatus === "unconfirmed" ? " (to confirm)" : ""} · {shortCancellation(selection.offer.cancellation)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {can("create_quote") ? (
              <Button size="sm" loading={pending === `create_quote:${pkg.ref}`} disabled={blocked} title={blocked ? "Check live prices before creating a quotation" : undefined} onClick={() => act("Create quotation", "create_quote", { packageId: pkg.ref })}>
                Create quotation
              </Button>
            ) : null}
            {can("validate_package") ? (
              <Button size="sm" variant="outline" loading={pending === `validate_package:${pkg.ref}`} onClick={() => act("Re-check live prices", "validate_package", { packageId: pkg.ref })}>
                Re-check live prices
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => act("Show in packages", "focus_package", { packageId: pkg.ref })}>
              Show in packages
            </Button>
            {blocked ? <p className="w-full text-xs text-warning">Live rates must be checked before a quotation can be created.</p> : null}
          </div>
        </div>
      </article>
    );
  },
});
