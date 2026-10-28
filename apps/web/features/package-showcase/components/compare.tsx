"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { PACKAGE_PROP_SCHEMAS, packageShowcaseDescriptions, type PlanningPackageView } from "@tripweave/planning-contract";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, mealLabel, money, nightsLabel } from "@/lib/utils";
import { budgetPosition, lowestPricedId, nightsOf, perNightMinor, perTravellerMinor, resolveShowcasePackage, sellingPriceOf, sortPackages, travellerCount, type CompareSort } from "../helpers";
import { usePackageShowcase } from "../context";
import { LiveBadge } from "./live";
import { MissingEntity, ScoreBar, budgetText, objectiveLabel, shortCancellation, useHostAction } from "./shared";

type Basis = "total" | "night" | "traveller";

const BASIS_LABEL: Record<Basis, string> = { total: "Total", night: "Per night", traveller: "Per traveller" };
const SORT_LABEL: Record<CompareSort, string> = { recommended: "Recommended", price: "Lowest price", score: "Highest score" };

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export const PackageCompare = defineComponent({
  name: "PackageCompare",
  description: packageShowcaseDescriptions.PackageCompare,
  props: PACKAGE_PROP_SCHEMAS.PackageCompare,
  component: function PackageCompareView({ props }) {
    const { snapshot } = usePackageShowcase();
    const act = useHostAction();
    const [basis, setBasis] = React.useState<Basis>("total");
    const [sort, setSort] = React.useState<CompareSort>("recommended");
    const resolved = props.packageIds.map((key) => resolveShowcasePackage(snapshot, key)).filter((pkg): pkg is PlanningPackageView => pkg !== null);
    if (resolved.length < 2) return <MissingEntity what="package comparison" />;

    const packages = sortPackages(resolved, sort);
    const cheapest = lowestPricedId(resolved);
    const travellers = travellerCount(snapshot.trip);
    const amount = (pkg: PlanningPackageView): number | null => {
      const price = sellingPriceOf(pkg);
      if (basis === "night") return perNightMinor(price, nightsOf(pkg));
      if (basis === "traveller") return perTravellerMinor(price, travellers);
      return price;
    };

    return (
      <section aria-label={props.title ?? "Compare packages"} className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold tracking-[-0.02em]">{props.title ?? "Compare the packages"}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Amount shown" className="flex flex-wrap gap-1.5">
              {(Object.keys(BASIS_LABEL) as Basis[]).map((key) => (
                <FilterButton key={key} active={basis === key} onClick={() => setBasis(key)}>
                  {BASIS_LABEL[key]}
                </FilterButton>
              ))}
            </div>
            <label className="sr-only" htmlFor={`sort-${props.packageIds.join("-")}`}>
              Sort packages
            </label>
            <select
              id={`sort-${props.packageIds.join("-")}`}
              value={sort}
              onChange={(event) => setSort(event.target.value as CompareSort)}
              className="h-8 rounded-full border border-border bg-card px-3 text-xs font-medium"
            >
              {(Object.keys(SORT_LABEL) as CompareSort[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABEL[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative min-w-0 overflow-x-auto rounded-2xl border border-border/80 bg-card">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">Packages compared by {BASIS_LABEL[basis].toLowerCase()} selling price, budget position, score and live status</caption>
            <thead>
              <tr className="bg-muted/45 text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">
                  Package
                </th>
                {packages.map((pkg) => (
                  <th key={pkg.id} scope="col" className="px-4 py-3 font-medium">
                    <span className="block text-foreground">
                      {objectiveLabel(pkg.objective)} <span className="font-normal text-muted-foreground">#{pkg.number}</span>
                    </span>
                    <span className="mt-0.5 block font-normal normal-case tracking-normal text-muted-foreground">{pkg.package.selections.map((selection) => selection.destination).join(" · ")}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border/70">
                <th scope="row" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {BASIS_LABEL[basis]} selling price
                </th>
                {packages.map((pkg) => {
                  const value = amount(pkg);
                  return (
                    <td key={pkg.id} className="px-4 py-3">
                      <span className="tw-num font-display text-lg font-semibold">{value === null ? "Unavailable" : money(value, pkg.pricing?.currency ?? pkg.package.currency)}</span>
                      {pkg.id === cheapest ? (
                        <span className="ml-2 align-middle">
                          <Badge tone="success">Lowest price</Badge>
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-t border-border/70">
                <th scope="row" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Budget
                </th>
                {packages.map((pkg) => {
                  const position = budgetPosition(pkg, snapshot.trip);
                  const difference = position.difference === null ? null : basis === "traveller" ? Math.round(position.difference / travellers) : position.difference;
                  return (
                    <td key={pkg.id} className={cn("px-4 py-3 font-medium", difference === null ? "text-muted-foreground" : difference >= 0 ? "text-success" : "text-destructive")}>
                      {budgetText(difference, pkg.package.currency, basis === "traveller")}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-t border-border/70">
                <th scope="row" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Score
                </th>
                {packages.map((pkg) => (
                  <td key={pkg.id} className="px-4 py-3">
                    <div className="max-w-[12rem]">
                      <ScoreBar label="Score" value={pkg.package.score / 100} />
                    </div>
                  </td>
                ))}
              </tr>
              <tr className="border-t border-border/70">
                <th scope="row" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Stays
                </th>
                {packages.map((pkg) => (
                  <td key={pkg.id} className="px-4 py-3">
                    <ul className="flex flex-col gap-1">
                      {pkg.package.selections.map((selection) => (
                        <li key={selection.stopId}>
                          <span className="font-medium">{selection.offer.property.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {nightsLabel(selection.offer.nights)} · {selection.offer.roomType.name} · {mealLabel(selection.offer.mealPlan)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
              <tr className="border-t border-border/70">
                <th scope="row" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Cancellation
                </th>
                {packages.map((pkg) => (
                  <td key={pkg.id} className="px-4 py-3 text-xs">
                    {pkg.package.selections.map((selection) => (
                      <span key={selection.stopId} className="block">
                        {selection.offer.property.name}: {shortCancellation(selection.offer.cancellation)}
                      </span>
                    ))}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-border/70">
                <th scope="row" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Live prices
                </th>
                {packages.map((pkg) => (
                  <td key={pkg.id} className="px-4 py-3">
                    <LiveBadge pkg={pkg} />
                  </td>
                ))}
              </tr>
              <tr className="border-t border-border/70">
                <th scope="row" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </th>
                {packages.map((pkg) => (
                  <td key={pkg.id} className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => act("Show in packages", "focus_package", { packageId: pkg.ref })}>
                      Show in packages
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    );
  },
});
