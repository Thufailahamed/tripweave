"use client";
import * as React from "react";
import { Coins, Percent, Receipt, TrendingUp, Wallet } from "lucide-react";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, money, percentFromBp, titleCase } from "@/lib/utils";
import { categoryLabel } from "./helpers";
import type { VersionDetail } from "./types";

type TileTone = "neutral" | "success" | "info" | "warning" | "danger";

const TILE_TONES: Record<TileTone, string> = {
  neutral: "border-border bg-muted/45 text-foreground",
  success: "border-success/25 bg-success-soft text-success",
  info: "border-info/25 bg-info-soft text-info",
  warning: "border-warning/25 bg-warning-soft text-warning",
  danger: "border-destructive/25 bg-destructive-soft text-destructive",
};

function MarginTile({ label, value, icon: Icon, tone }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; tone: TileTone }) {
  return (
    <div className={cn("rounded-xl border p-3", TILE_TONES[tone])}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</p>
        <Icon className="size-4 opacity-70" aria-hidden strokeWidth={1.8} />
      </div>
      <p className="tw-num mt-2 font-display text-xl font-semibold leading-none tracking-[-0.04em]">{value}</p>
    </div>
  );
}

/** Itemised pricing (selling prices only unless the API returned cost fields). */
export function PricingTable({ version, currency }: { version: VersionDetail; currency: string }) {
  const p = version.pricing;
  const showCost = version.items.some((i) => i.totalCostMinor !== undefined);
  return (
    <Card className="overflow-hidden">
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
              <tr key={i.id} className="border-t border-border align-top transition-colors hover:bg-accent-soft/25">
                <td className="px-4 py-3">
                  <p className="font-medium">{i.description}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge tone={i.category === "accommodation" ? "accent" : i.category === "transport" ? "info" : i.category === "activity" ? "success" : "neutral"}>{categoryLabel(i.category)}</Badge>
                    {i.optional ? <Badge tone="outline">Optional</Badge> : null}
                  </p>
                </td>
                <td className="tw-num px-4 py-3 text-right">{i.quantity}</td>
                <td className="tw-num px-4 py-3 text-right">{money(i.unitSellingMinor, i.currency || currency)}</td>
                <td className={`tw-num px-4 py-3 text-right font-medium ${i.optional ? "text-muted-foreground" : ""}`}>{money(i.totalSellingMinor, i.currency || currency)}</td>
                {showCost ? <td className="tw-num px-4 py-3 text-right text-muted-foreground">{money(i.totalCostMinor, i.currency || currency)}</td> : null}
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
      <CardContent className="border-t border-border bg-[linear-gradient(120deg,var(--accent-soft),transparent_62%)]">
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
  const selling = p.sellingPriceMinor ?? version.sellingPriceMinor;
  const marginPct = margin === undefined ? 0 : Math.max(0, Math.min(100, margin / 100));
  const tone: TileTone = margin === undefined ? "neutral" : marginPct >= 20 ? "success" : marginPct >= 10 ? "warning" : "danger";
  const gaugeColor = tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : tone === "danger" ? "var(--destructive)" : "var(--muted-foreground)";
  const costPct = selling && selling > 0 && cost !== undefined ? Math.max(0, Math.min(100, (cost / selling) * 100)) : 0;
  const profitPct = selling && selling > 0 && profit !== undefined ? Math.max(0, Math.min(100, (profit / selling) * 100)) : 0;
  const cats = p.categoryTotals ? Object.entries(p.categoryTotals) : [];
  return (
    <Card className="overflow-hidden border-accent/30">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>Internal margins</CardTitle>
          <CardDescription>Visible to staff with margin access only. Never shown to the client.</CardDescription>
        </div>
        <Badge tone={tone === "success" ? "success" : tone === "warning" ? "warning" : tone === "danger" ? "danger" : "neutral"}>
          {tone === "success" ? "Healthy margin" : tone === "warning" ? "Watch margin" : tone === "danger" ? "Low margin" : "Margin"}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-stretch">
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-[radial-gradient(120%_120%_at_0%_0%,var(--accent-soft),transparent_60%)] p-4">
            <div
              role="img"
              aria-label={`Gross margin ${percentFromBp(margin)}`}
              className="relative grid size-24 shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(${gaugeColor} ${marginPct}%, var(--muted) 0)` }}
            >
              <div aria-hidden className="absolute inset-[7px] rounded-full bg-card" />
              <div className="relative text-center">
                <span className={cn("tw-num block font-display text-2xl font-semibold leading-none tracking-[-0.05em]", tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-foreground")}>
                  {percentFromBp(margin)}
                </span>
                <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">gross margin</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Margin health</p>
              <p className="mt-1 font-display text-xl leading-tight tracking-[-0.04em]">{tone === "success" ? "Comfortable headroom" : tone === "warning" ? "Worth a closer look" : tone === "danger" ? "Thin margin" : "Margin snapshot"}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {marginPct >= 20 ? "The quotation has room for negotiation without eroding the target margin." : "Review the discount or cost before issuing this version."}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MarginTile label="Total cost (net)" value={money(cost, currency)} icon={Wallet} tone="neutral" />
            <MarginTile label="Gross profit" value={money(profit, currency)} icon={TrendingUp} tone="success" />
            <MarginTile label="Markup on cost" value={percentFromBp(p.markupBp)} icon={Percent} tone="info" />
            <MarginTile label="Payment fees" value={money(p.paymentFeeMinor ?? 0, currency)} icon={Receipt} tone="warning" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cost vs selling</p>
            <p className="text-xs text-muted-foreground">
              {money(cost, currency)} cost · {money(profit, currency)} profit
            </p>
          </div>
          <div role="img" aria-label={`Cost ${Math.round(costPct)}% and profit ${Math.round(profitPct)}% of selling price`} className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
            <div className="bg-accent/80 transition-[width] duration-700" style={{ width: `${costPct}%` }} title={`Cost ${money(cost, currency)}`} />
            <div className="bg-success transition-[width] duration-700" style={{ width: `${profitPct}%` }} title={`Profit ${money(profit, currency)}`} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-accent" /> Cost {Math.round(costPct)}%</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-success" /> Profit {Math.round(profitPct)}%</span>
            <span className="inline-flex items-center gap-1.5"><Coins className="size-3.5 text-accent" aria-hidden /> Selling {money(selling, currency)}</span>
          </div>
        </div>

        {cats.length > 0 ? (
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">By category</p>
            <div className="flex flex-col gap-2.5">
              {cats.map(([cat, t]) => {
                const catMargin = t.sellingMinor > 0 ? Math.round(((t.sellingMinor - t.costMinor) / t.sellingMinor) * 1_000) / 10 : 0;
                const catCostPct = t.sellingMinor > 0 ? Math.max(0, Math.min(100, (t.costMinor / t.sellingMinor) * 100)) : 0;
                return (
                  <div key={cat} className="group rounded-xl border border-border bg-card p-3 transition-colors hover:border-accent/40 hover:bg-accent-soft/20">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{categoryLabel(cat)}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{money(t.costMinor, currency)} cost</span>
                        <span aria-hidden>·</span>
                        <span>{money(t.sellingMinor, currency)} sell</span>
                        <Badge tone={catMargin >= 20 ? "success" : catMargin >= 10 ? "warning" : "danger"}>{catMargin.toFixed(1)}%</Badge>
                      </span>
                    </div>
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                      <div className="bg-accent/70" style={{ width: `${catCostPct}%` }} />
                      <div className="bg-success" style={{ width: `${100 - catCostPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {p.markupBp !== undefined ? <span className="rounded-full bg-muted px-2.5 py-1">Markup {percentFromBp(p.markupBp)}</span> : null}
          {p.paymentFeeMinor !== undefined ? <span className="rounded-full bg-muted px-2.5 py-1">Fees {money(p.paymentFeeMinor, currency)}</span> : null}
          {version.fx?.source ? <span className="rounded-full bg-muted px-2.5 py-1">FX {version.fx.source}{version.fx.asOf ? ` · ${version.fx.asOf.slice(0, 10)}` : ""}{version.fx.pivot ? ` · pivot ${version.fx.pivot}` : ""}</span> : null}
        </div>

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
