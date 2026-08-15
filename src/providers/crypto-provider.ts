import type { Asset, Candle, MarketStatus, Quote, Series, Timeframe } from "@/types/market";
import { findAsset, getUniverse } from "@/data/universe";
import { round } from "@/lib/utils";
import { RealMarketDataProvider } from "./live-base";
import { ProviderUnavailableError } from "./types";
import { getMarketStatus as staticMarketStatus } from "./market-status";
import {
  COINGECKO_IDS,
  CoinGeckoClient,
  CoinGeckoUnsupportedTimeframe,
  isTimeframeSupported,
  timeframePlanNote,
  type CoinGeckoMarket,
} from "./coingecko";
import { cryptoVendor, tuning } from "@/server/env";

/**
 * CRYPTO market-data provider — powered by CoinGecko.
 *
 * Configure with CRYPTO_API_BASE_URL (https://api.coingecko.com/api/v3 or the
 * pro-api host) and, optionally, CRYPTO_API_KEY. Credentials are resolved
 * server-side in src/server/env.ts and never reach the browser.
 *
 * There is no exchange-REST path and no Binance dependency: no /klines, no
 * /ticker/24hr, and no `BTCUSDT`-style pair formatting. If CoinGecko fails in REAL
 * mode the provider throws ProviderUnavailableError so the API answers
 * DATA_UNAVAILABLE — it never falls back to demo data or to another exchange.
 *
 * Meme-coin discovery is deliberately independent of this provider (see
 * src/providers/memecoin-provider.ts, which uses GeckoTerminal + DexScreener).
 */
export class CryptoMarketDataProvider extends RealMarketDataProvider {
  private readonly client: CoinGeckoClient;

  constructor() {
    const config = cryptoVendor();
    super("CRYPTO", "crypto", "Crypto market data", {
      baseUrl: config.baseUrl,
      // CoinGecko's public tier needs no key; a demo/pro key is used when supplied.
      apiKey: config.apiKey ?? "public",
      requiredEnv: config.requiredEnv,
      dataSource: config.dataSource,
      qualityOverride: tuning.cryptoQuality,
    });
    this.client = new CoinGeckoClient();
  }

  /** Ticker (or CoinGecko id) -> CoinGecko asset id. */
  private async assetId(symbol: string): Promise<string> {
    const id = await this.client.resolveId(symbol);
    if (!id) {
      throw new ProviderUnavailableError(
        this.id,
        `CoinGecko has no asset id for "${symbol.toUpperCase()}".`,
        "CRYPTO",
      );
    }
    return id;
  }

  /** Maps one CoinGecko market row onto the shared Quote shape. */
  private mapQuote(symbol: string, row: CoinGeckoMarket): Quote {
    const reference = findAsset(symbol, "CRYPTO") ?? findAsset(symbol, "MEME");
    const price = typeof row.current_price === "number" ? row.current_price : null;
    if (price === null) {
      throw new ProviderUnavailableError(this.id, `CoinGecko returned no price for ${symbol}`, "CRYPTO");
    }

    const asOfMs = row.last_updated ? Date.parse(row.last_updated) : null;
    const meta = this.buildMeta(Number.isFinite(asOfMs) ? (asOfMs as number) : null);
    const change = typeof row.price_change_24h === "number" ? row.price_change_24h : null;
    const changePercent =
      typeof row.price_change_percentage_24h === "number" ? row.price_change_percentage_24h : null;
    // 24h-ago price is derived from the provider's own absolute change, not guessed.
    const previousClose = change !== null ? price - change : price;
    const volume24h = typeof row.total_volume === "number" ? row.total_volume : null;
    const marketCap = typeof row.market_cap === "number" ? row.market_cap : null;

    return {
      symbol: (reference?.symbol ?? row.symbol ?? symbol).toUpperCase(),
      name: row.name ?? reference?.name ?? symbol.toUpperCase(),
      market: "CRYPTO",
      sector: reference?.sector ?? "Digital Asset",
      currency: "USD",
      price,
      change: change ?? 0,
      changePercent: changePercent === null ? 0 : round(changePercent, 2),
      open: round(previousClose, 12),
      high: typeof row.high_24h === "number" ? row.high_24h : price,
      low: typeof row.low_24h === "number" ? row.low_24h : price,
      previousClose: round(previousClose, 12),
      volume: volume24h ?? 0,
      avgVolume20: 0,
      volumeRatio: 0,
      // CoinGecko /coins/markets publishes all-time extremes, not 52-week ones.
      high52w: null,
      low52w: null,
      marketCap,
      quality: meta.quality,
      asOf: meta.asOf ?? new Date().toISOString(),
      meta,
      extras: {
        coingeckoId: row.id,
        change24h: changePercent === null ? null : round(changePercent, 2),
        high24h: typeof row.high_24h === "number" ? row.high_24h : null,
        low24h: typeof row.low_24h === "number" ? row.low_24h : null,
        volume24h,
        marketCap,
        fdv: typeof row.fully_diluted_valuation === "number" ? row.fully_diluted_valuation : null,
        circulatingSupply: typeof row.circulating_supply === "number" ? row.circulating_supply : null,
        totalSupply: typeof row.total_supply === "number" ? row.total_supply : null,
        maxSupply: typeof row.max_supply === "number" ? row.max_supply : null,
        volumeToMarketCap: volume24h !== null && marketCap ? round(volume24h / marketCap, 4) : null,
        lastUpdated: row.last_updated ?? null,
        // Not published by this vendor — rendered as N/A rather than estimated.
        fundingRate: null,
        openInterest: null,
        btcCorrelation: null,
      },
    };
  }

