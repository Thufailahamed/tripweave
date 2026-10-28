"use client";
import * as React from "react";
import { defineComponent, useTriggerAction } from "@openuidev/react-lang";
import { Check, Clock, Info, Languages, Lightbulb, MessageCircle, CalendarDays, Route, Sun, TriangleAlert, Wallet } from "lucide-react";
import {
  CalloutSchema,
  ComparisonTableSchema,
  DayPlanSchema,
  FollowUpsSchema,
  KeyFactsSchema,
  LeadSchema,
  PlaceCardSchema,
  PlaceGallerySchema,
  TipListSchema,
  planningComponentDescriptions,
} from "@tripweave/planning-contract";
import { cn } from "@/lib/utils";
import { usePlaceImage } from "../place-image";
import { DestinationPhoto } from "./destination-photo";

/**
 * Travel-guide blocks for questions that do not depend on the saved trip. They take text and place
 * names only. Every interaction either changes local presentation state (ticking an activity) or sends
 * the reader's next question back to the assistant through the built-in continue-conversation action.
 */
export function useAskAssistant() {
  const trigger = useTriggerAction();
  return React.useCallback((prompt: string) => void trigger(prompt, undefined, { params: {} }), [trigger]);
}

export const Lead = defineComponent({
  name: "Lead",
  description: planningComponentDescriptions.Lead,
  props: LeadSchema,
  component: function LeadView({ props }) {
    return (
      <p className="max-w-2xl text-[1.2rem] leading-[1.45] text-[var(--pl-ink)] sm:text-[1.35rem]" style={{ fontFamily: "var(--font-instrument), Georgia, serif" }}>
        {props.text}
      </p>
    );
  },
});

export const PlaceCard = defineComponent({
  name: "PlaceCard",
  description: planningComponentDescriptions.PlaceCard,
  props: PlaceCardSchema,
  component: function PlaceCardView({ props }) {
    const ask = useAskAssistant();
    const place = usePlaceImage(props.name);
    return (
      <article className="pl-card grid overflow-hidden sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)]">
        <div className="relative min-h-[200px] sm:min-h-[260px]">
          <DestinationPhoto destination={props.name} className="absolute inset-0 size-full pl-photo" />
        </div>
        <div className="flex min-w-0 flex-col gap-3 p-5 sm:p-6">
          <p className="pl-eyebrow">Destination</p>
          <h3 className="pl-display text-[1.8rem]">{props.name}</h3>
          {props.note ? <p className="text-[13px] leading-relaxed text-[var(--pl-muted)]">{props.note}</p> : null}
          {place?.extract ? <p className="line-clamp-4 text-[12px] leading-relaxed text-[var(--pl-muted)]">{place.extract}</p> : null}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <button type="button" className="pl-btn pl-btn-solid" onClick={() => ask(`Tell me about ${props.name}: what to see, how long to stay and how to get there.`)}>
              Ask about this place
            </button>
            {place?.articleUrl ? (
              <a href={place.articleUrl} target="_blank" rel="noreferrer noopener" className="text-[11px] text-[var(--pl-muted)] underline decoration-[var(--pl-line)] underline-offset-2 hover:text-[var(--pl-ink)]">
                Read on Wikipedia
              </a>
            ) : null}
          </div>
        </div>
      </article>
    );
  },
});

export const PlaceGallery = defineComponent({
  name: "PlaceGallery",
  description: planningComponentDescriptions.PlaceGallery,
  props: PlaceGallerySchema,
  component: function PlaceGalleryView({ props }) {
    const ask = useAskAssistant();
    const [selected, setSelected] = React.useState(0);
    const index = Math.min(selected, props.places.length - 1);
    const place = props.places[index] ?? props.places[0] ?? "";
    const detail = usePlaceImage(place);
    return (
      <section aria-label={props.title ?? "Places to visit"} className="flex flex-col gap-4">
        {props.title ? <p className="pl-eyebrow">{props.title}</p> : null}
        <div className="pl-scroll -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {props.places.map((name, position) => {
            const active = position === index;
            return (
              <button
                key={`${name}-${position}`}
                type="button"
                aria-label={name}
                aria-pressed={active}
                onClick={() => setSelected(position)}
                className={cn(
                  "group relative w-40 shrink-0 snap-start overflow-hidden rounded-[18px] border text-left transition sm:w-48",
                  active ? "border-[var(--pl-ink)] shadow-[0_16px_28px_-22px_rgba(30,22,12,0.7)]" : "border-[var(--pl-line)] hover:-translate-y-0.5",
                )}
              >
                <span className="relative block aspect-[4/5] w-full">
                  <DestinationPhoto destination={name} className="absolute inset-0 size-full pl-photo" />
                </span>
                <span aria-hidden className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(16,12,8,0.85))] px-3 pb-3 pt-10 text-[13px] font-semibold leading-tight text-white">
                  {name}
                </span>
              </button>
            );
          })}
        </div>
        <div className="pl-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="pl-display text-[1.6rem]">{place}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--pl-muted)]" aria-live="polite">
              {detail === undefined ? "Finding the place…" : detail?.extract ?? "Ask the assistant what to see and how long to stay here."}
            </p>
          </div>
          <button type="button" className="pl-btn pl-btn-accent shrink-0" onClick={() => ask(`Plan a visit to ${place}: what to see, the best time of year and how many days to spend there.`)}>
            Plan a visit
          </button>
        </div>
      </section>
    );
  },
});

