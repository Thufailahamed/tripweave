"use client";
import * as React from "react";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { money, percentFromBp, titleCase } from "@/lib/utils";
import { categoryLabel } from "./helpers";
import type { VersionDetail } from "./types";

/** Itemised pricing (selling prices only unless the API returned cost fields). */
export function PricingTable({ version, currency }: { version: VersionDetail; currency: string }) {
  const p = version.pricing;
  const showCost = version.items.some((i) => i.totalCostMinor !== undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
        <CardDescription>Itemised in {currency}. Optional items are shown but not included in the total.</CardDescription>
      </CardHeader>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">Itemised quotation pricing for version {version.versionNumber}</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-semibold">Item</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Qty</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Unit price</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Total</th>
              {showCost ? <th scope="col" className="px-4 py-2 text-right font-semibold">Cost</th> : null}
            </tr>
          </thead>
          <tbody>
            {version.items.map((i) => (
              <tr key={i.id} className="border-t border-border align-top">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{i.description}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {categoryLabel(i.category)}
                    {i.optional ? <Badge tone="outline">Optional</Badge> : null}
                  </p>
                </td>
                <td className="tw-num px-4 py-2.5 text-right">{i.quantity}</td>
                <td className="tw-num px-4 py-2.5 text-right">{money(i.unitSellingMinor, i.currency || currency)}</td>
                <td className={`tw-num px-4 py-2.5 text-right font-medium ${i.optional ? "text-muted-foreground" : ""}`}>{money(i.totalSellingMinor, i.currency || currency)}</td>
                {showCost ? <td className="tw-num px-4 py-2.5 text-right text-muted-foreground">{money(i.totalCostMinor, i.currency || currency)}</td> : null}
              </tr>
            ))}
            {version.items.length === 0 ? (
              <tr>
                <td colSpan={showCost ? 5 : 4} className="px-4 py-6 text-center text-muted-foreground">This version has no line items.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <CardContent className="border-t border-border">
        <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
          {p.sellingPriceBeforeDiscountMinor !== undefined ? (
            <>
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tw-num text-right">{money(p.sellingPriceBeforeDiscountMinor, currency)}</dd>
            </>
          ) : null}
          {p.discountMinor ? (
            <>
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tw-num text-right text-success">−{money(p.discountMinor, currency)}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Selling price</dt>
          <dd className="tw-num text-right font-medium">{money(p.sellingPriceMinor ?? version.sellingPriceMinor, currency)}</dd>
          {p.sellingTaxMinor !== undefined ? (
            <>
              <dt className="text-muted-foreground">Taxes</dt>
              <dd className="tw-num text-right">{money(p.sellingTaxMinor, currency)}</dd>
            </>
          ) : null}
          {p.totalPayableMinor !== undefined ? (
            <>
              <dt className="border-t border-border pt-2 font-semibold">Total payable</dt>
              <dd className="tw-num border-t border-border pt-2 text-right font-display text-lg font-semibold">{money(p.totalPayableMinor, currency)}</dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Internal commercial panel. Renders nothing unless the API returned cost/margin fields (margins:view). */
export function MarginPanel({ version, currency }: { version: VersionDetail; currency: string }) {
  const p = version.pricing;
  const cost = version.totalCostMinor ?? p.totalCostMinor;
  const profit = version.grossProfitMinor ?? p.grossProfitMinor;
  const margin = version.grossMarginBp ?? p.grossMarginBp;
  if (cost === undefined && profit === undefined && margin === undefined) return null;
  const rows: [string, React.ReactNode][] = [];
  if (cost !== undefined) rows.push(["Total cost (net)", money(cost, currency)]);
  if (p.paymentFeeMinor !== undefined) rows.push(["Payment fees", money(p.paymentFeeMinor, currency)]);
  if (profit !== undefined) rows.push(["Gross profit", money(profit, currency)]);
  if (margin !== undefined) rows.push(["Gross margin", percentFromBp(margin)]);
  if (p.markupBp !== undefined) rows.push(["Markup on cost", percentFromBp(p.markupBp)]);
  if (version.fx?.source) rows.push(["FX source", `${version.fx.source}${version.fx.asOf ? ` · ${version.fx.asOf.slice(0, 10)}` : ""}${version.fx.pivot ? ` · pivot ${version.fx.pivot}` : ""}`]);
  const cats = p.categoryTotals ? Object.entries(p.categoryTotals) : [];
  return (
    <Card className="border-accent/40">
      <CardHeader>
        <CardTitle>Internal margins</CardTitle>
        <CardDescription>Visible to staff with margin access only. Never shown to the client.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm sm:max-w-md">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="tw-num text-right font-medium">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
        {cats.length > 0 ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-sm">
              <caption className="sr-only">Cost and selling price by category</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1.5 text-left font-semibold">Category</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">Cost</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">Selling</th>
                </tr>
              </thead>
              <tbody>
                {cats.map(([cat, t]) => (
                  <tr key={cat} className="border-t border-border">
                    <td className="py-1.5">{categoryLabel(cat)}</td>
                    <td className="tw-num py-1.5 text-right">{money(t.costMinor, currency)}</td>
                    <td className="tw-num py-1.5 text-right">{money(t.sellingMinor, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {p.warnings && p.warnings.length > 0 ? (
          <Alert tone="warning" title="Pricing warnings">
            <ul className="list-disc pl-4">
              {p.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {p.approval?.required ? (
          <Alert tone="warning" title="Manager approval required">
            {p.approval.reasons && p.approval.reasons.length > 0 ? (
              <ul className="list-disc pl-4">
                {p.approval.reasons.map((r) => (
                  <li key={r}>{titleCase(r)}</li>
                ))}
              </ul>
            ) : (
              "This version exceeds a discount or margin threshold."
            )}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
