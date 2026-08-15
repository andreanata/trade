import type { Candle, MarketId, Timeframe } from "@/types/market";
import { INDEX_DEFINITIONS, type UniverseAsset } from "@/data/universe";
import { TIMEFRAME_MS, gaussianAt, hashString, noiseAt } from "@/lib/utils";

/**
 * Deterministic synthetic OHLCV generator.
 * Produces realistic looking trends, consolidations, squeezes, breakouts and volume
 * spikes so every feature of the terminal can run without an external vendor.
 * The output is ALWAYS labelled as DEMO DATA in the UI — it is never presented as live.
 */

const BASE_DAILY_VOL: Record<MarketId, number> = {
  US: 0.0155,
  CRYPTO: 0.028,
  MEME: 0.075,
};

export interface GeneratorInput {
  symbol: string;
  market: MarketId;
  basePrice: number;
  baseVolume: number;
  volatility: number;
}

export function toGeneratorInput(asset: UniverseAsset): GeneratorInput {
  return {
    symbol: asset.symbol,
    market: asset.market,
    basePrice: asset.basePrice,
    baseVolume: asset.baseVolume,
    volatility: asset.volatility,
  };
}

export function indexGeneratorInput(market: MarketId): GeneratorInput {
  const def = INDEX_DEFINITIONS[market];
  return {
    symbol: `${market}_INDEX`,
    market,
    basePrice: def.base,
    baseVolume: market === "CRYPTO" ? 128_000_000_000 : 9_500_000_000,
    volatility: def.volatility,
  };
}

function roundToTick(price: number, market: MarketId): number {
  if (market === "MEME" && price < 0.01) return Math.round(price * 1e12) / 1e12;
  if (price >= 1000) return Math.round(price * 100) / 100;
  if (price >= 1) return Math.round(price * 100) / 100;
  if (price >= 0.01) return Math.round(price * 10000) / 10000;
  return Math.round(price * 1e9) / 1e9;
}

export function generateCandles(input: GeneratorInput, timeframe: Timeframe, bars = 320): Candle[] {
  const interval = TIMEFRAME_MS[timeframe];
  const seed = hashString(`${input.symbol}|${input.market}|${timeframe}`);
  const lastOpen = Math.floor(Date.now() / interval) * interval;
  const lastIndex = Math.floor(lastOpen / interval);
  const firstIndex = lastIndex - (bars - 1);

  const dailyVol = BASE_DAILY_VOL[input.market] * input.volatility;
  const barVol = dailyVol * Math.sqrt(Math.min(1, interval / TIMEFRAME_MS["1D"]) || 0.02);

  // Long-cycle trend + medium consolidation cycle keeps regimes readable.
  const trendCycle = 90 + (seed % 130);
  const trendPhase = (noiseAt(seed, 7) * Math.PI * 2) as number;
  const microCycle = 18 + (seed % 27);
  const microPhase = noiseAt(seed, 11) * Math.PI * 2;
  const regimeBias = (noiseAt(seed, 3) - 0.42) * 0.8; // slight bullish skew overall

  const anchorSeedIndex = Math.floor(firstIndex / 512);
  let price =
    input.basePrice *
    (0.86 + 0.28 * noiseAt(seed, anchorSeedIndex + 101)) *
    (1 + 0.05 * Math.sin(firstIndex / 700));

  const candles: Candle[] = [];
  const barsPerDay = Math.max(1, Math.round(TIMEFRAME_MS["1D"] / interval));

  for (let step = 0; step < bars; step += 1) {
    const absIndex = firstIndex + step;
    const trend = Math.sin((absIndex / trendCycle) * Math.PI * 2 + trendPhase);
    const micro = Math.sin((absIndex / microCycle) * Math.PI * 2 + microPhase);
    // Volatility clustering: squeeze phases when |micro| small.
    const volMultiplier = 0.55 + Math.abs(micro) * 0.7 + Math.abs(trend) * 0.35;
    const shock = gaussianAt(seed, absIndex) * barVol * volMultiplier;
    const drift = (trend * 0.55 + regimeBias * 0.5 + micro * 0.18) * barVol * 0.85;
    const jump = noiseAt(seed, absIndex + 991) > 0.988 ? (noiseAt(seed, absIndex + 55) - 0.4) * barVol * 9 : 0;

    const ret = drift + shock + jump;
    const open = price;
    const close = Math.max(open * 0.6, open * (1 + ret));
    const bodyRange = Math.abs(close - open);
    const wickBase = barVol * price * (0.35 + noiseAt(seed, absIndex + 17) * 0.9);
    const high = Math.max(open, close) + wickBase * (0.4 + noiseAt(seed, absIndex + 29) * 0.9);
    const low = Math.min(open, close) - wickBase * (0.4 + noiseAt(seed, absIndex + 37) * 0.9);

    const volScale = Math.max(0.02, interval / TIMEFRAME_MS["1D"]);
    const baseVol = input.baseVolume * volScale;
    const moveIntensity = Math.min(3.2, Math.abs(ret) / (barVol || 1e-9));
    const spike =
      moveIntensity > 1.7 ? 1.25 + moveIntensity * 0.55 : 1 + Math.max(0, moveIntensity - 0.6) * 0.35;
    const cyclical = 0.75 + Math.abs(micro) * 0.45 + Math.max(0, trend) * 0.35;
    const volume = Math.max(
      1,
      Math.round(baseVol * cyclical * spike * (0.65 + noiseAt(seed, absIndex + 71) * 0.85)),
    );

    candles.push({
      time: absIndex * interval,
      open: roundToTick(open, input.market),
      high: roundToTick(Math.max(high, open, close), input.market),
      low: roundToTick(Math.min(low, open, close), input.market),
      close: roundToTick(close, input.market),
      volume,
    });

    price = close;
    // Mean reversion toward the anchor so long series stay inside a realistic band
    // (trends remain readable over 30–80 bars, but the walk cannot drift forever).
    const anchor = input.basePrice;
    const pull = 0.0075 * Math.max(0.4, Math.min(2, 1 / Math.max(0.25, barsPerDay / 24)));
    price += (anchor - price) * pull;
  }

  return candles;
}

export function generateSparkline(input: GeneratorInput, points = 32): number[] {
  const candles = generateCandles(input, "1H", points);
  return candles.map((c) => c.close);
}
