import type { AIAnalysisReport, AIAnalysisSection, AssetAnalysis, MarketId, Timeframe } from "@/types/market";
import { analyzeAsset } from "@/lib/engine/analyze";
import { getNews } from "@/lib/news/news-service";
import { formatPercent, formatPrice } from "@/lib/utils";
import { aiVendor } from "@/server/env";

export type AnalysisType = "FULL" | "TECHNICAL" | "BREAKOUT" | "RISK";

const DISCLAIMER =
  "This report is an automated analytical summary generated from structured market data. It is not financial advice and does not guarantee any outcome.";

function tone(value: number, positive = 60, negative = 40): AIAnalysisSection["tone"] {
  if (value >= positive) return "POSITIVE";
  if (value <= negative) return "NEGATIVE";
  return "NEUTRAL";
}

/** Deterministic, data-grounded narrative. The model never invents numbers. */
function buildSections(a: AssetAnalysis, type: AnalysisType): AIAnalysisSection[] {
  const c = a.currency;
  const ind = a.indicators;
  const sections: AIAnalysisSection[] = [];

  sections.push({
    title: "Market Trend",
    tone: a.aiScore.trend.includes("BULLISH") ? "POSITIVE" : a.aiScore.trend.includes("BEARISH") ? "NEGATIVE" : "NEUTRAL",
    body: `${a.symbol} is trading at ${formatPrice(a.price, c)} (${formatPercent(a.changePercent)}) on the ${a.timeframe} timeframe. Trend classification is ${a.aiScore.trend.replace("_", " ").toLowerCase()} with EMA structure ${ind.emaAlignment.toLowerCase()} (EMA20 ${formatPrice(ind.ema20, c)}, EMA50 ${formatPrice(ind.ema50, c)}, EMA200 ${formatPrice(ind.ema200, c)}). ADX reads ${ind.adx.adx.toFixed(1)} (${ind.adx.strength.replace("_", " ").toLowerCase()}), +DI ${ind.adx.plusDi.toFixed(1)} vs -DI ${ind.adx.minusDi.toFixed(1)}. Broader ${a.market} regime is ${a.regime.replace("_", " ").toLowerCase()}.`,
  });

  sections.push({
    title: "Momentum",
    tone: tone(a.momentum.score),
    body: `Momentum score is ${a.momentum.score.toFixed(0)}/100 and classified as ${a.momentum.label.toLowerCase()}. Rate of change: 5-bar ${formatPercent(a.momentum.roc5)}, 10-bar ${formatPercent(a.momentum.roc10)}, 20-bar ${formatPercent(a.momentum.roc20)}. RSI(14) is ${ind.rsi.toFixed(1)} (${ind.rsiState.toLowerCase()}) with a ${a.momentum.rsiSlope >= 0 ? "positive" : "negative"} 3-bar slope of ${a.momentum.rsiSlope.toFixed(2)}.`,
  });

  sections.push({
    title: "Technical Condition",
    tone: tone(a.aiScore.score, 68, 45),
    body: `MACD(12,26,9) is ${ind.macd.macd > ind.macd.signal ? "above" : "below"} its signal line with histogram ${ind.macd.histogram.toFixed(4)} and ${ind.macd.histogramDirection.toLowerCase()} momentum${ind.macd.crossover !== "NONE" ? `; a ${ind.macd.crossover.toLowerCase()} crossover just printed` : ""}. Bollinger position is ${ind.bollinger.position.replace("_", " ").toLowerCase()} with band width percentile ${ind.bollinger.widthPercentile.toFixed(0)}${ind.bollinger.squeeze ? " (squeeze active — volatility compression often precedes expansion)" : ""}. ATR is ${ind.atr.toFixed(4)} (${ind.atrPercent.toFixed(2)}% of price).`,
  });

  sections.push({
    title: "Volume",
    tone: ind.volume.ratio >= 1.4 ? "POSITIVE" : ind.volume.ratio < 0.8 ? "NEGATIVE" : "NEUTRAL",
    body: `Current volume is ${ind.volume.ratio.toFixed(2)}× the 20-bar average (state: ${ind.volume.state.toLowerCase()}), with volume base ${ind.volume.acceleration >= 0 ? "accelerating" : "decelerating"} ${Math.abs(ind.volume.acceleration).toFixed(1)}% over the last 5 bars. On-balance volume slope of ${ind.volume.obvSlope.toFixed(2)}% points to ${ind.volume.accumulation.toLowerCase()}.`,
  });

  sections.push({
    title: "Support",
    tone: "NEUTRAL",
    body: `Support 1: ${a.levels.support1 ? formatPrice(a.levels.support1.price, c) : "N/A"}${a.levels.support1 ? ` (strength ${a.levels.support1.strength.toFixed(0)}/100, ${a.levels.support1.touches} touches)` : ""}. Support 2: ${a.levels.support2 ? formatPrice(a.levels.support2.price, c) : "N/A"}.`,
  });

  sections.push({
    title: "Resistance",
    tone: "NEUTRAL",
    body: `Resistance 1: ${a.levels.resistance1 ? formatPrice(a.levels.resistance1.price, c) : "N/A"}${a.breakout.distanceToResistance !== null ? ` — ${a.breakout.distanceToResistance.toFixed(2)}% above spot` : ""}. Resistance 2: ${a.levels.resistance2 ? formatPrice(a.levels.resistance2.price, c) : "N/A"}.`,
  });

  sections.push({
    title: "Breakout Setup",
    tone: tone(a.breakout.probability, 61, 30),
    body: `Breakout model score ${a.breakout.probability.toFixed(0)}/100 (${a.breakout.probabilityLabel.replace("_", " ").toLowerCase()}), status ${a.breakout.status}. Volume confirmation: ${a.breakout.volumeConfirmed ? "present" : "not present"}. Estimated false-breakout risk ${a.breakout.falseBreakoutRisk.toFixed(0)}/100. Checklist passed: ${a.breakout.checklist.filter((x) => x.passed).length}/${a.breakout.checklist.length}. This score is a weighted model output, not a statistical probability.`,
  });

  sections.push({
    title: "Risk",
    tone: a.riskScore.score < 35 ? "POSITIVE" : a.riskScore.score > 62 ? "NEGATIVE" : "NEUTRAL",
    body: `Risk score ${a.riskScore.score.toFixed(0)}/100 (${a.riskScore.label}). Main contributors: ${[...a.riskScore.components]
      .sort((x, y) => y.score - x.score)
      .slice(0, 3)
      .map((x) => `${x.label} ${x.score.toFixed(1)}/${x.max}`)
      .join(", ")}. ${a.riskScore.notes[0]}`,
  });

  if (type === "FULL" || type === "BREAKOUT") {
    sections.push({
      title: "Potential Scenario",
      tone: tone(a.aiScore.score, 68, 45),
      body: `Analytical setup (${a.setup.bias}): entry zone ${formatPrice(a.setup.entryLow, c)} – ${formatPrice(a.setup.entryHigh, c)}, invalidation ${formatPrice(a.setup.stopLoss, c)}, targets ${formatPrice(a.setup.takeProfit1, c)} / ${formatPrice(a.setup.takeProfit2, c)} / ${formatPrice(a.setup.takeProfit3, c)} with a modelled risk/reward of ${a.setup.riskReward.toFixed(2)}. Method: ${a.setup.method} ${a.setup.disclaimer}`,
    });
  }

  return sections;
}

