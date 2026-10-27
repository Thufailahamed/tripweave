"use client";
import * as React from "react";
import Link from "next/link";
import { Archive, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleHelp, Coins, FileCheck2, FileText, Hotel, Inbox, Layers, Map as MapIcon, Moon, Route, Sparkles, Trophy, Users, Wallet, XCircle } from "lucide-react";
import { IconTile, Skeleton, StatusBadge, type TileTone } from "@/components/ui/card";
import { statusLabel } from "@/features/quotes/helpers";
import { BUDGET_SCOPE_LABELS, type TripDetail } from "@/features/trips/types";
import { cn, formatDate, money, nightsLabel, relativeTime, titleCase } from "@/lib/utils";
import type { UpcomingTrip } from "./trip-hero";

/* ---------- trip facts ---------- */
function FactCard({ icon, tone, label, href, children, i }: { icon: React.ComponentType<{ className?: string }>; tone: TileTone; label: string; href: string; children: React.ReactNode; i: number }) {
  return (
    <div className="tw-surface tw-row-in group relative flex flex-col overflow-hidden rounded-2xl border border-border p-5 transition-[border-color,translate] duration-300 hover:-translate-y-0.5 hover:border-foreground/20" style={{ "--i": i } as React.CSSProperties}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
          <IconTile icon={icon} tone={tone} size="sm" />
          {label}
        </p>
        <Link href={href} aria-label={`Open trip details: ${label}`} className="flex size-7 items-center justify-center rounded-full text-foreground/40 transition-colors hover:bg-foreground/10 hover:text-foreground">
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-accent transition-transform duration-500 ease-out group-hover:scale-x-100" />
    </div>
  );
}

/** Dates, travellers and budget for the trip shown in the hero. */
export function TripFacts({ trip, detail, loading }: { trip: UpcomingTrip; detail?: TripDetail; loading: boolean }) {
  const href = `/trips/${trip.id}`;
  if (loading || !detail) {
    return (
      <>
        {[0, 1, 2].map((i) => (
          <div key={i} className="tw-surface rounded-2xl border border-border p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-5 h-8 w-28" />
            <Skeleton className="mt-3 h-3 w-36" />
          </div>
        ))}
      </>
    );
  }
  const t = detail.trip;
  const nights = detail.itinerary?.stops.reduce((n, s) => n + s.nights, 0) ?? 0;
  const rooms = t.party.rooms.length;
  return (
    <>
      <FactCard icon={Moon} tone="info" label="Travel dates" href={href} i={0}>
        <p className="text-[32px] font-semibold leading-none tracking-[-0.06em]">{nights > 0 ? nightsLabel(nights) : "—"}</p>
        <p className="tw-num mt-auto flex items-center gap-2 pt-4 text-xs text-foreground/75">
          {formatDate(t.arrivalDate)}
          <ArrowLeftRight className="size-3 text-accent" aria-hidden />
          {formatDate(t.departureDate)}
        </p>
      </FactCard>
      <FactCard icon={Users} tone="accent" label="Travellers" href={href} i={1}>
        <p className="flex items-baseline gap-1.5">
          <span className="text-[32px] font-semibold leading-none tracking-[-0.06em]">{t.party.adults}</span>
          <span className="text-sm text-muted-foreground">/ adult{t.party.adults === 1 ? "" : "s"}</span>
          {t.party.children ? <span className="text-sm text-muted-foreground">· {t.party.children} child{t.party.children === 1 ? "" : "ren"}</span> : null}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-4">
          <span className="flex -space-x-2" aria-hidden>
            {Array.from({ length: Math.min(4, t.party.adults + t.party.children) }, (_, k) => (
              <span key={k} className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-primary-soft text-[10px] font-semibold text-foreground/80">
                {k === 0 && trip.customerName ? trip.customerName.slice(0, 1).toUpperCase() : ""}
              </span>
            ))}
          </span>
          <span className="truncate text-xs text-foreground/75">
            {trip.customerName ?? "No customer"} · {rooms} room{rooms === 1 ? "" : "s"}
          </span>
        </div>
      </FactCard>
      <FactCard icon={Wallet} tone="success" label="Budget" href={href} i={2}>
        <p className="tw-num text-[32px] font-semibold leading-none tracking-[-0.06em]">{t.budgetAmountMinor === null ? "—" : money(t.budgetAmountMinor, t.budgetCurrency)}</p>
        <p className="mt-auto flex items-center gap-2 pt-4 text-xs text-foreground/75">
          <Coins className="size-3 text-accent" aria-hidden />
          {t.budgetAmountMinor === null ? "No budget set" : (BUDGET_SCOPE_LABELS[t.budgetScope] ?? titleCase(t.budgetScope))}
          {detail.quotes.length ? <span className="ml-auto text-foreground/50">{detail.quotes.length} quote{detail.quotes.length === 1 ? "" : "s"}</span> : null}
        </p>
      </FactCard>
    </>
  );
}

