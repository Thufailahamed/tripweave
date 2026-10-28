"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Renderer } from "@openuidev/react-lang";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { PackageShowcaseSnapshot } from "@tripweave/planning-contract";
import { Alert, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiPost, errorMessage } from "@/lib/api";
import { tripKeys } from "@/features/trips/hooks";
import { PackageShowcaseProvider } from "./context";
import { getPackageShowcaseRenderLibrary } from "./library";
import { fetchPackageSnapshot, streamPackagePresentation, type PackagePresentationDone } from "./use-package-stream";
import { needsLiveCheck, resolveShowcasePackage } from "./helpers";

type Status = "streaming" | "done" | "error";

class PresentationBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) {
      return <Alert tone="warning" title="The package story could not be displayed">The standard package cards below show the same packages and prices.</Alert>;
    }
    return this.props.children;
  }
}

/**
 * The AI-composed package story for one optimisation run. The model composes the layout from the server
 * snapshot; every value is rendered from that snapshot, and actions are performed here through fixed
 * operations that the server checks again.
 */
export function PackageStoryPanel({ tripId, jobId, onFocusPackage }: { tripId: string; jobId: string; onFocusPackage: (packageId: string) => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const library = React.useMemo(() => getPackageShowcaseRenderLibrary(), []);
  const [snapshot, setSnapshot] = React.useState<PackageShowcaseSnapshot | null>(null);
  const [program, setProgram] = React.useState("");
  const [status, setStatus] = React.useState<Status>("streaming");
  const [done, setDone] = React.useState<PackagePresentationDone | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [focusDraft, setFocusDraft] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);

  const compose = React.useCallback(
    async (focus: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setStatus("streaming");
      setProgram("");
      setDone(null);
      setError(null);
      let finished = false;
      try {
        await streamPackagePresentation({
          tripId,
          jobId,
          focus,
          signal: controller.signal,
          onMeta: (next) => setSnapshot(next),
          onDelta: (text) => setProgram((current) => current + text),
          onReset: () => setProgram(""),
          onDone: (result) => {
            finished = true;
            setProgram(result.program);
            setDone(result);
            setStatus("done");
          },
        });
        if (!finished && !controller.signal.aborted) {
          setError("The connection closed before the package story finished. Compose it again.");
          setStatus("error");
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(errorMessage(caught));
        setStatus("error");
      }
    },
    [tripId, jobId],
  );

  React.useEffect(() => {
    void compose("");
    return () => controllerRef.current?.abort();
  }, [compose]);

  const refreshSnapshot = React.useCallback(async () => {
    const fresh = await fetchPackageSnapshot(tripId, jobId);
    setSnapshot(fresh.snapshot);
  }, [tripId, jobId]);

  const runAction = async (key: string, work: () => Promise<void>) => {
    setPending(key);
    try {
      await work();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setPending(null);
    }
  };

  const validatePackage = (packageId: string, ref: string) =>
    runAction(`validate_package:${ref}`, async () => {
      const result = await apiPost<{ verification: { allVerified: boolean }; changed: boolean }>(`/packages/${packageId}/validate`, {});
      await refreshSnapshot();
      void qc.invalidateQueries({ queryKey: ["trips", "packages", tripId] });
      void qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      if (result.verification.allVerified) toast.success(result.changed ? "Live prices checked; package totals updated" : "Live prices checked");
      else toast.error("Live price check failed. The package cannot be quoted.");
    });

  const createQuote = (packageId: string, ref: string) =>
    runAction(`create_quote:${ref}`, async () => {
      const quote = await apiPost<{ id: string }>("/quotes", { tripRequestId: tripId, packageId });
      void qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      toast.success("Quotation created");
      router.push(`/quotes/${quote.id}`);
    });

  const handleAction = (event: { type: string; params?: Record<string, unknown> }) => {
    const ref = typeof event.params?.packageId === "string" ? event.params.packageId : null;
    const pkg = ref && snapshot ? resolveShowcasePackage(snapshot, ref) : null;
    switch (event.type) {
      case "focus_package":
        if (pkg) onFocusPackage(pkg.id);
        return;
      case "validate_package":
        if (pkg) void validatePackage(pkg.id, pkg.ref);
        return;
      case "create_quote":
        if (!pkg) return;
        // The quotation API enforces this too; checking here explains the refusal before a round trip.
        if (needsLiveCheck(pkg)) {
          toast.error("Check live prices before creating a quotation.");
          return;
        }
        void createQuote(pkg.id, pkg.ref);
        return;
      case "open_itinerary":
        router.push(`/trips/${tripId}/itinerary`);
        return;
      case "open_optimise":
        router.push(`/trips/${tripId}/optimise`);
        return;
      default:
        toast.info("That action is not available here.");
    }
  };

  const composing = status === "streaming";
  const showStory = !!snapshot && program.length > 0;

  return (
    <section aria-labelledby="package-story-heading" className="tw-planner flex min-w-0 flex-col gap-6 rounded-[28px] border border-border/70 bg-card p-5 shadow-[0_18px_50px_-32px_rgba(20,26,45,0.35)] md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="tw-eyebrow text-muted-foreground">AI package story</p>
          <h2 id="package-story-heading" className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em]">
            The packages, explained
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Prices, hotels, dates and live-check status are read from the server. The AI only chooses the layout and the wording.
          </p>
        </div>
        <form
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            void compose(focusDraft.trim());
          }}
        >
          <label htmlFor="package-story-focus" className="sr-only">
            What matters most for this trip?
          </label>
          <input
            id="package-story-focus"
            value={focusDraft}
            maxLength={300}
            onChange={(event) => setFocusDraft(event.target.value)}
            placeholder="Who is travelling? What matters most?"
            className="h-9 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm sm:w-72 sm:flex-none"
          />
          <Button type="submit" size="sm" loading={composing}>
            <Sparkles /> Compose
          </Button>
        </form>
      </div>

      {error ? <Alert tone="danger" title="The package story could not be composed">{error}</Alert> : null}
      {done?.usedFallback ? <Alert tone="info">{done.warnings.join(" ")}</Alert> : null}
      {composing && !showStory ? <LoadingBlock label="Composing the package story" rows={3} /> : null}

      {showStory && snapshot ? (
        <PresentationBoundary>
          <PackageShowcaseProvider snapshot={snapshot} pending={pending}>
            <Renderer library={library} response={program} isStreaming={composing} publishObservability={false} onAction={(event) => handleAction(event as { type: string; params?: Record<string, unknown> })} />
          </PackageShowcaseProvider>
        </PresentationBoundary>
      ) : null}
    </section>
  );
}
