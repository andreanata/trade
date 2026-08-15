import type { Candle, LevelMap, Level, TechnicalIndicators, TradeSetup } from "@/types/market";
import { round } from "@/lib/utils";

interface RawLevel {
  price: number;
  touches: number;
  volume: number;
}

/**
 * Support & resistance derived from swing pivots, recent extremes and volume-weighted
 * clustering. Levels are grouped with an ATR-scaled tolerance.
 */
export function computeLevels(candles: Candle[], atr: number): LevelMap {
  const price = candles[candles.length - 1].close;
  const window = candles.slice(-180);
  const tolerance = Math.max(atr * 0.6, price * 0.004);

  const pivots: RawLevel[] = [];
  const left = 3;
  const right = 3;
  for (let i = left; i < window.length - right; i += 1) {
    const c = window[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j += 1) {
      if (j === i) continue;
      if (window[j].high >= c.high) isHigh = false;
      if (window[j].low <= c.low) isLow = false;
    }
    if (isHigh) pivots.push({ price: c.high, touches: 1, volume: c.volume });
    if (isLow) pivots.push({ price: c.low, touches: 1, volume: c.volume });
  }

  // Recent extremes always matter.
  const recent = window.slice(-30);
  if (recent.length) {
    pivots.push({ price: Math.max(...recent.map((c) => c.high)), touches: 1, volume: 0 });
    pivots.push({ price: Math.min(...recent.map((c) => c.low)), touches: 1, volume: 0 });
  }

  const clusters: RawLevel[] = [];
  for (const pivot of pivots.sort((a, b) => a.price - b.price)) {
    const existing = clusters[clusters.length - 1];
    if (existing && Math.abs(existing.price - pivot.price) <= tolerance) {
      const total = existing.touches + pivot.touches;
      existing.price = (existing.price * existing.touches + pivot.price * pivot.touches) / total;
      existing.touches = total;
      existing.volume += pivot.volume;
    } else {
      clusters.push({ ...pivot });
    }
  }

  const maxTouches = Math.max(1, ...clusters.map((c) => c.touches));
  const all: Level[] = clusters.map((c) => {
    const distance = Math.abs(c.price - price) / price;
    const recencyBoost = Math.max(0, 25 - distance * 400);
    const strength = Math.min(100, (c.touches / maxTouches) * 70 + recencyBoost + 5);
    return {
      price: round(c.price, 6),
      strength: round(strength, 1),
      touches: c.touches,
      kind: c.price >= price ? "RESISTANCE" : "SUPPORT",
    };
  });

  const resistances = all
    .filter((l) => l.kind === "RESISTANCE" && l.price > price * 1.0005)
    .sort((a, b) => a.price - b.price);
  const supports = all
    .filter((l) => l.kind === "SUPPORT" && l.price < price * 0.9995)
    .sort((a, b) => b.price - a.price);

  return {
    support1: supports[0] ?? null,
    support2: supports[1] ?? null,
    resistance1: resistances[0] ?? null,
    resistance2: resistances[1] ?? null,
    all: all.sort((a, b) => b.price - a.price),
  };
}

/**
 * Analytical setup: derived from structure (support/resistance) and volatility (ATR).
 * Never a recommendation — purely a levels-based framework.
 */
export function buildSetup(
  price: number,
  levels: LevelMap,
  indicators: TechnicalIndicators,
  bias: TradeSetup["bias"],
): TradeSetup {
  const atr = indicators.atr || price * 0.02;
  const support = levels.support1?.price ?? price - atr * 2;
  const support2 = levels.support2?.price ?? support - atr * 1.5;
  const resistance = levels.resistance1?.price ?? price + atr * 2;
  const resistance2 = levels.resistance2?.price ?? resistance + atr * 2;

  if (bias === "SHORT") {
    const entryHigh = resistance;
    const entryLow = Math.max(price, resistance - atr * 0.4);
    const stopLoss = resistance + atr * 1.2;
    const tp1 = price - atr * 1.2;
    const tp2 = support;
    const tp3 = support2;
    const risk = Math.abs(stopLoss - entryLow) || atr;
    return {
      bias,
      entryLow: round(Math.min(entryLow, entryHigh), 6),
      entryHigh: round(Math.max(entryLow, entryHigh), 6),
      stopLoss: round(stopLoss, 6),
      takeProfit1: round(tp1, 6),
      takeProfit2: round(tp2, 6),
      takeProfit3: round(tp3, 6),
      riskReward: round(Math.abs(entryLow - tp2) / risk, 2),
      method: "Resistance rejection zone with ATR-based invalidation; targets at prior support clusters.",
      disclaimer: "Analytical setup — not financial advice.",
    };
  }

  const nearBreakout = (resistance - price) / price < 0.03;
  const entryLow = nearBreakout ? Math.max(support, price - atr * 0.4) : support;
  const entryHigh = nearBreakout ? Math.min(resistance * 1.004, price + atr * 0.5) : support + atr * 0.6;
  const stopLoss = Math.min(entryLow - atr * 1.1, support - atr * 0.5);
  const risk = Math.max(entryHigh - stopLoss, atr * 0.5);
  const tp1 = nearBreakout ? resistance : Math.min(resistance, entryHigh + risk * 1.5);
  const tp2 = resistance2;
  const tp3 = resistance2 + atr * 2;

  return {
    bias,
    entryLow: round(Math.min(entryLow, entryHigh), 6),
    entryHigh: round(Math.max(entryLow, entryHigh), 6),
    stopLoss: round(stopLoss, 6),
    takeProfit1: round(tp1, 6),
    takeProfit2: round(tp2, 6),
    takeProfit3: round(tp3, 6),
    riskReward: round((tp2 - entryHigh) / risk, 2),
    method: nearBreakout
      ? "Breakout continuation zone: entry around resistance retest, stop below support − ATR, targets at higher resistance clusters."
      : "Pullback zone: entry near support + ATR adjustment, stop below support − ATR, targets at resistance clusters.",
    disclaimer: "Analytical setup — not financial advice.",
  };
}
