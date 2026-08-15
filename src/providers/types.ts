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

export interface VolumeInfo {
  symbol: string;
  volume: number;
  average20: number;
  ratio: number;
  quality: DataQuality;
  meta: DataMeta;
}

/**
 * Every data source implements this contract, so the UI and the analytics engine
 * never depend on a specific vendor.
 */
export interface MarketDataProvider {
  readonly id: string;
  readonly market: MarketId;
  readonly isDemo: boolean;
  readonly label: string;
  /** True when the credentials/URLs this provider needs are present. */
  readonly configured: boolean;
  readonly requiredEnv: string[];

  getQuote(symbol: string): Promise<Quote>;
  getHistoricalData(symbol: string, timeframe: Timeframe, bars?: number): Promise<Series>;
  getCandles(symbol: string, timeframe: Timeframe, bars?: number): Promise<Candle[]>;
  getVolume(symbol: string, timeframe: Timeframe): Promise<VolumeInfo>;
  searchSymbols(query: string): Promise<Asset[]>;
  getMarketStatus(): Promise<MarketStatus>;
  status(): ProviderStatus;

  /** Optional batch helpers used by the scanner to respect vendor rate limits. */
  getQuotes?(symbols: string[]): Promise<Map<string, Quote>>;
  getCandlesBatch?(symbols: string[], timeframe: Timeframe, bars: number): Promise<Map<string, Candle[]>>;
}

export class SymbolNotFoundError extends Error {
  constructor(symbol: string) {
    super(`Asset not found: ${symbol}`);
    this.name = "SymbolNotFoundError";
  }
}

/**
 * Thrown whenever real market data cannot be obtained in REAL mode.
 * The API layer converts this into an explicit DATA_UNAVAILABLE response —
 * it must never be swallowed by a demo fallback.
 */
export class ProviderUnavailableError extends Error {
  readonly providerId: string;
  readonly market: MarketId | null;
  readonly code = "DATA_UNAVAILABLE" as const;
  readonly cause?: unknown;

  constructor(providerId: string, detail?: string, market: MarketId | null = null, cause?: unknown) {
    super(detail ? `${providerId}: ${detail}` : `${providerId} is unavailable`);
    this.name = "ProviderUnavailableError";
    this.providerId = providerId;
    this.market = market;
    this.cause = cause;
  }
}

export function unavailableMeta(providerId: string, dataSource: string, note: string): DataMeta {
  return {
    mode: "REAL",
    quality: "UNAVAILABLE",
    dataSource,
    providerId,
    asOf: null,
    delaySeconds: null,
    note,
  };
}
