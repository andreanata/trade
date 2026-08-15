import type { Candle, DataMeta, MarketId, MarketRegime, SentimentLabel } from "@/types/market";
import { computeIndicators } from "@/lib/indicators";
import { indexGeneratorInput, generateCandles } from "@/lib/mock/generator";
import { getProvider, isMockMode, unavailableMetaFor } from "@/providers";
import { tuning } from "@/server/env";

export interface RegimeReading {
  regime: MarketRegime | "UNKNOWN";
  sentiment: SentimentLabel;
  indexValue: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  sparkline: number[];
  atrPercent: number | null;
  adx: number | null;
  /** Symbol actually used to derive the reading (index or liquid proxy). */
  proxySymbol: string | null;
  proxyLabel: string;
  meta: DataMeta;
  available: boolean;
  reason?: string;
}

const cache = new Map<string, { at: number; value: RegimeReading }>();
const TTL = 60_000;

export function detectRegime(candles: Candle[]): MarketRegime {
  const ind = computeIndicators(candles);
  const bullish = ind.price > ind.ema50 && ind.ema50 > ind.ema200;
  const bearish = ind.price < ind.ema50 && ind.ema50 < ind.ema200;
  const highVol = ind.atrPercent > 3.2 || ind.bollinger.widthPercentile > 85;
  const lowVol = ind.atrPercent < 0.9 && ind.bollinger.widthPercentile < 20;

  if (highVol && !bullish) return "HIGH_VOLATILITY";
  if (bullish && ind.adx.adx >= 20) return "BULL";
  if (bearish && ind.adx.adx >= 20) return "BEAR";
  if (lowVol) return "LOW_VOLATILITY";
  if (bullish) return "BULL";
  if (bearish) return "BEAR";
  return "SIDEWAYS";
}

/**
 * Index / proxy instrument used to read the broad regime for each market.
 * Index symbols are plan-gated at most vendors, so a liquid, configurable proxy is
 * used by default and is always labelled as such — never presented as the index itself.
 */
export function regimeProxy(market: MarketId): { symbol: string; label: string } {
  if (market === "US") {
    const configured = tuning.usIndexSymbol;
    const symbol = configured ?? "SPY";
    return { symbol, label: configured ? symbol : `US proxy · ${symbol}` };
  }
  if (market === "MEME") {
    // Each market gets its own regime read — meme regime is never inherited from crypto.
    const symbol = tuning.memeIndexSymbol ?? "";
    return { symbol, label: symbol ? symbol : "Meme market breadth" };
  }
  const configured = tuning.cryptoIndexSymbol;
  const symbol = configured ?? "BTC";
  return { symbol, label: configured ? symbol : `Crypto proxy · ${symbol}` };
}

function buildReading(
  candles: Candle[],
  meta: DataMeta,
  proxySymbol: string | null,
  proxyLabel: string,
): RegimeReading {
  const ind = computeIndicators(candles);
  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? current;
  const change = current.close - previous.close;
  const changePercent = previous.close ? (change / previous.close) * 100 : 0;
  const regime = detectRegime(candles);
  const sentiment: SentimentLabel =
    regime === "BULL" || (changePercent > 0.4 && ind.price > ind.ema20)
      ? "BULLISH"
      : regime === "BEAR" || changePercent < -0.6
        ? "BEARISH"
        : "NEUTRAL";

  return {
    regime,
    sentiment,
    indexValue: current.close,
    change,
    changePercent,
    volume: current.volume,
    sparkline: candles.slice(-40).map((c) => c.close),
    atrPercent: ind.atrPercent,
    adx: ind.adx.adx,
    proxySymbol,
    proxyLabel,
    meta,
    available: true,
  };
}

function unavailableReading(market: MarketId, reason: string): RegimeReading {
  const { symbol, label } = regimeProxy(market);
  return {
    regime: "UNKNOWN",
    sentiment: "NEUTRAL",
    indexValue: null,
    change: null,
    changePercent: null,
    volume: null,
    sparkline: [],
    atrPercent: null,
    adx: null,
    proxySymbol: symbol,
    proxyLabel: label,
    meta: unavailableMetaFor(market, reason),
    available: false,
    reason,
  };
}

/**
 * Market regime reading.
 * DEMO mode uses the synthetic index series; REAL mode derives it from real candles
 * of the configured index/proxy instrument. When the vendor fails the reading is
 * UNKNOWN + UNAVAILABLE — it is never back-filled with generated data.
 */
export async function readMarketRegime(market: MarketId): Promise<RegimeReading> {
  const key = `${market}:${isMockMode() ? "demo" : "real"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  let value: RegimeReading;

  if (isMockMode()) {
    const candles = generateCandles(indexGeneratorInput(market), "1D", 320);
    value = buildReading(
      candles,
      {
        mode: "DEMO",
        quality: "DEMO",
        dataSource: "MarketAI demo generator",
        providerId: `mock-${market.toLowerCase()}`,
        asOf: new Date().toISOString(),
        delaySeconds: null,
        note: "Synthetic index series — not live market data.",
      },
      null,
      `${market} demo index`,
    );
  } else {
    const provider = getProvider(market);
    const { symbol, label } = regimeProxy(market);
    if (!provider.configured) {
      value = unavailableReading(market, `${market} provider is not configured.`);
    } else if (market === "MEME" && !symbol) {
      // Meme regime is derived from live discovery breadth in analyze.ts, not from a
      // single proxy instrument. Reported as UNKNOWN until that breadth is computed.
      value = unavailableReading(market, "Meme regime is derived from discovery breadth.");
    } else {
      try {
        const series = await provider.getHistoricalData(symbol, "1D", 260);
        value = buildReading(series.candles, series.meta, symbol, label);
      } catch (error) {
        value = unavailableReading(market, error instanceof Error ? error.message : String(error));
      }
    }
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}