function buildScenarios(a: AssetAnalysis) {
  const c = a.currency;
  const r1 = a.levels.resistance1?.price ?? a.price * 1.04;
  const r2 = a.levels.resistance2?.price ?? a.price * 1.08;
  const s1 = a.levels.support1?.price ?? a.price * 0.96;
  const s2 = a.levels.support2?.price ?? a.price * 0.92;
  return {
    bullish: `Acceptance above ${formatPrice(r1, c)} with volume holding above ${(a.indicators.volume.average20 * 1.4).toExponential(2)} would keep the ${a.aiScore.trend.replace("_", " ").toLowerCase()} structure intact and open the ${formatPrice(r2, c)} area. Confirmation would require RSI staying above 50 and MACD holding its bullish posture.`,
    neutral: `Failure to clear ${formatPrice(r1, c)} while holding ${formatPrice(s1, c)} keeps price inside its current range. Bollinger width percentile ${a.indicators.bollinger.widthPercentile.toFixed(0)} suggests ${a.indicators.bollinger.squeeze ? "compression that can resolve either way" : "an ongoing balance phase"}.`,
    bearish: `Loss of ${formatPrice(s1, c)} on expanding volume would invalidate the current structure and expose ${formatPrice(s2, c)}. A MACD bearish crossover plus ADX turning down would strengthen that read.`,
  };
}

