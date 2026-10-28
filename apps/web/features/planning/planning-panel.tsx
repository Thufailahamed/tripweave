"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Renderer } from "@openuidev/react-lang";
import { ArrowUp, Plus, RefreshCw, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import type { PlanningSnapshot, PlanningStarter } from "@tripweave/planning-contract";
import { Alert, ErrorState, LoadingBlock } from "@/components/ui/card";
import { ApiError, errorMessage } from "@/lib/api";
import { tripKeys } from "@/features/trips/hooks";
import { dateRange } from "@/lib/utils";
import { PlanningProvider } from "./context";
import { PlanningFallbackView } from "./fallback-view";
import { getPlanningLibrary } from "./library";
import { PlannerWelcome } from "./welcome";
import { applyClarificationAnswers, fetchPlanningContext, streamPlanningTurn } from "./use-planning-stream";

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  snapshot: PlanningSnapshot | null;
  status: "streaming" | "done" | "error";
  usedFallback?: boolean;
  reason?: string;
  warnings: string[];
  errors: string[];
  standardView: boolean;
}

const CONNECTION_DROPPED = "The connection to the planner dropped before the reply finished. Try again in a moment.";

/** fetch and stream reads reject with a TypeError ("network error", "Failed to fetch") when the connection drops. */
function isConnectionDrop(error: unknown): boolean {
  return error instanceof TypeError;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class GeneratedInterfaceBoundary extends React.Component<{ snapshot: PlanningSnapshot; mode: "operator" | "traveler"; children: React.ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <PlanningFallbackView snapshot={this.props.snapshot} reason="error" mode={this.props.mode} />;
    return this.props.children;
  }
}

/** Removes operator-only next steps from a traveller's snapshot before any component sees it. */
function forTraveller(snapshot: PlanningSnapshot): PlanningSnapshot {
  return {
    ...snapshot,
    quotes: [],
    permissions: { ...snapshot.permissions, canCreateQuotes: false },
    allowedActions: snapshot.allowedActions.filter((action) => action !== "open_quote"),
  };
}

