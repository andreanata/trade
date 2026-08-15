import type { DataQuality } from "@/types/market";
import {
  cooldownRemaining,
  recordFailure,
  recordRateLimit,
  recordRequest,
  recordSuccess,
} from "@/server/provider-health";

/** Vendor returned a non-2xx status or an in-body error object. */
export class ProviderHttpError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly providerId: string;

  constructor(providerId: string, status: number, message: string, retryable = false) {
    super(message);
    this.name = "ProviderHttpError";
    this.providerId = providerId;
    this.status = status;
    this.retryable = retryable;
  }
}

export class ProviderTimeoutError extends Error {
  readonly providerId: string;
  constructor(providerId: string, timeoutMs: number) {
    super(`Request to ${providerId} timed out after ${timeoutMs}ms`);
    this.name = "ProviderTimeoutError";
    this.providerId = providerId;
  }
}

export class ProviderRateLimitError extends ProviderHttpError {
  /** Seconds the vendor asked us to wait, when it said so. */
  readonly retryAfterSeconds: number | null;
  constructor(providerId: string, message = "Vendor rate limit reached (429)", retryAfterSeconds: number | null = null) {
    super(providerId, 429, message, true);
    this.name = "ProviderRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Thrown while a provider is inside its post-429 cooldown window. */
export class ProviderCooldownError extends ProviderRateLimitError {
  constructor(providerId: string, remainingMs: number) {
    super(
      providerId,
      `${providerId} is rate limited. Retrying after cooldown (${Math.ceil(remainingMs / 1000)}s remaining).`,
      Math.ceil(remainingMs / 1000),
    );
    this.name = "ProviderCooldownError";
  }
}

export interface FetchOptions {
  providerId: string;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Extra validation of the parsed body; throw to reject (e.g. vendor error envelopes). */
  validate?: (body: unknown) => void;
  /** Set false to bypass the 429 cooldown gate (used by explicit health probes). */
  respectCooldown?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.round((date - Date.now()) / 1000)) : null;
}

/**
 * Hardened vendor fetch.
 *
 *  - AbortController timeout on every attempt
 *  - bounded retries with exponential backoff + jitter (429 / 5xx / network only)
 *  - post-429 cooldown: while a provider is cooling down we fail fast instead of
 *    hammering it, and the caller surfaces RATE_LIMITED
 *  - every outcome is recorded in the provider-health registry, which is what the
 *    status dashboard reads (so LIVE can never come from "a key exists")
 */
export async function providerFetch<T>(url: string, options: FetchOptions): Promise<T> {
  const { providerId, timeoutMs = 9_000, retries = 2, headers, validate, respectCooldown = true } = options;

  if (respectCooldown) {
    const remaining = cooldownRemaining(providerId);
    if (remaining > 0) throw new ProviderCooldownError(providerId, remaining);
  }

  recordRequest(providerId);
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", ...(headers ?? {}) },
        cache: "no-store",
      });

      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        throw new ProviderRateLimitError(
          providerId,
          `Vendor rate limit reached (429)${retryAfter ? `, retry after ${retryAfter}s` : ""}`,
          retryAfter,
        );
      }
      if (res.status >= 500) {
        throw new ProviderHttpError(providerId, res.status, `Vendor error ${res.status}`, true);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ProviderHttpError(
          providerId,
          res.status,
          `Vendor rejected the request (${res.status})${text ? `: ${text.slice(0, 180)}` : ""}`,
        );
      }

      const body = (await res.json()) as unknown;
      validate?.(body);
      // Freshness is classified by the caller; success here means "valid payload".
      recordSuccess(providerId, null, Date.now() - startedAt);
      return body as T;
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      if (isAbort) lastError = new ProviderTimeoutError(providerId, timeoutMs);

      // A 429 stops the retry loop immediately — retrying is what got us limited.
      if (error instanceof ProviderRateLimitError) {
        recordRateLimit(providerId, error.retryAfterSeconds);
        throw error;
      }

      const retryable =
        isAbort || (error instanceof ProviderHttpError && error.retryable) || error instanceof TypeError;

      if (!retryable || attempt === retries) break;
      await sleep(350 * 2 ** attempt + Math.random() * 200);
    } finally {
      clearTimeout(timer);
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Unknown vendor transport failure";
  recordFailure(providerId, lastError instanceof ProviderTimeoutError ? "TIMEOUT" : "ERROR", message);
  throw lastError instanceof Error ? lastError : new ProviderHttpError(providerId, 0, message);
}

/** Cache TTLs (ms) tuned so the terminal never hammers a vendor. */
export const TTL = {
  QUOTE: 15_000,
  INTRADAY: 60_000,
  DAILY: 5 * 60_000,
  HISTORICAL: 15 * 60_000,
  SEARCH: 10 * 60_000,
  STATUS: 60_000,
  FUNDAMENTALS: 10 * 60_000,
  NEWS: 5 * 60_000,
  HEALTH: 30_000,
  /** Negative cache so a failing vendor is not retried on every render. */
  ERROR: 20_000,
} as const;