  protected async fetchLiveQuote(symbol: string): Promise<Quote> {
    const id = await this.assetId(symbol);
    const row = await this.client.market(id);
    if (!row) {
      throw new ProviderUnavailableError(this.id, `CoinGecko returned no market data for ${symbol}`, "CRYPTO");
    }
    return this.mapQuote(symbol, row);
  }

  protected async fetchLiveCandles(symbol: string, timeframe: Timeframe, bars: number): Promise<Candle[]> {
    if (!isTimeframeSupported(timeframe)) {
      // Explicit, documented gap — never padded with fabricated candles.
      throw new ProviderUnavailableError(this.id, timeframePlanNote(timeframe), "CRYPTO");
    }
    const id = await this.assetId(symbol);
    try {
      const { candles } = await this.client.candles(id, timeframe, bars);
      if (!candles.length) {
        throw new ProviderUnavailableError(
          this.id,
          `CoinGecko returned no ${timeframe} history for ${symbol}`,
          "CRYPTO",
        );
      }
      return candles;
    } catch (error) {
      if (error instanceof CoinGeckoUnsupportedTimeframe) {
        throw new ProviderUnavailableError(this.id, error.message, "CRYPTO");
      }
      throw error;
    }
  }

  /** How the requested timeframe is sourced — surfaced on the series meta. */
  timeframeNote(timeframe: Timeframe): string {
    return timeframePlanNote(timeframe);
  }

  /**
   * Adds explicit provenance to the candle series so nothing is misread:
   * how the timeframe was sourced, and the fact that CoinGecko publishes a rolling
   * 24h volume series rather than per-bar traded volume.
   */
  override async getHistoricalData(symbol: string, timeframe: Timeframe, bars = 320): Promise<Series> {
    const series = await super.getHistoricalData(symbol, timeframe, bars);
    return {
      ...series,
      meta: {
        ...series.meta,
        note: `${this.timeframeNote(timeframe)} Volume is CoinGecko's rolling 24h volume sampled at each bar, not per-bar traded volume.`,
      },
    };
  }

  protected async fetchSymbolSearch(query: string): Promise<Asset[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];

    // Curated universe first so well-known tickers resolve instantly and unambiguously.
    const local = getUniverse("CRYPTO")
      .filter((a) => a.symbol.includes(q) || a.name.toUpperCase().includes(q))
      .slice(0, 10)
      .map(({ symbol, name, market, sector, currency }) => ({ symbol, name, market, sector, currency }));
    if (local.length) return local;

    // Otherwise ask CoinGecko so assets outside the curated list still work.
    const id = await this.client.resolveId(q);
    if (!id) return [];
    const row = await this.client.market(id);
    if (!row) return [];
    return [
      {
        symbol: (row.symbol ?? q).toUpperCase(),
        name: row.name ?? q,
        market: "CRYPTO" as const,
        sector: "Digital Asset",
        currency: "USD",
      },
    ];
  }

  protected async fetchMarketStatus(): Promise<MarketStatus> {
    return staticMarketStatus("CRYPTO");
  }

  /**
   * Batch quotes — CoinGecko serves many assets in a single /coins/markets call,
   * which keeps the scanner well inside the free-tier rate limit.
   */
  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    this.requireConfigured();
    const out = new Map<string, Quote>();
    if (!symbols.length) return out;

    const pairs: { symbol: string; id: string }[] = [];
    for (const symbol of symbols) {
      const upper = symbol.toUpperCase();
      const id = COINGECKO_IDS[upper] ?? (await this.client.resolveId(upper));
      if (id) pairs.push({ symbol: upper, id });
    }
    if (!pairs.length) return out;

    const rows = await this.client.markets(pairs.map((p) => p.id));
    for (const { symbol, id } of pairs) {
      const row = rows.get(id);
      if (!row) continue; // omitted, never substituted
      try {
        out.set(symbol, this.mapQuote(symbol, row));
      } catch {
        /* individual asset unavailable */
      }
    }
    if (out.size) this.recordSuccess([...out.values()][0].meta.quality);
    return out;
  }
}
