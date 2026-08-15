import type {
  AssetAnalysis,
  Candle,
  DataMeta,
  DataQuality,
  MarketId,
  MarketOverview,
  MemeTokenProfile,
  Quote,
  ScannerFilters,
  ScannerTag,
  SortKey,
  Timeframe,
  TokenRef,
  UserSettings,
} from "@/types/market";
import { INDEX_DEFINITIONS, findAsset, getUniverse } from "@/data/universe";
import { computeIndicators } from "@/lib/indicators";
import { buildSetup, computeLevels } from "@/lib/engine/levels";
import { detectBreakout } from "@/lib/engine/breakout";
import { calculateRiskScore, calculateTechnicalScore, computeMomentum, detectTrend } from "@/lib/engine/scoring";
import { generateSignal } from "@/lib/engine/signal";
import { readMarketRegime, regimeProxy } from "@/lib/engine/regime";
import { newsSentimentScore } from "@/lib/news/news-service";
import { dataMode, getMemeProvider, getProvider, isMockMode, mapLimit, unavailableMetaFor } from "@/providers";
import { ProviderUnavailableError, SymbolNotFoundError } from "@/providers/types";
import { memeAssetId, memeThresholds, parseMemeAssetId, type MemeThresholds } from "@/lib/meme/config";
import { tuning } from "@/server/env";
import { round } from "@/lib/utils";

const analysisCache = new Map<string, { at: number; value: AssetAnalysis }>();
const TTL_DEMO = 20_000;
const TTL_REAL = 30_000;

/** Worst quality wins so a stale/absent input can never be presented as LIVE. */
const QUALITY_RANK: Record<DataQuality, number> = {
  LIVE: 0,
  DELAYED: 1,
  HISTORICAL: 2,
  DEMO: 3,
  UNAVAILABLE: 4,
};

function mergeMeta(primary: DataMeta, secondary?: DataMeta | null): DataMeta {
  if (!secondary) return primary;
  const worst = QUALITY_RANK[secondary.quality] > QUALITY_RANK[primary.quality] ? secondary : primary;
  return {
    mode: primary.mode,
    quality: worst.quality,
    dataSource: primary.dataSource,
    providerId: primary.providerId,
    asOf: primary.asOf ?? secondary.asOf,
    delaySeconds: primary.delaySeconds ?? secondary.delaySeconds,
    note: primary.note ?? secondary.note ?? null,
  };
}

export interface AnalyzeOptions {
  timeframe?: Timeframe;
  bars?: number;
  riskPreference?: UserSettings["riskPreference"];
  memeThresholds?: Partial<MemeThresholds>;
  allowUnverified?: boolean;
}

function deriveTags(analysis: Omit<AssetAnalysis, "tags">): ScannerTag[] {
  const tags: ScannerTag[] = [];
  const { indicators: ind, aiScore, breakout, momentum } = analysis;
  if (aiScore.trend === "BULLISH" || aiScore.trend === "STRONG_BULLISH") tags.push("BULLISH_TREND");
  if (aiScore.trend === "BEARISH" || aiScore.trend === "STRONG_BEARISH") tags.push("BEARISH_TREND");
  if (momentum.label === "INCREASING" || momentum.label === "ACCELERATING") tags.push("MOMENTUM_INCREASING");
  if (momentum.label === "DECREASING" || momentum.label === "FADING") tags.push("MOMENTUM_DECREASING");
  if (ind.volume.ratio >= 2) tags.push("VOLUME_SPIKE");
  if (breakout.status === "BREAKOUT" || breakout.status === "CONFIRMED") tags.push("BREAKOUT");
  if (breakout.status === "EARLY") tags.push("APPROACHING_BREAKOUT");
  if (ind.rsiState === "OVERSOLD") tags.push("OVERSOLD");
  if (ind.rsiState === "OVERBOUGHT") tags.push("OVERBOUGHT");
  if (ind.volume.accumulation === "ACCUMULATION") tags.push("ACCUMULATION");
  if (ind.volume.accumulation === "DISTRIBUTION") tags.push("DISTRIBUTION");
  if (ind.bollinger.squeeze) tags.push("SQUEEZE");
  return tags;
}

/** Relevance terms used to filter news per market (never generic market noise). */
function relevanceTerms(market: MarketId, symbol: string, name: string, token?: TokenRef | null): string[] {
  if (market === "MEME" && token) {
    return [token.symbol, token.name, token.address].filter((t) => t && t.length >= 3);
  }
  return [symbol, name].filter((t) => t && t.length >= 3);
}

