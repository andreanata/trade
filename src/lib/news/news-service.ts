import type { DataMeta, MarketId, NewsAggregate, NewsItem, SentimentLabel } from "@/types/market";
import { findAsset } from "@/data/universe";
import { round } from "@/lib/utils";
import { TTL, cached, providerFetch } from "@/providers/http";
import { isMockMode } from "@/providers";
import { newsVendor } from "@/server/env";
import { hashString, noiseAt } from "@/lib/utils";

export interface NewsQuery {
  market?: MarketId | "ALL";
  symbol?: string;
  limit?: number;
  /**
   * Explicit relevance terms. US -> ticker + company, CRYPTO -> asset name,
   * MEME -> token symbol + project name + contract address.
   * Articles that match none of these terms are discarded.
   */
  relevanceTerms?: string[];
}

export interface NewsResult {
  items: NewsItem[];
  aggregate: NewsAggregate;
  quality: NewsItem["quality"];
  meta: DataMeta;
  available: boolean;
  reason?: string;
}

/* -------------------------------------------------------------------------- */
/* Sentiment lexicon — applied to REAL headlines, never used to invent content. */
/* -------------------------------------------------------------------------- */

const POSITIVE = [
  "surge", "surges", "soar", "soars", "rally", "rallies", "gain", "gains", "jump", "jumps", "beat", "beats",
  "record", "upgrade", "upgraded", "outperform", "bullish", "profit", "growth", "rise", "rises", "climb",
  "climbs", "strong", "boost", "boosts", "expands", "wins", "approval", "breakthrough", "high", "top",
];
const NEGATIVE = [
  "plunge", "plunges", "slump", "slumps", "fall", "falls", "drop", "drops", "loss", "losses", "miss", "misses",
  "downgrade", "downgraded", "underperform", "bearish", "cut", "cuts", "decline", "declines", "weak", "warning",
  "probe", "lawsuit", "fraud", "halt", "halted", "selloff", "sell-off", "crash", "risk", "delay", "layoff",
];

export function scoreHeadline(text: string): number {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/);
  let score = 0;
  for (const word of words) {
    if (POSITIVE.includes(word)) score += 18;
    if (NEGATIVE.includes(word)) score -= 18;
  }
  return Math.max(-100, Math.min(100, score));
}

function labelFor(score: number): SentimentLabel {
  return score > 18 ? "BULLISH" : score < -18 ? "BEARISH" : "NEUTRAL";
}

export function aggregateSentiment(items: NewsItem[]): NewsAggregate {
  const bullish = items.filter((i) => i.sentiment === "BULLISH").length;
  const bearish = items.filter((i) => i.sentiment === "BEARISH").length;
  const neutral = items.length - bullish - bearish;
  const netScore = items.length ? round(items.reduce((s, i) => s + i.sentimentScore, 0) / items.length, 1) : 0;
  return { bullish, neutral, bearish, netScore, label: netScore > 12 ? "BULLISH" : netScore < -12 ? "BEARISH" : "NEUTRAL" };
}

const EMPTY_AGGREGATE: NewsAggregate = { bullish: 0, neutral: 0, bearish: 0, netScore: 0, label: "NEUTRAL" };

/* ------------------------------- demo feed -------------------------------- */

const DEMO_TEMPLATES: { text: (n: string, s: string) => string; summary: (n: string) => string; weight: number }[] = [
  {
    text: (name) => `${name} volume expands as institutional flow picks up`,
    summary: (name) => `Trading desks report above-average turnover in ${name}, with block activity near recent highs.`,
    weight: 62,
  },
  {
    text: (name) => `${name} reclaims key moving average after multi-week base`,
    summary: (name) => `${name} closed back above its 50-period average, a level technicians watch for continuation.`,
    weight: 55,
  },
  {
    text: (_n, symbol) => `Analysts revisit ${symbol} valuation after latest operating update`,
    summary: (name) => `Sell-side commentary on ${name} is mixed, with estimates broadly unchanged.`,
    weight: 4,
  },
  {
    text: (name) => `${name} pulls back from resistance as profit taking emerges`,
    summary: (name) => `${name} faded intraday strength; short-term traders trimmed into overhead supply.`,
    weight: -48,
  },
  {
    text: (name) => `Liquidity thins in ${name} amid cautious macro tone`,
    summary: (name) => `Turnover in ${name} slipped below its 20-session average as macro headlines dominated.`,
    weight: -35,
  },
];

