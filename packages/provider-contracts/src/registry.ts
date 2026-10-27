import { isIsoDate, type NormalisedOffer } from "@tripweave/shared";
import { mapWithConcurrency, withRetry, type RetryOptions } from "./resilience";
import { ProviderError, type HotelAvailabilityInput, type HotelProvider, type ProviderOutcome } from "./types";

export interface MultiSearchOptions {
  timeoutMs: number;
  concurrency: number;
  retry: RetryOptions;
  now?: () => number;
  /** Called after each provider call for telemetry (provider health metrics). */
  onCall?: (outcome: ProviderOutcome) => void | Promise<void>;
}

export interface MultiSearchResult {
  offers: NormalisedOffer[];
  outcomes: ProviderOutcome[];
  dropped: number;
}

function withTimeout<T>(providerKey: string, p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderError(providerKey, "timeout", `Provider exceeded ${ms}ms`, true)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Drops structurally invalid offers so one bad supplier record can never poison optimisation. */
export function isValidOffer(o: NormalisedOffer, input: Pick<HotelAvailabilityInput, "checkIn" | "checkOut">): boolean {
  return (
    Number.isInteger(o.totalAmountMinor) && o.totalAmountMinor >= 0 &&
    typeof o.currency === "string" && o.currency.length === 3 &&
    isIsoDate(o.stayStart) && isIsoDate(o.stayEnd) &&
    o.stayStart === input.checkIn && o.stayEnd === input.checkOut &&
    o.nights > 0 && o.roomsRequired > 0 && !!o.property.id && !!o.offerId
  );
}

/**
 * Queries every provider with bounded concurrency, per-call timeouts and retries. A failing
 * provider is reported in `outcomes` and never prevents results from the others.
 */
export async function searchAllProviders(providers: HotelProvider[], input: HotelAvailabilityInput, opts: MultiSearchOptions): Promise<MultiSearchResult> {
  const clock = opts.now ?? Date.now;
  let dropped = 0;
  const perProvider = await mapWithConcurrency(providers, opts.concurrency, async (provider) => {
    const started = clock();
    let outcome: ProviderOutcome;
    let offers: NormalisedOffer[] = [];
    try {
      const raw = await withRetry(() => withTimeout(provider.key, provider.getAvailability(input), opts.timeoutMs), opts.retry);
      offers = raw.filter((o) => {
        const ok = isValidOffer(o, input);
        if (!ok) dropped++;
        return ok;
      });
      // Defence in depth: a mock provider's offers can never claim to be live.
      if (provider.isMock) offers = offers.map((o) => ({ ...o, isMock: true, verificationStatus: o.verificationStatus === "live_checked" ? "estimated" : o.verificationStatus }));
      outcome = { providerKey: provider.key, status: "ok", offers: offers.length, latencyMs: clock() - started, isMock: provider.isMock };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError(provider.key, "upstream", (e as Error).message ?? "Unknown error");
      offers = [];
      outcome = { providerKey: provider.key, status: err.code === "timeout" ? "timeout" : err.code === "unsupported" || err.code === "not_configured" ? "skipped" : "error", offers: 0, latencyMs: clock() - started, errorCode: err.code, errorMessage: err.message, isMock: provider.isMock };
    }
    await opts.onCall?.(outcome);
    return { outcome, offers };
  });
  const seen = new Set<string>();
  const offers: NormalisedOffer[] = [];
  for (const r of perProvider) for (const o of r.offers) if (!seen.has(o.offerId)) (seen.add(o.offerId), offers.push(o));
  return { offers, outcomes: perProvider.map((r) => r.outcome), dropped };
}
