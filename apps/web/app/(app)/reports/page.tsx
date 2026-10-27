"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, CheckCircle2, Coins, FileText, Handshake, PieChart, Send, Sparkles, TrendingUp } from "lucide-react";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, IconTile, LoadingBlock, PageHeader, Stat } from "@/components/ui/card";
import { IMAGES } from "@/features/marketing/imagery";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { apiGet } from "@/lib/api";
import { formatDate, formatDateTime, money, percentFromBp, titleCase } from "@/lib/utils";
import { MonthlyChart, type MonthlyDatum } from "@/features/dashboard/monthly-chart";
import { statusLabel } from "@/features/quotes/helpers";

interface QuotationPerformance {
  byStatus: Record<string, number>;
  total: number;
  sent: number;
  accepted: number;
  conversionBp: number;
  avgMarginBp?: number;
  sellingByCurrency: { currency: string; accepted: number; pipeline: number }[];
  monthly: MonthlyDatum[];
  range: { from: string; to: string };
}
interface SupplierPerformance {
  since: string;
  suppliers: { providerKey: string; offersRetrieved: number; mockOffers: number; avgPriceCheckedShare: number; calls: number; errors: number; avgLatencyMs: number }[];
  health: { providerKey: string; calls: number; errors: number; avgLatencyMs: number; lastCallAt: string | null }[];
  ai: { engine: string; operation: string; calls: number; input_chars: number | null; output_chars: number | null; avg_latency: number | null }[];
}

