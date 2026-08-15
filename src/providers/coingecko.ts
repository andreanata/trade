import type { Candle, Timeframe } from "@/types/market";
import { TTL, cached, chunk, configureRateLimit, providerFetch, rateLimit, ttlForTimeframe } from "./http";
import { cryptoVendor } from "@/server/env";
import { TIMEFRAME_MS } from "@/lib/utils";

/**
 * CoinGecko REST client — the primary crypto market-data source.
 *
 * SERVER-ONLY. `CRYPTO_API_KEY` is read through src/server/env.ts and attached as a
 * request header here; it is never returned to the browser.
 *
 * Endpoints used (all public/documented):
 *   /coins/markets            price, 24h change/high/low, volume, market cap, supply
 *   /coins/{id}/ohlc          true OHLC candles (native 30m and 4h granularity)
 *   /coins/{id}/market_chart  timestamped price samples + rolling 24h volume series
 *   /coins/list               dynamic symbol -> id resolution
 *   /ping                     connectivity probe
 *
 * No Binance endpoint (/klines, /ticker/24hr) and no Binance symbol formatting is
 * used anywhere in this file.
 */

/**
 * Free-tier CoinGecko rejects bursts, so requests are strictly spaced (burst = 1)
 * rather than fired in parallel. Raise CRYPTO_RPM on a paid plan.
 */
configureRateLimit("coingecko", Number(process.env.CRYPTO_RPM ?? 12), 1);

const VS = (process.env.CRYPTO_VS_CURRENCY ?? "usd").toLowerCase();

/**
 * Curated symbol -> CoinGecko asset id map for the supported universe.
 * A ticker alone is ambiguous across the whole of CoinGecko, so an explicit id is
 * used for every known asset; anything else is resolved dynamically below.
 */
export const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOT: "polkadot",
  SUI: "sui",
  PEPE: "pepe",
  WIF: "dogwifcoin",
  TON: "the-open-network",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  INJ: "injective-protocol",
  SEI: "sei-network",
  TIA: "celestia",
  FET: "fetch-ai",
  LTC: "litecoin",
  ATOM: "cosmos",
  FIL: "filecoin",
  AAVE: "aave",
  MATIC: "matic-network",
  BONK: "bonk",
  FLOKI: "floki",
  BRETT: "based-brett",
  POPCAT: "popcat",
  RNDR: "render-token",
};

export class CoinGeckoUnsupportedTimeframe extends Error {
  readonly timeframe: Timeframe;
  constructor(timeframe: Timeframe, detail: string) {
    super(detail);
    this.name = "CoinGeckoUnsupportedTimeframe";
    this.timeframe = timeframe;
  }
}

export interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  fully_diluted_valuation: number | null;
  total_volume: number | null;
  high_24h: number | null;
  low_24h: number | null;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  atl: number | null;
  last_updated: string | null;
}

interface MarketChart {
  prices?: [number, number][];
  total_volumes?: [number, number][];
}

/**
 * How each MarketAI timeframe is served.
 *  - `ohlc`         : provider's native OHLC endpoint at exactly this granularity.
 *  - `chart`        : timestamped price samples bucketed into candles.
 *  - `aggregate`    : coarser candles built by combining finer real observations.
 *  - `unsupported`  : finer than anything CoinGecko publishes -> DATA_UNAVAILABLE.
 */
type Plan =
  | { kind: "ohlc"; days: number; note: string }
  | { kind: "chart"; days: number; bucketMs: number; note: string }
  | { kind: "unsupported"; reason: string };

const PLANS: Record<Timeframe, Plan> = {
  // CoinGecko's finest published series is 5-minutely (market_chart, days=1).
  "1m": {
    kind: "unsupported",
    reason: "CoinGecko does not publish 1-minute data; its finest series is 5-minutely.",
  },
  "5m": {
    kind: "chart",
    days: 1,
    bucketMs: TIMEFRAME_MS["5m"],
    note: "Built from CoinGecko 5-minutely price samples (market_chart, 1 day).",
  },
  "15m": {
    kind: "chart",
    days: 1,
    bucketMs: TIMEFRAME_MS["15m"],
    note: "Aggregated from CoinGecko 5-minutely price samples (market_chart, 1 day).",
  },
  // Native 30-minute OHLC.
  "30m": { kind: "ohlc", days: 1, note: "CoinGecko native 30-minute OHLC (1 day)." },
  "1H": {
    kind: "chart",
    days: 30,
    bucketMs: TIMEFRAME_MS["1H"],
    note: "Built from CoinGecko hourly price samples (market_chart, 30 days).",
  },
  // Native 4-hour OHLC.
  "4H": { kind: "ohlc", days: 30, note: "CoinGecko native 4-hour OHLC (30 days)." },
  "1D": {
    kind: "chart",
    days: 90,
    bucketMs: TIMEFRAME_MS["1D"],
    note: "Aggregated from CoinGecko hourly price samples (market_chart, 90 days).",
  },
  "1W": {
    kind: "chart",
    days: 365,
    bucketMs: TIMEFRAME_MS["1W"],
    note: "Aggregated from CoinGecko daily price samples (market_chart, 365 days).",
  },
};

