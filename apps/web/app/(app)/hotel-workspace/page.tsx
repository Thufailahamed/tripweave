"use client";
import * as React from "react";
import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { BarChart3, Building2, CalendarClock, Handshake, Hotel, Inbox, Plus, Tag } from "lucide-react";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, IconTile, LoadingBlock, PageHeader, Skeleton, Stat, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/data-table";
import { apiGet, apiList } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import { formatDate, percentFromBp } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import { CATEGORY_LABEL, expiryState } from "@/features/hotels/lib";
import { ExpiryBadge } from "@/features/hotels/rates-tab";
import type { Enquiry, HotelDetail, PartnerShare, Property, RatePlan } from "@/features/hotels/types";

const DETAIL_LIMIT = 40;
const PAGE = 10;

interface QuotationPerformance {
  byStatus: Record<string, number>;
  total: number;
  sent: number;
  accepted: number;
  conversionBp: number;
  avgMarginBp?: number;
  range: { from: string; to: string };
}
interface SupplierPerformance {
  since: string;
  suppliers: { providerKey: string; offersRetrieved: number; mockOffers: number; avgPriceCheckedShare: number; calls: number; errors: number; avgLatencyMs: number }[];
}

function Section<T>({ q, title, children, empty }: { q: { isLoading: boolean; error: unknown; refetch: () => unknown; data: T | undefined }; title: string; children: (d: T) => React.ReactNode; empty?: (d: T) => boolean }) {
  if (q.isLoading) return <LoadingBlock rows={2} label={`Loading ${title}`} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title={`Could not load ${title}`} />;
  if (q.data === undefined) return null;
  if (empty?.(q.data)) return <p className="text-sm text-muted-foreground">No data recorded for this period.</p>;
  return <>{children(q.data)}</>;
}