interface BuildInput {
  assetId: string;
  symbol: string;
  name: string;
  market: MarketId;
  sector: string;
  currency: string;
  timeframe: Timeframe;
  candles: Candle[];
  quote: Quote;
  riskPreference: UserSettings["riskPreference"];
  seriesMeta: DataMeta;
  memeProfile?: MemeTokenProfile | null;
  thresholds?: MemeThresholds;
  allowUnverified?: boolean;
}

/**
 * Composes the full analytical view for one asset.
 * Every indicator, level, score and signal below is computed from the OHLCV array
 * supplied by the active provider — in REAL mode that array is vendor data only.
 */
async function buildAnalysis(input: BuildInput): Promise<AssetAnalysis> {
  const { candles } = input;
  const indicators = computeIndicators(candles);
  const levels = computeLevels(candles, indicators.atr);
  const breakout = detectBreakout(candles, indicators, levels);
  const momentum = computeMomentum(candles, indicators);
  const regimeReading = await readMarketRegime(input.market);
  const token = input.memeProfile?.token ?? null;
  const newsScore = await newsSentimentScore(
    input.market,
    input.symbol,
    relevanceTerms(input.market, input.symbol, input.name, token),
  );

  const aiScore = calculateTechnicalScore({
    indicators,
    breakout,
    momentum,
    regime: regimeReading.regime,
    newsScore,
    riskPreference: input.riskPreference,
  });
  const riskScore = calculateRiskScore(candles, indicators, levels, regimeReading.regime);
  const trend = detectTrend(indicators);
  const bias = trend === "STRONG_BEARISH" || trend === "BEARISH" ? "SHORT" : trend === "NEUTRAL" ? "NEUTRAL" : "LONG";
  const setup = buildSetup(indicators.price, levels, indicators, bias);

  const signal = generateSignal({
    market: input.market,
    indicators,
    aiScore,
    riskScore,
    momentum,
    breakout,
    regime: regimeReading.regime,
    newsScore,
    memeProfile: input.memeProfile ?? null,
    thresholds: input.thresholds,
    allowUnverified: input.allowUnverified,
  });

  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? current;
  const change = current.close - previous.close;
  const meta = mergeMeta(input.seriesMeta, input.quote.meta);

  const base: Omit<AssetAnalysis, "tags"> = {
    assetId: input.assetId,
    symbol: input.symbol,
    name: input.name,
    market: input.market,
    sector: input.sector,
    currency: input.currency,
    token,
    memeProfile: input.memeProfile ?? null,
    signal,
    timeframe: input.timeframe,
    quality: meta.quality,
    meta,
    asOf: meta.asOf ?? new Date(current.time).toISOString(),
    price: current.close,
    change: round(change, 12),
    changePercent: round((change / (previous.close || 1)) * 100, 2),
    volume: current.volume,
    quote: input.quote,
    indicators,
    levels,
    aiScore,
    riskScore,
    momentum,
    breakout,
    setup,
    regime: regimeReading.regime === "UNKNOWN" ? "SIDEWAYS" : regimeReading.regime,
    sparkline: candles.slice(-40).map((c) => c.close),
  };

  return { ...base, tags: deriveTags(base) };
}

export async function analyzeAsset(
  symbol: string,
  market: MarketId,
  options: AnalyzeOptions = {},
): Promise<AssetAnalysis> {
  const timeframe = options.timeframe ?? "1D";
  const bars = options.bars ?? 320;
  const riskPreference = options.riskPreference ?? "BALANCED";
  const key = `${dataMode()}:${market}:${symbol.toUpperCase()}:${timeframe}:${bars}:${riskPreference}:${options.allowUnverified ? 1 : 0}`;
  const ttl = isMockMode() ? TTL_DEMO : TTL_REAL;
  const hit = analysisCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;

  const provider = getProvider(market);
  const reference = findAsset(symbol, market);

  // Meme tokens carry a full on-chain profile (liquidity + security + holders).
  let memeProfile: MemeTokenProfile | null = null;
  const thresholds = memeThresholds(options.memeThresholds);
  const memeProvider = market === "MEME" ? getMemeProvider() : null;
  if (memeProvider) {
    memeProfile = await memeProvider.getTokenProfile(symbol, options.memeThresholds ?? {});
  }

  const providerSymbol = memeProfile ? memeAssetId(memeProfile.token.chain, memeProfile.token.address) : symbol;

  const [series, quote] = await Promise.all([
    provider.getHistoricalData(providerSymbol, timeframe, bars),
    provider.getQuote(providerSymbol),
  ]);
  if (!series.candles.length) {
    throw new ProviderUnavailableError(provider.id, `No ${timeframe} candles for ${symbol}`, market);
  }

  const assetId = memeProfile
    ? memeAssetId(memeProfile.token.chain, memeProfile.token.address)
    : (quote.symbol || reference?.symbol || symbol.toUpperCase());

  const value = await buildAnalysis({
    assetId,
    symbol: memeProfile?.token.symbol || quote.symbol || reference?.symbol || symbol.toUpperCase(),
    name: memeProfile?.token.name || quote.name || reference?.name || symbol.toUpperCase(),
    market,
    sector: quote.sector || reference?.sector || "N/A",
    currency: quote.currency || reference?.currency || "USD",
    timeframe,
    candles: series.candles,
    quote,
    riskPreference,
    seriesMeta: series.meta,
    memeProfile,
    thresholds,
    allowUnverified: options.allowUnverified,
  });

  analysisCache.set(key, { at: Date.now(), value });
  if (analysisCache.size > 1200) {
    const stale = [...analysisCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 400);
    for (const [k] of stale) analysisCache.delete(k);
  }
  return value;
}

