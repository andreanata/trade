import type { BreakoutSignal, Candle, LevelMap, TechnicalIndicators } from "@/types/market";
import { clamp, round } from "@/lib/utils";

interface Check {
  label: string;
  passed: boolean;
  detail: string;
  weight: number;
}

/**
 * Early breakout detector.
 * The returned `probability` is a weighted model score (0–100), NOT a statistical
 * probability and NOT a guarantee that a breakout will occur.
 */
export function detectBreakout(
  candles: Candle[],
  ind: TechnicalIndicators,
  levels: LevelMap,
): BreakoutSignal {
  const price = ind.price;
  const resistance = levels.resistance1?.price ?? null;
  const distancePct = resistance ? ((resistance - price) / price) * 100 : null;

  const recent = candles.slice(-40);
  const priorHigh = recent.length > 5 ? Math.max(...recent.slice(0, -3).map((c) => c.high)) : price;
  const brokeOut = price > priorHigh;
  const barsSinceBreak = (() => {
    if (!brokeOut) return -1;
    for (let i = candles.length - 1; i >= Math.max(0, candles.length - 15); i -= 1) {
      if (candles[i].close <= priorHigh) return candles.length - 1 - i;
    }
    return 15;
  })();

  const checks: Check[] = [
    {
      label: "Near resistance",
      passed: distancePct !== null && distancePct <= 4 && distancePct >= -1,
      detail:
        distancePct === null
          ? "No clean resistance detected above price."
          : `${distancePct.toFixed(2)}% to nearest resistance cluster.`,
      weight: 16,
    },
    {
      label: "Volume expansion",
      passed: ind.volume.ratio >= 1.3,
      detail: `Volume ${ind.volume.ratio.toFixed(2)}× the 20-bar average (${ind.volume.state}).`,
      weight: 16,
    },
    {
      label: "Volatility expanding / squeeze release",
      passed: ind.bollinger.expansion || ind.bollinger.squeeze,
      detail: ind.bollinger.squeeze
        ? `Bollinger squeeze active (width percentile ${ind.bollinger.widthPercentile.toFixed(0)}).`
        : ind.bollinger.expansion
          ? "Bollinger bands expanding — volatility waking up."
          : "Volatility flat, no expansion yet.",
      weight: 9,
    },
    {
      label: "EMA structure bullish",
      passed: ind.emaAlignment === "BULLISH" || (ind.price > ind.ema20 && ind.ema20 > ind.ema50),
      detail: `EMA20 ${ind.ema20 > ind.ema50 ? ">" : "<"} EMA50, EMA50 ${ind.ema50 > ind.ema200 ? ">" : "<"} EMA200.`,
      weight: 13,
    },
    {
      label: "MACD bullish",
      passed: ind.macd.macd > ind.macd.signal && ind.macd.histogramDirection !== "DECREASING",
      detail: `MACD ${ind.macd.macd > ind.macd.signal ? "above" : "below"} signal, histogram ${ind.macd.histogramDirection.toLowerCase()}.`,
      weight: 11,
    },
    {
      label: "RSI healthy (not exhausted)",
      passed: ind.rsi >= 48 && ind.rsi <= 74,
      detail: `RSI ${ind.rsi.toFixed(1)} — ${ind.rsi > 74 ? "extended" : ind.rsi < 48 ? "still soft" : "constructive"}.`,
      weight: 9,
    },
    {
      label: "ADX rising",
      passed: ind.adx.rising && ind.adx.adx >= 18,
      detail: `ADX ${ind.adx.adx.toFixed(1)} and ${ind.adx.rising ? "rising" : "not rising"}.`,
      weight: 8,
    },
    {
      label: "Higher lows structure",
      passed: ind.priceAction.higherLows,
      detail: ind.priceAction.higherLows ? "Series of higher lows into resistance." : "No higher-low sequence yet.",
      weight: 8,
    },
    {
      label: "Accumulation (OBV)",
      passed: ind.volume.accumulation === "ACCUMULATION",
      detail: `OBV slope ${ind.volume.obvSlope.toFixed(2)}% → ${ind.volume.accumulation.toLowerCase()}.`,
      weight: 6,
    },
    {
      label: "Breakout not overextended",
      passed: ind.priceAction.distanceFrom20BarHigh >= -3.5,
      detail: `Price is ${Math.abs(ind.priceAction.distanceFrom20BarHigh).toFixed(2)}% ${ind.priceAction.distanceFrom20BarHigh >= 0 ? "below" : "above"} the 20-bar high.`,
      weight: 4,
    },
  ];

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const raw = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  let probability = (raw / totalWeight) * 100;

  // Contextual adjustments.
  if (distancePct !== null && distancePct <= 1.2 && distancePct >= 0 && ind.volume.ratio >= 1.5) probability += 6;
  if (ind.priceAction.structure === "DOWNTREND") probability -= 12;
  if (ind.rsi > 82) probability -= 6;
  if (ind.volume.accumulation === "DISTRIBUTION") probability -= 6;
  probability = clamp(probability, 0, 100);

  const volumeConfirmed = ind.volume.ratio >= 1.5;
  const failed =
    brokeOut && barsSinceBreak >= 0 && barsSinceBreak <= 5 && price < priorHigh * 0.995 && !volumeConfirmed;

  let status: BreakoutSignal["status"];
  if (failed) status = "FAILED";
  else if (brokeOut && volumeConfirmed && barsSinceBreak >= 2) status = "CONFIRMED";
  else if (brokeOut) status = "BREAKOUT";
  else if (probability >= 58 && distancePct !== null && distancePct <= 4) status = "EARLY";
  else status = "WATCH";

  const falseBreakoutRisk = clamp(
    (volumeConfirmed ? 18 : 46) +
      (ind.priceAction.higherLows ? 0 : 12) +
      (ind.adx.adx < 20 ? 14 : 0) +
      (ind.rsi > 78 ? 10 : 0) -
      (ind.volume.accumulation === "ACCUMULATION" ? 10 : 0),
    0,
    100,
  );

  const retest =
    brokeOut && resistance !== null && Math.abs(price - priorHigh) / priorHigh < 0.012 && barsSinceBreak > 1;

  const strength = clamp(
    probability * 0.55 + (ind.adx.adx / 60) * 20 + clamp((ind.volume.ratio - 1) * 18, -10, 25),
    0,
    100,
  );

  return {
    status,
    probability: round(probability, 1),
    probabilityLabel: probability <= 30 ? "LOW" : probability <= 60 ? "MODERATE" : probability <= 80 ? "HIGH" : "VERY_HIGH",
    resistance: resistance === null ? null : round(resistance, 6),
    distanceToResistance: distancePct === null ? null : round(distancePct, 2),
    volumeConfirmed,
    falseBreakoutRisk: round(falseBreakoutRisk, 1),
    retest,
    strength: round(strength, 1),
    checklist: checks.map(({ label, passed, detail }) => ({ label, passed, detail })),
  };
}
