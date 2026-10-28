"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { ArrowUpRight, Check, Heart, MapPinned, PencilLine, Send, X } from "lucide-react";
import {
  BoardDaySchema,
  ChoiceSchema,
  ChoicesSchema,
  DayBoardSchema,
  HighlightSchema,
  HighlightsSchema,
  LocalFlavoursSchema,
  planningComponentDescriptions,
} from "@tripweave/planning-contract";
import { cn } from "@/lib/utils";
import { usePlaceImage } from "../place-image";
import { DestinationPhoto } from "./destination-photo";
import { useAskAssistant } from "./travel";

/**
 * Magazine-style travel blocks: photographic postcards, local flavours, a day board and choice cards
 * that continue the conversation. They take text and place names only; every photograph comes from
 * the app's place lookup, and every interaction is local state or the reader's next question.
 */

/** "Temple of the Tooth, Kandy" → name "Temple of the Tooth", area "Kandy". */
function splitPlace(value: string): { name: string; area: string | null } {
  const [head = value, ...rest] = value.split(",");
  const area = rest.join(",").trim();
  return { name: head.trim() || value, area: area || null };
}

/** Postcards lean a little, alternately, and straighten on hover. */
const TILTS = ["-1.4deg", "0.9deg", "-0.6deg", "1.2deg", "-1deg", "0.5deg"];

interface ChildNode<P> {
  props?: Partial<P>;
}

function childProps<P>(node: unknown): Partial<P> {
  return ((node as ChildNode<P> | null)?.props ?? {}) as Partial<P>;
}

type HighlightProps = { name: string; area?: string; note?: string };

function Postcard({ item, index, active, onSelect }: { item: HighlightProps; index: number; active?: boolean; onSelect?: () => void }) {
  const { name, area } = splitPlace(item.name);
  const Tag = onSelect ? "button" : "div";
  return (
    <Tag
      {...(onSelect ? { type: "button" as const, onClick: onSelect, "aria-pressed": !!active } : {})}
      className={cn("pl-postcard pl-rise group flex h-full w-full flex-col text-left", active && "pl-postcard-active")}
      style={{ "--tilt": TILTS[index % TILTS.length], "--i": index } as React.CSSProperties}
    >
      <span className="pl-postcard-frame">
        <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-[10px]">
          <DestinationPhoto destination={item.name} className="pl-photo absolute inset-0 size-full" />
        </span>
      </span>
      <span className="mt-3 flex min-w-0 flex-col gap-0.5 px-1">
        <span className="pl-display text-[1.25rem] leading-tight break-words">{name}</span>
        {item.area ?? area ? <span className="text-[11px] font-medium text-[var(--pl-muted)]">{item.area ?? area}</span> : null}
        {item.note ? <span className="mt-1 text-[12.5px] leading-relaxed text-[var(--pl-muted)]">{item.note}</span> : null}
      </span>
    </Tag>
  );
}

export const Highlight = defineComponent({
  name: "Highlight",
  description: planningComponentDescriptions.Highlight,
  props: HighlightSchema,
  component: function HighlightView({ props }) {
    return <Postcard item={props} index={0} />;
  },
});