export interface MarketScanResult {
  rows: AssetAnalysis[];
  requested: number;
  unavailable: { symbol: string; market: MarketId; reason: string }[];
}

/** Universe cap in REAL mode so vendor rate limits are respected. */
function scanLimit(market: MarketId): number {
  if (isMockMode()) return Number.MAX_SAFE_INTEGER;
  if (market === "MEME") return Math.max(1, tuning.memeScanLimit);
  return Math.max(1, tuning.realScanLimit);
}

/** Candidate list per market: static reference for equities/crypto, live discovery for meme. */
async function marketCandidates(market: MarketId): Promise<{ id: string; label: string }[]> {
  const limit = scanLimit(market);
  if (market !== "MEME" || isMockMode()) {
    return getUniverse(market)
      .slice(0, limit)
      .map((a) => ({ id: a.symbol, label: a.symbol }));
  }
  const provider = getMemeProvider();
  if (!provider) return [];
  const discovered = await provider.discoverTrending(limit);
  return discovered.map((t) => ({ id: memeAssetId(t.chain, t.address), label: t.symbol }));
}

/**
 * Analyses a whole market.
 * REAL mode prefers vendor batch endpoints, caps the universe and records every
 * symbol it could not fetch — those symbols are omitted, never demo-filled.
 */
