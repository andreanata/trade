import type { Candle, Timeframe } from "@/types/market";
import { TIMEFRAME_MS } from "@/lib/utils";
import { ProviderHttpError, ProviderRateLimitError, TTL, cached, chunk, providerFetch, ttlForTimeframe } from "./http";

/**
 * Twelve Data REST adapter (https://twelvedata.com/docs).
 * Covers US equities and crypto pairs with one licensed vendor.
 * Only server-side env vars are read — no key ever reaches the client.
 */

export const TD_INTERVAL: Record<Timeframe, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1H": "1h",
  "4H": "4h",
  "1D": "1day",
  "1W": "1week",
};

export interface TdQuote {
  symbol: string;
  name?: string;
  exchange?: string;
  currency?: string;
  datetime?: string;
  timestamp?: number;
  last_quote_at?: number;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  average_volume?: string;
  is_market_open?: boolean;
  fifty_two_week?: { low?: string; high?: string };
}

export interface TdTimeSeries {
  meta?: { symbol?: string; interval?: string; currency?: string; exchange?: string };
  values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[];
  status?: string;
}

export interface TdSymbolSearchItem {
  symbol: string;
  instrument_name?: string;
  exchange?: string;
  mic_code?: string;
  country?: string;
  currency?: string;
  instrument_type?: string;
}

export interface TdMarketState {
  name?: string;
  code?: string;
  country?: string;
  is_market_open?: boolean;
  time_to_open?: string;
  time_to_close?: string;
  time_after_open?: string;
}

interface TdErrorEnvelope {
  code?: number;
  status?: string;
  message?: string;
}

function assertNoVendorError(providerId: string, body: unknown) {
  if (!body || typeof body !== "object") return;
  const envelope = body as TdErrorEnvelope;
  if (envelope.status === "error") {
    const code = envelope.code ?? 400;
    const message = envelope.message ?? "Vendor returned an error";
    if (code === 429) throw new ProviderRateLimitError(providerId, message);
    throw new ProviderHttpError(providerId, code, message, code >= 500);
  }
}

export function tdNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Twelve Data returns exchange-local datetimes; parse to epoch ms. */
export function tdTime(datetime: string): number {
  const iso = datetime.includes(" ") ? datetime.replace(" ", "T") : datetime;
  const withZone = iso.length <= 10 ? `${iso}T00:00:00Z` : `${iso}Z`;
  const parsed = Date.parse(withZone);
  return Number.isFinite(parsed) ? parsed : Date.parse(datetime);
}

export interface TwelveDataConfig {
  baseUrl: string;
  apiKey: string;
  /** Exchange filter, e.g. "NASDAQ" for US. */
  exchange?: string;
  /** Optional symbol suffix for vendors that require one. */
  symbolSuffix?: string;
  country?: string;
  providerId: string;
  /** Optional hard override of the reported freshness (LIVE / DELAYED / HISTORICAL). */
  qualityOverride?: string | null;
}

export class TwelveDataClient {
  readonly config: TwelveDataConfig;

  constructor(config: TwelveDataConfig) {
    this.config = config;
  }

  get providerId(): string {
    return this.config.providerId;
  }

  vendorSymbol(symbol: string): string {
    const suffix = this.config.symbolSuffix ?? "";
    return `${symbol.toUpperCase()}${suffix}`;
  }