const th = "px-4 py-2 text-xs font-medium text-muted-foreground";

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" description="Quotation outcomes and supplier data quality, straight from your records." icon={BarChart3} image={IMAGES.footer} />
      <Tabs defaultValue="quotations">
        <TabsList aria-label="Reports">
          <TabsTrigger value="quotations">Quotation performance</TabsTrigger>
          <TabsTrigger value="suppliers">Supplier performance</TabsTrigger>
        </TabsList>
        <TabsContent value="quotations">
          <QuotationReport />
        </TabsContent>
        <TabsContent value="suppliers">
          <SupplierReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuotationReport() {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [applied, setApplied] = React.useState<{ from?: string; to?: string }>({});
  const invalid = !!from && !!to && from > to;
  const q = useQuery({ queryKey: ["reports", "quotation-performance", applied], queryFn: () => apiGet<QuotationPerformance>("/reports/quotation-performance", applied) });
  const d = q.data;

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) setApplied({ from: from || undefined, to: to || undefined });
        }}
      >
        <Field label="From" htmlFor="rep-from">
          <Input id="rep-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="rep-to" error={invalid ? "End date must be after the start date." : null}>
          <Input id="rep-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button type="submit" disabled={invalid}>Apply</Button>
        {from || to || applied.from || applied.to ? (
          <Button
            variant="ghost"
            onClick={() => {
              setFrom("");
              setTo("");
              setApplied({});
            }}
          >
            Reset to last 90 days
          </Button>
        ) : null}
      </form>

      {q.isLoading ? (
        <LoadingBlock rows={5} label="Loading report" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load the report" />
      ) : d ? (
        <>
          <p className="text-sm text-muted-foreground">
            Quotations created between <strong>{formatDate(d.range.from)}</strong> and <strong>{formatDate(d.range.to)}</strong>.
            {applied.from || applied.to ? "" : " This is the default window; pick dates to change it."}
          </p>
          {d.total === 0 ? (
            <EmptyState icon={BarChart3} title="No quotations in this period" description="Widen the date range, or create and send quotations to see outcomes here." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                <Stat icon={FileText} iconTone="primary" label="Created" value={d.total} />
                <Stat icon={Send} iconTone="accent" label="Issued to clients" value={d.sent} hint="Sent, viewed, decided or expired" />
                <Stat icon={CheckCircle2} iconTone="success" tone="success" label="Accepted" value={d.accepted} />
                <Stat icon={TrendingUp} iconTone="warning" label="Conversion" value={percentFromBp(d.conversionBp)} hint="Accepted of issued" />
                {d.avgMarginBp !== undefined ? <Stat icon={Coins} iconTone="info" label="Average margin" value={percentFromBp(d.avgMarginBp)} hint="Current versions" /> : null}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="flex-row items-center gap-3">
                    <IconTile icon={PieChart} tone="primary" size="sm" />
                    <CardTitle>Status breakdown</CardTitle>
                  </CardHeader>
                  <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">Quotations by status</caption>
                    <thead className="bg-muted/60">
                      <tr>
                        <th scope="col" className={`${th} text-left`}>Status</th>
                        <th scope="col" className={`${th} text-right`}>Quotations</th>
                        <th scope="col" className={`${th} text-right`}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(d.byStatus)
                        .sort((a, b) => b[1] - a[1])
                        .map(([s, n]) => (
                          <tr key={s} className="border-t border-border">
                            <th scope="row" className="px-4 py-2 text-left font-normal">{statusLabel(s)}</th>
                            <td className="tw-num px-4 py-2 text-right">{n}</td>
                            <td className="tw-num px-4 py-2 text-right text-muted-foreground">{percentFromBp(Math.round((n * 10_000) / d.total), 0)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Card>

                <Card>
                  <CardHeader className="flex-row items-center gap-3">
                    <IconTile icon={Coins} tone="accent" size="sm" />
                    <div>
                      <CardTitle>Selling value by currency</CardTitle>
                      <CardDescription>Accepted versus still in the pipeline (ready, sent or viewed). Currencies are never added together.</CardDescription>
                    </div>
                  </CardHeader>
                  {d.sellingByCurrency.length === 0 ? (
                    <CardContent>
                      <p className="text-sm text-muted-foreground">No priced quotations in this period.</p>
                    </CardContent>
                  ) : (
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">Selling value by currency</caption>
                      <thead className="bg-muted/60">
                        <tr>
                          <th scope="col" className={`${th} text-left`}>Currency</th>
                          <th scope="col" className={`${th} text-right`}>Accepted</th>
                          <th scope="col" className={`${th} text-right`}>Pipeline</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.sellingByCurrency.map((r) => (
                          <tr key={r.currency} className="border-t border-border">
                            <th scope="row" className="px-4 py-2 text-left font-normal">{r.currency}</th>
                            <td className="tw-num px-4 py-2 text-right font-medium">{money(r.accepted, r.currency)}</td>
                            <td className="tw-num px-4 py-2 text-right">{money(r.pipeline, r.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </div>

              <Card>
                <CardHeader className="flex-row items-center gap-3">
                  <IconTile icon={BarChart3} tone="info" size="sm" />
                  <div>
                    <CardTitle>Created versus accepted by month</CardTitle>
                    <CardDescription>Months are by quotation creation date.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {d.monthly.length === 0 ? <p className="text-sm text-muted-foreground">No monthly data.</p> : <MonthlyChart data={d.monthly} />}
                </CardContent>
              </Card>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function SupplierReport() {
  const q = useQuery({ queryKey: ["reports", "supplier-performance"], queryFn: () => apiGet<SupplierPerformance>("/reports/supplier-performance") });
  if (q.isLoading) return <LoadingBlock rows={5} label="Loading report" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load the report" />;
  const d = q.data;
  if (!d) return null;
  const empty = d.suppliers.length === 0 && d.health.length === 0 && d.ai.length === 0;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">Activity since {formatDateTime(d.since)} (last 30 days).</p>
      {empty ? (
        <EmptyState icon={BarChart3} title="No supplier activity yet" description="Offers retrieved from rate sources and supplier API calls appear here after you run your first optimisation." />
      ) : null}

      {d.suppliers.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <IconTile icon={Handshake} tone="primary" size="sm" />
            <div>
              <CardTitle>Offers by provider</CardTitle>
              <CardDescription>How many offers each source returned and how many were verified with a live price check.</CardDescription>
            </div>
          </CardHeader>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Supplier performance by provider</caption>
              <thead className="bg-muted/60">
                <tr>
                  <th scope="col" className={`${th} text-left`}>Provider</th>
                  <th scope="col" className={`${th} text-right`}>Offers</th>
                  <th scope="col" className={`${th} text-right`}>Illustrative</th>
                  <th scope="col" className={`${th} text-right`}>Price-checked</th>
                  <th scope="col" className={`${th} text-right`}>API calls</th>
                  <th scope="col" className={`${th} text-right`}>Errors</th>
                  <th scope="col" className={`${th} text-right`}>Avg latency</th>
                </tr>
              </thead>
              <tbody>
                {d.suppliers.map((s) => (
                  <tr key={s.providerKey} className="border-t border-border">
                    <th scope="row" className="px-4 py-2 text-left font-medium">{titleCase(s.providerKey)}</th>
                    <td className="tw-num px-4 py-2 text-right">{s.offersRetrieved}</td>
                    <td className="tw-num px-4 py-2 text-right">{s.mockOffers > 0 ? <Badge tone="warning">{s.mockOffers} mock</Badge> : 0}</td>
                    <td className="tw-num px-4 py-2 text-right">{s.offersRetrieved > 0 ? `${Math.round(s.avgPriceCheckedShare * 100)}%` : "—"}</td>
                    <td className="tw-num px-4 py-2 text-right">{s.calls}</td>
                    <td className="tw-num px-4 py-2 text-right">{s.errors > 0 ? <span className="font-semibold text-destructive">{s.errors}</span> : 0}</td>
                    <td className="tw-num px-4 py-2 text-right">{s.calls > 0 ? `${s.avgLatencyMs} ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {d.health.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <IconTile icon={Activity} tone="success" size="sm" />
            <div>
              <CardTitle>Provider health</CardTitle>
              <CardDescription>A provider is flagged when 30% or more of its calls failed.</CardDescription>
            </div>
          </CardHeader>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">Provider health</caption>
              <thead className="bg-muted/60">
                <tr>
                  <th scope="col" className={`${th} text-left`}>Provider</th>
                  <th scope="col" className={`${th} text-left`}>State</th>
                  <th scope="col" className={`${th} text-right`}>Calls</th>
                  <th scope="col" className={`${th} text-right`}>Errors</th>
                  <th scope="col" className={`${th} text-right`}>Avg latency</th>
                  <th scope="col" className={`${th} text-left`}>Last call</th>
                </tr>
              </thead>
              <tbody>
                {d.health.map((h) => {
                  const rate = h.calls > 0 ? h.errors / h.calls : 0;
                  return (
                    <tr key={h.providerKey} className="border-t border-border">
                      <th scope="row" className="px-4 py-2 text-left font-medium">{titleCase(h.providerKey)}</th>
                      <td className="px-4 py-2">{rate >= 0.3 ? <Badge tone="danger">Unhealthy</Badge> : rate > 0 ? <Badge tone="warning">Some errors</Badge> : <Badge tone="success">Healthy</Badge>}</td>
                      <td className="tw-num px-4 py-2 text-right">{h.calls}</td>
                      <td className="tw-num px-4 py-2 text-right">{h.errors}</td>
                      <td className="tw-num px-4 py-2 text-right">{h.avgLatencyMs} ms</td>
                      <td className="px-4 py-2 text-muted-foreground">{formatDateTime(h.lastCallAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <IconTile icon={Sparkles} tone="warning" size="sm" />
          <div>
            <CardTitle>AI usage</CardTitle>
            <CardDescription>Calls made to language-model engines for parsing and explanations.</CardDescription>
          </div>
        </CardHeader>
        {d.ai.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">No AI calls were made in this period.</p>
          </CardContent>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">AI usage by engine and operation</caption>
              <thead className="bg-muted/60">
                <tr>
                  <th scope="col" className={`${th} text-left`}>Engine</th>
                  <th scope="col" className={`${th} text-left`}>Operation</th>
                  <th scope="col" className={`${th} text-right`}>Calls</th>
                  <th scope="col" className={`${th} text-right`}>Characters in</th>
                  <th scope="col" className={`${th} text-right`}>Characters out</th>
                  <th scope="col" className={`${th} text-right`}>Avg latency</th>
                </tr>
              </thead>
              <tbody>
                {d.ai.map((a) => (
                  <tr key={`${a.engine}-${a.operation}`} className="border-t border-border">
                    <th scope="row" className="px-4 py-2 text-left font-medium">{titleCase(a.engine)}</th>
                    <td className="px-4 py-2">{titleCase(a.operation)}</td>
                    <td className="tw-num px-4 py-2 text-right">{a.calls}</td>
                    <td className="tw-num px-4 py-2 text-right">{(a.input_chars ?? 0).toLocaleString("en-GB")}</td>
                    <td className="tw-num px-4 py-2 text-right">{(a.output_chars ?? 0).toLocaleString("en-GB")}</td>
                    <td className="tw-num px-4 py-2 text-right">{Math.round(a.avg_latency ?? 0)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {d.suppliers.some((s) => s.mockOffers > 0) ? <Alert tone="warning">Some offers are illustrative mock data. They are labelled everywhere and can never be quoted.</Alert> : null}
    </div>
  );
}