export const DayPlan = defineComponent({
  name: "DayPlan",
  description: planningComponentDescriptions.DayPlan,
  props: DayPlanSchema,
  component: function DayPlanView({ props }) {
    const ask = useAskAssistant();
    const [done, setDone] = React.useState<number[]>([]);
    const toggle = (position: number) => setDone((current) => (current.includes(position) ? current.filter((item) => item !== position) : [...current, position]));
    return (
      <article className="pl-card grid gap-5 p-5 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)] sm:p-6">
        <div className="flex flex-col gap-1.5">
          <span className="pl-eyebrow">{props.day}</span>
          <h3 className="pl-display text-[1.6rem]">{props.title}</h3>
        </div>
        <ol className="flex min-w-0 flex-col gap-1.5">
          {props.activities.map((activity, position) => {
            const checked = done.includes(position);
            return (
              <li key={`${position}-${activity}`}>
                <button
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(position)}
                  className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--pl-surface-2)]"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-px grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
                      checked ? "border-[var(--pl-sage)] bg-[var(--pl-sage)] text-white" : "border-[var(--pl-line)] text-[var(--pl-muted)]",
                    )}
                  >
                    {checked ? <Check className="size-3" /> : position + 1}
                  </span>
                  <span className={cn("min-w-0 text-[13px] leading-relaxed", checked && "text-[var(--pl-muted)] line-through decoration-[var(--pl-line)]")}>{activity}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--pl-line)] pt-3 sm:col-span-2">
          <span className="text-[11px] text-[var(--pl-muted)]">
            {done.length} of {props.activities.length} ticked off
          </span>
          <button type="button" className="pl-btn" onClick={() => ask(`Rework ${props.day} (${props.title}) so it is realistic: add rough timings, travel between stops and a rest option.`)}>
            Adjust this day
          </button>
        </div>
      </article>
    );
  },
});

export const TipList = defineComponent({
  name: "TipList",
  description: planningComponentDescriptions.TipList,
  props: TipListSchema,
  component: function TipListView({ props }) {
    const [ticked, setTicked] = React.useState<boolean[]>([]);
    const count = props.tips.filter((_, position) => ticked[position]).length;
    const percent = props.tips.length > 0 ? Math.round((count / props.tips.length) * 100) : 0;
    const toggleTip = (position: number) =>
      setTicked((current) => {
        const next = [...current];
        next[position] = !next[position];
        return next;
      });
    return (
      <section className="pl-card flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="pl-display text-[1.5rem]">{props.title}</h3>
          <span className="pl-chip">
            {count} of {props.tips.length}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[var(--pl-surface-2)]" aria-hidden>
          <div className="h-full rounded-full bg-[var(--pl-sage)] transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {props.tips.map((tip, position) => (
            <li key={`${position}-${tip}`}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-2 transition hover:bg-[var(--pl-surface-2)]">
                <input
                  type="checkbox"
                  checked={!!ticked[position]}
                  onChange={() => toggleTip(position)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--pl-sage)]"
                />
                <span className={cn("text-[13px] leading-relaxed", ticked[position] && "text-[var(--pl-muted)] line-through decoration-[var(--pl-line)]")}>{tip}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    );
  },
});

function factIcon(label: string) {
  if (/season|month|when|best time/i.test(label)) return CalendarDays;
  if (/weather|climate|temperature|sun/i.test(label)) return Sun;
  if (/language/i.test(label)) return Languages;
  if (/time|hour|duration|days?/i.test(label)) return Clock;
  if (/getting|transport|route|travel|reach/i.test(label)) return Route;
  if (/money|currency|budget|cost|tip/i.test(label)) return Wallet;
  return Info;
}

