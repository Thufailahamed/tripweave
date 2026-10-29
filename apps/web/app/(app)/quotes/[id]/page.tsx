"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, Coins, FileText, FileX2, History, Hotel, Lock, MapPin, Wallet } from "lucide-react";
import { Alert, Card, CardContent, ErrorState, EmptyState, LoadingBlock, Stat, StatGrid, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { ApiError, apiGet } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDate, money } from "@/lib/utils";
import { ApprovalBanner } from "@/features/quotes/approval-banner";
import { BookingConfirmationCard } from "@/features/quotes/booking-confirmation";
import { REVISABLE, statusLabel } from "@/features/quotes/helpers";
import { LifecycleActions } from "@/features/quotes/lifecycle-actions";
import { NewVersionButton } from "@/features/quotes/new-version-dialog";
import { PdfPreview } from "@/features/quotes/pdf-preview";
import { ApprovalsCard, AcceptancesCard, StatusTimeline, VersionHistory } from "@/features/quotes/quote-history";
import { HotelsCard, ItineraryCard, TermsCard } from "@/features/quotes/quote-itinerary";
import { MarginPanel, PricingTable } from "@/features/quotes/quote-pricing";
import { ShareLinks } from "@/features/quotes/share-links";
import { quoteKeys, type QuoteDetailResponse } from "@/features/quotes/types";

export default function QuoteDetailPage() {
  return (
    <React.Suspense fallback={<LoadingBlock label="Loading quotation" />}>
      <QuoteDetail />
    </React.Suspense>
  );
}

