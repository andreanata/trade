import type {
  AIScore,
  BreakoutSignal,
  MarketId,
  MarketRegime,
  MemeTokenProfile,
  MomentumSignal,
  RiskScore,
  SignalComponent,
  SignalState,
  TechnicalIndicators,
  TradingSignal,
} from "@/types/market";
import { clamp, round } from "@/lib/utils";
import type { MemeThresholds } from "@/lib/meme/config";

/**
 * Transparent signal engine.
 *
 * Weights: Technical 30 · Momentum 15 · Volume 15 · Trend 10 · Breakout 10 ·
 *          Market structure 5 · News/Sentiment 5 · Risk & security 10
 *
 * For meme coins, security and liquidity have VETO POWER: a token with a critical
 * finding can never be rated BUY or STRONG BUY regardless of how bullish the chart is.
 * Every component reason references a real measured value.
 */
export const SIGNAL_WEIGHTS = {
  technical: 30,
  momentum: 15,
  volume: 15,
  trend: 10,
  breakout: 10,
  structure: 5,
  news: 5,
  risk: 10,
} as const;

const DISCLAIMER =
  "Data-driven, probability-based analysis. Signals can be wrong and are not financial advice.";

export interface SignalInput {
  market: MarketId;
  indicators: TechnicalIndicators;
  aiScore: AIScore;
  riskScore: RiskScore;
  momentum: MomentumSignal;
  breakout: BreakoutSignal;
  regime: MarketRegime | "UNKNOWN";
  /** 0..100, or null when no relevant news exists. */
  newsScore: number | null;
  memeProfile?: MemeTokenProfile | null;
  thresholds?: MemeThresholds;
  /** User opt-in required before an unverified meme token may be marked buyable. */
  allowUnverified?: boolean;
}

function component(
  key: keyof typeof SIGNAL_WEIGHTS,
  label: string,
  score: number,
  reason: string,
): SignalComponent {
  const weightPercent = SIGNAL_WEIGHTS[key];
  const bounded = clamp(score, 0, 100);
  return {
    key,
    label,
    weightPercent,
    score: round(bounded, 1),
    contribution: round((bounded / 100) * weightPercent, 2),
    reason,
  };
}

