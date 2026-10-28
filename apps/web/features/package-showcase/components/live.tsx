"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { PACKAGE_PROP_SCHEMAS, packageShowcaseDescriptions, type PlanningPackageView } from "@tripweave/planning-contract";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AvailabilityBadges } from "@/features/trips/availability-badge";
import { formatDateTime } from "@/lib/utils";
import { checkCounts, liveStatus, resolveShowcasePackage, verificationOf } from "../helpers";
import { usePackageShowcase } from "../context";
import { MissingEntity, useHostAction } from "./shared";

/** Compact status used on cards and in comparisons. The state comes from the server verification. */
export function LiveBadge({ pkg }: { pkg: PlanningPackageView }) {
  const status = liveStatus(pkg);
  if (status.state === "live") return <Badge tone="success">Live checked</Badge>;
  if (status.state === "expired") return <Badge tone="warning">Check expired</Badge>;
  return <Badge tone="warning">Indicative</Badge>;
}

export const LivePriceStatus = defineComponent({
  name: "LivePriceStatus",
  description: packageShowcaseDescriptions.LivePriceStatus,
  props: PACKAGE_PROP_SCHEMAS.LivePriceStatus,
  component: function LivePriceStatusView({ props }) {
    const { snapshot, pending } = usePackageShowcase();
    const act = useHostAction();
    const pkg = resolveShowcasePackage(snapshot, props.packageId);
    if (!pkg) return <MissingEntity what="package" />;
    const status = liveStatus(pkg);
    const counts = checkCounts(pkg);
    const verification = verificationOf(pkg);
    const priceChanges = (verification.checks ?? []).filter((check) => check.status === "price_changed").length;
    const canRecheck = snapshot.allowedActions.includes("validate_package");
    const headline =
      status.state === "live"
        ? `Live checked until ${formatDateTime(status.validUntil)}`
        : status.state === "expired"
          ? `The live check expired ${formatDateTime(status.validUntil)}`
          : "Not live checked yet";
    const detail =
      status.state === "live"
        ? "Every hotel rate in this package was confirmed with its supplier, so it can be quoted."
        : status.state === "expired"
          ? "The rates were confirmed earlier but have passed their validity. Re-check them before quoting."
          : "These rates come from the search and have not been confirmed with the supplier yet.";

    return (
      <section aria-label="Live price status" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
              <ShieldCheck className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{headline}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
            </div>
          </div>
          <Badge tone={status.state === "live" ? "success" : "warning"}>{status.state === "live" ? "Live" : status.state === "expired" ? "Expired" : "Indicative"}</Badge>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Last checked</dt>
            <dd className="tw-num font-medium">{formatDateTime(status.checkedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rates confirmed</dt>
            <dd className="tw-num font-medium">{counts.total === 0 ? "Not checked" : `${counts.confirmed} of ${counts.total}`}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Price changes</dt>
            <dd className="tw-num font-medium">{priceChanges === 0 ? "None reported" : `${priceChanges} rate${priceChanges === 1 ? "" : "s"} changed`}</dd>
          </div>
        </dl>

        <ul aria-label="Rates in this package" className="flex flex-col gap-2">
          {pkg.package.selections.map((selection) => (
            <li key={selection.stopId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{selection.offer.property.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {selection.destination} · {selection.offer.source === "external" ? "external rate" : selection.offer.isMock ? "illustrative rate" : "own inventory"}
                </span>
              </span>
              <AvailabilityBadges offer={selection.offer} />
            </li>
          ))}
        </ul>

        {canRecheck ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" loading={pending === `validate_package:${pkg.ref}`} onClick={() => act("Re-check live prices", "validate_package", { packageId: pkg.ref })}>
              <RefreshCw /> Re-check live prices
            </Button>
            <p className="text-xs text-muted-foreground">Re-checking asks each supplier for its current rate. The package total updates if a rate has changed.</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Ask someone with package permissions to re-check these rates.</p>
        )}
      </section>
    );
  },
});