function PlaceStory({ item, onClose }: { item: HighlightProps; onClose: () => void }) {
  const ask = useAskAssistant();
  const info = usePlaceImage(item.name);
  const { name } = splitPlace(item.name);
  return (
    <div className="pl-card pl-rise grid overflow-hidden sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" role="region" aria-label={`About ${name}`}>
      <div className="relative min-h-[180px]">
        <DestinationPhoto destination={item.name} className="absolute inset-0 size-full" />
      </div>
      <div className="flex min-w-0 flex-col gap-3 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h4 className="pl-display text-[1.7rem] break-words">{name}</h4>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--pl-line)] text-[var(--pl-muted)] transition hover:text-[var(--pl-ink)]">
            <X className="size-3.5" />
          </button>
        </div>
        {item.note ? <p className="pl-hand text-[1.2rem]">{item.note}</p> : null}
        <p className="line-clamp-5 text-[13px] leading-relaxed text-[var(--pl-muted)]" aria-live="polite">
          {info === undefined ? "Finding the story…" : info?.extract ?? "Ask the assistant what makes it special and when to go."}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <button type="button" className="pl-btn pl-btn-solid" onClick={() => ask(`Plan a visit to ${item.name}: the best time of day, how long to spend and what not to miss.`)}>
            Plan a visit
          </button>
          <button type="button" className="pl-btn" onClick={() => ask(`Where is ${item.name} on a map, and what is nearby worth combining with it?`)}>
            <MapPinned className="size-3.5" aria-hidden /> What's nearby
          </button>
          {info?.articleUrl ? (
            <a href={info.articleUrl} target="_blank" rel="noreferrer noopener" className="text-[11px] text-[var(--pl-muted)] underline decoration-[var(--pl-line)] underline-offset-2 hover:text-[var(--pl-ink)]">
              Wikipedia
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const Highlights = defineComponent({
  name: "Highlights",
  description: planningComponentDescriptions.Highlights,
  props: HighlightsSchema,
  component: function HighlightsView({ props }) {
    const items = (props.items ?? []).map((node) => childProps<HighlightProps>(node)).filter((item): item is HighlightProps => typeof item.name === "string" && item.name.length > 0);
    const [selected, setSelected] = React.useState<number | null>(null);
    const active = selected !== null ? items[selected] : undefined;
    return (
      <section aria-label={props.title ?? "Highlights"} className="flex flex-col gap-4">
        {props.title ? <p className="pl-eyebrow">{props.title}</p> : null}
        <div className={cn("grid gap-x-4 gap-y-6", items.length === 2 || items.length === 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
          {items.map((item, index) => (
            <Postcard key={`${index}-${item.name}`} item={item} index={index} active={selected === index} onSelect={() => setSelected((current) => (current === index ? null : index))} />
          ))}
        </div>
        {active ? <PlaceStory key={active.name} item={active} onClose={() => setSelected(null)} /> : <p className="pl-hand pl-hand-muted">tap a postcard for its story</p>}
      </section>
    );
  },
});

export const LocalFlavours = defineComponent({
  name: "LocalFlavours",
  description: planningComponentDescriptions.LocalFlavours,
  props: LocalFlavoursSchema,
  component: function LocalFlavoursView({ props }) {
    const ask = useAskAssistant();
    const [saved, setSaved] = React.useState<string[]>([]);
    const toggle = (item: string) => setSaved((current) => (current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]));
    return (
      <section aria-label={props.title} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h3 className="pl-display text-[1.6rem]">{props.title}</h3>
            {props.note ? <p className="pl-hand mt-1">{props.note}</p> : null}
          </div>
          {saved.length > 0 ? (
            <button type="button" className="pl-btn" onClick={() => ask(`Where can we try ${saved.join(", ")} on this trip? Suggest the kind of place and the best time.`)}>
              <Heart className="size-3.5 fill-current text-[var(--pl-accent)]" aria-hidden /> Find {saved.length === 1 ? "it" : `these ${saved.length}`}
            </button>
          ) : null}
        </div>
        <ul className="pl-scroll -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible">
          {(props.items ?? []).map((item, index) => {
            const isSaved = saved.includes(item);
            return (
              <li key={`${index}-${item}`} className="pl-rise w-[42vw] max-w-[200px] shrink-0 snap-start sm:w-auto sm:max-w-none" style={{ "--i": index } as React.CSSProperties}>
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => ask(`Tell me about ${item}: what it is, where to try a good one and how locals have it.`)}
                    className="block w-full overflow-hidden rounded-[16px] border border-[var(--pl-line)] bg-[var(--pl-surface)] p-1.5 text-left shadow-[0_14px_26px_-22px_rgba(30,22,12,0.7)] transition hover:-translate-y-0.5"
                    aria-label={`About ${item}`}
                  >
                    <span className="relative block aspect-square w-full overflow-hidden rounded-[11px]">
                      <DestinationPhoto destination={item} className="pl-photo absolute inset-0 size-full" />
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={isSaved}
                    aria-label={isSaved ? `Remove ${item} from the list` : `Save ${item} to try`}
                    onClick={() => toggle(item)}
                    className={cn(
                      "absolute right-3 top-3 grid size-8 place-items-center rounded-full border backdrop-blur-[6px] transition",
                      isSaved ? "border-transparent bg-[var(--pl-accent)] text-white" : "border-white/40 bg-black/25 text-white hover:bg-black/40",
                    )}
                  >
                    <Heart className={cn("size-3.5", isSaved && "fill-current")} />
                  </button>
                </div>
                <p className="mt-2 px-1 text-[13px] font-semibold leading-snug">{item}</p>
              </li>
            );
          })}
        </ul>
      </section>
    );
  },
});

type ChoiceProps = { label: string; detail?: string; note?: string; reply?: string };

function ChoiceCard({ option, index, state, onPick }: { option: ChoiceProps; index: number; state: "idle" | "picked" | "dimmed"; onPick?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onPick || state !== "idle"}
      aria-pressed={state === "picked"}
      onClick={onPick}
      className={cn("pl-choice pl-rise flex h-full w-full flex-col items-start gap-1 text-left", state === "picked" && "pl-choice-picked", state === "dimmed" && "opacity-45")}
      style={{ "--i": index } as React.CSSProperties}
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="pl-display text-[1.35rem] leading-tight break-words">{option.label}</span>
        <span aria-hidden className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border transition", state === "picked" ? "border-[var(--pl-accent)] bg-[var(--pl-accent)] text-white" : "border-[var(--pl-line)] text-transparent")}>
          <Check className="size-3.5" />
        </span>
      </span>
      {option.detail ? <span className="text-[12.5px] font-semibold text-[var(--pl-ink)]">{option.detail}</span> : null}
      {option.note ? <span className="text-[12px] leading-relaxed text-[var(--pl-muted)]">{option.note}</span> : null}
    </button>
  );
}

export const Choice = defineComponent({
  name: "Choice",
  description: planningComponentDescriptions.Choice,
  props: ChoiceSchema,
  component: function ChoiceView({ props }) {
    const ask = useAskAssistant();
    const [picked, setPicked] = React.useState(false);
    return (
      <ChoiceCard
        option={props}
        index={0}
        state={picked ? "picked" : "idle"}
        onPick={() => {
          setPicked(true);
          ask(props.reply ?? props.label);
        }}
      />
    );
  },
});

export const Choices = defineComponent({
  name: "Choices",
  description: planningComponentDescriptions.Choices,
  props: ChoicesSchema,
  component: function ChoicesView({ props }) {
    const ask = useAskAssistant();
    const options = (props.options ?? []).map((node) => childProps<ChoiceProps>(node)).filter((option): option is ChoiceProps => typeof option.label === "string" && option.label.length > 0);
    const [picked, setPicked] = React.useState<number | "custom" | null>(null);
    const [writing, setWriting] = React.useState(false);
    const [text, setText] = React.useState("");
    const inputId = React.useId();
    const pick = (index: number) => {
      const option = options[index];
      if (!option || picked !== null) return;
      setPicked(index);
      ask(option.reply ?? (option.detail ? `${option.label} (${option.detail})` : option.label));
    };
    const submitCustom = (event: React.FormEvent) => {
      event.preventDefault();
      const value = text.trim();
      if (!value || picked !== null) return;
      setPicked("custom");
      ask(`${props.question} ${value}`.slice(0, 4_000));
    };
    return (
      <section aria-label={props.question} className="flex flex-col gap-3">
        <h3 className="pl-display text-[1.6rem]">{props.question}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((option, index) => (
            <ChoiceCard key={`${index}-${option.label}`} option={option} index={index} state={picked === null ? "idle" : picked === index ? "picked" : "dimmed"} onPick={() => pick(index)} />
          ))}
        </div>
        {props.custom ? (
          writing ? (
            <form onSubmit={submitCustom} className="flex max-w-md items-center gap-2 rounded-full border border-[var(--pl-line)] bg-[var(--pl-surface)] py-1 pl-4 pr-1">
              <label htmlFor={inputId} className="sr-only">
                {props.custom}
              </label>
              <input
                id={inputId}
                autoFocus
                value={text}
                maxLength={200}
                disabled={picked !== null}
                onChange={(event) => setText(event.target.value)}
                placeholder={props.custom}
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] outline-none placeholder:text-[var(--pl-muted)]"
              />
              <button type="submit" aria-label="Send" disabled={!text.trim() || picked !== null} className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--pl-accent)] text-white transition disabled:opacity-40">
                <Send className="size-3.5" />
              </button>
            </form>
          ) : (
            <button type="button" className="pl-btn self-start" disabled={picked !== null} onClick={() => setWriting(true)}>
              <PencilLine className="size-3.5" aria-hidden /> {props.custom}
            </button>
          )
        ) : null}
      </section>
    );
  },
});

