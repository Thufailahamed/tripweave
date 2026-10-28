"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Renderer } from "@openuidev/react-lang";
import { ArrowUp, Compass, Layers, Lightbulb, ListChecks, MessageSquare, RefreshCw, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import type { PlanningSnapshot, PlanningStarter } from "@tripweave/planning-contract";
import { Alert, Badge, Card, CardContent, ErrorState, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage } from "@/lib/api";
import { tripKeys } from "@/features/trips/hooks";
import { dateRange } from "@/lib/utils";
import { PlanningProvider } from "./context";
import { PlanningFallbackView } from "./fallback-view";
import { getPlanningLibrary } from "./library";
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

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function starterIcon(label: string) {
  if (/missing|ask/i.test(label)) return ListChecks;
  if (/package|compare|value/i.test(label)) return Layers;
  if (/why|explain|recommend/i.test(label)) return Lightbulb;
  if (/next|itinerary|summar/i.test(label)) return Compass;
  return Sparkles;
}

class GeneratedInterfaceBoundary extends React.Component<{ snapshot: PlanningSnapshot; children: React.ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <PlanningFallbackView snapshot={this.props.snapshot} reason="error" />;
    return this.props.children;
  }
}

export function PlanningPanel({ tripId }: { tripId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const library = React.useMemo(() => getPlanningLibrary(), []);
  const initial = useQuery({ queryKey: ["trips", "planning", tripId], queryFn: ({ signal }) => fetchPlanningContext(tripId, signal), staleTime: 15_000 });
  const [snapshot, setSnapshot] = React.useState<PlanningSnapshot | null>(null);
  const [starters, setStarters] = React.useState<PlanningStarter[]>([]);
  const [engineAvailable, setEngineAvailable] = React.useState(false);
  const [messages, setMessages] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!initial.data) return;
    setSnapshot(initial.data.snapshot);
    setStarters(initial.data.starters);
    setEngineAvailable(initial.data.engineAvailable);
  }, [initial.data]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, streaming]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

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
        await streamPlanningTurn({
          tripId,
          message: text,
          history,
          signal: controller.signal,
          onMeta: (meta) => {
            setSnapshot(meta.snapshot);
            setStarters(meta.starters);
            setEngineAvailable(meta.engineAvailable);
            patchTurn(assistantId, { snapshot: meta.snapshot });
          },
          onDelta: (chunk) => setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, content: message.content + chunk } : message))),
          onDone: (done) => {
            doneReceived = true;
            patchTurn(assistantId, { content: done.program, status: "done", usedFallback: done.usedFallback, reason: done.reason, warnings: done.warnings ?? [] });
          },
        });
        if (!doneReceived && !controller.signal.aborted) {
          patchTurn(assistantId, { status: "error", content: "", errors: ["The stream ended before the interface was complete. A standard view is shown."] });
        }
      } catch (error) {
        if (doneReceived) return;
        const aborted = (error as Error)?.name === "AbortError";
        patchTurn(assistantId, {
          status: "error",
          errors: [aborted ? "Generation stopped." : errorMessage(error)],
          content: "",
        });
        if (!aborted) setNotice({ tone: "danger", text: errorMessage(error) });
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [messages, patchTurn, snapshot, streaming, tripId],
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
        router.push(`/trips/${tripId}/packages`);
        return;
      }
      if (event.type === "open_itinerary") {
        router.push(`/trips/${tripId}/itinerary`);
        return;
      }
      if (event.type === "open_optimise") {
        router.push(`/trips/${tripId}/optimise`);
        return;
      }
      if (event.type === "open_quote") {
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
    [qc, router, send, snapshot, tripId],
  );

  if (initial.isLoading && !snapshot) return <LoadingBlock label="Loading planning context" />;
  if (initial.isError && !snapshot) return <ErrorState error={initial.error} onRetry={() => initial.refetch()} title="Could not load the planning assistant" />;

  const visibleStarters = (starters.length > 0 ? starters : [{ label: "Summarise the trip", prompt: "Summarise the current trip requirements." }]).slice(0, 4);

  return (
    <div className="flex flex-col gap-3">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-4 pb-20 sm:p-5 sm:pb-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
                <Sparkles className="size-4" />
              </span>
              <div>
                <h2 className="font-display text-[17px] font-semibold tracking-[-0.03em]">Planning assistant</h2>
                <p className="text-[11px] text-muted-foreground">
                  {snapshot ? `${snapshot.trip.title} · ${dateRange(snapshot.trip.arrivalDate, snapshot.trip.departureDate)}` : "Composing from your saved trip"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={engineAvailable ? "accent" : "neutral"}>{engineAvailable ? "AI-assisted" : "Standard summaries"}</Badge>
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-success" /> Server-authoritative
              </span>
            </div>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {streaming ? "The assistant is composing a response." : messages.length > 0 ? "Response complete." : "Ready for a planning request."}
          </p>

          {messages.length === 0 ? (
            <div className="tw-planner overflow-hidden p-5 sm:p-7">
              <p className="pl-eyebrow">
                <span aria-hidden className="size-1.5 rounded-full bg-[var(--pl-accent)]" /> Generated on demand
              </p>
              <h3 className="pl-display mt-2 max-w-lg text-[2.4rem] leading-[0.96] sm:text-[3rem]">What shall we plan next?</h3>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[var(--pl-muted)]">
                I can compose a summary, compare packages, explain a recommendation or gather the missing details. Every layout is built for this request; every number comes from your saved trip.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {visibleStarters.map((starter, index) => {
                  const Icon = starterIcon(starter.label);
                  return (
                    <button
                      key={starter.label}
                      type="button"
                      aria-label={starter.label}
                      disabled={!snapshot}
                      onClick={() => void send(starter.prompt)}
                      className="pl-card pl-rise group flex items-center gap-3 px-4 py-3 text-left transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ "--i": index } as React.CSSProperties}
                    >
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--pl-surface-2)] text-[var(--pl-accent)] transition group-hover:bg-[var(--pl-accent-soft)]">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold">{starter.label}</span>
                        <span className="block truncate text-[10px] text-[var(--pl-muted)]">{starter.prompt}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="pl-hand mt-4">nothing is booked or changed without you</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-5" aria-label="Planning conversation">
            {messages.map((message) => {
              if (message.role === "user") {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md border border-border bg-muted/45 px-4 py-2.5 text-[13px]">
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  </div>
                );
              }
              const showFallback = message.usedFallback || message.standardView || (message.errors.length > 0 && !message.content);
              return (
                <div key={message.id} className="flex flex-col gap-2">
                  {message.status === "streaming" && !message.content ? (
                    <div role="status" className="flex items-center gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-4">
                      <span aria-hidden className="size-2 animate-pulse rounded-full bg-accent" />
                      <span className="pl-hand" style={{ fontFamily: "var(--font-caveat), cursive", color: "var(--accent)", fontSize: "1.3rem" }}>
                        composing your itinerary…
                      </span>
                    </div>
                  ) : null}
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
                    <PlanningFallbackView snapshot={message.snapshot} reason={message.standardView ? "manual" : message.reason === "invalid" ? "invalid" : message.usedFallback ? "unavailable" : "error"} onRetry={retry} />
                  ) : message.snapshot ? (
                    <GeneratedInterfaceBoundary snapshot={message.snapshot}>
                      <PlanningProvider snapshot={message.snapshot}>
                        <Renderer
                          library={library}
                          response={message.content}
                          isStreaming={message.status === "streaming"}
                          publishObservability={false}
                          onAction={(event) => void handleAction(event as { type: string; params: Record<string, unknown>; humanFriendlyMessage?: string })}
                          onError={(errors) => {
                            const relevant = errors.filter((error) => error.severity !== "warning").map((error) => `${error.code}: ${error.message}`);
                            patchTurn(message.id, { errors: relevant.slice(0, 3) });
                          }}
                        />
                      </PlanningProvider>
                    </GeneratedInterfaceBoundary>
                  ) : null}
                  {message.status !== "streaming" && message.snapshot ? (
                    <div className="flex flex-wrap items-center gap-2 px-1">
                      <Button size="sm" variant="ghost" onClick={() => patchTurn(message.id, { standardView: !message.standardView })}>
                        {message.standardView ? "Try generated view" : "Standard view"}
                      </Button>
                      {message.status === "error" ? (
                        <Button size="sm" variant="outline" onClick={retry}>
                          <RefreshCw /> Try again
                        </Button>
                      ) : null}
                      {message.usedFallback && message.reason === "invalid" ? (
                        <span className="text-[10px] text-muted-foreground">The server rejected malformed or unauthorised interface output before rendering it.</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div ref={scrollRef} />
          </div>

          {notice?.tone === "danger" && messages.length === 0 ? (
            <Button variant="outline" onClick={() => initial.refetch()}>
              Reload planning context
            </Button>
          ) : null}

        </CardContent>
      </Card>
      <div className={messages.length > 0 ? "sticky bottom-3 z-20 flex flex-col gap-1.5" : "flex flex-col gap-1.5"}>
          <form
            className="rounded-2xl border border-border bg-card/95 p-2 shadow-[0_18px_40px_-24px_rgba(20,26,45,0.55)] backdrop-blur-md"
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
              rows={2}
              disabled={streaming || !snapshot}
              placeholder={snapshot ? "Ask about hotels, routes, packages or what is missing…" : "Planning context is loading…"}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              className="min-h-[52px] w-full resize-none border-0 bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1">
              <p className="text-[10px] text-muted-foreground">Enter sends · Shift+Enter adds a line · {input.length}/4000</p>
              <div className="flex items-center gap-2">
                {streaming ? (
                  <Button type="button" variant="outline" size="sm" onClick={stop} aria-label="Stop generating">
                    <Square /> Stop
                  </Button>
                ) : null}
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!snapshot || input.trim().length === 0 || streaming}
                  className="grid size-9 place-items-center rounded-full bg-accent text-accent-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </div>
          </form>
          <p className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
            <MessageSquare className="size-3" aria-hidden /> Generated interfaces are validated against a fixed component allowlist. AI is optional; the standard view uses the same data.
          </p>
      </div>
      {!engineAvailable ? (
        <p className="text-xs text-muted-foreground">AI generation is not configured for this organisation. Requests still work and return a deterministic, readable summary built from the same server data.</p>
      ) : null}
    </div>
  );
}
