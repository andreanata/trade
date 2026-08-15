import type {
  Asset,
  Candle,
  DataMeta,
  MarketId,
  MarketStatus,
  ProviderStatus,
  Quote,
  Series,
  Timeframe,
} from "@/types/market";
import { UNIVERSE, findAsset, getUniverse } from "@/data/universe";
import { generateCandles, toGeneratorInput } from "@/lib/mock/generator";
import { sma } from "@/lib/indicators";
import { round } from "@/lib/utils";
import { getMarketStatus } from "./market-status";
import { SymbolNotFoundError, type MarketDataProvider, type VolumeInfo } from "./types";

const cache = new Map<string, { at: number; candles: Candle[] }>();
const CACHE_TTL_MS = 20_000;

function cachedCandles(symbol: string, market: MarketId, timeframe: Timeframe, bars: number): Candle[] {
  const key = `${market}:${symbol}:${timeframe}:${bars}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.candles;
  const asset = findAsset(symbol, market);
  if (!asset) throw new SymbolNotFoundError(symbol);
  const candles = generateCandles(toGeneratorInput(asset), timeframe, bars);
  cache.set(key, { at: Date.now(), candles });
  if (cache.size > 900) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 300);
    for (const [k] of oldest) cache.delete(k);
  }
  return candles;
}

/**
 * Deterministic demo dataset. Only ever used when MOCK_MODE=true, and everything
 * it emits is stamped with mode="DEMO" / quality="DEMO" so the UI can label it.
 */
export class MockMarketDataProvider implements MarketDataProvider {
  readonly id: string;
  readonly market: MarketId;
  readonly isDemo = true;
  readonly label: string;
  readonly configured = true;
  readonly requiredEnv: string[] = [];

  constructor(market: MarketId) {
    this.market = market;
    this.id = `mock-${market.toLowerCase()}`;
    this.label = `Demo generator (${market})`;
  }

  private meta(asOf?: number): DataMeta {
    return {
      mode: "DEMO",
      quality: "DEMO",
      dataSource: "MarketAI demo generator",
      providerId: this.id,
      asOf: new Date(asOf ?? Date.now()).toISOString(),
      delaySeconds: null,
      note: "Synthetic dataset — not live market data.",
    };
  }

  async getCandles(symbol: string, timeframe: Timeframe, bars = 320): Promise<Candle[]> {
    return cachedCandles(symbol.toUpperCase(), this.market, timeframe, bars);
  }

  async getHistoricalData(symbol: string, timeframe: Timeframe, bars = 320): Promise<Series> {
    const candles = await this.getCandles(symbol, timeframe, bars);
    return { symbol: symbol.toUpperCase(), timeframe, candles, quality: "DEMO", meta: this.meta() };
  }

  async getQuote(symbol: string): Promise<Quote> {
    const upper = symbol.toUpperCase();
    const asset = findAsset(upper, this.market);
    if (!asset) throw new SymbolNotFoundError(symbol);

    const daily = await this.getCandles(upper, "1D", 300);
    const current = daily[daily.length - 1];
    const previous = daily[daily.length - 2] ?? current;
    const volumes = daily.map((c) => c.volume);
    const avgSeries = sma(volumes, 20);
    const avg20 = avgSeries[avgSeries.length - 1] ?? current.volume;
    const yearly = daily.slice(-252);
    const change = current.close - previous.close;

    const extras: Record<string, number | string | null> = {};
    if (this.market === "US") {
      extras.preMarket = round(current.close * (1 + (current.volume % 7) / 4000), 2);
      extras.afterHours = round(current.close * (1 - (current.volume % 5) / 4000), 2);
      extras.peRatio = round(12 + (asset.basePrice % 40), 2);
      extras.eps = round(current.close / (12 + (asset.basePrice % 40)), 2);
      extras.dividendYield = round((asset.basePrice % 4) / 2, 2);
      extras.sector = asset.sector;
    } else if (this.market === "MEME") {
      const supply = (asset.baseVolume / 8) * 24;
      extras.chain = "demo-chain";
      extras.contractAddress = `demo-${asset.symbol.toLowerCase()}`;
      extras.liquidityUsd = round(current.close * supply * 0.05, 0);
      extras.marketCap = round(current.close * supply, 0);
      extras.volume24h = round(current.volume * current.close, 0);
      extras.buys24h = 400 + (current.volume % 900);
      extras.sells24h = 380 + (current.volume % 700);
      extras.securityStatus = "DEMO";
    } else {
      const supply = (asset.baseVolume / 12) * 24;
      extras.marketCap = round(current.close * supply, 0);
      extras.volume24h = round(current.volume * current.close, 0);
      extras.volumeToMarketCap = round((current.volume * current.close) / (current.close * supply), 4);
      extras.liquidityTier = current.volume * current.close > 1e9 ? "DEEP" : "MODERATE";
      extras.fundingRate = null;
      extras.openInterest = null;
      extras.btcCorrelation = asset.symbol === "BTC" ? 1 : null;
    }

    return {
      symbol: upper,
      name: asset.name,
      market: this.market,
      sector: asset.sector,
      currency: asset.currency,
      price: current.close,
      change: round(change, 6),
      changePercent: round((change / previous.close) * 100, 2),
      open: current.open,
      high: current.high,
      low: current.low,
      previousClose: previous.close,
      volume: current.volume,
      avgVolume20: round(avg20, 0),
      volumeRatio: round(current.volume / (avg20 || 1), 2),
      high52w: yearly.length ? Math.max(...yearly.map((c) => c.high)) : null,
      low52w: yearly.length ? Math.min(...yearly.map((c) => c.low)) : null,
      marketCap: typeof extras.marketCap === "number" ? extras.marketCap : null,
      quality: "DEMO",
      asOf: new Date().toISOString(),
      meta: this.meta(),
      extras,
    };
  }

  async getVolume(symbol: string, timeframe: Timeframe): Promise<VolumeInfo> {
    const candles = await this.getCandles(symbol, timeframe, 120);
    const volumes = candles.map((c) => c.volume);
    const avgSeries = sma(volumes, 20);
    const avg20 = avgSeries[avgSeries.length - 1] ?? volumes[volumes.length - 1];
    const volume = volumes[volumes.length - 1];
    return {
      symbol: symbol.toUpperCase(),
      volume,
      average20: round(avg20, 0),
      ratio: round(volume / (avg20 || 1), 2),
      quality: "DEMO",
      meta: this.meta(),
    };
  }

  async searchSymbols(query: string): Promise<Asset[]> {
    const q = query.trim().toUpperCase();
    const pool = this.market ? getUniverse(this.market) : UNIVERSE;
    return pool
      .filter((a) => !q || a.symbol.includes(q) || a.name.toUpperCase().includes(q))
      .slice(0, 25)
      .map(({ symbol, name, market, sector, currency }) => ({ symbol, name, market, sector, currency }));
  }

  async getMarketStatus(): Promise<MarketStatus> {
    return getMarketStatus(this.market);
  }

  status(): ProviderStatus {
    return {
      market: this.market,
      providerId: this.id,
      dataSource: "MarketAI demo generator",
      mode: "DEMO",
      configured: true,
      quality: "DEMO",
      state: "DEMO",
      message: "MOCK_MODE=true — deterministic demo dataset, not live market data.",
      lastSuccessAt: new Date().toISOString(),
      lastErrorAt: null,
      lastError: null,
      requiredEnv: [],
    };
  }
}
