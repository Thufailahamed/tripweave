"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { PACKAGE_PROP_SCHEMAS, packageShowcaseDescriptions } from "@tripweave/planning-contract";
import { Alert } from "@/components/ui/card";
import { cn, formatDate, mealLabel, money, nightsLabel, percentFromBp } from "@/lib/utils";
import { budgetPosition, nightsOf, perNightMinor, perTravellerMinor, resolveShowcasePackage, sellingPriceOf, travellerCount } from "../helpers";
import { usePackageShowcase } from "../context";
import { MissingEntity, Meter, budgetText } from "./shared";

function Row({ label, value, strong = false, muted = false }: { label: string; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2 text-sm", strong ? "border-t border-border pt-3 font-semibold" : "border-b border-border/60", muted && "text-muted-foreground")}>
      <dt>{label}</dt>
      <dd className="tw-num text-right">{value}</dd>
    </div>
  );
}

export const PriceBreakdown = defineComponent({
  name: "PriceBreakdown",
  description: packageShowcaseDescriptions.PriceBreakdown,
  props: PACKAGE_PROP_SCHEMAS.PriceBreakdown,
  component: function PriceBreakdownView({ props }) {
    const { snapshot } = usePackageShowcase();
    const pkg = resolveShowcasePackage(snapshot, props.packageId);
    if (!pkg) return <MissingEntity what="package" />;
    const pricing = pkg.pricing;
    if (!pricing) return <Alert tone="warning" title="Price unavailable">This package could not be priced from the latest data.</Alert>;
    const currency = pricing.currency;
    const nights = nightsOf(pkg);
    const travellers = travellerCount(snapshot.trip);
    const selling = sellingPriceOf(pkg);
    const showMargins = pricing.grossProfitMinor !== undefined;

    return (
      <section aria-label="Price breakdown" className="grid min-w-0 gap-4 rounded-2xl border border-border/80 bg-card p-5 md:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">What the price includes</p>
          <dl className="mt-2">
            <Row label="Selling price" value={money(selling, currency)} />
            <Row label="Tax" value={money(pricing.sellingTaxMinor, currency)} />
            <Row label="Total payable" value={money(pricing.totalPayableMinor, currency)} strong />
          </dl>
          <dl className="mt-4">
            <Row label={`Per night (${nightsLabel(nights)})`} value={money(perNightMinor(selling, nights), currency)} muted />
            <Row label={`Per traveller (${travellers})`} value={money(perTravellerMinor(selling, travellers), currency)} muted />
          </dl>
          {pricing.approval?.required ? <Alert tone="warning" title="Approval needed">This package needs approval before it can be quoted.</Alert> : null}
          {pricing.warnings.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
              {pricing.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Stays covered</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {pkg.package.selections.map((selection) => (
              <li key={selection.stopId} className="rounded-xl border border-border/70 bg-background/40 px-3 py-2">
                <p className="font-medium">{selection.offer.property.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selection.destination} · {nightsLabel(selection.offer.nights)} · {formatDate(selection.offer.stayStart)} → {formatDate(selection.offer.stayEnd)} · {mealLabel(selection.offer.mealPlan)}
                </p>
              </li>
            ))}
          </ul>
          {showMargins ? (
            <dl className="mt-4 rounded-xl border border-dashed border-border p-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Internal</p>
              <Row label="Supplier cost" value={money(pkg.package.totalCostMinor ?? null, currency)} muted />
              <Row label="Gross profit" value={money(pricing.grossProfitMinor ?? null, currency)} muted />
              <Row label="Gross margin" value={percentFromBp(pricing.grossMarginBp)} muted />
            </dl>
          ) : null}
        </div>
      </section>
    );
  },
});

export const BudgetFit = defineComponent({
  name: "BudgetFit",
  description: packageShowcaseDescriptions.BudgetFit,
  props: PACKAGE_PROP_SCHEMAS.BudgetFit,
  component: function BudgetFitView({ props }) {
    const { snapshot } = usePackageShowcase();
    const [basis, setBasis] = React.useState<"total" | "traveller">("total");
    const pkg = resolveShowcasePackage(snapshot, props.packageId);
    if (!pkg) return <MissingEntity what="package" />;
    const trip = snapshot.trip;
    const currency = pkg.pricing?.currency ?? pkg.package.currency;
    const travellers = travellerCount(trip);
    const selling = sellingPriceOf(pkg);
    const position = budgetPosition(pkg, trip);
    const perTraveller = basis === "traveller";
    const shownPrice = perTraveller ? perTravellerMinor(selling, travellers) : selling;
    const shownBudget = trip.budgetAmountMinor === null ? null : perTraveller ? perTravellerMinor(trip.budgetAmountMinor, travellers) : trip.budgetAmountMinor;
    const shownDifference = position.difference === null ? null : perTraveller ? Math.round(position.difference / travellers) : position.difference;
    const scopeNote = trip.budgetScope === "all_inclusive_trip" ? "The budget covers the whole trip, so accommodation is compared with the whole-trip figure." : "The budget covers accommodation only.";

    return (
      <section aria-label="Budget position" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">Budget position</p>
          <div role="group" aria-label="Show amounts" className="inline-flex rounded-full border border-border bg-muted/50 p-0.5 text-xs">
            {(
              [
                ["total", "Total"],
                ["traveller", "Per traveller"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={basis === key}
                onClick={() => setBasis(key)}
                className={cn("rounded-full px-3 py-1 font-medium transition-colors", basis === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {shownBudget === null ? (
          <p className="text-sm text-muted-foreground">No budget is set for this trip, so there is nothing to compare against.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="tw-num font-display text-2xl font-semibold">{money(shownPrice, currency)}</p>
              <p className="tw-num text-sm text-muted-foreground">of {money(shownBudget, trip.budgetCurrency)}</p>
            </div>
            {position.meterFraction !== null ? <Meter label="Selling price against the budget" fraction={position.meterFraction} /> : null}
            <p className={cn("text-sm font-semibold", shownDifference === null ? "text-muted-foreground" : shownDifference >= 0 ? "text-success" : "text-destructive")}>
              {shownDifference === null ? "The server did not compare this package with the budget." : budgetText(shownDifference, currency, perTraveller)}
            </p>
            <p className="text-xs text-muted-foreground">{scopeNote}</p>
          </>
        )}
      </section>
    );
  },
});