export async function analyzeMarketDetailed(
  market: MarketId | "ALL",
  options: AnalyzeOptions = {},
): Promise<MarketScanResult> {
  const timeframe = options.timeframe ?? "1D";
  const markets: MarketId[] = market === "ALL" ? ["US", "CRYPTO", "MEME"] : [market];
  const unavailable: { symbol: string; market: MarketId; reason: string }[] = [];
  const rows: AssetAnalysis[] = [];

  for (const target of markets) {
    const provider = getProvider(target);

    if (!isMockMode() && !provider.configured) {
      unavailable.push({
        symbol: `${target} universe`,
        market: target,
        reason: `${target} provider not configured (${provider.requiredEnv.join(", ")})`,
      });
      continue;
    }

    let candidates: { id: string; label: string }[] = [];
    try {
      candidates = await marketCandidates(target);
    } catch (error) {
      unavailable.push({
        symbol: `${target} discovery`,
        market: target,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    // Warm vendor batch endpoints where available (one request per N symbols).
    if (!isMockMode() && target !== "MEME") {
      const symbols = candidates.map((c) => c.id);
      const warmers: Promise<unknown>[] = [];
      // Each vendor exposes whichever batch endpoints it actually has: CoinGecko
      // batches quotes only, Twelve Data batches both.
      if (provider.getQuotes) warmers.push(provider.getQuotes(symbols));
      if (provider.getCandlesBatch) {
        warmers.push(provider.getCandlesBatch(symbols, timeframe, options.bars ?? 320));
      }
      if (warmers.length) {
        await Promise.allSettled(warmers);
      }
    }

    const concurrency = isMockMode() ? 16 : target === "MEME" ? 1 : 4;
    const results = await mapLimit(candidates, concurrency, async (candidate) => {
      try {
        return await analyzeAsset(candidate.id, target, options);
      } catch (error) {
        unavailable.push({
          symbol: candidate.label,
          market: target,
          reason: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    });
    for (const row of results) if (row) rows.push(row);
  }

  return { rows, requested: rows.length + unavailable.length, unavailable };
}

export async function analyzeMarket(
  market: MarketId | "ALL",
  options: AnalyzeOptions = {},
): Promise<AssetAnalysis[]> {
  const { rows } = await analyzeMarketDetailed(market, options);
  return rows;
}

const SIGNAL_RANK: Record<string, number> = {
  STRONG_BUY: 6,
  BUY: 5,
  WATCH: 4,
  NEUTRAL: 3,
  SELL: 2,
  STRONG_SELL: 1,
  AVOID: 0,
};

export function sortAnalyses(rows: AssetAnalysis[], sort: SortKey = "AI_SCORE"): AssetAnalysis[] {
  const copy = [...rows];
  switch (sort) {
    case "MOMENTUM":
      return copy.sort((a, b) => b.momentum.score - a.momentum.score);
    case "VOLUME":
      return copy.sort((a, b) => b.indicators.volume.ratio - a.indicators.volume.ratio);
    case "CHANGE":
      return copy.sort((a, b) => b.changePercent - a.changePercent);
    case "RISK_ASC":
      return copy.sort((a, b) => a.riskScore.score - b.riskScore.score);
    case "BREAKOUT":
      return copy.sort((a, b) => b.breakout.probability - a.breakout.probability);
    case "AI_SCORE":
    default:
      // Ranking never puts a vetoed (AVOID) token above a tradeable one, so a
      // +500% token with critical security risk cannot top the list.
      return copy.sort(
        (a, b) =>
          SIGNAL_RANK[b.signal.state] - SIGNAL_RANK[a.signal.state] ||
          b.aiScore.score - a.aiScore.score ||
          a.riskScore.score - b.riskScore.score,
      );
  }
}

export function applyFilters(rows: AssetAnalysis[], f: ScannerFilters): AssetAnalysis[] {
  return rows.filter((row) => {
    if (f.sector && f.sector !== "ALL" && row.sector !== f.sector) return false;
    if (f.minPrice !== undefined && row.price < f.minPrice) return false;
    if (f.maxPrice !== undefined && row.price > f.maxPrice) return false;
    if (f.minChange !== undefined && row.changePercent < f.minChange) return false;
    if (f.maxChange !== undefined && row.changePercent > f.maxChange) return false;
    if (f.minVolumeRatio !== undefined && row.indicators.volume.ratio < f.minVolumeRatio) return false;
    if (f.minRsi !== undefined && row.indicators.rsi < f.minRsi) return false;
    if (f.maxRsi !== undefined && row.indicators.rsi > f.maxRsi) return false;
    if (f.macd === "BULLISH" && row.indicators.macd.macd <= row.indicators.macd.signal) return false;
    if (f.macd === "BEARISH" && row.indicators.macd.macd >= row.indicators.macd.signal) return false;
    if (f.minAdx !== undefined && row.indicators.adx.adx < f.minAdx) return false;
    if (f.minAiScore !== undefined && row.aiScore.score < f.minAiScore) return false;
    if (f.maxRisk !== undefined && row.riskScore.score > f.maxRisk) return false;
    if (f.minBreakout !== undefined && row.breakout.probability < f.minBreakout) return false;
    if (f.trend === "BULLISH" && !row.aiScore.trend.includes("BULLISH")) return false;
    if (f.trend === "BEARISH" && !row.aiScore.trend.includes("BEARISH")) return false;
    if (f.tags?.length && !f.tags.every((tag) => row.tags.includes(tag))) return false;
    return true;
  });
}

export interface ScanResult {
  rows: AssetAnalysis[];
  total: number;
  scanned: number;
  unavailableCount: number;
  unavailable: { symbol: string; market: MarketId; reason: string }[];
  timeframe: Timeframe;
  quality: DataQuality;
  mode: "REAL" | "DEMO";
  generatedAt: string;
}

export async function runScan(
  filters: ScannerFilters,
  riskPreference?: UserSettings["riskPreference"],
  options: AnalyzeOptions = {},
): Promise<ScanResult> {
  const timeframe = filters.timeframe ?? "1D";
  const detailed = await analyzeMarketDetailed(filters.market ?? "ALL", {
    ...options,
    timeframe,
    riskPreference,
  });
  const filtered = applyFilters(detailed.rows, filters);
  const sorted = sortAnalyses(filtered, filters.sort ?? "AI_SCORE");
  const limit = filters.limit ?? 50;

  return {
    rows: sorted.slice(0, limit),
    total: filtered.length,
    scanned: detailed.rows.length,
    unavailableCount: detailed.unavailable.length,
    unavailable: detailed.unavailable.slice(0, 20),
    timeframe,
    quality: detailed.rows[0]?.quality ?? (isMockMode() ? "DEMO" : "UNAVAILABLE"),
    mode: dataMode(),
    generatedAt: new Date().toISOString(),
  };
}

export async function getMarketOverview(market: MarketId): Promise<MarketOverview> {
  const def = INDEX_DEFINITIONS[market];
  const reading = await readMarketRegime(market);
  const provider = getProvider(market);
  const status = await provider.getMarketStatus();
  const detailed = await analyzeMarketDetailed(market, { timeframe: "1D" });
  const rows = detailed.rows;

  const advancers = rows.filter((r) => r.changePercent > 0).length;
  const decliners = rows.length - advancers;
  const turnover = rows.length ? rows.reduce((s, r) => s + r.volume * r.price, 0) : null;

  const extras: Record<string, number | string | null> = {
    scannedAssets: rows.length,
    unavailableAssets: detailed.unavailable.length,
    proxySymbol: reading.proxySymbol,
  };

  if (market === "US") {
    extras.breadth = rows.length ? `${advancers}/${decliners}` : null;
    extras.preMarketMovers = null;
  } else if (market === "CRYPTO") {
    const caps = rows.map((r) => r.quote.marketCap).filter((v): v is number => typeof v === "number");
    extras.totalVolume24h = turnover === null ? null : round(turnover, 0);
    extras.aggregatedMarketCap = caps.length ? round(caps.reduce((a, b) => a + b, 0), 0) : null;
    extras.btcDominance = null;
  } else {
    const liq = rows
      .map((r) => r.memeProfile?.liquidity.usd)
      .filter((v): v is number => typeof v === "number");
    extras.totalLiquidity = liq.length ? round(liq.reduce((a, b) => a + b, 0), 0) : null;
    extras.avoidCount = rows.filter((r) => r.signal.state === "AVOID").length;
    extras.verifiedCount = rows.filter(
      (r) => r.memeProfile?.security.status === "SAFE_CHECK_PASSED" || r.memeProfile?.security.status === "LOW_RISK",
    ).length;
    extras.chains = [...new Set(rows.map((r) => r.token?.chain).filter(Boolean))].join(", ") || null;
  }

  // Meme market regime is derived from its own discovery breadth (never inherited).
  let regime = reading.regime;
  let sentiment = reading.sentiment;
  let indexValue = reading.indexValue;
  let changePercent = reading.changePercent;
  let quality: DataQuality = reading.available ? reading.meta.quality : "UNAVAILABLE";

  if (market === "MEME" && rows.length) {
    const avgChange = rows.reduce((s, r) => s + r.changePercent, 0) / rows.length;
    const bullishShare = advancers / rows.length;
    const volatility = rows.reduce((s, r) => s + r.indicators.atrPercent, 0) / rows.length;
    regime = volatility > 12 ? "HIGH_VOLATILITY" : bullishShare > 0.6 ? "BULL" : bullishShare < 0.35 ? "BEAR" : "SIDEWAYS";
    sentiment = bullishShare > 0.6 ? "BULLISH" : bullishShare < 0.35 ? "BEARISH" : "NEUTRAL";
    indexValue = round(bullishShare * 100, 1);
    changePercent = round(avgChange, 2);
    quality = rows[0].quality;
  }

  const indexName = market === "MEME" ? "MEME BREADTH (% ADVANCING)" : isMockMode() ? def.indexName : reading.proxyLabel.toUpperCase();

  return {
    market,
    label: def.label,
    indexName,
    indexValue: indexValue === null ? null : round(indexValue, 2),
    change: reading.change === null ? null : round(reading.change, 2),
    changePercent: changePercent === null ? null : round(changePercent, 2),
    volume: turnover === null ? null : round(turnover, 0),
    sentiment,
    regime,
    status,
    quality,
    meta:
      market === "MEME" && rows.length
        ? rows[0].meta
        : reading.available
          ? reading.meta
          : unavailableMetaFor(market, reading.reason ?? "Market data unavailable."),
    advancers,
    decliners,
    sparkline: market === "MEME" ? rows.slice(0, 40).map((r) => r.changePercent) : reading.sparkline,
    unavailableReason:
      market === "MEME"
        ? rows.length
          ? null
          : "No meme tokens could be analysed with the configured providers."
        : reading.available
          ? null
          : (reading.reason ?? "Market data unavailable."),
    extras,
  };
}

export async function getAllOverviews(): Promise<MarketOverview[]> {
  return Promise.all((["US", "CRYPTO", "MEME"] as MarketId[]).map((m) => getMarketOverview(m)));
}

export { regimeProxy, SymbolNotFoundError, parseMemeAssetId };
