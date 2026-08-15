import type {
  AIScore,
  BreakoutSignal,
  Candle,
  LevelMap,
  MarketRegime,
  MomentumSignal,
  RiskScore,
  ScoreComponent,
  TechnicalIndicators,
  TrendLabel,
  UserSettings,
} from "@/types/market";
import { clamp, round } from "@/lib/utils";
import { rateOfChange, rsi, sma } from "@/lib/indicators";

/** AI Score weights — total 100. */
export const SCORE_WEIGHTS = {
  rsi: 15,
  macd: 15,
  emaTrend: 15,
  volume: 15,
  breakout: 15,
  adx: 10,
  priceAction: 10,
  sentiment: 5,
} as const;

export function detectTrend(ind: TechnicalIndicators): TrendLabel {
  let score = 0;
  if (ind.price > ind.ema20) score += 1;
  if (ind.ema20 > ind.ema50) score += 1;
  if (ind.ema50 > ind.ema200) score += 1;
  if (ind.price > ind.ema200) score += 1;
  if (ind.macd.aboveZero) score += 1;
  if (ind.adx.plusDi > ind.adx.minusDi) score += 1;
  if (ind.price < ind.ema20) score -= 1;
  if (ind.ema20 < ind.ema50) score -= 1;
  if (ind.ema50 < ind.ema200) score -= 1;
  if (!ind.macd.aboveZero) score -= 1;
  if (ind.adx.plusDi < ind.adx.minusDi) score -= 1;

  const strong = ind.adx.adx >= 25;
  if (score >= 4) return strong ? "STRONG_BULLISH" : "BULLISH";
  if (score >= 2) return "BULLISH";
  if (score <= -4) return strong ? "STRONG_BEARISH" : "BEARISH";
  if (score <= -2) return "BEARISH";
  return "NEUTRAL";
}

export function computeMomentum(candles: Candle[], ind: TechnicalIndicators): MomentumSignal {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const roc5 = rateOfChange(closes, 5);
  const roc10 = rateOfChange(closes, 10);
  const roc20 = rateOfChange(closes, 20);
  const rsiSeries = rsi(closes, 14);
  const rsiNow = ind.rsi;
  const rsiBack = rsiSeries[rsiSeries.length - 4] ?? rsiNow;
  const rsiSlope = rsiNow - (rsiBack ?? rsiNow);

  const volMa = sma(volumes, 20);
  const volNow = volMa[volMa.length - 1] ?? 0;
  const volPrev = volMa[Math.max(0, volMa.length - 11)] ?? volNow;
  const volumeTrend = volPrev ? ((volNow - volPrev) / volPrev) * 100 : 0;

  const raw =
    clamp(roc5 * 2.2, -22, 22) +
    clamp(roc10 * 1.2, -18, 18) +
    clamp(roc20 * 0.6, -14, 14) +
    clamp(rsiSlope * 1.1, -14, 14) +
    clamp(ind.macd.histogram > ind.macd.previousHistogram ? 10 : -8, -10, 10) +
    clamp(volumeTrend * 0.25, -10, 10);
  const score = clamp(50 + raw, 0, 100);

  const label: MomentumSignal["label"] =
    score >= 78 ? "ACCELERATING" : score >= 60 ? "INCREASING" : score >= 44 ? "STABLE" : score >= 30 ? "DECREASING" : "FADING";

  return {
    label,
    score: round(score, 1),
    roc5: round(roc5, 2),
    roc10: round(roc10, 2),
    roc20: round(roc20, 2),
    rsiSlope: round(rsiSlope, 2),
    volumeTrend: round(volumeTrend, 2),
  };
}

