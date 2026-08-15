import type { DataQuality } from "@/types/market";

/**
 * PROVIDER HEALTH REGISTRY — the single source of truth for "is this provider
 * actually working right now?".
 *
 * Every outbound vendor request funnels through `providerFetch()`, which records
 * its real outcome here. Status is therefore derived from observed behaviour, not
 * from "an API key is present". A configured-but-never-called provider reports
 * CONFIGURED; only a genuinely successful, fresh response yields LIVE.
 *
 * Also implements the 429 cooldown: after a rate limit the provider is blocked
 * from further calls until `cooldownUntil`, so we stop hammering a vendor that has
 * already told us to back off.
 */

export type ProviderOutcome = "SUCCESS" | "RATE_LIMITED" | "TIMEOUT" | "ERROR";

export interface ProviderHealth {
  providerId: string;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastRateLimitAt: number | null;
  /** Epoch ms until which requests are suppressed after a 429. */
  cooldownUntil: number | null;
  lastError: string | null;
  /** Freshness measured on the last successful payload. */
  lastQuality: DataQuality | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
  requests: number;
  successes: number;
  rateLimitHits: number;
}

const registry = new Map<string, ProviderHealth>();

const DEFAULT_COOLDOWN_MS = Number(process.env.PROVIDER_COOLDOWN_MS ?? 60_000);
const MAX_COOLDOWN_MS = Number(process.env.PROVIDER_MAX_COOLDOWN_MS ?? 5 * 60_000);

function blank(providerId: string): ProviderHealth {
  return {
    providerId,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastRateLimitAt: null,
    cooldownUntil: null,
    lastError: null,
    lastQuality: null,
    lastLatencyMs: null,
    consecutiveFailures: 0,
    requests: 0,
    successes: 0,
    rateLimitHits: 0,
  };
}

function entry(providerId: string): ProviderHealth {
  let record = registry.get(providerId);
  if (!record) {
    record = blank(providerId);
    registry.set(providerId, record);
  }
  return record;
}

export function recordRequest(providerId: string): void {
  entry(providerId).requests += 1;
}

export function recordSuccess(providerId: string, quality: DataQuality | null, latencyMs?: number): void {
  const record = entry(providerId);
  record.lastSuccessAt = Date.now();
  record.lastQuality = quality;
  record.lastLatencyMs = latencyMs ?? record.lastLatencyMs;
  record.lastError = null;
  record.consecutiveFailures = 0;
  record.cooldownUntil = null;
  record.successes += 1;
}

/**
 * Applies an escalating cooldown. `retryAfterSeconds` from the vendor wins when
 * present; otherwise the wait doubles per consecutive hit, capped.
 */
export function recordRateLimit(providerId: string, retryAfterSeconds?: number | null): void {
  const record = entry(providerId);
  const now = Date.now();
  record.lastRateLimitAt = now;
  record.lastErrorAt = now;
  record.rateLimitHits += 1;
  record.consecutiveFailures += 1;
  record.lastError = "Rate limit reached (HTTP 429).";

  const vendorWait = retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;
  const backoff = Math.min(DEFAULT_COOLDOWN_MS * 2 ** Math.min(record.consecutiveFailures - 1, 3), MAX_COOLDOWN_MS);
  record.cooldownUntil = now + Math.max(vendorWait, backoff);
}

export function recordFailure(providerId: string, outcome: ProviderOutcome, message: string): void {
  if (outcome === "RATE_LIMITED") {
    recordRateLimit(providerId);
    return;
  }
  const record = entry(providerId);
  record.lastErrorAt = Date.now();
  record.lastError = message;
  record.consecutiveFailures += 1;
}

export function getHealth(providerId: string): ProviderHealth {
  return { ...entry(providerId) };
}

export function peekHealth(providerId: string): ProviderHealth | null {
  const record = registry.get(providerId);
  return record ? { ...record } : null;
}

/** Remaining cooldown in ms (0 when the provider is free to be called). */
export function cooldownRemaining(providerId: string): number {
  const record = registry.get(providerId);
  if (!record?.cooldownUntil) return 0;
  return Math.max(0, record.cooldownUntil - Date.now());
}

export function isRateLimited(providerId: string): boolean {
  return cooldownRemaining(providerId) > 0;
}

/** A 429 seen recently still colours the status even after the cooldown expires. */
export function recentlyRateLimited(providerId: string, windowMs = 120_000): boolean {
  const record = registry.get(providerId);
  if (!record?.lastRateLimitAt) return false;
  // A successful request after the 429 means we have recovered — stop colouring
  // the status as rate limited.
  if (record.lastSuccessAt && record.lastSuccessAt > record.lastRateLimitAt) return false;
  return Date.now() - record.lastRateLimitAt < windowMs;
}

export function allHealth(): ProviderHealth[] {
  return [...registry.values()].map((record) => ({ ...record }));
}

/** Test/maintenance helper. */
export function resetHealth(providerId?: string): void {
  if (providerId) registry.delete(providerId);
  else registry.clear();
}