export default function HotelWorkspacePage() {
  const can = useCan();
  const { data: session } = useSession();
  const [page, setPage] = React.useState(1);

  const props = useQuery({ queryKey: ["hotels", "workspace-own"], queryFn: () => apiList<Property>("/hotels", { scope: "own", pageSize: 100, sort: "name", order: "asc" }), enabled: can("hotels:read") });
  const properties = props.data?.items ?? [];
  const detailTargets = properties.slice(0, DETAIL_LIMIT);
  const details = useQueries({ queries: detailTargets.map((p) => ({ queryKey: ["hotel", p.id], queryFn: () => apiGet<HotelDetail>(`/hotels/${p.id}`), staleTime: 60_000 })) });
  const detailsLoading = details.some((d) => d.isLoading);
  const detailById = new Map(details.map((d, i) => [detailTargets[i]!.id, d.data]));

  const expiring = useQuery({ queryKey: ["expiring", 30], queryFn: () => apiGet<RatePlan[]>("/rates/expiring", { days: 30 }), enabled: can("rates:read") });
  const shares = useQuery({ queryKey: ["partners", "shared"], queryFn: () => apiGet<PartnerShare[]>("/partners/shared"), enabled: can("partners:manage") });
  const received = useQuery({ queryKey: ["enquiries", "received"], queryFn: () => apiGet<Enquiry[]>("/enquiries", { direction: "received" }), enabled: can("trips:read") });
  const sent = useQuery({ queryKey: ["enquiries", "sent"], queryFn: () => apiGet<Enquiry[]>("/enquiries", { direction: "sent" }), enabled: can("trips:read") });
  const quotation = useQuery({ queryKey: ["reports", "quotation-performance"], queryFn: () => apiGet<QuotationPerformance>("/reports/quotation-performance"), enabled: can("reports:read") });
  const suppliers = useQuery({ queryKey: ["reports", "supplier-performance"], queryFn: () => apiGet<SupplierPerformance>("/reports/supplier-performance"), enabled: can("reports:read") });

  const loadedDetails = details.filter((d) => d.data).map((d) => d.data!);
  const roomCount = loadedDetails.reduce((s, d) => s + d.rooms.length, 0);
  const planCount = loadedDetails.reduce((s, d) => s + d.ratePlans.filter((p) => !p.shared).length, 0);
  const activeProps = properties.filter((p) => p.status === "active").length;
  const activeShares = (shares.data ?? []).filter((s) => s.status === "active").length;
  const openEnquiries = (received.data ?? []).filter((e) => e.status === "open").length;
  const total = props.data?.meta.total ?? 0;
  const pageItems = properties.slice((page - 1) * PAGE, page * PAGE);
  const pageMeta = { total: properties.length, page, pageSize: PAGE, pages: Math.max(1, Math.ceil(properties.length / PAGE)) };

  if (!can("hotels:read")) return <Alert tone="warning" title="Not available to your role">You need the hotels:read permission.</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={session?.organization?.name}
        title="Hotel portfolio"
        description="Your properties, how well their rates are covered, and what partners are doing with them."
        icon={Building2}
        image={IMAGES.auth}
        actions={
          <>
            <Button asChild variant="outline"><Link href="/hotel-workspace/partners">Partner sharing</Link></Button>
            {can("hotels:write") ? (
              <Button asChild><Link href="/hotels/new"><Plus /> Add hotel</Link></Button>
            ) : null}
          </>
        }
      />

      <section aria-label="Portfolio totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Building2} iconTone="primary" label="Properties" value={props.isLoading ? "…" : total} hint={props.data ? `${activeProps} active` : undefined} />
        <Stat icon={Hotel} iconTone="info" label="Room types" value={detailsLoading || props.isLoading ? "…" : roomCount} />
        <Stat icon={Tag} iconTone="accent" label="Rate plans" value={detailsLoading || props.isLoading ? "…" : planCount} />
        <Stat icon={CalendarClock} iconTone="warning" label="Rates expiring (30d)" value={can("rates:read") ? (expiring.isLoading ? "…" : (expiring.data?.length ?? "—")) : "—"} tone={(expiring.data?.length ?? 0) > 0 ? "warning" : "default"} hint="Including already expired" />
        <Stat icon={Handshake} iconTone="success" label="Active partner shares" value={can("partners:manage") ? (shares.isLoading ? "…" : shares.data ? activeShares : "—") : "—"} />
        <Stat icon={Inbox} iconTone="info" label="Open enquiries" value={can("trips:read") ? (received.isLoading ? "…" : received.data ? openEnquiries : "—") : "—"} tone={openEnquiries > 0 ? "warning" : "default"} hint="Received, awaiting a response" />
      </section>
      {properties.length > DETAIL_LIMIT ? <Alert tone="info">Room and rate-plan counts cover the first {DETAIL_LIMIT} of {total} properties.</Alert> : null}

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <IconTile icon={Building2} tone="primary" size="sm" />
          <div>
            <CardTitle>Properties</CardTitle>
            <CardDescription>Rate coverage counts your own active rate plans and shows when the latest one ends.</CardDescription>
          </div>
        </CardHeader>
        {props.isLoading ? (
          <CardContent><LoadingBlock label="Loading properties" /></CardContent>
        ) : props.error ? (
          <CardContent><ErrorState error={props.error} onRetry={() => props.refetch()} title="Could not load properties" /></CardContent>
        ) : properties.length === 0 ? (
          <CardContent>
            <EmptyState icon={Building2} title="No properties yet" description="Add the hotels you manage to start publishing rates and sharing them with partners." action={can("hotels:write") ? <Button asChild><Link href="/hotels/new">Add hotel</Link></Button> : undefined} />
          </CardContent>
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <caption className="sr-only">Owned properties</caption>
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Hotel</th>
                    <th scope="col" className="px-4 py-2.5">Category</th>
                    <th scope="col" className="px-4 py-2.5">Status</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Rooms</th>
                    <th scope="col" className="px-4 py-2.5">Rate coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p) => {
                    const d = detailById.get(p.id);
                    const own = d?.ratePlans.filter((r) => !r.shared) ?? [];
                    const active = own.filter((r) => r.status === "active");
                    const latest = active.map((r) => r.effectiveTo).sort().at(-1);
                    const state = latest ? expiryState(latest) : null;
                    return (
                      <tr key={p.id} className="border-t border-border transition-colors hover:bg-foreground/[0.03]">
                        <td className="px-4 py-3">
                          <Link href={`/hotels/${p.id}`} className="font-semibold text-primary hover:underline">{p.name}</Link>
                          <div className="text-xs text-muted-foreground">{p.city}</div>
                        </td>
                        <td className="px-4 py-3">{CATEGORY_LABEL[p.category] ?? p.category}</td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                        <td className="tw-num px-4 py-3 text-right">{d ? d.rooms.length : <Skeleton className="ml-auto h-4 w-6" />}</td>
                        <td className="px-4 py-3">
                          {!d ? (
                            <Skeleton className="h-4 w-32" />
                          ) : active.length === 0 ? (
                            <Badge tone="danger">No active rates</Badge>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>{active.length} active plan{active.length === 1 ? "" : "s"}, to {formatDate(latest)}</span>
                              {state ? <ExpiryBadge effectiveTo={latest!} /> : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pageMeta.pages > 1 ? <Pagination meta={pageMeta} onPageChange={setPage} /> : null}
          </>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <IconTile icon={CalendarClock} tone="warning" size="sm" />
            <div>
              <CardTitle>Rates needing attention</CardTitle>
              <CardDescription>Active plans ending within 30 days or already ended.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!can("rates:read") ? (
              <p className="text-sm text-muted-foreground">You need the rates:read permission.</p>
            ) : (
              <Section q={expiring} title="expiring rates">
                {(list) =>
                  list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">All active rate plans run beyond the next 30 days.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border">
                      {list.slice(0, 8).map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <span>
                            <Link href={`/hotels/${r.propertyId}?tab=rates`} className="font-semibold text-primary hover:underline">{r.propertyName}</Link>
                            <span className="text-muted-foreground"> · {r.name}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="tw-num text-xs text-muted-foreground">{formatDate(r.effectiveTo)}</span>
                            <ExpiryBadge effectiveTo={r.effectiveTo} />
                          </span>
                        </li>
                      ))}
                      {list.length > 8 ? (
                        <li className="pt-2 text-xs"><Link href="/hotels/rates" className="font-semibold text-primary hover:underline">See all {list.length} on the rates page</Link></li>
                      ) : null}
                    </ul>
                  )
                }
              </Section>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <IconTile icon={Handshake} tone="success" size="sm" />
            <div>
              <CardTitle>Partner activity</CardTitle>
              <CardDescription>Shares you granted and enquiries exchanged with partners.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Active shares</span>
              <span className="tw-num font-semibold">{can("partners:manage") ? (shares.isLoading ? "…" : shares.data ? activeShares : "—") : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Enquiries received</span>
              <span className="tw-num font-semibold">{received.data ? `${received.data.length} (${openEnquiries} open)` : received.isLoading ? "…" : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Enquiries sent</span>
              <span className="tw-num font-semibold">{sent.data ? sent.data.length : sent.isLoading ? "…" : "—"}</span>
            </div>
            <div className="flex gap-2 pt-1">
              <Button asChild size="sm" variant="outline"><Link href="/hotel-workspace/partners">Manage sharing</Link></Button>
              <Button asChild size="sm" variant="outline"><Link href="/hotel-workspace/enquiries">Open enquiries</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <IconTile icon={BarChart3} tone="info" size="sm" />
          <div>
            <CardTitle>Portfolio performance</CardTitle>
            <CardDescription>Recorded activity from quotations and supplier connections. Figures appear only where the platform has recorded data; nothing is estimated.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!can("reports:read") ? (
            <p className="text-sm text-muted-foreground">You need the reports:read permission to see performance figures.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="min-w-0">
                <h3 className="mb-2 text-sm font-semibold">Quotation activity</h3>
                <Section q={quotation} title="quotation performance" empty={(d) => d.total === 0}>
                  {(d) => (
                    <div>
                      <p className="mb-2 text-xs text-muted-foreground">{formatDate(d.range.from)} – {formatDate(d.range.to)}</p>
                      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        <div><dt className="text-xs text-muted-foreground">Quotes created</dt><dd className="tw-num text-lg font-semibold">{d.total}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Sent</dt><dd className="tw-num text-lg font-semibold">{d.sent}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Accepted</dt><dd className="tw-num text-lg font-semibold">{d.accepted}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Conversion</dt><dd className="tw-num text-lg font-semibold">{percentFromBp(d.conversionBp)}</dd></div>
                        {d.avgMarginBp !== undefined ? <div><dt className="text-xs text-muted-foreground">Average margin</dt><dd className="tw-num text-lg font-semibold">{percentFromBp(d.avgMarginBp)}</dd></div> : null}
                      </dl>
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {Object.entries(d.byStatus).map(([s, n]) => (
                          <li key={s}><StatusBadge status={s} label={`${s.replace(/_/g, " ")}: ${n}`} /></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Section>
              </div>
              <div className="min-w-0">
                <h3 className="mb-2 text-sm font-semibold">Supplier connections (last 30 days)</h3>
                <Section q={suppliers} title="supplier performance" empty={(d) => d.suppliers.length === 0}>
                  {(d) => (
                    <div className="relative overflow-x-auto">
                      <table className="w-full min-w-[420px] border-collapse text-sm">
                        <caption className="sr-only">Supplier performance</caption>
                        <thead className="text-left text-xs text-muted-foreground">
                          <tr>
                            <th scope="col" className="py-1.5 pr-3">Provider</th>
                            <th scope="col" className="py-1.5 pr-3 text-right">Offers</th>
                            <th scope="col" className="py-1.5 pr-3 text-right">Calls</th>
                            <th scope="col" className="py-1.5 pr-3 text-right">Errors</th>
                            <th scope="col" className="py-1.5 text-right">Avg latency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.suppliers.map((s) => (
                            <tr key={s.providerKey} className="border-t border-border">
                              <td className="py-2 pr-3 font-mono text-xs">{s.providerKey}{s.mockOffers > 0 ? <Badge tone="warning" className="ml-2">{s.mockOffers} illustrative</Badge> : null}</td>
                              <td className="tw-num py-2 pr-3 text-right">{s.offersRetrieved}</td>
                              <td className="tw-num py-2 pr-3 text-right">{s.calls}</td>
                              <td className="tw-num py-2 pr-3 text-right">{s.errors}</td>
                              <td className="tw-num py-2 text-right">{s.avgLatencyMs} ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
