"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { PACKAGE_PROP_SCHEMAS, packageShowcaseDescriptions } from "@tripweave/planning-contract";
import { Alert, Badge } from "@/components/ui/card";
import { AvailabilityBadges, cancellationText } from "@/features/trips/availability-badge";
import { CoverImage } from "@/features/hotels/hotel-card";
import { cn, formatDate, formatDateTime, mealLabel, nightsLabel, titleCase } from "@/lib/utils";
import { resolveShowcaseOffer, resolveShowcasePackage } from "../helpers";
import { usePackageShowcase } from "../context";
import { MissingEntity, Stars } from "./shared";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export const HotelStay = defineComponent({
  name: "HotelStay",
  description: packageShowcaseDescriptions.HotelStay,
  props: PACKAGE_PROP_SCHEMAS.HotelStay,
  component: function HotelStayView({ props }) {
    const { snapshot } = usePackageShowcase();
    const entry = resolveShowcaseOffer(snapshot, props.offerId);
    if (!entry) return <MissingEntity what="hotel" />;
    const offer = entry.offer;
    const pkg = props.packageId ? resolveShowcasePackage(snapshot, props.packageId) : null;
    if (props.packageId && (!pkg || !entry.packageIds.includes(pkg.id))) return <MissingEntity what="hotel in that package" />;
    const sourceName = offer.supplierName || offer.providerKey;
    const reviewed = offer.property.reviewScore !== null;

    return (
      <article aria-label={`Stay at ${offer.property.name}`} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card sm:flex-row">
        <div className="relative h-44 shrink-0 bg-muted sm:h-auto sm:w-56">
          <CoverImage imageId={entry.coverImageId} alt={offer.property.name} className="absolute inset-0 size-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {entry.destination}
                {offer.property.category ? ` · ${titleCase(offer.property.category)}` : ""}
              </p>
              <h3 className="font-display text-xl font-semibold leading-snug tracking-[-0.02em]">{offer.property.name}</h3>
              <Stars count={offer.property.starRating} />
            </div>
            <Badge tone={reviewed ? "primary" : "neutral"}>{reviewed ? `${offer.property.reviewScore}/10 review` : "Unrated"}</Badge>
          </div>

          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Fact label="Dates">
              {formatDate(offer.stayStart)} → {formatDate(offer.stayEnd)} · {nightsLabel(offer.nights)}
            </Fact>
            <Fact label="Room">
              {offer.roomType.name} · {offer.roomsRequired} room{offer.roomsRequired === 1 ? "" : "s"}
            </Fact>
            <Fact label="Meal plan">
              {mealLabel(offer.mealPlan)}
              {offer.mealPlanStatus === "unconfirmed" ? <span className="ml-2 text-xs text-warning">To confirm with the hotel</span> : null}
            </Fact>
            <Fact label="Cancellation">
              <span className={cn(offer.cancellation.refundable === false && "text-destructive")}>{cancellationText(offer.cancellation)}</span>
            </Fact>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <AvailabilityBadges offer={offer} />
            {offer.isMock ? <Badge tone="danger">Illustrative data</Badge> : null}
          </div>

          {offer.isMock ? <Alert tone="danger" title="Not a live rate">This stay uses illustrative data and must not be quoted.</Alert> : null}

          <p className="mt-auto text-xs text-muted-foreground">
            Rate from {sourceName} · retrieved {formatDateTime(offer.retrievedAt)}
            {offer.expiresAt ? ` · valid until ${formatDateTime(offer.expiresAt)}` : ""}
          </p>
        </div>
      </article>
    );
  },
});