function rsiComponent(ind: TechnicalIndicators, trend: TrendLabel): ScoreComponent {
  const max = SCORE_WEIGHTS.rsi;
  const r = ind.rsi;
  const bullishContext = trend === "BULLISH" || trend === "STRONG_BULLISH";
  let score: number;
  let reason: string;

  if (r >= 55 && r <= 70) {
    score = max * 0.92;
    reason = `RSI ${r.toFixed(1)} sits in the healthy bullish momentum band (50–70).`;
  } else if (r > 70 && r <= 80) {
    score = bullishContext ? max * 0.72 : max * 0.42;
    reason = bullishContext
      ? `RSI ${r.toFixed(1)} is overbought but consistent with a strong trend — momentum still intact.`
      : `RSI ${r.toFixed(1)} is overbought without trend confirmation — extension risk.`;
  } else if (r > 80) {
    score = bullishContext ? max * 0.5 : max * 0.22;
    reason = `RSI ${r.toFixed(1)} is deeply overbought; risk of mean reversion increases.`;
  } else if (r >= 50 && r < 55) {
    score = max * 0.72;
    reason = `RSI ${r.toFixed(1)} just reclaimed the 50 midline — early momentum shift.`;
  } else if (r >= 40 && r < 50) {
    score = max * 0.42;
    reason = `RSI ${r.toFixed(1)} is weak/neutral, momentum not confirmed yet.`;
  } else if (r >= 30 && r < 40) {
    score = ind.rsi > ind.rsiPrevious ? max * 0.38 : max * 0.2;
    reason = `RSI ${r.toFixed(1)} is weak${ind.rsi > ind.rsiPrevious ? " but turning up" : " and still falling"}.`;
  } else {
    score = bullishContext ? max * 0.55 : max * 0.3;
    reason = `RSI ${r.toFixed(1)} is oversold — potential reversion zone, needs confirmation.`;
  }
  return { key: "rsi", label: "RSI", score: round(score, 1), max, reason };
}

function macdComponent(ind: TechnicalIndicators): ScoreComponent {
  const max = SCORE_WEIGHTS.macd;
  const m = ind.macd;
  let score = max * 0.3;
  const notes: string[] = [];
  if (m.crossover === "BULLISH") {
    score = max * 0.95;
    notes.push("fresh bullish crossover");
  } else if (m.macd > m.signal) {
    score = max * 0.78;
    notes.push("MACD above signal line");
  } else if (m.crossover === "BEARISH") {
    score = max * 0.14;
    notes.push("fresh bearish crossover");
  } else {
    score = max * 0.3;
    notes.push("MACD below signal line");
  }
  if (m.histogramDirection === "INCREASING") {
    score = Math.min(max, score + max * 0.1);
    notes.push("histogram expanding");
  } else if (m.histogramDirection === "DECREASING") {
    score = Math.max(0, score - max * 0.12);
    notes.push("histogram contracting");
  }
  if (m.aboveZero) {
    score = Math.min(max, score + max * 0.06);
    notes.push("above zero line");
  } else {
    score = Math.max(0, score - max * 0.06);
    notes.push("below zero line");
  }
  return { key: "macd", label: "MACD", score: round(score, 1), max, reason: `MACD(12,26,9): ${notes.join(", ")}.` };
}

function emaComponent(ind: TechnicalIndicators): ScoreComponent {
  const max = SCORE_WEIGHTS.emaTrend;
  let score = 0;
  const notes: string[] = [];
  if (ind.ema20 > ind.ema50) {
    score += max * 0.3;
    notes.push("EMA20 > EMA50");
  }
  if (ind.ema50 > ind.ema200) {
    score += max * 0.3;
    notes.push("EMA50 > EMA200");
  }
  if (ind.price > ind.ema20) {
    score += max * 0.2;
    notes.push("price above EMA20");
  }
  if (ind.price > ind.ema200) {
    score += max * 0.2;
    notes.push("price above EMA200");
  }
  if (ind.goldenCross) {
    score = Math.min(max, score + max * 0.1);
    notes.push("golden cross (SMA50/200)");
  }
  if (ind.deathCross) {
    score = Math.max(0, score - max * 0.2);
    notes.push("death cross (SMA50/200)");
  }
  if (!notes.length) notes.push("moving averages stacked bearishly");
  return { key: "emaTrend", label: "EMA Trend", score: round(score, 1), max, reason: `${notes.join(", ")}.` };
}