function demoItem(symbol: string, market: MarketId, slot: number): NewsItem {
  const asset = findAsset(symbol, market);
  const name = asset?.name ?? symbol;
  const seed = hashString(`${symbol}|${market}|news`);
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  const pick = Math.floor(noiseAt(seed, hourBucket + slot * 13) * DEMO_TEMPLATES.length) % DEMO_TEMPLATES.length;
  const template = DEMO_TEMPLATES[pick];
  const score = Math.max(-100, Math.min(100, template.weight + (noiseAt(seed, hourBucket + slot * 29) - 0.5) * 22));
  const minutesAgo = Math.round(8 + noiseAt(seed, hourBucket + slot * 7) * 900);
  return {
    id: `${market}-${symbol}-${hourBucket}-${slot}`,
    headline: template.text(name, symbol),
    summary: template.summary(name),
    source: "MarketAI demo wire",
    url: null,
    publishedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    symbols: [symbol],
    market,
    sentiment: labelFor(score),
    sentimentScore: round(score, 1),
    quality: "DEMO",
  };
}

/* ------------------------------- real feed -------------------------------- */

interface NewsApiArticle {
  title?: string;
  description?: string;
  url?: string;
  publishedAt?: string;
  source?: { name?: string };
}

function newsMeta(quality: NewsItem["quality"], source: string, asOf: string | null, note?: string): DataMeta {
  return {
    mode: isMockMode() ? "DEMO" : "REAL",
    quality,
    dataSource: source,
    providerId: "news",
    asOf,
    delaySeconds: asOf ? Math.max(0, Math.round((Date.now() - Date.parse(asOf)) / 1000)) : null,
    note: note ?? null,
  };
}