export function timeframePlanNote(timeframe: Timeframe): string {
  const plan = PLANS[timeframe];
  return plan.kind === "unsupported" ? plan.reason : plan.note;
}

export function isTimeframeSupported(timeframe: Timeframe): boolean {
  return PLANS[timeframe].kind !== "unsupported";
}

export class CoinGeckoClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  readonly dataSource: string;

  constructor() {
    const config = cryptoVendor();
    this.baseUrl = config.baseUrl ?? "";
    this.apiKey = config.apiKey;
    this.dataSource = config.dataSource;
  }

  get configured(): boolean {
    return Boolean(this.baseUrl);
  }

  /**
   * CoinGecko demo keys authenticate with `x-cg-demo-api-key`, paid keys on
   * pro-api.coingecko.com with `x-cg-pro-api-key`. The header name can be
   * overridden for compatible gateways.
   */
  private headers(): Record<string, string> | undefined {
    if (!this.apiKey) return undefined;
    const override = process.env.CRYPTO_API_KEY_HEADER;
    if (override) return { [override]: this.apiKey };
    return this.baseUrl.includes("pro-api")
      ? { "x-cg-pro-api-key": this.apiKey }
      : { "x-cg-demo-api-key": this.apiKey };
  }

  private async request<T>(path: string, params: Record<string, string | number>): Promise<T> {
    await rateLimit("coingecko");
    const url = new URL(`${this.baseUrl}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    return providerFetch<T>(url.toString(), {
      providerId: "crypto",
      headers: this.headers(),
      timeoutMs: 15_000,
    });
  }

  /** Connectivity probe used by the provider status dashboard. */
  async ping(): Promise<boolean> {
    try {
      await this.request<{ gecko_says?: string }>("ping", {});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves a ticker to a CoinGecko asset id.
   * Curated map first; otherwise the provider's own coin list is searched so new
   * assets work without a code change. Ambiguous tickers prefer an exact id match.
   */
  async resolveId(symbol: string): Promise<string | null> {
    const upper = symbol.toUpperCase();
    if (COINGECKO_IDS[upper]) return COINGECKO_IDS[upper];
    if (symbol.includes("-") || symbol === symbol.toLowerCase()) {
      // Looks like a CoinGecko id already (e.g. "avalanche-2").
      return symbol.toLowerCase();
    }
    try {
      const list = await cached("coingecko:list", TTL.SEARCH * 6, () =>
        this.request<{ id: string; symbol: string; name: string }[]>("coins/list", {}),
      );
      const lower = upper.toLowerCase();
      const matches = list.filter((c) => c.symbol.toLowerCase() === lower);
      if (!matches.length) return null;
      const exact = matches.find((c) => c.id.toLowerCase() === lower);
      return (exact ?? matches[0]).id;
    } catch {
      return null;
    }
  }

  /** Batch market snapshot — one request serves the whole scanner page. */
  async markets(ids: string[]): Promise<Map<string, CoinGeckoMarket>> {
    const out = new Map<string, CoinGeckoMarket>();
    if (!ids.length) return out;

    for (const group of chunk([...new Set(ids)], 100)) {
      const key = `coingecko:markets:${group.join(",")}`;
      const rows = await cached(key, TTL.QUOTE, () =>
        this.request<CoinGeckoMarket[]>("coins/markets", {
          vs_currency: VS,
          ids: group.join(","),
          order: "market_cap_desc",
          per_page: group.length,
          page: 1,
          sparkline: "false",
          price_change_percentage: "24h",
        }),
      );
      if (!Array.isArray(rows)) continue;
      for (const row of rows) if (row?.id) out.set(row.id, row);
    }
    return out;
  }

  async market(id: string): Promise<CoinGeckoMarket | null> {
    const map = await this.markets([id]);
    return map.get(id) ?? null;
  }

  /** True OHLC candles from the provider's native endpoint. */
  private async ohlc(id: string, days: number): Promise<Candle[]> {
    const rows = await this.request<[number, number, number, number, number][]>(`coins/${id}/ohlc`, {
      vs_currency: VS,
      days,
    });
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => Array.isArray(r) && r.length >= 5)
      .map(([time, open, high, low, close]) => ({
        time: Number(time),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: 0,
      }))
      .filter((c) => Number.isFinite(c.close) && Number.isFinite(c.time));
  }

  private async marketChart(id: string, days: number): Promise<MarketChart> {
    return this.request<MarketChart>(`coins/${id}/market_chart`, { vs_currency: VS, days });
  }

  /**
   * Builds candles for a MarketAI timeframe.
   *
   * IMPORTANT — volume semantics: CoinGecko does not publish per-candle traded
   * volume. `total_volumes` is the asset's *rolling 24h* volume sampled at each
   * timestamp. That real, provider-reported figure is carried on each bar so
   * relative activity analytics (ratio vs its own average, acceleration) remain
   * meaningful. It is never presented as per-bar traded volume — see the note on
   * the returned series meta.
   */
  async candles(id: string, timeframe: Timeframe, bars: number): Promise<{ candles: Candle[]; note: string }> {
    const plan = PLANS[timeframe];
    if (plan.kind === "unsupported") {
      throw new CoinGeckoUnsupportedTimeframe(timeframe, plan.reason);
    }

    const key = `coingecko:candles:${id}:${timeframe}:${bars}`;
    const candles = await cached(key, ttlForTimeframe(TIMEFRAME_MS[timeframe]), async () => {
      if (plan.kind === "ohlc") {
        // Native OHLC is the source of truth; market_chart is optional volume
        // enrichment, so a failure there must not fail the whole series.
        const raw = await this.ohlc(id, plan.days);
        const chart = await this.marketChart(id, plan.days).catch(() => ({}) as MarketChart);
        const volumes = Array.isArray(chart.total_volumes) ? chart.total_volumes : [];
        return attachVolume(raw, volumes, TIMEFRAME_MS[timeframe]);
      }

      // market_chart IS the data source here — never swallow its errors, or a
      // rate limit would masquerade as "no history available".
      const chart = await this.marketChart(id, plan.days);
      const prices = Array.isArray(chart.prices) ? chart.prices : [];
      const volumes = Array.isArray(chart.total_volumes) ? chart.total_volumes : [];
      return bucketPrices(prices, volumes, plan.bucketMs);
    });

    return { candles: candles.slice(-Math.max(1, bars)), note: plan.note };
  }
}

/** Attaches the nearest rolling-24h volume sample to each native OHLC bar. */
function attachVolume(candles: Candle[], volumes: [number, number][], bucketMs: number): Candle[] {
  if (!volumes.length) return candles.sort((a, b) => a.time - b.time);
  return candles
    .map((candle) => {
      let best: number | null = null;
      let bestDelta = Number.POSITIVE_INFINITY;
      for (const [time, value] of volumes) {
        const delta = Math.abs(time - candle.time);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = value;
        }
        if (delta > bucketMs * 4 && best !== null) break;
      }
      return { ...candle, volume: best !== null && Number.isFinite(best) ? best : 0 };
    })
    .sort((a, b) => a.time - b.time);
}

/**
 * Buckets real, timestamped price observations into OHLC candles.
 * open = first observation in the bucket, high/low = observed extremes,
 * close = last observation. No value is invented; a bucket with no observation is
 * simply omitted rather than filled in.
 */
function bucketPrices(
  prices: [number, number][],
  volumes: [number, number][],
  bucketMs: number,
): Candle[] {
  if (!prices.length) return [];
  const volumeAt = new Map<number, number>();
  for (const [time, value] of volumes) volumeAt.set(Math.floor(time / bucketMs) * bucketMs, value);

  const buckets = new Map<number, Candle>();
  for (const [time, price] of prices) {
    if (!Number.isFinite(price) || !Number.isFinite(time)) continue;
    const start = Math.floor(time / bucketMs) * bucketMs;
    const existing = buckets.get(start);
    if (!existing) {
      buckets.set(start, {
        time: start,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volumeAt.get(start) ?? 0,
      });
    } else {
      existing.high = Math.max(existing.high, price);
      existing.low = Math.min(existing.low, price);
      existing.close = price;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}
