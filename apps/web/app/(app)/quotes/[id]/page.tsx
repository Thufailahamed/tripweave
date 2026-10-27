"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Coins, FileText, FileX2, History, Lock, Wallet } from "lucide-react";
import { Alert, Card, CardContent, ErrorState, EmptyState, LoadingBlock, PageHeader, Stat, StatusBadge } from "@/components/ui/card";
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

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link href="/quotes" className="hover:underline">
            Quotations
          </Link>
        }
        title={quote.quoteNumber}
        icon={FileText}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={quote.status} label={statusLabel(quote.status)} />
            <span>
              {quote.customerId ? (
                <Link href={`/customers/${quote.customerId}`} className="font-medium text-foreground hover:underline">
                  {quote.customerName ?? "Customer"}
                </Link>
              ) : (
                "No customer"
              )}
              {" · "}
              <Link href={`/trips/${quote.tripRequestId}`} className="hover:underline">
                {quote.tripTitle ?? "Trip request"}
              </Link>
            </span>
          </span>
        }
        actions={
          <>
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
          </>
        }
      />

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

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Coins} iconTone="accent" label="Selling price" value={money(version.sellingPriceMinor, quote.currency)} hint={`Version ${version.versionNumber}`} />
        {version.pricing.totalPayableMinor !== undefined ? <Stat icon={Wallet} iconTone="success" label="Total payable" value={money(version.pricing.totalPayableMinor, quote.currency)} hint="Including taxes" /> : null}
        <Stat icon={CalendarClock} iconTone={quote.status === "expired" ? "warning" : "info"} label="Valid until" value={formatDate(quote.validUntil)} tone={quote.status === "expired" ? "warning" : "default"} hint={quote.status === "expired" ? "Expired" : undefined} />
        <Stat icon={History} iconTone="primary" label="Created" value={formatDate(version.createdAt)} hint={`Updated ${formatDate(quote.updatedAt)}`} />
      </div>

      {isCurrent ? (
        <Card className="mb-6">
          <CardContent>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Actions</p>
            <LifecycleActions quote={quote} />
          </CardContent>
        </Card>
      ) : null}

      {isCurrent ? <BookingConfirmationCard quote={quote} confirmation={d.bookingConfirmation} /> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Quotation sections">
          <TabsTrigger value="quotation">Quotation</TabsTrigger>
          <TabsTrigger value="versions">Versions ({d.versions.length})</TabsTrigger>
          <TabsTrigger value="share">Share and PDF</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="quotation" className="flex flex-col gap-6">
          <PricingTable version={version} currency={quote.currency} />
          <MarginPanel version={version} currency={quote.currency} />
          <div className="grid gap-6 lg:grid-cols-2">
            <ItineraryCard version={version} />
            <HotelsCard version={version} />
          </div>
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