/* ---------- trip pipeline ---------- */
const STAGES: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; tone: TileTone; bar: string }[] = [
  { key: "new", label: "New", icon: Inbox, tone: "info", bar: "bg-info" },
  { key: "needs_clarification", label: "Needs clarification", icon: CircleHelp, tone: "warning", bar: "bg-warning" },
  { key: "planning", label: "Planning", icon: Route, tone: "primary", bar: "bg-primary" },
  { key: "optimised", label: "Optimised", icon: Sparkles, tone: "accent", bar: "bg-accent" },
  { key: "quoted", label: "Quoted", icon: FileCheck2, tone: "primary", bar: "bg-primary/60" },
  { key: "won", label: "Won", icon: Trophy, tone: "success", bar: "bg-success" },
  { key: "lost", label: "Lost", icon: XCircle, tone: "danger", bar: "bg-destructive" },
  { key: "archived", label: "Archived", icon: Archive, tone: "neutral", bar: "bg-muted-foreground/40" },
];

/** Where every trip request sits: a proportional stage bar plus a stage list with counts. */
export function TripPipeline({ tripsByStatus }: { tripsByStatus: Record<string, number> }) {
  const rows = STAGES.map((s) => ({ ...s, count: tripsByStatus[s.key] ?? 0 }));
  const total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <div>
      <div role="img" aria-label={total === 0 ? "No trip requests yet" : `Trip requests by stage: ${rows.filter((r) => r.count).map((r) => `${r.label} ${r.count}`).join(", ")}`} className="flex h-3 gap-1 overflow-hidden rounded-full">
        {total === 0 ? (
          <span className="h-full w-full rounded-full bg-muted" />
        ) : (
          rows
            .filter((r) => r.count > 0)
            .map((r, i) => <span key={r.key} className={cn("tw-bar-grow h-full rounded-full", r.bar)} style={{ width: `${(r.count / total) * 100}%`, "--i": i } as React.CSSProperties} />)
        )}
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((r, i) => (
          <li key={r.key} className={cn("tw-row-in group flex items-center gap-3 rounded-xl border border-border p-2.5 transition-colors hover:border-foreground/20", r.count === 0 && "opacity-60")} style={{ "--i": i } as React.CSSProperties}>
            <IconTile icon={r.icon} tone={r.tone} size="sm" />
            <span className="min-w-0">
              <span className="tw-num block text-lg font-semibold leading-none tracking-[-0.04em]">{r.count}</span>
              <span className="mt-1 block truncate text-[11px] text-muted-foreground">{r.label}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- upcoming arrivals table ---------- */
/** Upcoming arrivals. Selecting a row shows it in the hero; hover reveals quick links. */
export function ArrivalsTable({ trips, selected, onSelect }: { trips: UpcomingTrip[]; selected: number; onSelect: (i: number) => void }) {
  if (trips.length === 0) {
    return <p className="px-6 py-10 text-center text-sm text-muted-foreground">No upcoming arrivals. Trips with a future arrival date appear here.</p>;
  }
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-y-1 px-3 pb-3 text-sm">
        <caption className="sr-only">Upcoming arrivals</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="hidden w-10 px-3 py-2 font-medium 2xl:table-cell">#</th>
            <th scope="col" className="px-3 py-2 font-medium">Trip</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="w-20 px-2 py-2 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {trips.map((t, i) => {
            const active = i === selected;
            return (
              <tr key={t.id} className={cn("tw-row-in group transition-colors [&>td]:transition-colors", active ? "[&>td]:bg-foreground/[0.06]" : "hover:[&>td]:bg-foreground/[0.035]")} style={{ "--i": i } as React.CSSProperties}>
                <td className={cn("relative hidden rounded-l-xl px-3 py-3 text-xs text-muted-foreground tw-num 2xl:table-cell", active && "text-accent")}>
                  <span aria-hidden className={cn("absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")} />
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td className="rounded-l-xl px-3 py-3 2xl:rounded-l-none">
                  <button type="button" onClick={() => onSelect(i)} aria-pressed={active} className="flex items-center gap-3 text-left">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors", active ? "border-accent/50 bg-accent/15 text-accent" : "border-border bg-primary-soft text-foreground/70")}>
                      {(t.customerName ?? t.title).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 max-w-[180px] 2xl:max-w-[280px]">
                      <span className="block truncate font-medium transition-colors group-hover:text-foreground">{t.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t.customerName ?? "No customer"} · <span className="tw-num">{formatDate(t.arrivalDate)}</span>
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={t.status} label={statusLabel(t.status)} />
                </td>
                <td className="rounded-r-xl px-2 py-3">
                  <span className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <Link href={`/trips/${t.id}/packages`} aria-label={`Packages for ${t.title}`} className="flex size-8 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-accent">
                      <Layers className="size-4" />
                    </Link>
                    <Link href={`/trips/${t.id}`} aria-label={`Open ${t.title}`} className="flex size-8 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-accent">
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- quotation pipeline bubbles ---------- */
const PIPELINE: { key: string; label: string; statuses: string[]; color: string; ink: string }[] = [
  { key: "progress", label: "In progress", statuses: ["draft", "preparing", "ready_for_review"], color: "#5b7cfa", ink: "#ffffff" },
  { key: "sent", label: "With client", statuses: ["sent", "viewed"], color: "#fb9a2c", ink: "#ffffff" },
  { key: "won", label: "Won", statuses: ["accepted"], color: "#22b67a", ink: "#ffffff" },
  { key: "lost", label: "Closed", statuses: ["rejected", "expired", "cancelled"], color: "#f26b5e", ink: "#ffffff" },
];
/** Bubble centres (percent of the stage), assigned largest-first. */
const SLOTS = [
  { x: 56, y: 40 },
  { x: 28, y: 64 },
  { x: 78, y: 68 },
  { x: 50, y: 84 },
];

/** Quotations grouped by lifecycle stage, drawn as floating bubbles sized by share. */
export function PipelineBubbles({ quotesByStatus }: { quotesByStatus: Record<string, number> }) {
  const groups = PIPELINE.map((g) => ({ ...g, count: g.statuses.reduce((n, s) => n + (quotesByStatus[s] ?? 0), 0) }));
  const total = groups.reduce((n, g) => n + g.count, 0);
  const shown = groups.filter((g) => g.count > 0).sort((a, b) => b.count - a.count);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-muted-foreground">Quotation pipeline</p>
        <p className="tw-num text-xs text-foreground/60">{total} total</p>
      </div>
      <div role="img" aria-label={total === 0 ? "No quotations yet" : `Quotations: ${groups.map((g) => `${g.label} ${g.count}`).join(", ")}`} className="relative my-2 min-h-[190px] flex-1">
        {total === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-center text-xs text-muted-foreground">No quotations yet.</p>
        ) : (
          shown.map((g, i) => {
            const share = g.count / total;
            const size = Math.round(54 + 92 * Math.sqrt(share));
            const slot = SLOTS[i]!;
            return (
              <span
                key={g.key}
                aria-hidden
                className="tw-bubble group/b absolute flex items-center justify-center rounded-full text-xs font-semibold transition-[scale] duration-500 hover:z-10 hover:scale-110"
                style={
                  {
                    width: size,
                    height: size,
                    left: `calc(${slot.x}% - ${size / 2}px)`,
                    top: `calc(${slot.y}% - ${size / 2}px)`,
                    color: g.ink,
                    background: `radial-gradient(circle at 30% 28%, color-mix(in oklab, ${g.color}, white 35%), ${g.color} 55%, color-mix(in oklab, ${g.color}, black 25%))`,
                    boxShadow: `0 18px 40px -12px color-mix(in oklab, ${g.color} 55%, transparent)`,
                    "--i": i,
                  } as React.CSSProperties
                }
              >
                <span className="tw-num">{Math.round(share * 100)}%</span>
              </span>
            );
          })
        )}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {groups.map((g) => (
          <li key={g.key} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full border-2" style={{ borderColor: g.color }} />
            <span className="text-foreground/75">{g.label}</span>
            <span className="tw-num ml-auto font-semibold">{g.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- month calendar ---------- */
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Month grid marking arrival days. Picking a marked day selects that trip; arrows change month. */
export function MonthCalendar({ trips, selected, onSelect }: { trips: UpcomingTrip[]; selected: number; onSelect: (i: number) => void }) {
  const now = new Date();
  const today = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const first = trips[selected]?.arrivalDate ?? trips.find((t) => t.arrivalDate)?.arrivalDate;
  const [view, setView] = React.useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  // Follow the selected trip to its month.
  React.useEffect(() => {
    const d = trips[selected]?.arrivalDate;
    if (d) setView({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1 });
  }, [selected, trips]);

  const arrivals = new Map<string, number[]>();
  trips.forEach((t, i) => {
    if (!t.arrivalDate) return;
    arrivals.set(t.arrivalDate, [...(arrivals.get(t.arrivalDate) ?? []), i]);
  });
  const selectedDay = trips[selected]?.arrivalDate ?? null;
  const startOffset = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const prevDays = new Date(view.y, view.m, 0).getDate();
  const cells = Array.from({ length: Math.ceil((startOffset + daysInMonth) / 7) * 7 }, (_, k) => {
    const d = k - startOffset + 1;
    if (d < 1) return { day: prevDays + d, key: null as string | null, out: true };
    if (d > daysInMonth) return { day: d - daysInMonth, key: null as string | null, out: true };
    return { day: d, key: ymd(view.y, view.m, d), out: false };
  });
  const shift = (delta: number) => setView((v) => ({ y: v.m + delta < 0 ? v.y - 1 : v.m + delta > 11 ? v.y + 1 : v.y, m: (v.m + delta + 12) % 12 }));
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(view.y, view.m, 1));

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold tracking-[-0.03em]" aria-live="polite">
          {label}
        </p>
        <div className="flex gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="flex size-8 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="flex size-8 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div role="grid" aria-label={label} className="mt-4 grid grid-cols-7 gap-y-1 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <span key={w} role="columnheader" className="pb-2 text-[11px] text-muted-foreground">
            {w}
          </span>
        ))}
        {cells.map((c, k) => {
          const hits = c.key ? arrivals.get(c.key) : undefined;
          const isToday = c.key === today;
          const isSel = c.key !== null && c.key === selectedDay;
          return (
            <span key={k} role="gridcell" className="flex justify-center">
              <button
                type="button"
                disabled={!hits}
                onClick={() => hits && onSelect(hits[0]!)}
                aria-label={c.key ? `${formatDate(c.key, { day: "numeric", month: "long" })}${hits ? `, ${hits.length} arrival${hits.length === 1 ? "" : "s"}` : ""}` : undefined}
                aria-hidden={c.out || undefined}
                tabIndex={hits ? 0 : -1}
                className={cn(
                  "tw-num relative flex size-9 items-center justify-center rounded-full transition-[background-color,color,scale] duration-200",
                  c.out ? "text-foreground/20" : "text-foreground/80",
                  hits && "cursor-pointer font-semibold text-foreground hover:scale-110 hover:bg-foreground/10",
                  isToday && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
                  isSel && !isToday && "ring-1 ring-accent/70 ring-offset-0",
                )}
              >
                {c.day}
                {hits ? <span aria-hidden className={cn("absolute bottom-1 size-1 rounded-full", isToday ? "bg-accent-foreground" : "bg-accent")} /> : null}
              </button>
            </span>
          );
        })}
      </div>
      {first ? null : <p className="mt-3 text-xs text-muted-foreground">No arrivals scheduled.</p>}
    </div>
  );
}

/* ---------- activity timeline ---------- */
export interface ActivityItem {
  id: string;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
}
const TONES: Record<string, { icon: React.ComponentType<{ className?: string }>; tint: string; ink: string }> = {
  trip: { icon: MapIcon, tint: "bg-info-soft border-info/25", ink: "text-info" },
  quote: { icon: FileText, tint: "bg-accent-soft border-accent/25", ink: "text-accent" },
  property: { icon: Hotel, tint: "bg-success-soft border-success/25", ink: "text-success" },
};
const DEFAULT_TONE = { icon: Users, tint: "bg-primary-soft border-border", ink: "text-foreground/70" };
const ROUTES: Record<string, string> = { quote: "/quotes", trip: "/trips", property: "/hotels", customer: "/customers" };

/** Recent activity on a vertical time rail, newest first, with a live "now" marker. */
export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const time = (d: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(d);
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative pl-14">
      <span aria-hidden className="absolute bottom-2 left-[46px] top-2 w-px bg-border" />
      <li className="relative mb-4 flex items-center" aria-label={`Now, ${time(now)}`}>
        <span className="tw-num absolute -left-14 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">{time(now)}</span>
        <span aria-hidden className="h-px flex-1 bg-accent/60" />
      </li>
      {items.map((a, i) => {
        const tone = TONES[a.resourceType] ?? DEFAULT_TONE;
        const href = a.resourceId && ROUTES[a.resourceType] ? `${ROUTES[a.resourceType]}/${a.resourceId}` : null;
        const Icon = tone.icon;
        const body = (
          <>
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-background/40", tone.ink)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-[13px] font-semibold", tone.ink)}>{titleCase(a.action.replace(/\./g, " "))}</span>
              <span className="block truncate text-[11px] text-foreground/60">
                {a.actorName ?? "System"} · {relativeTime(a.createdAt)}
              </span>
            </span>
            {href ? <ArrowUpRight className="size-3.5 shrink-0 text-foreground/30 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden /> : null}
          </>
        );
        return (
          <li key={a.id} className="tw-row-in relative mb-2.5" style={{ "--i": i } as React.CSSProperties}>
            <time dateTime={a.createdAt} className="tw-num absolute -left-14 top-3 w-10 text-right text-[10px] text-muted-foreground">
              {time(new Date(a.createdAt))}
            </time>
            <span aria-hidden className="absolute -left-[11px] top-[18px] size-2 rounded-full border-2 border-background bg-foreground/40" />
            {href ? (
              <Link href={href} className={cn("group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-[translate,border-color] duration-300 hover:translate-x-0.5 hover:border-foreground/25", tone.tint)}>
                {body}
              </Link>
            ) : (
              <div className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5", tone.tint)}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
