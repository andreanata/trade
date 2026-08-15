import type {
  Asset,
  Candle,
  DataMeta,
  DataQuality,
  MarketId,
  MarketStatus,
  ProviderStatus,
  Quote,
  Series,
  Timeframe,
} from "@/types/market";
import { sma } from "@/lib/indicators";
import { TIMEFRAME_MS, round } from "@/lib/utils";
import { getMarketStatus as staticMarketStatus } from "./market-status";
import { ProviderUnavailableError, type MarketDataProvider, type VolumeInfo } from "./types";
import { classifyQuality } from "./http";

export interface LiveProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  requiredEnv: string[];
  dataSource: string;
  qualityOverride?: string | null;
}

/**
 * Base class for vendor-backed providers used when MOCK_MODE=false.
 *
 * HARD RULE: there is NO demo fallback here. If the vendor is not configured, or
 * the request fails (timeout / 401 / 429 / 5xx / malformed payload), the provider
 * throws ProviderUnavailableError so the caller reports DATA_UNAVAILABLE.
 * Fabricated prices, volumes, candles or market caps are never produced.
 */
export abstract class RealMarketDataProvider implements MarketDataProvider {
  readonly market: MarketId;
  readonly id: string;
  readonly label: string;
  readonly isDemo = false;
  protected readonly config: LiveProviderConfig;

  private lastSuccessAt: string | null = null;
  private lastErrorAt: string | null = null;
  private lastError: string | null = null;
  private lastQuality: DataQuality | null = null;

  protected constructor(market: MarketId, id: string, label: string, config: LiveProviderConfig) {
    this.market = market;
    this.id = id;
    this.label = label;
    this.config = config;
  }

  get configured(): boolean {
    return Boolean(this.config.baseUrl && this.config.apiKey);
  }

  get requiredEnv(): string[] {
    return this.config.requiredEnv;
  }

  get dataSource(): string {
    return this.config.dataSource;
  }

  /** Vendor implementations. These must throw (never fabricate) on failure. */
  protected abstract fetchLiveQuote(symbol: string): Promise<Quote>;
  protected abstract fetchLiveCandles(symbol: string, timeframe: Timeframe, bars: number): Promise<Candle[]>;
  protected abstract fetchSymbolSearch(query: string): Promise<Asset[]>;
  protected abstract fetchMarketStatus(): Promise<MarketStatus>;

  protected requireConfigured() {
    if (!this.configured) {
      throw new ProviderUnavailableError(
        this.id,
        `Real market data is enabled (MOCK_MODE=false) but ${this.config.requiredEnv.join(" and ")} ${
          this.config.requiredEnv.length > 1 ? "are" : "is"
        } not configured.`,
        this.market,
      );
    }
  }

  /** Marks a successful call without claiming anything about data freshness. */
  protected recordOk() {
    this.lastSuccessAt = new Date().toISOString();
    this.lastError = null;
  }

  protected recordSuccess(quality: DataQuality) {
    this.lastSuccessAt = new Date().toISOString();
    this.lastQuality = quality;
    this.lastError = null;
  }

  protected recordFailure(error: unknown): ProviderUnavailableError {
    const message = error instanceof Error ? error.message : String(error);
    this.lastErrorAt = new Date().toISOString();
    this.lastError = message;
    this.lastQuality = "UNAVAILABLE";
    return error instanceof ProviderUnavailableError
      ? error
      : new ProviderUnavailableError(this.id, message, this.market, error);
  }

  protected buildMeta(asOfMs: number | null, note?: string | null): DataMeta {
    const { quality, delaySeconds } = classifyQuality(asOfMs, this.config.qualityOverride);
    return {
      mode: "REAL",
      quality,
      dataSource: this.dataSource,
      providerId: this.id,
      asOf: asOfMs === null ? null : new Date(asOfMs).toISOString(),
      delaySeconds,
      note: note ?? null,
    };
  }

  async getQuote(symbol: string): Promise<Quote> {
    this.requireConfigured();
    try {
      const quote = await this.fetchLiveQuote(symbol);
      this.recordSuccess(quote.meta.quality);
      return quote;
    } catch (error) {
      throw this.recordFailure(error);
    }
  }

  async getCandles(symbol: string, timeframe: Timeframe, bars = 320): Promise<Candle[]> {
    this.requireConfigured();
    try {
      const candles = await this.fetchLiveCandles(symbol, timeframe, bars);
      if (!candles.length) {
        throw new ProviderUnavailableError(
          this.id,
          `No ${timeframe} history returned for ${symbol}.`,
          this.market,
        );
      }
      const last = candles[candles.length - 1];
      // Do not overwrite the quote-derived freshness with a bar-close estimate.
      this.recordOk();
      return candles;
    } catch (error) {
      throw this.recordFailure(error);
    }
  }

  async getHistoricalData(symbol: string, timeframe: Timeframe, bars = 320): Promise<Series> {
    const candles = await this.getCandles(symbol, timeframe, bars);
    const last = candles[candles.length - 1];
    const meta = this.buildMeta(last.time + TIMEFRAME_MS[timeframe]);
    return { symbol: symbol.toUpperCase(), timeframe, candles, quality: meta.quality, meta };
  }

  async getVolume(symbol: string, timeframe: Timeframe): Promise<VolumeInfo> {
    const candles = await this.getCandles(symbol, timeframe, 120);
    const volumes = candles.map((c) => c.volume);
    const avgSeries = sma(volumes, 20);
    const average20 = avgSeries[avgSeries.length - 1] ?? volumes[volumes.length - 1] ?? 0;
    const volume = volumes[volumes.length - 1] ?? 0;
    const meta = this.buildMeta(candles[candles.length - 1].time + TIMEFRAME_MS[timeframe]);
    return {
      symbol: symbol.toUpperCase(),
      volume,
      average20: round(average20, 0),
      ratio: average20 ? round(volume / average20, 2) : 0,
      quality: meta.quality,
      meta,
    };
  }

  async searchSymbols(query: string): Promise<Asset[]> {
    this.requireConfigured();
    try {
      const results = await this.fetchSymbolSearch(query);
      this.recordOk();
      return results;
    } catch (error) {
      throw this.recordFailure(error);
    }
  }

  async getMarketStatus(): Promise<MarketStatus> {
    if (!this.configured) return staticMarketStatus(this.market);
    try {
      return await this.fetchMarketStatus();
    } catch {
      // Session clock is derived from exchange hours, not from price data.
      return staticMarketStatus(this.market);
    }
  }

  status(): ProviderStatus {
    const configured = this.configured;
    const quality: DataQuality = !configured
      ? "UNAVAILABLE"
      : this.lastError && !this.lastSuccessAt
        ? "UNAVAILABLE"
        : (this.lastQuality ?? "DELAYED");

    const state =
      quality === "LIVE" ? "REAL" : quality === "DELAYED" ? "DELAYED" : quality === "HISTORICAL" ? "HISTORICAL" : "UNAVAILABLE";

    const message = !configured
      ? `Not configured — set ${this.config.requiredEnv.join(", ")}`
      : this.lastError
        ? this.lastError
        : this.lastSuccessAt
          ? `Connected to ${this.dataSource}`
          : `Configured (${this.dataSource}), awaiting first request`;

    return {
      market: this.market,
      providerId: this.id,
      dataSource: this.dataSource,
      mode: "REAL",
      configured,
      quality,
      state,
      message,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
      requiredEnv: this.config.requiredEnv,
    };
  }
}