interface CacheEntry {
  at: number;
  ttl: number;
  value?: unknown;
  error?: unknown;
  /** Set while a background revalidation is running. */
  revalidating?: boolean;
}

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

export function ttlForTimeframe(timeframeMs: number): number {
  if (timeframeMs <= 15 * 60_000) return TTL.INTRADAY;
  if (timeframeMs <= 4 * 60 * 60_000) return TTL.DAILY;
  return TTL.HISTORICAL;
}

/** How long a stale entry may still be served while it refreshes in the background. */
const SWR_WINDOW_MULTIPLIER = Number(process.env.CACHE_SWR_MULTIPLIER ?? 8);

/**
 * TTL cache with:
 *  - in-flight de-duplication / request coalescing (5 callers -> 1 vendor request)
 *  - short negative caching so a failure is not retried on every render
 *  - stale-while-revalidate: a slightly stale value is returned instantly while a
 *    single background refresh runs, so timeframe switches feel immediate
 */
export async function cached<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();

  if (hit) {
    const age = now - hit.at;
    if (age < hit.ttl) {
      if (hit.error) throw hit.error;
      return hit.value as T;
    }
    // Stale but still inside the SWR window: serve now, refresh behind the scenes.
    if (!hit.error && hit.value !== undefined && age < hit.ttl * SWR_WINDOW_MULTIPLIER) {
      if (!hit.revalidating && !inflight.has(key)) {
        hit.revalidating = true;
        void loader()
          .then((value) => {
            store.set(key, { at: Date.now(), ttl, value });
          })
          .catch(() => {
            // Keep serving the last good value; the error surfaces on the next miss.
            hit.revalidating = false;
          });
      }
      return hit.value as T;
    }
  }

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const promise = loader()
    .then((value) => {
      store.set(key, { at: Date.now(), ttl, value });
      return value;
    })
    .catch((error: unknown) => {
      store.set(key, { at: Date.now(), ttl: TTL.ERROR, error });
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
      if (store.size > 2_000) {
        const stale = [...store.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 800);
        for (const [k] of stale) store.delete(k);
      }
    });

  inflight.set(key, promise);
  return promise;
}

/** Cache metadata for observability (age of a cached entry, in ms). */
export function cacheAge(key: string): number | null {
  const hit = store.get(key);
  return hit ? Date.now() - hit.at : null;
}

export function cacheStats() {
  return { entries: store.size, inflight: inflight.size };
}

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

/**
 * Per-host token bucket. Free on-chain endpoints (discovery / OHLCV) cap requests
 * per minute, so calls are spaced instead of bursting into 429s.
 */
const buckets = new Map<string, { tokens: number; last: number; capacity: number; refillPerMs: number }>();

export function configureRateLimit(key: string, perMinute: number, burst = perMinute) {
  if (!buckets.has(key)) {
    buckets.set(key, { tokens: burst, last: Date.now(), capacity: burst, refillPerMs: perMinute / 60_000 });
  }
}

export async function rateLimit(key: string): Promise<void> {
  const bucket = buckets.get(key);
  if (!bucket) return;
  for (;;) {
    const now = Date.now();
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + (now - bucket.last) * bucket.refillPerMs);
    bucket.last = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - bucket.tokens) / bucket.refillPerMs);
    await sleep(Math.min(2_500, Math.max(60, waitMs)));
  }
}

/** Bounded concurrency so batch scans stay inside vendor rate limits. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + Math.max(1, size)));
  return out;
}

/**
 * Freshness classification. A vendor payload is only LIVE when the underlying
 * data point is genuinely recent; otherwise it degrades to DELAYED/HISTORICAL.
 */
export function classifyQuality(
  asOfMs: number | null,
  override?: string | null,
): { quality: DataQuality; delaySeconds: number | null } {
  const normalized = (override ?? "").toUpperCase();
  const delaySeconds = asOfMs === null ? null : Math.max(0, Math.round((Date.now() - asOfMs) / 1000));

  if (normalized === "LIVE" || normalized === "DELAYED" || normalized === "HISTORICAL") {
    return { quality: normalized as DataQuality, delaySeconds };
  }
  if (asOfMs === null) return { quality: "HISTORICAL", delaySeconds: null };
  if (delaySeconds !== null && delaySeconds <= 120) return { quality: "LIVE", delaySeconds };
  if (delaySeconds !== null && delaySeconds <= 30 * 60) return { quality: "DELAYED", delaySeconds };
  return { quality: "HISTORICAL", delaySeconds };
}
