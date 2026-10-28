"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, FileText, Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusBadge } from "@/components/ui/card";
import { cn, formatDateTime, money, relativeTime, titleCase } from "@/lib/utils";
import { SectionHeading } from "./dossier";
import type { TripDetail } from "./types";

type Quote = TripDetail["quotes"][number];
type StatusChange = TripDetail["statusHistory"][number];

const QUOTE_ACCENT: Record<string, string> = {
  accepted: "before:bg-success",
  sent: "before:bg-info",
  draft: "before:bg-border",
  rejected: "before:bg-destructive",
  expired: "before:bg-warning",
};

/** Quotations laid out like documents on a desk, with the total value that has been accepted. */
export function QuotesShelf({ tripId, quotes }: { tripId: string; quotes: Quote[] }) {
  if (quotes.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No quotations yet"
        description="Create a quotation from a package once you have compared them."
        action={
          <Button asChild variant="outline">
            <Link href={`/trips/${tripId}/packages`}>Go to packages</Link>
          </Button>
        }
      />
    );
  }
  const accepted = quotes.filter((quote) => quote.status === "accepted");
  const currencies = new Set(accepted.map((quote) => quote.currency));
  const acceptedValue = currencies.size === 1 ? money(accepted.reduce((sum, quote) => sum + quote.sellingPriceMinor, 0), accepted[0]!.currency) : null;
  return (
    <section aria-labelledby="quotes-h">
      <SectionHeading
        id="quotes-h"
        title="Quotations"
        note={accepted.length ? `${accepted.length} accepted${acceptedValue ? `, worth ${acceptedValue}` : ""}` : "nothing accepted yet"}
        aside={`${quotes.length} quotation${quotes.length === 1 ? "" : "s"} for this trip`}
      />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {quotes.map((quote, index) => (
          <li key={quote.id} className="tw-row-in" style={{ "--i": index } as React.CSSProperties}>
            <article
              className={cn(
                "tw-surface tw-lift group relative flex h-full flex-col gap-5 overflow-hidden rounded-2xl border border-border p-5 before:absolute before:inset-x-0 before:top-0 before:h-1",
                QUOTE_ACCENT[quote.status] ?? "before:bg-border",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span aria-hidden className="relative grid h-12 w-10 place-items-center rounded-md border border-border bg-card shadow-sm [clip-path:polygon(0_0,72%_0,100%_24%,100%_100%,0_100%)]">
                  <FileText className="size-4 text-accent" strokeWidth={1.8} />
                </span>
                <StatusBadge status={quote.status} />
              </div>
              <div>
                <Link href={`/quotes/${quote.id}`} className="tw-trip-display text-[1.7rem] leading-none after:absolute after:inset-0 after:rounded-2xl">
                  {quote.quoteNumber}
                </Link>
                <p className="tw-num mt-1 text-xs text-muted-foreground">Version {quote.currentVersion}</p>
              </div>
              <div className="mt-auto flex items-end justify-between gap-3 border-t border-dashed border-border pt-4">
                <div>
                  <p className="tw-kicker">Selling price</p>
                  <p className="tw-num tw-trip-display mt-1 text-[1.8rem] leading-none">{money(quote.sellingPriceMinor, quote.currency)}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/80 transition group-hover:text-accent">
                  Open <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </article>
          </li>
        ))}
        <li className="tw-row-in" style={{ "--i": quotes.length } as React.CSSProperties}>
          <Link
            href={`/trips/${tripId}/packages`}
            className="group flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-5 text-center text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
          >
            <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent transition group-hover:scale-105">
              <Plus className="size-5" />
            </span>
            <span className="tw-trip-display text-[1.3rem] leading-none text-foreground">Another quotation</span>
            <span className="flex items-center gap-1 text-xs">
              <Layers className="size-3.5" /> Start from a package
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}

/** Every status change, newest first, with the current status called out. */
export function StatusTimeline({ history, currentStatus }: { history: StatusChange[]; currentStatus: string }) {
  if (history.length === 0) return <EmptyState title="No status changes recorded" />;
  const entries = [...history].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return (
    <section aria-labelledby="history-h">
      <SectionHeading id="history-h" title="Status history" note={`now ${titleCase(currentStatus).toLowerCase()}`} aside={`${history.length} change${history.length === 1 ? "" : "s"}`} />
      <ol className="relative ml-1 flex flex-col">
        <span aria-hidden className="absolute bottom-4 left-[11px] top-4 w-px bg-border" />
        {entries.map((entry, index) => {
          const latest = index === 0;
          return (
            <li key={entry.id} className="tw-row-in relative grid grid-cols-[24px_minmax(0,1fr)] gap-4 pb-5 last:pb-0" style={{ "--i": index } as React.CSSProperties}>
              <span aria-hidden className={cn("relative z-10 mt-4 grid size-6 place-items-center rounded-full border-2 bg-background", latest ? "border-accent" : "border-border")}>
                <span className={cn("size-2 rounded-full", latest ? "bg-accent" : "bg-muted-foreground/40")} />
              </span>
              <div className={cn("rounded-xl border p-4", latest ? "border-accent/40 bg-card shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_7%,transparent)]" : "border-border bg-card/60")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="tw-trip-display text-[1.35rem] leading-none">{titleCase(entry.to_status)}</p>
                  {latest ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">Current</span> : null}
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {entry.from_status ? (
                    <>
                      <StatusBadge status={entry.from_status} /> <span aria-label="changed to">→</span> <StatusBadge status={entry.to_status} />
                    </>
                  ) : (
                    <>
                      Created as <StatusBadge status={entry.to_status} />
                    </>
                  )}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">{entry.changed_by_name ?? "The system"}</span> · <time dateTime={entry.created_at} title={formatDateTime(entry.created_at)}>{relativeTime(entry.created_at)}</time>
                  <span className="tw-num"> · {formatDateTime(entry.created_at)}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