function restoreMessages(persistKey: string | undefined): Turn[] {
  if (!persistKey || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(persistKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((turn): turn is Turn => !!turn && typeof turn === "object" && (turn as Turn).role !== undefined && typeof (turn as Turn).content === "string").map((turn) => (turn.status === "streaming" ? { ...turn, status: "error" as const, errors: ["This reply was interrupted when the page was closed."] } : turn)).slice(-20);
  } catch {
    return [];
  }
}

export function PlanningPanel({ tripId, mode = "operator", persistKey }: { tripId: string; mode?: "operator" | "traveler"; persistKey?: string }) {
  const traveler = mode === "traveler";
  const basePath = traveler ? `/travel/trips/${tripId}` : `/trips/${tripId}`;
  const qc = useQueryClient();
  const router = useRouter();
  const library = React.useMemo(() => getPlanningLibrary(), []);
  const initial = useQuery({ queryKey: ["trips", "planning", tripId], queryFn: ({ signal }) => fetchPlanningContext(tripId, signal), staleTime: 15_000 });
  const [snapshot, setSnapshot] = React.useState<PlanningSnapshot | null>(null);
  const [starters, setStarters] = React.useState<PlanningStarter[]>([]);
  const [engineAvailable, setEngineAvailable] = React.useState(false);
  const [messages, setMessages] = React.useState<Turn[]>(() => restoreMessages(persistKey));
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!initial.data) return;
    setSnapshot(traveler ? forTraveller(initial.data.snapshot) : initial.data.snapshot);
    setStarters(initial.data.starters);
    setEngineAvailable(initial.data.engineAvailable);
  }, [initial.data, traveler]);

  React.useEffect(() => {
    if (!persistKey || typeof window === "undefined" || streaming) return;
    try {
      if (messages.length === 0) window.localStorage.removeItem(persistKey);
      else window.localStorage.setItem(persistKey, JSON.stringify(messages.slice(-20)));
    } catch {
      /* A full or unavailable storage must never break the planner. */
    }
  }, [messages, persistKey, streaming]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, streaming]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  React.useLayoutEffect(() => {
    const node = composerRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [input]);

  const patchTurn = React.useCallback((id: string, patch: Partial<Turn>) => {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...patch, warnings: patch.warnings ?? message.warnings, errors: patch.errors ?? message.errors } : message)));
  }, []);

  const send = React.useCallback(
    async (raw: string, overrideSnapshot?: PlanningSnapshot) => {
      const text = raw.trim();
      if (!text || streaming) return;
      if (text.length > 4_000) {
        setNotice({ tone: "danger", text: "Keep the message under 4,000 characters." });
        return;
      }
      const baseSnapshot = overrideSnapshot ?? snapshot;
      if (!baseSnapshot) return;
      const history = messages
        .filter((message) => message.role === "user")
        .slice(-8)
        .map((message) => ({ role: "user" as const, content: message.content }));
      const assistantId = newId();
      const userTurn: Turn = { id: newId(), role: "user", content: text, snapshot: baseSnapshot, status: "done", warnings: [], errors: [], standardView: false };
      const assistantTurn: Turn = { id: assistantId, role: "assistant", content: "", snapshot: baseSnapshot, status: "streaming", warnings: [], errors: [], standardView: false };
      setMessages((current) => [...current, userTurn, assistantTurn]);
      setInput("");
      setNotice(null);
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let doneReceived = false;
      try {
        for (let attempt = 1; ; attempt += 1) {
          try {
            await streamPlanningTurn({
              tripId,
              message: text,
              history,
              signal: controller.signal,
              onMeta: (meta) => {
                const nextSnapshot = traveler ? forTraveller(meta.snapshot) : meta.snapshot;
                setSnapshot(nextSnapshot);
                setStarters(meta.starters);
                setEngineAvailable(meta.engineAvailable);
                patchTurn(assistantId, { snapshot: nextSnapshot });
              },
              onDelta: (chunk) => setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, content: message.content + chunk } : message))),
              onReset: () => patchTurn(assistantId, { content: "", warnings: [], errors: [] }),
              onDone: (done) => {
                doneReceived = true;
                patchTurn(assistantId, { content: done.program, status: "done", usedFallback: done.usedFallback, reason: done.reason, warnings: done.warnings ?? [] });
              },
            });
            break;
          } catch (error) {
            // A dropped connection (the API restarting, a proxy or network blip) is retried once from
            // scratch; HTTP errors, validation fallbacks and the reader's own Stop are not.
            if (doneReceived || controller.signal.aborted || !isConnectionDrop(error) || attempt >= 2) throw error;
            patchTurn(assistantId, { content: "", warnings: [], errors: [] });
            await new Promise((resolve) => setTimeout(resolve, 1_500));
            if (controller.signal.aborted) throw error;
          }
        }
        if (!doneReceived && !controller.signal.aborted) {
          patchTurn(assistantId, { status: "error", content: "", errors: ["The stream ended before the interface was complete. A standard view is shown."] });
        }
      } catch (error) {
        if (doneReceived) return;
        const aborted = (error as Error)?.name === "AbortError";
        const message = aborted ? "Generation stopped." : isConnectionDrop(error) ? CONNECTION_DROPPED : errorMessage(error);
        patchTurn(assistantId, { status: "error", errors: [message], content: "" });
        if (!aborted) setNotice({ tone: "danger", text: message });
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [messages, patchTurn, snapshot, streaming, traveler, tripId],
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = React.useCallback(() => {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (lastUser) void send(lastUser.content);
  }, [messages, send]);

  const handleAction = React.useCallback(
    async (event: { type: string; params: Record<string, unknown>; humanFriendlyMessage?: string }) => {
      if (!snapshot) return;
      if (event.type === "continue_conversation") {
        const message = String(event.humanFriendlyMessage ?? "").slice(0, 4_000);
        if (message) void send(message);
        return;
      }
      if (event.type === "apply_clarification") {
        const rawAnswers = event.params.answers;
        if (!Array.isArray(rawAnswers) || rawAnswers.length === 0 || rawAnswers.length > 20) {
          toast.error("The clarification submission was not valid.");
          return;
        }
        const answers: { questionId: string; value: unknown }[] = [];
        for (const item of rawAnswers) {
          if (!item || typeof item !== "object") {
            toast.error("The clarification submission was not valid.");
            return;
          }
          const record = item as { questionId?: unknown; value?: unknown };
          if (typeof record.questionId !== "string" || !/^[a-z_]{3,64}$/.test(record.questionId)) {
            toast.error("The clarification submission was not valid.");
            return;
          }
          answers.push({ questionId: record.questionId, value: record.value ?? null });
        }
        try {
          const result = await applyClarificationAnswers(tripId, answers);
          setSnapshot(result.snapshot);
          setMessages((current) =>
            current.map((message) => (message.role === "assistant" && message.status === "done" ? { ...message, snapshot: result.snapshot } : message)),
          );
          qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
          qc.invalidateQueries({ queryKey: ["trips", "planning", tripId] });
          toast.success("Requirements updated");
          await send("I answered the clarification questions. Show the updated requirements and the next step.", result.snapshot);
        } catch (error) {
          const message = error instanceof ApiError && error.status === 403 ? "You do not have permission to change this trip." : errorMessage(error);
          setNotice({ tone: "danger", text: message });
          toast.error(message);
        }
        return;
      }
      if (event.type === "open_packages") {
        router.push(traveler ? `${basePath}/stays` : `${basePath}/packages`);
        return;
      }
      if (event.type === "open_itinerary") {
        router.push(`${basePath}/itinerary`);
        return;
      }
      if (event.type === "open_optimise") {
        router.push(traveler ? `${basePath}/stays` : `${basePath}/optimise`);
        return;
      }
      if (event.type === "open_quote") {
        if (traveler) {
          toast("Quotes are not part of your personal trip.");
          return;
        }
        const quoteId = typeof event.params.quoteId === "string" ? event.params.quoteId : "";
        if (!snapshot.quotes.some((quote) => quote.id === quoteId)) {
          toast.error("That quotation is no longer available.");
          return;
        }
        router.push(`/quotes/${quoteId}`);
        return;
      }
      toast.error("That action is not available here.");
    },
    [basePath, qc, router, send, snapshot, traveler, tripId],
  );

  const topRef = React.useRef<HTMLElement | null>(null);
  const newChat = React.useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setNotice(null);
    setInput("");
    if (persistKey && typeof window !== "undefined") {
      try { window.localStorage.removeItem(persistKey); } catch { /* ignore */ }
    }
    topRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [persistKey]);

  if (initial.isLoading && !snapshot) return <LoadingBlock label="Loading planning context" />;
  if (initial.isError && !snapshot) return <ErrorState error={initial.error} onRetry={() => initial.refetch()} title="Could not load the planning assistant" />;

  const visibleStarters = (starters.length > 0 ? starters : [{ label: "Summarise the trip", prompt: "Summarise the current trip requirements." }]).slice(0, 6);
  const firstStop = snapshot?.itinerary?.stops[0]?.destination ?? null;

  const composer = (
    <div className="flex flex-col gap-1.5">
      <form
        className="pl-composer flex items-end gap-2 rounded-[26px] py-2 pl-5 pr-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="planning-message" className="sr-only">
          Message the planning assistant
        </label>
        <textarea
          ref={composerRef}
          id="planning-message"
          value={input}
          maxLength={4_000}
          rows={1}
          disabled={streaming || !snapshot}
          placeholder={snapshot ? `Ask anything about ${firstStop ?? "this trip"}…` : "Planning context is loading…"}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send(input);
            }
          }}
          className="max-h-40 min-h-[40px] flex-1 resize-none border-0 bg-transparent py-2.5 text-[14px] leading-snug outline-none placeholder:text-[var(--pl-muted)] disabled:opacity-60"
        />
        {streaming ? (
          <button type="button" onClick={stop} aria-label="Stop generating" className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--pl-line)] bg-[var(--pl-surface)] text-[var(--pl-ink)] transition hover:border-[var(--pl-ink)]">
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send message"
            disabled={!snapshot || input.trim().length === 0 || streaming}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--pl-accent)] text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </form>
      {messages.length === 0 ? (
        <p className="px-5 text-center text-[10px] text-[var(--pl-muted)]">
          Ask about this trip or travel anywhere: places, seasons, food, routes, packing. Trip prices and availability always come from the saved trip.
        </p>
      ) : null}
    </div>
  );

  return (
    <section ref={topRef} aria-label="AI planner" className="tw-planner pl-flat mx-auto flex w-full max-w-[880px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--pl-accent-soft)] text-[var(--pl-accent)]">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold leading-tight">Planning assistant</h2>
            <p className="truncate text-[11px] text-[var(--pl-muted)]">
              {snapshot ? `${snapshot.trip.title} · ${dateRange(snapshot.trip.arrivalDate, snapshot.trip.departureDate)}` : "Composing from your saved trip"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pl-chip" title={engineAvailable ? "Replies are composed by AI and checked by the server" : "AI generation is not configured"}>
            <span aria-hidden className={engineAvailable ? "size-1.5 rounded-full bg-[var(--pl-sage)]" : "size-1.5 rounded-full bg-[var(--pl-muted)]"} />
            {engineAvailable ? "AI-assisted" : "Standard summaries"}
          </span>
          {messages.length > 0 ? (
            <button type="button" className="pl-btn" onClick={newChat}>
              <Plus className="size-3.5" aria-hidden /> New chat
            </button>
          ) : null}
        </div>
      </div>

      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      <p role="status" aria-live="polite" className="sr-only">
        {streaming ? "The assistant is composing a response." : messages.length > 0 ? "Response complete." : "Ready for a planning request."}
      </p>

      {messages.length === 0 && snapshot ? (
        <PlannerWelcome snapshot={snapshot} starters={visibleStarters} disabled={!snapshot} onAsk={(prompt) => void send(prompt)} composer={composer} />
      ) : null}

      <div className="flex flex-col gap-12" aria-label="Planning conversation">
        {messages.map((message) => {
          if (message.role === "user") {
            return (
              <div key={message.id} className="pl-rise -mb-6 max-w-[34rem]">
                <p className="sr-only">You asked:</p>
                <p className="pl-echo whitespace-pre-wrap">{message.content}</p>
              </div>
            );
          }
          const showFallback = message.usedFallback || message.standardView || (message.errors.length > 0 && !message.content);
          return (
            <div key={message.id} className="flex flex-col gap-3">
              {message.status === "streaming" && !message.content ? <ComposingPlaceholder /> : null}
              {message.usedFallback ? (
                <Alert tone="warning" title={message.reason === "invalid" ? "Generated interface rejected" : "AI generation unavailable"}>
                  {message.warnings[0] ?? "A standard view of the same server data is shown below."}
                </Alert>
              ) : null}
              {message.errors.length > 0 && message.status !== "streaming" ? (
                <Alert tone="danger" title="This response could not be completed">
                  <p>{message.errors[0]}</p>
                </Alert>
              ) : null}
              {showFallback && message.snapshot ? (
                <PlanningFallbackView snapshot={message.snapshot} reason={message.standardView ? "manual" : message.reason === "invalid" ? "invalid" : message.usedFallback ? "unavailable" : "error"} onRetry={retry} mode={mode} />
              ) : message.snapshot ? (
                <GeneratedInterfaceBoundary snapshot={message.snapshot} mode={mode}>
                  <PlanningProvider snapshot={message.snapshot} mode={mode}>
                    <Renderer
                      library={library}
                      response={message.content}
                      isStreaming={message.status === "streaming"}
                      publishObservability={false}
                      onAction={(event) => void handleAction(event as { type: string; params: Record<string, unknown>; humanFriendlyMessage?: string })}
                      onError={(errors) => {
                        const relevant = errors.filter((error) => error.severity !== "warning" && error.code !== "excess-args").map((error) => `${error.code}: ${error.message}`);
                        patchTurn(message.id, { errors: relevant.slice(0, 3) });
                      }}
                    />
                  </PlanningProvider>
                </GeneratedInterfaceBoundary>
              ) : null}
              {message.status === "streaming" && message.content ? (
                <p className="pl-hand pl-hand-muted flex items-center gap-2" aria-hidden>
                  <span className="size-1.5 animate-pulse rounded-full bg-[var(--pl-accent)]" /> still composing…
                </p>
              ) : null}
              {message.status !== "streaming" && message.snapshot ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" className="pl-btn h-8 border-transparent bg-transparent px-3 shadow-none" onClick={() => patchTurn(message.id, { standardView: !message.standardView })}>
                    {message.standardView ? "Try generated view" : "Standard view"}
                  </button>
                  {message.status === "error" ? (
                    <button type="button" className="pl-btn h-8 px-3" onClick={retry}>
                      <RefreshCw className="size-3.5" aria-hidden /> Try again
                    </button>
                  ) : null}
                  {message.usedFallback && message.reason === "invalid" ? (
                    <span className="text-[10px] text-[var(--pl-muted)]">The server rejected malformed or unauthorised interface output before rendering it.</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {notice?.tone === "danger" && messages.length === 0 ? (
        <button type="button" className="pl-btn self-start" onClick={() => initial.refetch()}>
          Reload planning context
        </button>
      ) : null}

      {messages.length > 0 ? <div className="sticky bottom-4 z-20">{composer}</div> : null}
      {!engineAvailable ? (
        <p className="text-xs text-[var(--pl-muted)]">AI generation is not configured for this organisation. Requests still work and return a readable summary built from the saved trip; general travel questions need AI.</p>
      ) : null}
    </section>
  );
}

/** Shown until the first chunk arrives: a pen at work and the outline of a page being laid out. */
function ComposingPlaceholder() {
  return (
    <div role="status" className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <svg aria-hidden viewBox="0 0 120 16" className="pl-scribble h-4 w-24 text-[var(--pl-muted)]">
          <path d="M2 10 C 14 2, 22 14, 34 8 S 56 4, 66 10 S 90 14, 100 6 S 114 8, 118 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="pl-hand pl-hand-muted">writing back…</span>
      </div>
      <div aria-hidden className="flex flex-col gap-4">
        <div className="pl-sheen h-10 w-3/4 rounded-xl" />
        <div className="pl-sheen h-5 w-2/3 rounded-lg" />
        <div className="grid grid-cols-3 gap-4">
          <div className="pl-sheen aspect-[4/5] rounded-[14px]" />
          <div className="pl-sheen aspect-[4/5] rounded-[14px]" />
          <div className="pl-sheen aspect-[4/5] rounded-[14px]" />
        </div>
      </div>
    </div>
  );
}