function volumeComponent(ind: TechnicalIndicators): ScoreComponent {
  const max = SCORE_WEIGHTS.volume;
  const ratio = ind.volume.ratio;
  let score: number;
  if (ratio >= 3) score = max * 0.95;
  else if (ratio >= 2) score = max * 0.88;
  else if (ratio >= 1.5) score = max * 0.76;
  else if (ratio >= 1.2) score = max * 0.6;
  else if (ratio >= 0.9) score = max * 0.42;
  else score = max * 0.22;

  if (ind.volume.accumulation === "ACCUMULATION") score = Math.min(max, score + max * 0.08);
  if (ind.volume.accumulation === "DISTRIBUTION") score = Math.max(0, score - max * 0.12);
  if (ind.volume.acceleration > 10) score = Math.min(max, score + max * 0.05);

  return {
    key: "volume",
    label: "Volume",
    score: round(score, 1),
    max,
    reason: `Volume ratio ${ratio.toFixed(2)}× (20-bar avg), state ${ind.volume.state}, OBV shows ${ind.volume.accumulation.toLowerCase()}.`,
  };
}

function breakoutComponent(breakout: BreakoutSignal): ScoreComponent {
  const max = SCORE_WEIGHTS.breakout;
  const score = (breakout.probability / 100) * max;
  return {
    key: "breakout",
    label: "Breakout",
    score: round(score, 1),
    max,
    reason: `Breakout model score ${breakout.probability.toFixed(0)}/100 (${breakout.probabilityLabel}) with status ${breakout.status}.`,
  };
}

function adxComponent(ind: TechnicalIndicators): ScoreComponent {
  const max = SCORE_WEIGHTS.adx;
  const a = ind.adx.adx;
  let score: number;
  if (a >= 40) score = max * 0.95;
  else if (a >= 25) score = max * 0.85;
  else if (a >= 20) score = max * 0.6;
  else score = max * 0.3;
  if (!ind.adx.rising) score *= 0.85;
  if (ind.adx.minusDi > ind.adx.plusDi) score *= 0.6;
  return {
    key: "adx",
    label: "ADX",
    score: round(score, 1),
    max,
    reason: `ADX ${a.toFixed(1)} (${ind.adx.strength.replace("_", " ").toLowerCase()}), ${ind.adx.rising ? "rising" : "flat/falling"}, +DI ${ind.adx.plusDi.toFixed(1)} vs -DI ${ind.adx.minusDi.toFixed(1)}.`,
  };
}

function priceActionComponent(ind: TechnicalIndicators): ScoreComponent {
  const max = SCORE_WEIGHTS.priceAction;
  const pa = ind.priceAction;
  let score = max * 0.35;
  const notes: string[] = [];
  if (pa.structure === "UPTREND") {
    score = max * 0.85;
    notes.push("higher highs & higher lows");
  } else if (pa.structure === "DOWNTREND") {
    score = max * 0.15;
    notes.push("lower highs & lower lows");
  } else {
    notes.push("range-bound structure");
  }
  if (pa.higherLows && pa.structure !== "UPTREND") {
    score = Math.min(max, score + max * 0.18);
    notes.push("higher lows forming");
  }
  if (pa.distanceFrom20BarHigh < 2) {
    score = Math.min(max, score + max * 0.12);
    notes.push(`only ${pa.distanceFrom20BarHigh.toFixed(1)}% from the 20-bar high`);
  }
  if (pa.bodyStrength > 60) {
    score = Math.min(max, score + max * 0.05);
    notes.push("decisive candle body");
  }
  if (ind.bollinger.squeeze) notes.push("Bollinger squeeze active");
  return { key: "priceAction", label: "Price Action", score: round(score, 1), max, reason: `${notes.join(", ")}.` };
}

function sentimentComponent(regime: MarketRegime | "UNKNOWN", newsScore: number | null): ScoreComponent {
  const max = SCORE_WEIGHTS.sentiment;
  let base = max * 0.5;
  if (regime === "BULL") base = max * 0.9;
  else if (regime === "BEAR") base = max * 0.2;
  else if (regime === "HIGH_VOLATILITY") base = max * 0.45;
  else if (regime === "UNKNOWN") base = max * 0.5;

  // No sentiment feed → neutral baseline, stated explicitly. Never invented.
  const adj = newsScore === null ? clamp(base, 0, max) : clamp(base + (newsScore / 100) * max * 0.4, 0, max);
  const regimeText = regime === "UNKNOWN" ? "unavailable" : regime.replace("_", " ").toLowerCase();
  return {
    key: "sentiment",
    label: "Market Sentiment",
    score: round(adj, 1),
    max,
    reason:
      newsScore === null
        ? `Market regime ${regimeText}; news sentiment unavailable, neutral baseline applied.`
        : `Market regime ${regimeText}, news sentiment score ${newsScore.toFixed(0)}/100.`,
  };
}