async function fetchRealNews(query: NewsQuery): Promise<NewsItem[]> {
  const config = newsVendor();
  const apiKey = config.apiKey;
  const baseUrl = config.baseUrl ?? "";
  if (!apiKey || !baseUrl) return [];

  const limit = Math.min(query.limit ?? 24, 50);
  const symbol = query.symbol?.toUpperCase();
  const asset = symbol ? findAsset(symbol) : null;
  const marketTerm =
    query.market === "CRYPTO"
      ? "crypto OR bitcoin OR ethereum"
      : query.market === "US"
        ? "US stocks OR Wall Street OR Nasdaq"
        : query.market === "MEME"
          ? "meme coin OR memecoin OR dogecoin OR solana meme"
          : "stock market OR crypto";
  // Relevance terms: ticker for equities/crypto, token + project name for meme coins.
  const q = symbol ? `${query.relevanceTerms?.join(" OR ") ?? `${symbol} OR "${asset?.name ?? symbol}"`}` : marketTerm;

  const url = new URL(`${baseUrl}/everything`);
  url.searchParams.set("q", q);
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", String(limit));

  const body = await providerFetch<{ articles?: NewsApiArticle[]; status?: string; message?: string }>(url.toString(), {
    providerId: "news",
    headers: { "X-Api-Key": apiKey },
    validate: (payload) => {
      const envelope = payload as { status?: string; message?: string };
      if (envelope?.status === "error") throw new Error(envelope.message ?? "News vendor error");
    },
  });

  const articles = Array.isArray(body.articles) ? body.articles : [];
  // Relevance gate: only articles that actually mention the asset are used for
  // sentiment. Unrelated market noise is discarded rather than counted.
  const terms = (query.relevanceTerms ?? [symbol, asset?.name].filter(Boolean) as string[])
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3);
  const relevant = (a: NewsApiArticle) => {
    if (!terms.length) return true;
    const haystack = `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase();
    return terms.some((t) => haystack.includes(t));
  };

  return articles
    .filter((a) => a.title)
    .filter((a) => (symbol ? relevant(a) : true))
    .slice(0, limit)
    .map((article, index) => {
      const headline = article.title ?? "";
      const score = scoreHeadline(`${headline} ${article.description ?? ""}`);
      const publishedAt = article.publishedAt ?? new Date().toISOString();
      const ageMinutes = (Date.now() - Date.parse(publishedAt)) / 60_000;
      return {
        id: `${article.url ?? headline}-${index}`,
        headline,
        summary: article.description ?? "",
        source: article.source?.name ?? "News vendor",
        url: article.url ?? null,
        publishedAt,
        symbols: symbol ? [symbol] : [],
        market: (query.market && query.market !== "ALL" ? query.market : "GLOBAL") as NewsItem["market"],
        sentiment: labelFor(score),
        sentimentScore: round(score, 1),
        quality: ageMinutes <= 60 ? "LIVE" : "DELAYED",
      } satisfies NewsItem;
    });
}

/**
 * News feed.
 * DEMO mode returns the labelled demo wire. REAL mode requires NEWS_API_KEY —
 * without it (or on vendor failure) the module reports UNAVAILABLE instead of
 * inventing headlines.
 */
export async function getNews(query: NewsQuery = {}): Promise<NewsResult> {
  const limit = query.limit ?? 24;

  if (isMockMode()) {
    const items: NewsItem[] = [];
    if (query.symbol) {
      const asset = findAsset(query.symbol);
      const market = asset?.market ?? (query.market && query.market !== "ALL" ? query.market : "US");
      for (let slot = 0; slot < Math.min(limit, 5); slot += 1) items.push(demoItem(query.symbol.toUpperCase(), market, slot));
    } else {
      const hourBucket = Math.floor(Date.now() / 3_600_000);
      const pool = (await import("@/data/universe")).UNIVERSE.filter((a) =>
        query.market && query.market !== "ALL" ? a.market === query.market : true,
      );
      pool
        .map((asset, i) => ({ asset, rank: noiseAt(hashString(asset.symbol), hourBucket + i) }))
        .sort((a, b) => b.rank - a.rank)
        .slice(0, limit)
        .forEach(({ asset }, i) => items.push(demoItem(asset.symbol, asset.market, i % 3)));
    }
    items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return {
      items,
      aggregate: aggregateSentiment(items),
      quality: "DEMO",
      meta: newsMeta("DEMO", "MarketAI demo wire", new Date().toISOString(), "Synthetic headlines — not real coverage."),
      available: true,
    };
  }

  if (!newsVendor().configured) {
    const reason = "News is unavailable: NEWS_API_BASE_URL / NEWS_API_KEY are not configured.";
    return {
      items: [],
      aggregate: EMPTY_AGGREGATE,
      quality: "UNAVAILABLE",
      meta: newsMeta("UNAVAILABLE", newsVendor().dataSource, null, reason),
      available: false,
      reason,
    };
  }

  const cacheKey = `news:${query.market ?? "ALL"}:${query.symbol ?? ""}:${(query.relevanceTerms ?? []).join("|")}:${limit}`;
  try {
    const items = await cached(cacheKey, TTL.NEWS, () => fetchRealNews(query));
    if (!items.length) {
      const reason = "News vendor returned no matching articles.";
      return {
        items: [],
        aggregate: EMPTY_AGGREGATE,
        quality: "UNAVAILABLE",
        meta: newsMeta("UNAVAILABLE", newsVendor().dataSource, null, reason),
        available: false,
        reason,
      };
    }
    const quality = items.some((i) => i.quality === "LIVE") ? "LIVE" : "DELAYED";
    return {
      items,
      aggregate: aggregateSentiment(items),
      quality,
      meta: newsMeta(quality, newsVendor().dataSource, items[0]?.publishedAt ?? null),
      available: true,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "News vendor request failed.";
    return {
      items: [],
      aggregate: EMPTY_AGGREGATE,
      quality: "UNAVAILABLE",
      meta: newsMeta("UNAVAILABLE", newsVendor().dataSource, null, reason),
      available: false,
      reason,
    };
  }
}

/**
 * 0..100 sentiment input for the AI Score.
 * Returns null when no sentiment data exists so the scoring engine can fall back to
 * a neutral, clearly-explained baseline instead of a fabricated value.
 */
export async function newsSentimentScore(
  market: MarketId,
  symbol?: string,
  relevanceTerms?: string[],
): Promise<number | null> {
  const result = await getNews({ market, symbol, relevanceTerms, limit: symbol ? 6 : 14 });
  if (!result.available || !result.items.length) return null;
  return round(Math.max(0, Math.min(100, 50 + result.aggregate.netScore / 2)), 1);
}