function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const can = useCan();
  const raw = sp.get("version");
  const wanted = raw && /^\d+$/.test(raw) && Number(raw) >= 1 ? Number(raw) : undefined;
  const [tab, setTab] = React.useState("quotation");

  const q = useQuery({
    queryKey: quoteKeys.detail(id, wanted),
    queryFn: () => apiGet<QuoteDetailResponse>(`/quotes/${id}`, { version: wanted }),
    enabled: !!id,
  });

  if (q.isLoading) return <LoadingBlock rows={6} label="Loading quotation" />;
  if (q.error) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return (
        <EmptyState
          icon={FileX2}
          title={wanted ? "Quotation or version not found" : "Quotation not found"}
          description="It may have been removed, or it belongs to another organisation."
          action={
            <Button asChild variant="outline">
              <Link href={wanted ? `/quotes/${id}` : "/quotes"}>{wanted ? "Go to the current version" : "Back to quotations"}</Link>
            </Button>
          }
        />
      );
    return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load this quotation" />;
  }
  const d = q.data;
  if (!d) return null;
  const { quote, version } = d;
  const isCurrent = version.versionNumber === quote.currentVersion;
  const goVersion = (n: number) => router.replace(n === quote.currentVersion ? `/quotes/${id}` : `/quotes/${id}?version=${n}`);
  const stays = version.package.selections ?? [];
  const totalNights = stays.reduce((sum, s) => sum + s.offer.nights, 0);
  const destinations = [...new Set(stays.map((s) => s.destination))];

  return (
    <div>
      <header className="relative mb-6 overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_18px_50px_-34px_rgba(40,32,20,0.4)]">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_140%_at_100%_0%,var(--accent-soft),transparent_56%)]" />
        <div aria-hidden className="absolute -right-24 -top-28 size-80 rounded-full border border-accent/15" />
        <div aria-hidden className="absolute -right-10 -top-14 size-52 rounded-full border border-accent/10" />
        <div aria-hidden className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
        <div className="relative flex flex-col gap-6 p-6 md:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="tw-eyebrow">
              <Link href="/quotes" className="hover:underline">
                Quotations
              </Link>
            </p>
            <div className="mt-4 flex items-start gap-4">
              <span aria-hidden className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent sm:flex">
                <FileText className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.055em] md:text-[52px]">{quote.quoteNumber}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <StatusBadge status={quote.status} label={statusLabel(quote.status)} />
                  <span>
                    {quote.customerId ? (
                      <Link href={`/customers/${quote.customerId}`} className="font-medium text-foreground hover:underline">
                        {quote.customerName ?? "Customer"}
                      </Link>
                    ) : (
                      "No customer"
                    )}
                  </span>
                  <span aria-hidden>·</span>
                  <Link href={`/trips/${quote.tripRequestId}`} className="hover:underline">
                    {quote.tripTitle ?? "Trip request"}
                  </Link>
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4 text-accent" aria-hidden /> Valid until {formatDate(quote.validUntil)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Hotel className="size-4 text-accent" aria-hidden /> {stays.length} stay{stays.length === 1 ? "" : "s"} · {totalNights} night{totalNights === 1 ? "" : "s"}
              </span>
              {destinations.length > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-accent" aria-hidden /> {destinations.join(" → ")}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                Version
                <Select className="w-auto normal-case" value={version.versionNumber} onChange={(e) => goVersion(Number(e.target.value))} aria-label="Select version">
                  {d.versions.map((v) => (
                    <option key={v.versionNumber} value={v.versionNumber}>
                      v{v.versionNumber}
                      {v.versionNumber === quote.currentVersion ? " (current)" : ""}
                    </option>
                  ))}
                </Select>
              </label>
              {isCurrent && can("quotes:write") && REVISABLE.includes(quote.status) ? <NewVersionButton quote={quote} version={version} /> : null}
            </div>
            <p className="text-xs text-muted-foreground lg:text-right">
              Current version v{quote.currentVersion} · updated {formatDate(quote.updatedAt)}
            </p>
          </div>
        </div>
      </header>

      {!isCurrent ? (
        <Alert tone="info" className="mb-4">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Lock className="size-3.5" aria-hidden /> Version {version.versionNumber} is read-only.
            </span>
            <span>The current version is {quote.currentVersion}. Older versions are immutable.</span>
            <Link className="font-semibold underline" href={`/quotes/${id}`}>
              Go to the current version
            </Link>
          </p>
        </Alert>
      ) : null}

      {isCurrent && d.awaitingApproval ? (
        <div className="mb-4">
          <ApprovalBanner quoteId={quote.id} version={version.versionNumber} approvals={d.approvals} canApprove={d.canApprove} reasons={version.pricing.approval?.reasons} />
        </div>
      ) : null}

      <StatGrid className="mb-6 grid-cols-2 lg:grid-cols-4">
        <Stat bare icon={Coins} iconTone="accent" label="Selling price" value={money(version.sellingPriceMinor, quote.currency)} hint={`Version ${version.versionNumber}`} />
        {version.pricing.totalPayableMinor !== undefined ? <Stat bare icon={Wallet} iconTone="success" label="Total payable" value={money(version.pricing.totalPayableMinor, quote.currency)} hint="Including taxes" /> : null}
        <Stat bare icon={CalendarClock} iconTone={quote.status === "expired" ? "warning" : "info"} label="Valid until" value={formatDate(quote.validUntil)} tone={quote.status === "expired" ? "warning" : "default"} hint={quote.status === "expired" ? "Expired" : undefined} />
        <Stat bare icon={History} iconTone="primary" label="Created" value={formatDate(version.createdAt)} hint={`Updated ${formatDate(quote.updatedAt)}`} />
      </StatGrid>

      {isCurrent ? (
        <Card className="mb-6 overflow-hidden border-accent/25">
          <CardContent className="relative flex flex-wrap items-center justify-between gap-4 py-4">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,var(--accent-soft),transparent_58%)]" />
            <div className="relative">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Next step</p>
              <p className="mt-1 text-sm text-muted-foreground">Issue the quotation, request a review, or record the client&apos;s decision.</p>
            </div>
            <div className="relative">
              <LifecycleActions quote={quote} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isCurrent ? <BookingConfirmationCard quote={quote} confirmation={d.bookingConfirmation} /> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <TabsList className="mb-0" aria-label="Quotation sections">
            <TabsTrigger value="quotation">Quotation</TabsTrigger>
            <TabsTrigger value="versions">Versions ({d.versions.length})</TabsTrigger>
            <TabsTrigger value="share">Share and PDF</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            Viewing v{version.versionNumber}{isCurrent ? " · current" : " · read-only"}
          </p>
        </div>
        <TabsContent value="quotation" className="flex flex-col gap-6">
          <ItineraryCard version={version} />
          <HotelsCard version={version} />
          <PricingTable version={version} currency={quote.currency} />
          <MarginPanel version={version} currency={quote.currency} />
          <TermsCard version={version} />
        </TabsContent>
        <TabsContent value="versions" className="flex flex-col gap-6">
          <VersionHistory quoteId={quote.id} versions={d.versions} currentVersion={quote.currentVersion} selected={version.versionNumber} currency={quote.currency} />
        </TabsContent>
        <TabsContent value="share" className="flex flex-col gap-6">
          {can("quotes:send") ? (
            <ShareLinks quoteId={quote.id} status={quote.status} shares={d.shares} currentVersion={quote.currentVersion} />
          ) : (
            <Alert tone="info">You don&apos;t have permission to manage client links.</Alert>
          )}
          <PdfPreview quoteId={quote.id} quoteNumber={quote.quoteNumber} version={version.versionNumber} />
        </TabsContent>
        <TabsContent value="history" className="grid gap-6 lg:grid-cols-2">
          <StatusTimeline history={d.history} />
          <div className="flex flex-col gap-6">
            <AcceptancesCard acceptances={d.acceptances} />
            <ApprovalsCard approvals={d.approvals} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