type BoardDayProps = { label: string; places: string[]; title?: string };

function partsOfDay(count: number): string[] {
  if (count <= 1) return ["All day"];
  if (count === 2) return ["Morning", "Afternoon"];
  if (count === 3) return ["Morning", "Afternoon", "Evening"];
  return ["Morning", "Midday", "Afternoon", "Evening"];
}

function DayRow({ day, index }: { day: BoardDayProps; index: number }) {
  const ask = useAskAssistant();
  const places = (day.places ?? []).filter(Boolean);
  const parts = partsOfDay(places.length);
  const [open, setOpen] = React.useState<number | null>(null);
  const openPlace = open !== null ? places[open] : undefined;
  const info = usePlaceImage(openPlace ?? null);
  return (
    <li className={cn("pl-rise flex min-w-0 flex-col gap-2.5", places.length >= 3 && "sm:col-span-2")} style={{ "--i": index } as React.CSSProperties}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[12px] font-semibold text-[var(--pl-muted)]">
          <span className="text-[var(--pl-ink)]">{day.label}</span>
          {day.title ? <span> · {day.title}</span> : null}
        </p>
        {places.length > 1 ? (
          <button type="button" className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--pl-muted)] underline-offset-2 transition hover:text-[var(--pl-ink)] hover:underline" onClick={() => ask(`Show ${day.label} on a map: ${places.join(", ")}, with the route between them.`)}>
            <MapPinned className="size-3" aria-hidden /> Map this day
          </button>
        ) : null}
      </div>
      <ul className="pl-scroll flex gap-3 overflow-x-auto pb-1">
        {places.map((place, position) => {
          const { name } = splitPlace(place);
          const active = open === position;
          return (
            <li key={`${position}-${place}`} className="w-[112px] shrink-0 sm:w-[128px]">
              <button type="button" aria-pressed={active} onClick={() => setOpen(active ? null : position)} className="group block w-full text-left">
                <span className={cn("relative block aspect-square overflow-hidden rounded-[14px] border-[3px] bg-[var(--pl-surface)] shadow-[0_10px_22px_-18px_rgba(30,22,12,0.8)] transition group-hover:-translate-y-0.5", active ? "border-[var(--pl-accent)]" : "border-[var(--pl-surface)]")}>
                  <DestinationPhoto destination={place} className="pl-photo absolute inset-0 size-full" />
                </span>
                <span className="mt-1.5 block text-[12px] font-semibold leading-tight break-words">{name}</span>
                <span className="block text-[10.5px] text-[var(--pl-muted)]">{parts[position] ?? "Later"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {openPlace ? (
        <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--pl-line)] bg-[var(--pl-surface)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="line-clamp-3 text-[12.5px] leading-relaxed text-[var(--pl-muted)]" aria-live="polite">
            {info === undefined ? "Finding the place…" : info?.extract ?? `Ask what makes ${splitPlace(openPlace).name} worth the stop.`}
          </p>
          <button type="button" className="pl-btn shrink-0" onClick={() => ask(`Swap ${openPlace} on ${day.label} for something nearby that suits the same time of day.`)}>
            Swap it
          </button>
        </div>
      ) : null}
    </li>
  );
}

export const BoardDay = defineComponent({
  name: "BoardDay",
  description: planningComponentDescriptions.BoardDay,
  props: BoardDaySchema,
  component: function BoardDayView({ props }) {
    return (
      <ul className="flex flex-col">
        <DayRow day={props} index={0} />
      </ul>
    );
  },
});

export const DayBoard = defineComponent({
  name: "DayBoard",
  description: planningComponentDescriptions.DayBoard,
  props: DayBoardSchema,
  component: function DayBoardView({ props }) {
    const ask = useAskAssistant();
    const days = (props.days ?? []).map((node) => childProps<BoardDayProps>(node)).filter((day): day is BoardDayProps => typeof day.label === "string" && Array.isArray(day.places));
    return (
      <section aria-label={props.title} className="pl-board flex flex-col gap-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="pl-display text-[1.7rem]">{props.title}</h3>
            {props.note ? <p className="pl-hand mt-1">{props.note}</p> : null}
          </div>
          <span className="pl-chip">
            {days.length} day{days.length === 1 ? "" : "s"}
          </span>
        </header>
        <ol className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
          {days.map((day, index) => (
            <DayRow key={`${index}-${day.label}`} day={day} index={index} />
          ))}
        </ol>
        <div className="flex flex-wrap gap-2 border-t border-[var(--pl-line)] pt-4">
          <button type="button" className="pl-btn" onClick={() => ask(`Make "${props.title}" slower, with fewer stops each day and time to rest.`)}>
            Slower pace
          </button>
          <button type="button" className="pl-btn" onClick={() => ask(`Turn "${props.title}" into a stop-by-stop route with times for each day.`)}>
            Add timings <ArrowUpRight className="size-3.5" aria-hidden />
          </button>
        </div>
      </section>
    );
  },
});
