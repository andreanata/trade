import type { Asset, Candle, MarketId, MarketStatus, Quote, Timeframe } from "@/types/market";
import { findAsset } from "@/data/universe";
import { TIMEFRAME_MS, round } from "@/lib/utils";
import { RealMarketDataProvider, type LiveProviderConfig } from "./live-base";
import { TwelveDataClient, tdNumber, type TdQuote } from "./twelvedata";
import { ProviderUnavailableError } from "./types";
import { getMarketStatus as staticMarketStatus } from "./market-status";
import { chunk } from "./http";

export interface EquityProviderOptions extends LiveProviderConfig {
  market: MarketId;
  id: string;
  label: string;
  exchange?: string;
  country?: string;
  symbolSuffix?: string;
  currency: string;
  batchSize: number;
}

/**
 * Vendor-backed equity provider (Twelve Data compatible REST shape).
 * Used for US equities.
 *
 * Everything returned here originates from the vendor payload. Fields the vendor
 * does not supply are emitted as `null` so the UI renders N/A instead of a guess.
 */
export class TwelveDataEquityProvider extends RealMarketDataProvider {
  protected readonly client: TwelveDataClient;
  protected readonly options: EquityProviderOptions;

  constructor(options: EquityProviderOptions) {
    super(options.market, options.id, options.label, options);
    this.options = options;
    this.client = new TwelveDataClient({
      baseUrl: options.baseUrl ?? "",
      apiKey: options.apiKey ?? "",
      exchange: options.exchange,
      country: options.country,
      symbolSuffix: options.symbolSuffix,
      providerId: options.id,
      qualityOverride: options.qualityOverride,
    });
  }

  private asOfFromQuote(raw: TdQuote): number | null {
    const lastQuote = tdNumber(raw.last_quote_at ?? null);
    if (lastQuote) return lastQuote * 1000;
    const ts = tdNumber(raw.timestamp ?? null);
    return ts ? ts * 1000 : null;
  }

  protected async mapQuote(symbol: string, raw: TdQuote): Promise<Quote> {
    const reference = findAsset(symbol, this.market);
    const price = tdNumber(raw.close);
    if (price === null) {
      throw new ProviderUnavailableError(this.id, `Vendor returned no price for ${symbol}`, this.market);
    }

    const asOfMs = this.asOfFromQuote(raw);
    const meta = this.buildMeta(asOfMs);
    const previousClose = tdNumber(raw.previous_close);
    const volume = tdNumber(raw.volume);
    const averageVolume = tdNumber(raw.average_volume);
    const change = tdNumber(raw.change);
    const changePercent = tdNumber(raw.percent_change);
    const stats = await this.client.statistics(symbol);

    const extras: Record<string, number | string | null> = {
      sector: reference?.sector ?? null,
      exchange: raw.exchange ?? this.options.exchange ?? null,
      peRatio: stats.peRatio,
      eps: stats.eps,
      dividendYield: stats.dividendYield,
    };

    // The standard vendor quote does not expose extended-hours prints.
    extras.preMarket = null;
    extras.afterHours = null;

    return {
      symbol: symbol.toUpperCase(),
      name: raw.name ?? reference?.name ?? symbol.toUpperCase(),
      market: this.market,
      sector: reference?.sector ?? "N/A",
      currency: raw.currency ?? reference?.currency ?? this.options.currency,
      price,
      change: change ?? (previousClose !== null ? round(price - previousClose, 6) : 0),
      changePercent:
        changePercent ?? (previousClose ? round(((price - previousClose) / previousClose) * 100, 2) : 0),
      open: tdNumber(raw.open) ?? price,
      high: tdNumber(raw.high) ?? price,
      low: tdNumber(raw.low) ?? price,
      previousClose: previousClose ?? price,
      volume: volume ?? 0,
      avgVolume20: averageVolume ?? 0,
      volumeRatio: averageVolume && volume ? round(volume / averageVolume, 2) : 0,
      high52w: tdNumber(raw.fifty_two_week?.high ?? null),
      low52w: tdNumber(raw.fifty_two_week?.low ?? null),
      marketCap: stats.marketCap,
      quality: meta.quality,
      asOf: meta.asOf ?? new Date().toISOString(),
      meta,
      extras,
    };
  }

  protected async fetchLiveQuote(symbol: string): Promise<Quote> {
    const raw = await this.client.quote(symbol);
    return this.mapQuote(symbol, raw);
  }

  protected async fetchLiveCandles(symbol: string, timeframe: Timeframe, bars: number): Promise<Candle[]> {
    return this.client.timeSeries(symbol, timeframe, bars);
  }

  protected async fetchSymbolSearch(query: string): Promise<Asset[]> {
    const items = await this.client.symbolSearch(query);
    const exchange = (this.options.exchange ?? "").toUpperCase();
    return items
      .filter((item) => {
        if (!exchange) return (item.country ?? "").toUpperCase().includes("UNITED STATES");
        const itemExchange = (item.exchange ?? "").toUpperCase();
        return itemExchange === exchange || (item.country ?? "").toUpperCase().includes("UNITED STATES");
      })
      .slice(0, 15)
      .map((item) => ({
        symbol: item.symbol.toUpperCase(),
        name: item.instrument_name ?? item.symbol,
        market: this.market,
        sector: findAsset(item.symbol, this.market)?.sector ?? "N/A",
        currency: item.currency ?? this.options.currency,
      }));
  }

  protected async fetchMarketStatus(): Promise<MarketStatus> {
    const exchange = this.options.exchange;
    const fallback = staticMarketStatus(this.market);
    if (!exchange) return fallback;
    const state = await this.client.marketState(exchange);
    if (!state || typeof state.is_market_open !== "boolean") return fallback;
    return {
      ...fallback,
      isOpen: state.is_market_open,
      state: state.is_market_open ? "OPEN" : fallback.state === "OPEN" ? "CLOSED" : fallback.state,
      nextEvent: state.is_market_open
        ? `Closes in ${state.time_to_close ?? "—"}`
        : `Opens in ${state.time_to_open ?? "—"}`,
    };
  }

  /** Batched quotes so a full-market scan stays inside vendor rate limits. */
  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    this.requireConfigured();
    const out = new Map<string, Quote>();
    const raw = await this.client.quotes(symbols, this.options.batchSize);
    for (const [symbol, payload] of raw) {
      try {
        out.set(symbol, await this.mapQuote(symbol, payload));
      } catch {
        /* omitted — never substituted with demo values */
      }
    }
    if (out.size) this.recordSuccess([...out.values()][0].meta.quality);
    return out;
  }

  async getCandlesBatch(symbols: string[], timeframe: Timeframe, bars: number): Promise<Map<string, Candle[]>> {
    this.requireConfigured();
    const result = new Map<string, Candle[]>();
    for (const group of chunk(symbols, this.options.batchSize)) {
      const batch = await this.client.timeSeriesBatch(group, timeframe, bars, this.options.batchSize);
      for (const [symbol, candles] of batch) result.set(symbol, candles);
    }
    if (result.size) {
      const first = [...result.values()][0];
      this.recordSuccess(this.buildMeta(first[first.length - 1].time + TIMEFRAME_MS[timeframe]).quality);
    }
    return result;
  }
}
