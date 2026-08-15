import type { DataQuality, ServiceId, ServiceState, ServiceStatus } from "@/types/market";
import {
  cryptoVendor,
  dexVendor,
  discoveryVendor,
  isMockMode,
  isMockModeConfigured,
  newsVendor,
  safeVendorView,
  tokenSecurityVendor,
  usVendor,
  type VendorConfig,
} from "@/server/env";
import { cooldownRemaining, peekHealth, recentlyRateLimited } from "@/server/provider-health";

/**
 * Provider dashboard projection.
 *
 * State is derived from OBSERVED REQUEST OUTCOMES recorded in the provider-health
 * registry — never from "an API key is set":
 *
 *   no credentials            -> NOT_CONFIGURED
 *   credentials, no traffic   -> CONFIGURED       (explicitly *not* LIVE)
 *   HTTP 429 / in cooldown    -> RATE_LIMITED
 *   success + fresh payload   -> LIVE
 *   success + latency         -> DELAYED
 *   success, freshness n/a    -> CONNECTED
 *   failures only             -> ERROR / UNAVAILABLE
 *
 * Secrets are never included: only `configured` / `hasKey` / `hasSecret` booleans
 * and the env var names the operator still needs to provide.
 */

const LABEL: Record<ServiceId, string> = {
  US_STOCKS: "US Stocks",
  CRYPTO: "Crypto",
  DEX: "DEX / Meme Coins",
  TOKEN_SECURITY: "Token Security",
  NEWS: "News",
};

/** Provider ids used by `providerFetch` for each dashboard service. */
const PROVIDER_IDS: Record<ServiceId, string[]> = {
  US_STOCKS: ["us-stocks"],
  CRYPTO: ["crypto"],
  DEX: ["meme", "meme-dex"],
  TOKEN_SECURITY: ["token-security"],
  NEWS: ["news"],
};

export interface RuntimeSignal {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  /** Observed freshness from the last successful call, when known. */
  quality?: DataQuality | null;
}