export const KeyFacts = defineComponent({
  name: "KeyFacts",
  description: planningComponentDescriptions.KeyFacts,
  props: KeyFactsSchema,
  component: function KeyFactsView({ props }) {
    return (
      <section className="flex flex-col gap-3">
        {props.title ? <p className="pl-eyebrow">{props.title}</p> : null}
        <dl className="grid gap-2.5 sm:grid-cols-2">
          {props.facts.map((fact, position) => {
            const [rawLabel = "", ...rest] = fact.split(":");
            const value = rest.join(":").trim();
            const label = value ? rawLabel.trim() : "Note";
            const Icon = factIcon(label);
            return (
              <div key={`${position}-${fact}`} className="pl-card flex items-start gap-3 p-4">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--pl-accent-soft)] text-[var(--pl-accent)]">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--pl-muted)]">{label}</dt>
                  <dd className="mt-1 text-[13px] leading-relaxed">{value || rawLabel.trim()}</dd>
                </div>
              </div>
            );
          })}
        </dl>
      </section>
    );
  },
});

const CALLOUT_TONES = {
  info: { Icon: Info, className: "border-[var(--pl-line)] bg-[var(--pl-surface)]", iconClassName: "text-[var(--pl-sage)]" },
  tip: { Icon: Lightbulb, className: "border-[color-mix(in_oklab,var(--pl-sage)_35%,var(--pl-line))] bg-[var(--pl-sage-soft)]", iconClassName: "text-[var(--pl-sage)]" },
  caution: { Icon: TriangleAlert, className: "border-[color-mix(in_oklab,var(--pl-accent)_40%,var(--pl-line))] bg-[var(--pl-accent-soft)]", iconClassName: "text-[var(--pl-accent)]" },
} as const;

export const Callout = defineComponent({
  name: "Callout",
  description: planningComponentDescriptions.Callout,
  props: CalloutSchema,
  component: function CalloutView({ props }) {
    const tone = CALLOUT_TONES[props.tone];
    const { Icon } = tone;
    return (
      <aside role="note" className={cn("flex items-start gap-3 rounded-[18px] border p-4 sm:p-5", tone.className)}>
        <Icon className={cn("mt-0.5 size-4 shrink-0", tone.iconClassName)} aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[13px] font-semibold">{props.title}</p>
          {props.body ? <p className="text-[12px] leading-relaxed text-[var(--pl-muted)]">{props.body}</p> : null}
        </div>
      </aside>
    );
  },
});

export const ComparisonTable = defineComponent({
  name: "ComparisonTable",
  description: planningComponentDescriptions.ComparisonTable,
  props: ComparisonTableSchema,
  component: function ComparisonTableView({ props }) {
    const caption = props.title ?? "Comparison";
    return (
      <section className="flex flex-col gap-3">
        {props.title ? <p className="pl-eyebrow">{props.title}</p> : null}
        <div className="pl-card overflow-x-auto">
          <table className="w-full min-w-[460px] border-collapse text-left text-[13px]">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-[var(--pl-line)] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--pl-muted)]">
                  <span className="sr-only">Topic</span>
                </th>
                {props.columns.map((column, position) => (
                  <th key={`${position}-${column}`} scope="col" className="border-b border-[var(--pl-line)] px-4 py-3 font-display text-[15px] font-semibold text-[var(--pl-ink)]">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, rowPosition) => (
                <tr key={`${rowPosition}-${row[0]}`}>
                  <th scope="row" className="border-b border-[var(--pl-line)] px-4 py-3 align-top font-semibold">
                    {row[0]}
                  </th>
                  {row.slice(1).map((cell, cellPosition) => (
                    <td key={`${cellPosition}-${cell}`} className="border-b border-[var(--pl-line)] px-4 py-3 align-top leading-relaxed text-[var(--pl-muted)]">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  },
});

export const FollowUps = defineComponent({
  name: "FollowUps",
  description: planningComponentDescriptions.FollowUps,
  props: FollowUpsSchema,
  component: function FollowUpsView({ props }) {
    const ask = useAskAssistant();
    return (
      <section aria-label="Suggested questions" className="flex flex-col gap-2">
        <p className="pl-hand pl-1">{props.title ?? "keep exploring"}</p>
        <div className="flex flex-wrap gap-2">
          {props.questions.map((question, position) => (
            <button key={`${position}-${question}`} type="button" className="pl-btn h-auto max-w-full py-2.5 text-left leading-snug" onClick={() => ask(question)}>
              <MessageCircle className="size-3.5 shrink-0 text-[var(--pl-accent)]" aria-hidden />
              <span>{question}</span>
            </button>
          ))}
        </div>
      </section>
    );
  },
});
