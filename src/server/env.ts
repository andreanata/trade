/**
 * MARKETAI — server-only environment access.
 *
 * This is the ONLY place in the codebase that reads vendor credentials.
 *
 * HARD RULES
 *  - Every value here is read from `process.env` on the server. Nothing is bundled
 *    into the browser: this module must never be imported from a "use client" file.
 *  - No key is ever hardcoded, defaulted to a placeholder, or echoed in an API
 *    response. Route handlers only return the sanitised shapes in `serviceStatus()`.
 *  - `NEXT_PUBLIC_*` is never used for a secret. The only public flag is the
 *    non-sensitive MOCK_MODE mirror.
 */

if (typeof window !== "undefined") {
  throw new Error("src/server/env.ts is server-only and must not be imported by client code.");
}

function str(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function firstDefined(...names: string[]): string | undefined {
  for (const name of names) {
    const value = str(name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function url(value: string | undefined, fallback?: string): string | undefined {
  const raw = value ?? fallback;
  return raw ? raw.replace(/\/+$/, "") : undefined;
}

function num(name: string, fallback: number): number {
  const parsed = Number(str(name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = str(name);
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

/** Credentials for a single vendor. `apiKey`/`apiSecret` never leave the server. */
export interface VendorConfig {
  readonly baseUrl: string | undefined;
  readonly apiKey: string | undefined;
  readonly apiSecret: string | undefined;
  /** True when everything this vendor needs to answer a request is present. */
  readonly configured: boolean;
  /** Env var names shown to the operator when the vendor is not configured. */
  readonly requiredEnv: string[];
  /** Human readable vendor name that IS safe to expose. */
  readonly dataSource: string;
}

function vendor(input: {
  baseUrl: string | undefined;
  apiKey?: string | undefined;
  apiSecret?: string | undefined;
  requiredEnv: string[];
  dataSource: string;
  /** Some public market endpoints need no key — only a base URL. */
  keyRequired?: boolean;
}): VendorConfig {
  const keyRequired = input.keyRequired ?? true;
  return {
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    apiSecret: input.apiSecret,
    configured: Boolean(input.baseUrl) && (!keyRequired || Boolean(input.apiKey)),
    requiredEnv: input.requiredEnv,
    dataSource: input.dataSource,
  };
}

/* -------------------------------------------------------------------------- */
/* Data mode                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * MOCK_MODE=false → real vendors only, no demo fallback anywhere.
 * MOCK_MODE=true  → deterministic demo dataset, labelled DEMO in every payload.
 */
/** True when MOCK_MODE was explicitly provided by the operator. */
export function isMockModeConfigured(): boolean {
  return (str("MOCK_MODE") ?? str("NEXT_PUBLIC_MOCK_MODE")) !== undefined;
}

/**
 * Resolves the data mode.
 *
 *   MOCK_MODE="true"   -> DEMO
 *   MOCK_MODE="false"  -> REAL
 *   MOCK_MODE missing  -> REAL in production, DEMO in development
 *
 * Production must never silently fall back to DEMO: shipping synthetic prices
 * because an env var was forgotten would be far more dangerous than surfacing
 * DATA_UNAVAILABLE. Locally, an unset flag still defaults to DEMO so the terminal
 * runs without vendor credentials.
 */
export function isMockMode(): boolean {
  const flag = str("MOCK_MODE") ?? str("NEXT_PUBLIC_MOCK_MODE");
  if (flag !== undefined) return flag.toLowerCase() !== "false";
  const isProduction = process.env.NODE_ENV === "production";
  return !isProduction;
}

/**
 * Operator warning shown on the provider dashboard when the mode was inferred
 * rather than declared. Null when MOCK_MODE was set explicitly.
 */
export function mockModeWarning(): string | null {
  if (isMockModeConfigured()) return null;
  return process.env.NODE_ENV === "production"
    ? "MOCK_MODE not explicitly configured; production defaults to REAL."
    : "MOCK_MODE not explicitly configured; development defaults to DEMO. Set MOCK_MODE=false to use real vendors.";
}

/* -------------------------------------------------------------------------- */
/* Vendors                                                                     */
/* -------------------------------------------------------------------------- */

const TWELVE_DATA_DEFAULT = "https://api.twelvedata.com";
const COINGECKO_DEFAULT = "https://api.coingecko.com/api/v3";

/** US equities — AAPL, NVDA, TSLA, AMD, MSFT, … */
export function usVendor(): VendorConfig {
  return vendor({
    baseUrl: url(firstDefined("US_API_BASE_URL", "MARKET_DATA_BASE_URL"), TWELVE_DATA_DEFAULT),
    apiKey: firstDefined("US_API_KEY", "MARKET_DATA_API_KEY"),
    requiredEnv: ["US_API_BASE_URL", "US_API_KEY"],
    dataSource: str("US_DATA_SOURCE") ?? "Twelve Data",
  });
}

/**
 * Crypto — CoinGecko is the primary and only crypto market-data source.
 *
 * The public tier works without a key, so a base URL alone is sufficient; a demo
 * or pro key is used when supplied. There is deliberately no exchange-REST or
 * Binance-compatible fallback: if CoinGecko fails in REAL mode the caller reports
 * DATA_UNAVAILABLE rather than silently switching vendors.
 */
export function cryptoVendor(): VendorConfig {
  return vendor({
    // Accepts either naming: CRYPTO_MARKETCAP_* (documented for CoinGecko) or the
    // shorter CRYPTO_API_* pair. Both point at the same CoinGecko deployment.
    baseUrl: url(firstDefined("CRYPTO_MARKETCAP_BASE_URL", "CRYPTO_API_BASE_URL"), COINGECKO_DEFAULT),
    apiKey: firstDefined("CRYPTO_MARKETCAP_API_KEY", "CRYPTO_API_KEY"),
    keyRequired: false,
    requiredEnv: ["CRYPTO_MARKETCAP_BASE_URL", "CRYPTO_MARKETCAP_API_KEY"],
    dataSource: str("CRYPTO_DATA_SOURCE") ?? "CoinGecko",
  });
}

/** DEX pair data for meme coins — price, liquidity, volume, txns, market cap. */
export function dexVendor(): VendorConfig {
  return vendor({
    baseUrl: url(firstDefined("DEX_API_BASE_URL", "MEME_DEX_API_BASE_URL"), "https://api.dexscreener.com"),
    apiKey: firstDefined("DEX_API_KEY", "MEME_DEX_API_KEY"),
    keyRequired: false,
    requiredEnv: ["DEX_API_BASE_URL", "DEX_API_KEY"],
    dataSource: str("DEX_DATA_SOURCE") ?? "DexScreener",
  });
}

/** On-chain token discovery + OHLCV pools (GeckoTerminal compatible). */
export function discoveryVendor(): VendorConfig {
  return vendor({
    baseUrl: url(str("MEME_DISCOVERY_API_BASE_URL"), "https://api.geckoterminal.com/api/v2"),
    apiKey: str("MEME_DISCOVERY_API_KEY"),
    keyRequired: false,
    requiredEnv: ["MEME_DISCOVERY_API_BASE_URL"],
    dataSource: str("MEME_DATA_SOURCE") ?? "GeckoTerminal",
  });
}

/**
 * Normalises the GoPlus base URL. The scanner appends `/token_security/...`, which
 * lives under `/api/v1`, so a host-only value is completed rather than silently
 * producing 404s.
 */
function goPlusBase(value: string | undefined): string | undefined {
  if (!value) return value;
  if (/\/api\/v\d+$/.test(value)) return value;
  if (/gopluslabs\.io$/i.test(value)) return `${value}/api/v1`;
  return value;
}

/** Honeypot / contract / holder security scanner. Supports key + secret auth. */
export function tokenSecurityVendor(): VendorConfig {
  return vendor({
    // Accepts "https://api.gopluslabs.io" or ".../api/v1"; the version segment is
    // appended when missing so either documented form works.
    baseUrl: goPlusBase(url(str("TOKEN_SECURITY_API_BASE_URL"), "https://api.gopluslabs.io/api/v1")),
    apiKey: str("TOKEN_SECURITY_API_KEY"),
    apiSecret: str("TOKEN_SECURITY_API_SECRET"),
    keyRequired: false,
    requiredEnv: ["TOKEN_SECURITY_API_BASE_URL", "TOKEN_SECURITY_API_KEY", "TOKEN_SECURITY_API_SECRET"],
    dataSource: str("TOKEN_SECURITY_SOURCE") ?? "GoPlus Security",
  });
}

/**
 * Market cap / circulating supply no longer needs a separate vendor: the primary
 * CoinGecko `/coins/markets` response already carries market_cap,
 * circulating_supply and total_supply, so a second request would be duplicate work.
 * Meme tokens take their market cap from the DEX pair data instead.
 */

/** News vendor. Required in REAL mode, otherwise news reports UNAVAILABLE. */
export function newsVendor(): VendorConfig {
  return vendor({
    baseUrl: url(str("NEWS_API_BASE_URL"), "https://newsapi.org/v2"),
    apiKey: str("NEWS_API_KEY"),
    requiredEnv: ["NEWS_API_BASE_URL", "NEWS_API_KEY"],
    dataSource: str("NEWS_API_SOURCE") ?? "News vendor",
  });
}

/** Optional LLM narrative layer. Numbers always come from the local engine. */
export function aiVendor(): VendorConfig & { model: string } {
  return {
    ...vendor({
      baseUrl: url(str("AI_API_BASE_URL")),
      apiKey: str("AI_API_KEY"),
      requiredEnv: ["AI_API_BASE_URL", "AI_API_KEY"],
      dataSource: "LLM narrative",
    }),
    model: str("AI_MODEL") ?? "gpt-4o-mini",
  };
}

/* -------------------------------------------------------------------------- */
/* Non-secret tuning                                                           */
/* -------------------------------------------------------------------------- */

export const tuning = {
  get realScanLimit() {
    return num("REAL_SCAN_LIMIT", 5);
  },
  get memeScanLimit() {
    return num("MEME_SCAN_LIMIT", 10);
  },
  get realBatchSize() {
    return num("REAL_BATCH_SIZE", 8);
  },
  get discoveryRpm() {
    return num("MEME_DISCOVERY_RPM", 12);
  },
  get dexRpm() {
    return num("DEX_RPM", num("MEME_DEX_RPM", 60));
  },
  get cryptoQuoteAsset() {
    return str("CRYPTO_QUOTE_ASSET") ?? "USDT";
  },
  get usExchange() {
    return str("US_API_EXCHANGE");
  },
  get usCountry() {
    return str("US_API_COUNTRY") ?? "United States";
  },
  get usIndexSymbol() {
    return str("US_INDEX_SYMBOL");
  },
  get cryptoIndexSymbol() {
    return str("CRYPTO_INDEX_SYMBOL");
  },
  get memeIndexSymbol() {
    return str("MEME_INDEX_SYMBOL");
  },
  get usQuality() {
    return str("US_DATA_QUALITY") ?? null;
  },
  get cryptoQuality() {
    return str("CRYPTO_DATA_QUALITY") ?? null;
  },
  get memeQuality() {
    return str("MEME_DATA_QUALITY") ?? null;
  },
  get memeAllowUnverified() {
    return bool("MEME_ALLOW_UNVERIFIED", false);
  },
  get memeRequireSecurity() {
    return bool("MEME_REQUIRE_SECURITY", true);
  },
};

/* -------------------------------------------------------------------------- */
/* Safe status projection                                                      */
/* -------------------------------------------------------------------------- */

export type VendorState = "CONNECTED" | "NOT_CONFIGURED" | "FAILED" | "UNAVAILABLE" | "DEMO";

/**
 * Projects a vendor config into a shape that is SAFE to send to the browser.
 * Only booleans, env var names and the public vendor label are exposed —
 * never the key, the secret, or any authorization header.
 */
export function safeVendorView(config: VendorConfig) {
  return {
    dataSource: config.dataSource,
    configured: config.configured,
    hasKey: Boolean(config.apiKey),
    hasSecret: Boolean(config.apiSecret),
    requiredEnv: config.requiredEnv,
  };
}