  private url(path: string, params: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.config.baseUrl.replace(/\/$/, "")}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    url.searchParams.set("apikey", this.config.apiKey);
    return url.toString();
  }

  private request<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    return providerFetch<T>(this.url(path, params), {
      providerId: this.providerId,
      validate: (body) => assertNoVendorError(this.providerId, body),
    });
  }

  async quote(symbol: string): Promise<TdQuote> {
    const key = `${this.providerId}:quote:${symbol}`;
    return cached(key, TTL.QUOTE, async () => {
      const body = await this.request<TdQuote>("quote", {
        symbol: this.vendorSymbol(symbol),
        exchange: this.config.exchange,
        country: this.config.country,
      });
      if (!body || tdNumber(body.close) === null) {
        throw new ProviderHttpError(this.providerId, 404, `Vendor returned no quote for ${symbol}`);
      }
      return body;
    });
  }

  /** Batch quote: Twelve Data accepts comma separated symbols and keys the response. */
  async quotes(symbols: string[], batchSize = 8): Promise<Map<string, TdQuote>> {
    const out = new Map<string, TdQuote>();
    for (const group of chunk(symbols, batchSize)) {
      if (group.length === 1) {
        try {
          out.set(group[0].toUpperCase(), await this.quote(group[0]));
        } catch {
          /* individual symbol unavailable — omitted, never faked */
        }
        continue;
      }
      const key = `${this.providerId}:quotes:${group.join(",")}`;
      try {
        const body = await cached(key, TTL.QUOTE, () =>
          this.request<Record<string, TdQuote>>("quote", {
            symbol: group.map((s) => this.vendorSymbol(s)).join(","),
            exchange: this.config.exchange,
            country: this.config.country,
          }),
        );
        for (const symbol of group) {
          const vendorKey = this.vendorSymbol(symbol);
          const entry = (body as Record<string, TdQuote>)[vendorKey] ?? (body as Record<string, TdQuote>)[symbol.toUpperCase()];
          if (entry && tdNumber(entry.close) !== null) out.set(symbol.toUpperCase(), entry);
        }
      } catch {
        /* whole batch unavailable — callers surface UNAVAILABLE for these symbols */
      }
    }
    return out;
  }

  async timeSeries(symbol: string, timeframe: Timeframe, bars: number): Promise<Candle[]> {
    const key = `${this.providerId}:ts:${symbol}:${timeframe}:${bars}`;
    return cached(key, ttlForTimeframe(TIMEFRAME_MS[timeframe]), async () => {
      const body = await this.request<TdTimeSeries>("time_series", {
        symbol: this.vendorSymbol(symbol),
        interval: TD_INTERVAL[timeframe],
        outputsize: Math.min(Math.max(bars, 30), 5000),
        exchange: this.config.exchange,
        country: this.config.country,
        order: "ASC",
      });
      const candles = normalizeTimeSeries(body);
      if (!candles.length) {
        throw new ProviderHttpError(
          this.providerId,
          404,
          `Vendor returned no ${timeframe} history for ${symbol}`,
        );
      }
      return candles;
    });
  }

  /** Batch time series keyed by symbol; failures are omitted, never substituted. */
  async timeSeriesBatch(
    symbols: string[],
    timeframe: Timeframe,
    bars: number,
    batchSize = 8,
  ): Promise<Map<string, Candle[]>> {
    const out = new Map<string, Candle[]>();
    for (const group of chunk(symbols, batchSize)) {
      if (group.length === 1) {
        try {
          out.set(group[0].toUpperCase(), await this.timeSeries(group[0], timeframe, bars));
        } catch {
          /* omitted */
        }
        continue;
      }
      const key = `${this.providerId}:tsb:${group.join(",")}:${timeframe}:${bars}`;
      try {
        const body = await cached(key, ttlForTimeframe(TIMEFRAME_MS[timeframe]), () =>
          this.request<Record<string, TdTimeSeries>>("time_series", {
            symbol: group.map((s) => this.vendorSymbol(s)).join(","),
            interval: TD_INTERVAL[timeframe],
            outputsize: Math.min(Math.max(bars, 30), 5000),
            exchange: this.config.exchange,
            country: this.config.country,
            order: "ASC",
          }),
        );
        for (const symbol of group) {
          const vendorKey = this.vendorSymbol(symbol);
          const entry = body[vendorKey] ?? body[symbol.toUpperCase()];
          const candles = entry ? normalizeTimeSeries(entry) : [];
          if (candles.length) out.set(symbol.toUpperCase(), candles);
        }
      } catch {
        /* omitted */
      }
    }
    return out;
  }

  async symbolSearch(query: string): Promise<TdSymbolSearchItem[]> {
    const key = `${this.providerId}:search:${query.toLowerCase()}`;
    return cached(key, TTL.SEARCH, async () => {
      const body = await this.request<{ data?: TdSymbolSearchItem[] }>("symbol_search", {
        symbol: query,
        outputsize: 20,
      });
      return Array.isArray(body?.data) ? body.data : [];
    });
  }

  async marketState(exchange: string): Promise<TdMarketState | null> {
    const key = `${this.providerId}:state:${exchange}`;
    return cached(key, TTL.STATUS, async () => {
      const body = await this.request<TdMarketState[] | TdMarketState>("market_state", { exchange });
      if (Array.isArray(body)) return body[0] ?? null;
      return body ?? null;
    });
  }

  /** Market cap etc. Returns null when the plan/vendor does not expose it. */
  async statistics(symbol: string): Promise<{ marketCap: number | null; peRatio: number | null; eps: number | null; dividendYield: number | null }> {
    const key = `${this.providerId}:stats:${symbol}`;
    try {
      return await cached(key, TTL.FUNDAMENTALS, async () => {
        const body = await this.request<{
          statistics?: {
            valuations_metrics?: { market_capitalization?: number; trailing_pe?: number };
            financials?: { income_statement?: { diluted_eps_ttm?: number } };
            dividends_and_splits?: { forward_annual_dividend_yield?: number };
          };
        }>("statistics", { symbol: this.vendorSymbol(symbol), exchange: this.config.exchange });
        const stats = body?.statistics;
        return {
          marketCap: tdNumber(stats?.valuations_metrics?.market_capitalization),
          peRatio: tdNumber(stats?.valuations_metrics?.trailing_pe),
          eps: tdNumber(stats?.financials?.income_statement?.diluted_eps_ttm),
          dividendYield: tdNumber(stats?.dividends_and_splits?.forward_annual_dividend_yield),
        };
      });
    } catch {
      // Fundamentals are optional; absence must render as N/A, never as a guess.
      return { marketCap: null, peRatio: null, eps: null, dividendYield: null };
    }
  }
}

export function normalizeTimeSeries(body: TdTimeSeries): Candle[] {
  const values = Array.isArray(body?.values) ? body.values : [];
  const candles = values
    .map((v) => {
      const open = tdNumber(v.open);
      const high = tdNumber(v.high);
      const low = tdNumber(v.low);
      const close = tdNumber(v.close);
      const volume = tdNumber(v.volume ?? null);
      if (open === null || high === null || low === null || close === null) return null;
      return { time: tdTime(v.datetime), open, high, low, close, volume: volume ?? 0 } satisfies Candle;
    })
    .filter((c): c is Candle => c !== null && Number.isFinite(c.time));
  return candles.sort((a, b) => a.time - b.time);
}