async function tryLlmConclusion(payload: object): Promise<string | null> {
  const config = aiVendor();
  const apiKey = config.apiKey;
  const baseUrl = config.baseUrl;
  const model = config.model;
  if (!apiKey || !baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 320,
        messages: [
          {
            role: "system",
            content:
              "You are a market analyst. Use ONLY the structured JSON data provided. Never invent prices or numbers. Never promise profits. Reply with 3-5 sentences of neutral analytical language.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function generateAnalysis(
  symbol: string,
  market: MarketId,
  timeframe: Timeframe = "1D",
  type: AnalysisType = "FULL",
): Promise<AIAnalysisReport> {
  const analysis = await analyzeAsset(symbol, market, { timeframe });
  const sections = buildSections(analysis, type);
  const scenarios = buildScenarios(analysis);
  const news = await getNews({ market, symbol, limit: 4 });

  const structured = {
    symbol: analysis.symbol,
    timeframe,
    price: analysis.price,
    changePercent: analysis.changePercent,
    trend: analysis.aiScore.trend,
    aiScore: analysis.aiScore.score,
    riskScore: analysis.riskScore.score,
    momentum: analysis.momentum,
    rsi: analysis.indicators.rsi,
    macd: analysis.indicators.macd,
    adx: analysis.indicators.adx,
    volume: analysis.indicators.volume,
    levels: {
      support1: analysis.levels.support1?.price ?? null,
      support2: analysis.levels.support2?.price ?? null,
      resistance1: analysis.levels.resistance1?.price ?? null,
      resistance2: analysis.levels.resistance2?.price ?? null,
    },
    breakout: analysis.breakout,
    newsSentiment: news.available ? news.aggregate : null,
    dataQuality: analysis.quality,
    dataSource: analysis.meta.dataSource,
    dataMode: analysis.meta.mode,
    asOf: analysis.meta.asOf,
  };

  // ---- Data validation gate -------------------------------------------------
  // Before any conclusion is produced, verify the inputs are real and fresh.
  // A stale or unavailable feed must not yield an aggressive signal.
  const asOfMs = analysis.meta.asOf ? Date.parse(analysis.meta.asOf) : NaN;
  const ageSeconds = Number.isFinite(asOfMs) ? Math.round((Date.now() - asOfMs) / 1000) : null;
  const staleThreshold = Number(process.env.AI_STALE_THRESHOLD_SECONDS ?? 3600);
  const hasOhlc = Number.isFinite(analysis.price) && analysis.price > 0;
  const hasVolume = Number.isFinite(analysis.volume);
  const dataUnavailable = analysis.quality === "UNAVAILABLE";
  const isStale = dataUnavailable || !hasOhlc || (ageSeconds !== null && ageSeconds > staleThreshold);

  if (isStale) {
    const reason = dataUnavailable
      ? `provider reported ${analysis.meta.dataSource} data as UNAVAILABLE`
      : !hasOhlc
        ? "price/OHLC data is missing"
        : `the latest bar is ${ageSeconds}s old (threshold ${staleThreshold}s)`;
    sections.unshift({
      title: "DATA STALE",
      tone: "NEGATIVE",
      body: `Signal generation was withheld because ${reason}. Provider: ${analysis.meta.dataSource} (${analysis.quality})${!hasVolume ? "; volume unavailable" : ""}. Refresh once the provider recovers.`,
    });
  }

  const llm = isStale ? null : await tryLlmConclusion(structured);
  const newsSentence = news.available
    ? `News flow across ${news.items.length} recent items reads ${news.aggregate.label.toLowerCase()}.`
    : `News sentiment is unavailable (${news.reason ?? "no news vendor configured"}), so it contributes a neutral baseline only.`;
  if (isStale) {
    return {
      symbol: analysis.symbol,
      name: analysis.name,
      market,
      timeframe,
      analysisType: type,
      generatedAt: new Date().toISOString(),
      engine: "MarketAI rule-based analyst v1 (data validation gate)",
      sections,
      scenarios,
      conclusion: `DATA STALE — no directional signal issued for ${analysis.symbol}. The market data underpinning this report could not be validated as current (${analysis.meta.dataSource}, ${analysis.quality}${ageSeconds !== null ? `, ${ageSeconds}s old` : ""}). Scores shown are historical context only, not a trade signal.`,
      aiScore: analysis.aiScore.score,
      riskScore: analysis.riskScore.score,
      quality: analysis.quality,
      disclaimer: DISCLAIMER,
    };
  }

  const ruleConclusion = `${analysis.symbol} scores ${analysis.aiScore.score.toFixed(0)}/100 on the AI model (grade ${analysis.aiScore.grade}, setup quality ${analysis.aiScore.setupQuality.toLowerCase()}) with a ${analysis.riskScore.label.toLowerCase()} risk profile at ${analysis.riskScore.score.toFixed(0)}/100. Momentum is ${analysis.momentum.label.toLowerCase()} and the breakout module reports ${analysis.breakout.status} with a ${analysis.breakout.probability.toFixed(0)}/100 model score. ${newsSentence} Data source: ${analysis.meta.dataSource} (${analysis.meta.quality}). Treat all levels as analytical reference points, not instructions.`;

  return {
    symbol: analysis.symbol,
    name: analysis.name,
    market,
    timeframe,
    analysisType: type,
    generatedAt: new Date().toISOString(),
    engine: llm ? `LLM (${aiVendor().model}) + rule engine` : "MarketAI rule-based analyst v1",
    sections,
    scenarios,
    conclusion: llm ?? ruleConclusion,
    aiScore: analysis.aiScore.score,
    riskScore: analysis.riskScore.score,
    quality: analysis.quality,
    disclaimer: DISCLAIMER,
  };
}