export interface ScoreContext {
  indicators: TechnicalIndicators;
  breakout: BreakoutSignal;
  momentum: MomentumSignal;
  regime: MarketRegime | "UNKNOWN";
  /** Null when no sentiment feed is available (REAL mode without a news vendor). */
  newsScore: number | null;
  riskPreference?: UserSettings["riskPreference"];
}

export function calculateTechnicalScore(ctx: ScoreContext): AIScore {
  const trend = detectTrend(ctx.indicators);
  const components: ScoreComponent[] = [
    rsiComponent(ctx.indicators, trend),
    macdComponent(ctx.indicators),
    emaComponent(ctx.indicators),
    volumeComponent(ctx.indicators),
    breakoutComponent(ctx.breakout),
    adxComponent(ctx.indicators),
    priceActionComponent(ctx.indicators),
    sentimentComponent(ctx.regime, ctx.newsScore),
  ];

  let total = components.reduce((sum, c) => sum + c.score, 0);

  // Risk preference only tilts the ranking, it never guarantees an outcome.
  if (ctx.riskPreference === "CONSERVATIVE") {
    if (ctx.indicators.atrPercent > 6) total -= 6;
    if (ctx.indicators.rsi > 75) total -= 4;
    if (ctx.indicators.adx.adx > 25 && trend.includes("BULLISH")) total += 2;
  } else if (ctx.riskPreference === "AGGRESSIVE") {
    if (ctx.momentum.score > 70) total += 4;
    if (ctx.indicators.volume.ratio > 2) total += 2;
  }

  const score = round(clamp(total, 0, 100), 1);
  const signals: string[] = [];
  if (ctx.indicators.macd.crossover === "BULLISH") signals.push("MACD bullish crossover");
  if (ctx.indicators.macd.crossover === "BEARISH") signals.push("MACD bearish crossover");
  if (ctx.indicators.emaAlignment === "BULLISH") signals.push("EMA alignment bullish");
  if (ctx.indicators.goldenCross) signals.push("Golden cross");
  if (ctx.indicators.deathCross) signals.push("Death cross");
  if (ctx.indicators.volume.ratio >= 2) signals.push("Volume spike");
  if (ctx.indicators.bollinger.squeeze) signals.push("Bollinger squeeze");
  if (ctx.indicators.bollinger.position === "ABOVE_UPPER") signals.push("Upper band breakout");
  if (ctx.indicators.bollinger.position === "BELOW_LOWER") signals.push("Lower band breakdown");
  if (ctx.indicators.rsiState === "OVERSOLD") signals.push("RSI oversold");
  if (ctx.indicators.rsiState === "OVERBOUGHT") signals.push("RSI overbought");
  if (ctx.indicators.adx.adx >= 25) signals.push(`ADX ${ctx.indicators.adx.adx.toFixed(0)} trend strength`);
  if (ctx.breakout.status === "EARLY") signals.push("Early breakout candidate");
  if (ctx.breakout.status === "CONFIRMED") signals.push("Breakout confirmed by volume");
  if (ctx.indicators.volume.accumulation === "ACCUMULATION") signals.push("Accumulation detected");

  return {
    score,
    grade: score >= 85 ? "A+" : score >= 75 ? "A" : score >= 60 ? "B" : score >= 45 ? "C" : "D",
    components,
    trend,
    momentum: ctx.momentum.label,
    signals,
    setupQuality: score >= 82 ? "PREMIUM" : score >= 68 ? "GOOD" : score >= 50 ? "AVERAGE" : "POOR",
  };
}