export function generateSignal(input: SignalInput): TradingSignal {
  const ind = input.indicators;
  const positives: string[] = [];
  const negatives: string[] = [];
  const vetoes: string[] = [];

  // 1. Technical (AI Score already blends RSI/MACD/EMA/Volume/Breakout/ADX/PA/sentiment)
  const technical = component(
    "technical",
    "Technical score",
    input.aiScore.score,
    `AI technical model ${input.aiScore.score.toFixed(0)}/100 (grade ${input.aiScore.grade}), RSI ${ind.rsi.toFixed(1)}, MACD histogram ${ind.macd.histogram.toFixed(6)}.`,
  );
  if (input.aiScore.score >= 70) positives.push(`Technical model ${input.aiScore.score.toFixed(0)}/100`);
  if (input.aiScore.score < 45) negatives.push(`Weak technical model score (${input.aiScore.score.toFixed(0)}/100)`);

  // 2. Momentum
  const momentum = component(
    "momentum",
    "Momentum",
    input.momentum.score,
    `Momentum ${input.momentum.label.toLowerCase()} (${input.momentum.score.toFixed(0)}/100); ROC 5/10/20 = ${input.momentum.roc5.toFixed(2)}% / ${input.momentum.roc10.toFixed(2)}% / ${input.momentum.roc20.toFixed(2)}%.`,
  );
  if (input.momentum.score >= 65) positives.push(`Momentum ${input.momentum.label.toLowerCase()}`);
  if (input.momentum.score < 40) negatives.push("Momentum fading");

  // 3. Volume
  const ratio = ind.volume.ratio;
  const volumeScore = ratio >= 3 ? 95 : ratio >= 2 ? 85 : ratio >= 1.5 ? 72 : ratio >= 1.1 ? 58 : ratio >= 0.8 ? 40 : 22;
  const volume = component(
    "volume",
    "Volume",
    volumeScore,
    `Volume ${ratio.toFixed(2)}× the 20-bar average (${ind.volume.state.toLowerCase()}), OBV shows ${ind.volume.accumulation.toLowerCase()}.`,
  );
  if (ratio >= 1.5) positives.push(`Volume ${ratio.toFixed(2)}× average`);
  if (ratio < 0.8) negatives.push("Volume below average");

  // 4. Trend
  const trendScore =
    input.aiScore.trend === "STRONG_BULLISH"
      ? 95
      : input.aiScore.trend === "BULLISH"
        ? 76
        : input.aiScore.trend === "NEUTRAL"
          ? 50
          : input.aiScore.trend === "BEARISH"
            ? 24
            : 8;
  const trend = component(
    "trend",
    "Trend",
    trendScore,
    `Trend ${input.aiScore.trend.replace("_", " ").toLowerCase()}; EMA20 ${ind.ema20 > ind.ema50 ? ">" : "<"} EMA50, ADX ${ind.adx.adx.toFixed(1)}.`,
  );
  if (trendScore >= 76) positives.push("EMA structure bullish");
  if (trendScore <= 24) negatives.push("Trend structure bearish");

  // 5. Breakout
  const breakout = component(
    "breakout",
    "Breakout",
    input.breakout.probability,
    `Breakout model ${input.breakout.probability.toFixed(0)}/100 (${input.breakout.status}), volume ${input.breakout.volumeConfirmed ? "confirmed" : "not confirmed"}.`,
  );
  if (input.breakout.probability >= 61) positives.push(`Breakout setup ${input.breakout.status.toLowerCase()}`);

  // 6. Market structure / regime
  const regimeScore =
    input.regime === "BULL" ? 85 : input.regime === "BEAR" ? 20 : input.regime === "HIGH_VOLATILITY" ? 40 : input.regime === "UNKNOWN" ? 50 : 55;
  const structure = component(
    "structure",
    "Market structure",
    regimeScore,
    input.regime === "UNKNOWN"
      ? "Market regime unavailable — neutral contribution applied."
      : `Market regime is ${input.regime.replace("_", " ").toLowerCase()}; price structure ${ind.priceAction.structure.toLowerCase()}.`,
  );

  // 7. News (null = no relevant coverage, explicitly neutral and flagged)
  const news = component(
    "news",
    "News sentiment",
    input.newsScore ?? 50,
    input.newsScore === null
      ? "No relevant news found for this asset — sentiment is unavailable, neutral contribution applied."
      : `Relevant news sentiment scores ${input.newsScore.toFixed(0)}/100.`,
  );
  if (input.newsScore !== null && input.newsScore >= 65) positives.push("Positive news flow");
  if (input.newsScore !== null && input.newsScore <= 35) negatives.push("Negative news flow");

  // 8. Risk & security (inverted: low risk = high score)
  const meme = input.memeProfile ?? null;
  const riskBase = meme ? meme.memeRisk.score : input.riskScore.score;
  const riskScoreValue = 100 - riskBase;
  const riskReason = meme
    ? `Meme risk ${meme.memeRisk.score.toFixed(0)}/100 (${meme.memeRisk.label}); security ${meme.security.status}; liquidity ${meme.liquidity.status.replace("_", " ").toLowerCase()}.`
    : `Risk score ${input.riskScore.score.toFixed(0)}/100 (${input.riskScore.label}); ATR ${ind.atrPercent.toFixed(2)}% of price.`;
  const risk = component("risk", "Risk & security", riskScoreValue, riskReason);
  if (riskBase >= 70) negatives.push(`High measured risk (${riskBase.toFixed(0)}/100)`);
  if (riskBase < 35) positives.push("Low measured risk");

  const components = [technical, momentum, volume, trend, breakout, structure, news, risk];
  const score = round(clamp(components.reduce((s, c) => s + c.contribution, 0), 0, 100), 1);

  // ---- Base state from the composite score -------------------------------
  let state: SignalState;
  if (score >= 78) state = "STRONG_BUY";
  else if (score >= 64) state = "BUY";
  else if (score >= 54) state = "WATCH";
  else if (score >= 42) state = "NEUTRAL";
  else if (score >= 28) state = "SELL";
  else state = "STRONG_SELL";

  // ---- Hard vetoes (meme coins) ------------------------------------------
  if (meme) {
    const sec = meme.security;
    const liq = meme.liquidity;
    const th = input.thresholds;

    if (sec.status === "HONEYPOT_DETECTED" || sec.honeypot === true) {
      vetoes.push("HONEYPOT_DETECTED — the security vendor reports this token cannot be sold normally.");
    }
    if (sec.criticalIssues.length > 0) {
      vetoes.push(`CRITICAL_CONTRACT_RISK — ${sec.criticalIssues.slice(0, 3).join(", ")}.`);
    }
    if (liq.status === "CRITICAL" || liq.status === "LOW_LIQUIDITY") {
      vetoes.push(
        `LIQUIDITY_TOO_LOW — $${(liq.usd ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} is below the $${liq.minRequiredUsd.toLocaleString("en-US")} minimum.`,
      );
    }
    if (meme.memeRisk.label === "EXTREME") {
      vetoes.push(`EXTREME_RISK — meme risk score ${meme.memeRisk.score.toFixed(0)}/100.`);
    }
    if (th) {
      const worstTax = Math.max(sec.buyTax ?? 0, sec.sellTax ?? 0);
      if (worstTax > Math.max(th.maxBuyTax, th.maxSellTax)) {
        vetoes.push(`TAX_TOO_HIGH — ${worstTax}% exceeds the configured limit.`);
      }
      if (meme.holders.top10Percent !== null && meme.holders.top10Percent > th.maxHolderConcentration) {
        negatives.push(`Top 10 holders control ${meme.holders.top10Percent.toFixed(1)}%`);
      }
    }

    const unverified = sec.status === "UNVERIFIED" || sec.status === "DATA_UNAVAILABLE";
    if (unverified && !input.allowUnverified) {
      // Default policy: UNVERIFIED = NOT BUYABLE (but not automatically AVOID).
      if (state === "STRONG_BUY" || state === "BUY") {
        state = "WATCH";
        negatives.push("Security data unavailable — buy states are disabled until the token is verified.");
      }
    }

    if (vetoes.length > 0) state = "AVOID";
  } else {
    // Non-meme markets: extreme risk downgrades but does not force AVOID.
    if (input.riskScore.label === "EXTREME" && (state === "STRONG_BUY" || state === "BUY")) {
      state = "WATCH";
      negatives.push("Extreme volatility/risk profile downgraded the signal.");
    }
  }

  const confidence: TradingSignal["confidence"] =
    vetoes.length > 0
      ? "HIGH"
      : meme && (meme.security.status === "UNVERIFIED" || meme.security.status === "DATA_UNAVAILABLE")
        ? "LOW"
        : input.newsScore === null || input.regime === "UNKNOWN"
          ? "MEDIUM"
          : "HIGH";

  const summary =
    state === "AVOID"
      ? `AVOID — ${vetoes[0]}`
      : `${state.replace("_", " ")} · conviction ${score.toFixed(0)}/100 from ${positives.length} supporting and ${negatives.length} opposing factors.`;

  return {
    state,
    score,
    components,
    positives,
    negatives,
    vetoes,
    confidence,
    summary,
    disclaimer: DISCLAIMER,
  };
}
