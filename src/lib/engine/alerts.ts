import type { AlertEvaluation, AlertMetric, AlertRule, AssetAnalysis } from "@/types/market";
import { analyzeAsset } from "@/lib/engine/analyze";
import { formatPrice } from "@/lib/utils";

export const ALERT_METRICS: { value: AlertMetric; label: string; unit: string; needsThreshold: boolean }[] = [
  { value: "PRICE_ABOVE", label: "Price crosses above", unit: "price", needsThreshold: true },
  { value: "PRICE_BELOW", label: "Price crosses below", unit: "price", needsThreshold: true },
  { value: "RSI_ABOVE", label: "RSI above", unit: "", needsThreshold: true },
  { value: "RSI_BELOW", label: "RSI below", unit: "", needsThreshold: true },
  { value: "MACD_BULLISH_CROSS", label: "MACD bullish crossover", unit: "", needsThreshold: false },
  { value: "MACD_BEARISH_CROSS", label: "MACD bearish crossover", unit: "", needsThreshold: false },
  { value: "VOLUME_RATIO_ABOVE", label: "Volume ratio above", unit: "×", needsThreshold: true },
  { value: "BREAKOUT_PROBABILITY_ABOVE", label: "Breakout score above", unit: "/100", needsThreshold: true },
  { value: "AI_SCORE_ABOVE", label: "AI Score above", unit: "/100", needsThreshold: true },
  { value: "RISK_SCORE_BELOW", label: "Risk Score below", unit: "/100", needsThreshold: true },
  { value: "RESISTANCE_BREAK", label: "Breaks Resistance 1", unit: "", needsThreshold: false },
];

export function evaluateRule(rule: AlertRule, a: AssetAnalysis): AlertEvaluation {
  let triggered = false;
  let currentValue: number | null = null;
  let message = "";

  switch (rule.metric) {
    case "PRICE_ABOVE":
      currentValue = a.price;
      triggered = a.price > rule.threshold;
      message = `Price ${formatPrice(a.price, a.currency)} vs trigger ${formatPrice(rule.threshold, a.currency)}`;
      break;
    case "PRICE_BELOW":
      currentValue = a.price;
      triggered = a.price < rule.threshold;
      message = `Price ${formatPrice(a.price, a.currency)} vs trigger ${formatPrice(rule.threshold, a.currency)}`;
      break;
    case "RSI_ABOVE":
      currentValue = a.indicators.rsi;
      triggered = a.indicators.rsi > rule.threshold;
      message = `RSI ${a.indicators.rsi.toFixed(1)} vs ${rule.threshold}`;
      break;
    case "RSI_BELOW":
      currentValue = a.indicators.rsi;
      triggered = a.indicators.rsi < rule.threshold;
      message = `RSI ${a.indicators.rsi.toFixed(1)} vs ${rule.threshold}`;
      break;
    case "MACD_BULLISH_CROSS":
      currentValue = a.indicators.macd.histogram;
      triggered = a.indicators.macd.crossover === "BULLISH";
      message = `MACD crossover state: ${a.indicators.macd.crossover}`;
      break;
    case "MACD_BEARISH_CROSS":
      currentValue = a.indicators.macd.histogram;
      triggered = a.indicators.macd.crossover === "BEARISH";
      message = `MACD crossover state: ${a.indicators.macd.crossover}`;
      break;
    case "VOLUME_RATIO_ABOVE":
      currentValue = a.indicators.volume.ratio;
      triggered = a.indicators.volume.ratio > rule.threshold;
      message = `Volume ratio ${a.indicators.volume.ratio.toFixed(2)}× vs ${rule.threshold}×`;
      break;
    case "BREAKOUT_PROBABILITY_ABOVE":
      currentValue = a.breakout.probability;
      triggered = a.breakout.probability > rule.threshold;
      message = `Breakout model score ${a.breakout.probability.toFixed(0)} vs ${rule.threshold}`;
      break;
    case "AI_SCORE_ABOVE":
      currentValue = a.aiScore.score;
      triggered = a.aiScore.score > rule.threshold;
      message = `AI Score ${a.aiScore.score.toFixed(0)} vs ${rule.threshold}`;
      break;
    case "RISK_SCORE_BELOW":
      currentValue = a.riskScore.score;
      triggered = a.riskScore.score < rule.threshold;
      message = `Risk Score ${a.riskScore.score.toFixed(0)} vs ${rule.threshold}`;
      break;
    case "RESISTANCE_BREAK":
    default: {
      const r1 = a.levels.resistance1?.price ?? null;
      currentValue = a.price;
      triggered = r1 !== null ? a.price > r1 : a.breakout.status === "BREAKOUT" || a.breakout.status === "CONFIRMED";
      message = r1
        ? `Price ${formatPrice(a.price, a.currency)} vs Resistance 1 ${formatPrice(r1, a.currency)}`
        : `Breakout status ${a.breakout.status}`;
      break;
    }
  }

  return { ...rule, triggered, currentValue, message, quality: a.quality };
}

export async function evaluateAlerts(rules: AlertRule[]): Promise<AlertEvaluation[]> {
  const evaluations = await Promise.all(
    rules.map(async (rule) => {
      try {
        const analysis = await analyzeAsset(rule.symbol, rule.market, { timeframe: rule.timeframe });
        return evaluateRule(rule, analysis);
      } catch {
        return {
          ...rule,
          triggered: false,
          currentValue: null,
          message: "Unable to fetch market data.",
          quality: "UNAVAILABLE" as const,
        };
      }
    }),
  );
  return evaluations;
}
