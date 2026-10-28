"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { Info, Receipt } from "lucide-react";
import { CostBreakdownSchema } from "@tripweave/planning-contract";
import { money, percentFromBp } from "@/lib/utils";
import { resolvePlanningPackage, usePlanningSnapshot } from "../context";
import { MissingEntity } from "../ui";

const DESCRIPTION = "Authoritative cost breakdown for one package from CONTEXT. Internal cost and margin lines appear only when the viewer is authorised. Pass the packageId.";

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 ${strong ? "text-[14px] font-semibold" : "text-[12.5px] text-[var(--pl-muted)]"}`}>
      <dt>{label}</dt>
      <dd className={`tw-num ${strong ? "text-[var(--pl-ink)]" : "text-[var(--pl-ink)]"}`}>{value}</dd>
    </div>
  );
}

export const CostBreakdown = defineComponent({
  name: "CostBreakdown",
  description: DESCRIPTION,
  props: CostBreakdownSchema,
  component: function CostBreakdownView({ props }) {
    const snapshot = usePlanningSnapshot();
    const pkg = resolvePlanningPackage(snapshot, props.packageId);
    if (!pkg) return <MissingEntity what="cost breakdown" />;
    const pricing = pkg.pricing;
    if (!pricing) {
      return (
        <section className="pl-card p-5">
          <p className="pl-eyebrow">
            <Receipt className="size-3" aria-hidden /> Cost breakdown
          </p>
          <p role="status" className="mt-2 text-sm text-[var(--pl-muted)]">
            Pricing is unavailable for this package. Re-price it on the packages page before creating a quotation.
          </p>
        </section>
      );
    }
    const internal = pricing.totalCostMinor !== undefined;
    return (
      <section aria-label="Cost breakdown" className="pl-card overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="pl-eyebrow">
                <Receipt className="size-3" aria-hidden /> The receipt
              </p>
              <h3 className="pl-display mt-1 text-[1.9rem] leading-none">What the price includes</h3>
            </div>
            <span className="pl-chip">Package #{pkg.number}</span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3 rounded-2xl bg-[var(--pl-surface-2)] px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pl-muted)]">Total payable</p>
              <p className="tw-num pl-display mt-1 text-[2.2rem] leading-none">{money(pricing.totalPayableMinor, pricing.currency)}</p>
            </div>
            <span className="pl-chip pl-chip-sage">{pricing.currency}</span>
          </div>

          <dl className="mt-3 divide-y divide-dashed divide-[var(--pl-line)]">
            <Line label="Selling price" value={money(pricing.sellingPriceMinor, pricing.currency)} />
            <Line label="Selling tax" value={money(pricing.sellingTaxMinor, pricing.currency)} />
            {pricing.paymentFeeMinor !== undefined ? <Line label="Payment fee" value={money(pricing.paymentFeeMinor, pricing.currency)} /> : null}
            <Line label="Total payable" value={money(pricing.totalPayableMinor, pricing.currency)} strong />
          </dl>

          {pricing.warnings.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1">
              {pricing.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1.5 text-[11px] text-[var(--pl-accent)]">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {warning}
                </li>
              ))}
            </ul>
          ) : null}

          {internal ? (
            <section aria-label="Internal cost and margin" className="mt-4 rounded-2xl border border-[color-mix(in_oklab,var(--pl-accent)_35%,var(--pl-line))] bg-[var(--pl-accent-soft)] p-3">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--pl-accent)]">Internal only · not shown to the customer</h4>
                {pricing.approval?.required ? <span className="pl-chip pl-chip-accent">Margin approval required</span> : null}
              </div>
              <dl className="grid gap-x-5 sm:grid-cols-2">
                {pkg.package.totalCostMinor !== undefined ? <Line label="Accommodation cost" value={money(pkg.package.totalCostMinor, pkg.package.currency)} /> : null}
                {pkg.package.costPerNightMinor !== undefined ? <Line label="Cost per night" value={money(pkg.package.costPerNightMinor, pkg.package.currency)} /> : null}
                <Line label="Total cost incl. extras" value={money(pricing.totalCostMinor, pricing.currency)} />
                {pricing.grossProfitMinor !== undefined ? <Line label="Gross profit" value={money(pricing.grossProfitMinor, pricing.currency)} strong /> : null}
                {pricing.grossMarginBp !== undefined ? <Line label="Gross margin" value={percentFromBp(pricing.grossMarginBp)} /> : null}
                {pricing.markupBp !== undefined ? <Line label="Markup" value={percentFromBp(pricing.markupBp)} /> : null}
              </dl>
            </section>
          ) : (
            <p className="mt-3 text-[10px] text-[var(--pl-muted)]">Internal cost and margin are hidden for your role. Selling price and payable total come from the API.</p>
          )}

          <p className="mt-3 text-[10px] text-[var(--pl-muted)]">This is a quotation estimate, not a booking or a guarantee of availability.</p>
        </div>
      </section>
    );
  },
});
