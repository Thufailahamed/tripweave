import { ProviderError } from "./types";

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Injected for tests so no real time passes. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Bounded retries with exponential backoff + jitter; only retryable ProviderErrors are retried. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions): Promise<T> {
  const sleep = o.sleep ?? defaultSleep;
  const rnd = o.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastError = e;
      const retryable = e instanceof ProviderError && e.retryable;
      if (!retryable || attempt === o.retries) throw e;
      const delay = Math.min(o.maxDelayMs, o.baseDelayMs * 2 ** attempt) * (0.5 + rnd() / 2);
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Simple minimum-interval limiter so one provider is never hit faster than its quota allows. */
export class IntervalLimiter {
  private nextSlot = 0;
  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}
  async acquire(): Promise<void> {
    const t = this.now();
    const wait = Math.max(0, this.nextSlot - t);
    this.nextSlot = Math.max(t, this.nextSlot) + this.minIntervalMs;
    if (wait > 0) await this.sleep(wait);
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Fetch with a hard timeout and HTTP-status → ProviderError classification. */
export async function fetchJson<T>(providerKey: string, fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") throw new ProviderError(providerKey, "timeout", `Request timed out after ${timeoutMs}ms`, true);
    throw new ProviderError(providerKey, "upstream", `Network error: ${(e as Error).message}`, true);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError(providerKey, "auth", `Supplier rejected credentials (${res.status})`, false, res.status);
  if (res.status === 429) throw new ProviderError(providerKey, "rate_limited", "Supplier rate limit reached", true, res.status);
  if (res.status >= 500) throw new ProviderError(providerKey, "upstream", `Supplier error (${res.status})`, true, res.status);
  if (res.status >= 400) {
    const body = await res.text().catch(() => "");
    throw new ProviderError(providerKey, "bad_request", `Supplier rejected the request (${res.status}): ${body.slice(0, 200)}`, false, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderError(providerKey, "bad_response", "Supplier returned invalid JSON", false, res.status);
  }
}