export function calculateRiskScore(
  candles: Candle[],
  ind: TechnicalIndicators,
  levels: LevelMap,
  regime: MarketRegime | "UNKNOWN",
): RiskScore {
  const components: ScoreComponent[] = [];
  const notes: string[] = [];

  const volRisk = clamp((ind.atrPercent / 9) * 22, 0, 22);
  components.push({
    key: "volatility",
    label: "Volatility (ATR)",
    score: round(volRisk, 1),
    max: 22,
    reason: `ATR is ${ind.atrPercent.toFixed(2)}% of price.`,
  });
  if (ind.atrPercent > 6) notes.push("Elevated volatility — position sizing matters.");

  const recent = candles.slice(-60);
  const peak = Math.max(...recent.map((c) => c.high));
  const drawdown = ((peak - ind.price) / peak) * 100;
  const ddRisk = clamp((drawdown / 35) * 18, 0, 18);
  components.push({
    key: "drawdown",
    label: "Drawdown from 60-bar high",
    score: round(ddRisk, 1),
    max: 18,
    reason: `Price is ${drawdown.toFixed(1)}% below the 60-bar peak.`,
  });

  const vols = candles.slice(-30).map((c) => c.volume);
  const meanVol = vols.reduce((a, b) => a + b, 0) / (vols.length || 1);
  const varVol = vols.reduce((a, b) => a + (b - meanVol) ** 2, 0) / (vols.length || 1);
  const cv = meanVol ? Math.sqrt(varVol) / meanVol : 0;
  const volInstability = clamp(cv * 22, 0, 14);
  components.push({
    key: "volumeInstability",
    label: "Volume instability",
    score: round(volInstability, 1),
    max: 14,
    reason: `Volume coefficient of variation ${cv.toFixed(2)} over 30 bars.`,
  });

  const turnover = ind.volume.average20 * ind.price;
  const liquidityRisk = turnover > 5e9 ? 2 : turnover > 5e8 ? 5 : turnover > 5e7 ? 9 : 14;
  components.push({
    key: "liquidity",
    label: "Liquidity",
    score: liquidityRisk,
    max: 14,
    reason: `Average 20-bar turnover ≈ ${turnover.toExponential(2)}.`,
  });
  if (liquidityRisk >= 12) notes.push("Thin liquidity can widen slippage.");

  const res = levels.resistance1?.price ?? ind.price * 1.05;
  const distance = ((res - ind.price) / ind.price) * 100;
  const proximityRisk = clamp(12 - Math.abs(distance) * 1.2, 0, 12);
  components.push({
    key: "resistance",
    label: "Distance from resistance",
    score: round(proximityRisk, 1),
    max: 12,
    reason: `Nearest resistance is ${distance.toFixed(2)}% away — overhead supply can cap upside.`,
  });

  const overbought = ind.rsi > 70 ? clamp((ind.rsi - 70) * 1.1, 0, 12) : 0;
  components.push({
    key: "overbought",
    label: "Overbought condition",
    score: round(overbought, 1),
    max: 12,
    reason: ind.rsi > 70 ? `RSI ${ind.rsi.toFixed(1)} is in overbought territory.` : `RSI ${ind.rsi.toFixed(1)} is not overbought.`,
  });

  const regimeRisk =
    regime === "BEAR" ? 8 : regime === "HIGH_VOLATILITY" ? 6 : regime === "SIDEWAYS" ? 4 : regime === "UNKNOWN" ? 4 : 1.5;
  components.push({
    key: "regime",
    label: "Market trend",
    score: regimeRisk,
    max: 8,
    reason:
      regime === "UNKNOWN"
        ? "Broader market regime is unavailable; a neutral risk contribution is applied."
        : `Broader regime is ${regime.replace("_", " ").toLowerCase()}.`,
  });

  const total = clamp(components.reduce((s, c) => s + c.score, 0), 0, 100);
  const label = total < 30 ? "LOW" : total < 50 ? "MEDIUM" : total < 72 ? "HIGH" : "EXTREME";
  if (label === "EXTREME") notes.push("Extreme risk profile — treat any setup as speculative.");
  if (!notes.length) notes.push("No dominant risk factor detected in the current window.");

  return { score: round(total, 1), label, components, notes };
}
