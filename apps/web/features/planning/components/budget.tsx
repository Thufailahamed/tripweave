"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { ArrowDownRight, ArrowUpRight, CircleCheck, TriangleAlert, Wallet } from "lucide-react";
import { BudgetMeterSchema } from "@tripweave/planning-contract";
import { money } from "@/lib/utils";
import { resolvePlanningPackage, usePlanningSnapshot } from "../context";
import { MissingEntity } from "../ui";

const DESCRIPTION = "Visual budget position for one package from CONTEXT: selling price against the trip budget, with a total/per-person switch. Pass the packageId. Use it when the user asks whether a package fits the budget.";

export const BudgetMeter = defineComponent({
  name: "BudgetMeter",
  description: DESCRIPTION,
  props: BudgetMeterSchema,
  component: function BudgetMeterView({ props }) {
    const snapshot = usePlanningSnapshot();
    const pkg = resolvePlanningPackage(snapshot, props.packageId);
    const [mode, setMode] = React.useState<"total" | "person">("total");
    if (!pkg) return <MissingEntity what="budget position" />;
    const pricing = pkg.pricing;
    if (!pricing) return <MissingEntity what="package price" />;
    const sameCurrency = snapshot.trip.budgetCurrency === pricing.currency;
    const budget = sameCurrency ? snapshot.trip.budgetAmountMinor : null;
    const partySize = Math.max(1, snapshot.trip.party.adults + snapshot.trip.party.children);
    const amount = mode === "person" ? Math.round(pricing.sellingPriceMinor / partySize) : pricing.sellingPriceMinor;
    const target = budget === null ? null : mode === "person" ? Math.round(budget / partySize) : budget;
    const percent = target && target > 0 ? (amount / target) * 100 : null;
    const difference = target === null ? null : target - amount;
    const within = difference !== null && difference >= 0;
    const overBy = difference !== null && difference < 0 ? -difference : 0;
    return (
      <section aria-label={`Budget position for package ${pkg.number}`} className="pl-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="pl-eyebrow">
              <Wallet className="size-3" aria-hidden /> Budget position
            </p>
            <p className="pl-display mt-1.5 text-[2rem] leading-none">{money(amount, pricing.currency)}</p>
            <p className="mt-1 text-xs text-[var(--pl-muted)]">
              {mode === "person" ? "per person" : "total selling price"} · package #{pkg.number}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-[var(--pl-line)] bg-[var(--pl-surface-2)] p-0.5" role="group" aria-label="Price view">
            {(["total", "person"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${mode === option ? "bg-[var(--pl-ink)] text-[var(--pl-bg)]" : "text-[var(--pl-muted)] hover:text-[var(--pl-ink)]"}`}
              >
                {option === "total" ? "Total" : "Per person"}
              </button>
            ))}
          </div>
        </div>

        {target === null || percent === null ? (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--pl-line)] px-3 py-2 text-xs text-[var(--pl-muted)]">
            {sameCurrency ? "This trip has no budget to compare against." : "The trip budget is in a different currency, so no comparison is shown."}
          </p>
        ) : (
          <>
            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px] text-[var(--pl-muted)]">
                <span>0</span>
                <span className="tw-num">
                  {Math.round(percent)}% of {mode === "person" ? "per-person budget" : "budget"}
                </span>
                <span className="tw-num">{money(target, pricing.currency)}</span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.round(percent))}
                aria-label={within ? "Within budget" : "Over budget"}
                className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-[var(--pl-surface-2)] ring-1 ring-inset ring-[var(--pl-line)]"
              >
                <span
                  className={`pl-bar absolute inset-y-0 left-0 rounded-full ${within ? "bg-[var(--pl-sage)]" : "bg-[var(--pl-accent)]"}`}
                  style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
                />
              </div>
            </div>
            <p className={`mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold ${within ? "text-[var(--pl-sage)]" : "text-[var(--pl-accent)]"}`}>
              {within ? <CircleCheck className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
              {within ? `${money(difference, pricing.currency)} under budget` : `${money(overBy, pricing.currency)} over budget`}
              <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--pl-muted)]">
                {within ? <ArrowDownRight className="size-3" aria-hidden /> : <ArrowUpRight className="size-3" aria-hidden />}
                {mode === "person" ? "per person" : "total"}
              </span>
            </p>
          </>
        )}
        <p className="mt-3 text-[10px] text-[var(--pl-muted)]">Selling price from the pricing engine. {mode === "person" ? "The per-person view divides the total evenly across travellers. " : ""}Not a booking or an availability guarantee.</p>
      </section>
    );
  },
});