function iso(value: number | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** Merges the health records of every provider id backing one dashboard service. */
function mergedHealth(service: ServiceId) {
  const records = PROVIDER_IDS[service].map((id) => peekHealth(id)).filter((r) => r !== null);
  const cooldown = Math.max(0, ...PROVIDER_IDS[service].map((id) => cooldownRemaining(id)));
  const limitedRecently = PROVIDER_IDS[service].some((id) => recentlyRateLimited(id));

  if (!records.length) {
    return {
      observed: false,
      lastSuccessAt: null as number | null,
      lastErrorAt: null as number | null,
      lastRateLimitAt: null as number | null,
      lastError: null as string | null,
      lastLatencyMs: null as number | null,
      requests: 0,
      successes: 0,
      rateLimitHits: 0,
      cooldown,
      limitedRecently,
    };
  }

  const pick = (fn: (r: NonNullable<(typeof records)[number]>) => number | null) =>
    records.reduce<number | null>((acc, r) => {
      const value = fn(r!);
      return value === null ? acc : acc === null ? value : Math.max(acc, value);
    }, null);

  return {
    observed: true,
    lastSuccessAt: pick((r) => r.lastSuccessAt),
    lastErrorAt: pick((r) => r.lastErrorAt),
    lastRateLimitAt: pick((r) => r.lastRateLimitAt),
    lastError: records.find((r) => r!.lastError)?.lastError ?? null,
    lastLatencyMs: pick((r) => r.lastLatencyMs),
    requests: records.reduce((s, r) => s + r!.requests, 0),
    successes: records.reduce((s, r) => s + r!.successes, 0),
    rateLimitHits: records.reduce((s, r) => s + r!.rateLimitHits, 0),
    cooldown,
    limitedRecently,
  };
}

function build(
  service: ServiceId,
  config: VendorConfig,
  runtime: RuntimeSignal | undefined,
  notConfiguredHint: string,
): ServiceStatus {
  const view = safeVendorView(config);
  const demo = isMockMode();
  const health = mergedHealth(service);

  let state: ServiceState;
  let quality: DataQuality;
  let message: string;

  if (demo) {
    state = "DEMO";
    quality = "DEMO";
    message = isMockModeConfigured()
      ? "MOCK_MODE=true — demo dataset, labelled DEMO everywhere."
      : "MOCK_MODE not set; development defaults to DEMO — demo dataset, labelled DEMO everywhere.";
  } else if (!config.configured) {
    state = "NOT_CONFIGURED";
    quality = "UNAVAILABLE";
    message = notConfiguredHint;
  } else if (health.cooldown > 0 || health.limitedRecently) {
    // A 429 must never read as LIVE.
    state = "RATE_LIMITED";
    quality = "UNAVAILABLE";
    const seconds = Math.ceil(health.cooldown / 1000);
    message =
      health.cooldown > 0
        ? `${config.dataSource} rate limit reached. Retrying after cooldown (${seconds}s remaining).`
        : `${config.dataSource} recently rate limited (HTTP 429). Backing off.`;
  } else if (!health.observed || health.requests === 0) {
    // Credentials present but nothing has actually been fetched yet.
    state = "CONFIGURED";
    quality = "UNAVAILABLE";
    message = `Configured (${config.dataSource}) — awaiting first successful request.`;
  } else if (health.successes === 0) {
    state = health.lastError ? "ERROR" : "UNAVAILABLE";
    quality = "UNAVAILABLE";
    message = health.lastError ?? `${config.dataSource} did not return usable data.`;
  } else {
    // At least one real success. Freshness decides LIVE vs DELAYED.
    const observedQuality = runtime?.quality ?? null;
    quality = observedQuality && observedQuality !== "UNAVAILABLE" ? observedQuality : "LIVE";
    state = quality === "DELAYED" ? "DELAYED" : quality === "HISTORICAL" ? "CONNECTED" : "LIVE";
    const ageSeconds = health.lastSuccessAt ? Math.round((Date.now() - health.lastSuccessAt) / 1000) : null;
    message =
      `${config.dataSource}: ${health.successes}/${health.requests} successful` +
      (ageSeconds !== null ? `, last OK ${ageSeconds}s ago` : "") +
      (health.lastLatencyMs ? ` (${health.lastLatencyMs}ms)` : "") +
      ".";
  }

  return {
    service,
    label: LABEL[service],
    dataSource: config.dataSource,
    state,
    quality,
    message,
    configured: view.configured,
    hasKey: view.hasKey,
    hasSecret: view.hasSecret,
    requiredEnv: view.requiredEnv,
    lastSuccessAt: iso(health.lastSuccessAt) ?? runtime?.lastSuccessAt ?? null,
    lastErrorAt: iso(health.lastErrorAt) ?? runtime?.lastErrorAt ?? null,
    lastRateLimitAt: iso(health.lastRateLimitAt),
    cooldownSecondsRemaining: health.cooldown > 0 ? Math.ceil(health.cooldown / 1000) : null,
    lastLatencyMs: health.lastLatencyMs,
    requests: health.requests,
    successes: health.successes,
    rateLimitHits: health.rateLimitHits,
  };
}

export interface RuntimeSignals {
  us?: RuntimeSignal;
  crypto?: RuntimeSignal;
  dex?: RuntimeSignal;
}

/** The five services required by the provider dashboard. */
export function buildServiceStatuses(runtime: RuntimeSignals = {}): ServiceStatus[] {
  // The meme market reads pair data from the DEX vendor and pools from discovery.
  const dex = dexVendor();
  const discovery = discoveryVendor();
  const dexCombined: VendorConfig = {
    ...dex,
    configured: dex.configured && discovery.configured,
    dataSource: `${discovery.dataSource} + ${dex.dataSource}`,
  };

  return [
    build(
      "US_STOCKS",
      usVendor(),
      runtime.us,
      "Not configured — set US_API_BASE_URL and US_API_KEY to enable US stocks.",
    ),
    build(
      "CRYPTO",
      cryptoVendor(),
      runtime.crypto,
      "Not configured — set CRYPTO_MARKETCAP_BASE_URL for CoinGecko or CRYPTO_MARKETCAP_API_KEY.",
    ),
    build(
      "DEX",
      dexCombined,
      runtime.dex,
      "Not configured — set DEX_API_BASE_URL (and DEX_API_KEY if your vendor requires one).",
    ),
    build(
      "TOKEN_SECURITY",
      tokenSecurityVendor(),
      undefined,
      "Not configured — set TOKEN_SECURITY_API_BASE_URL, TOKEN_SECURITY_API_KEY and TOKEN_SECURITY_API_SECRET. Without it meme tokens stay UNVERIFIED and are not buyable.",
    ),
    build(
      "NEWS",
      newsVendor(),
      undefined,
      "Not configured — set NEWS_API_BASE_URL and NEWS_API_KEY. Without it news sentiment reports UNAVAILABLE.",
    ),
  ];
}
