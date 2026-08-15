import type { NextRequest } from "next/server";
import { analyzeMarketDetailed, getAllOverviews, sortAnalyses } from "@/lib/engine/analyze";
import { getNews } from "@/lib/news/news-service";
import { dataMode, providerStatuses } from "@/providers";
import { handleError, ok } from "@/server/http";
import { parseMarket, parseTimeframe } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Single aggregated payload so the dashboard renders with one round trip. */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const market = parseMarket(params.get("market"));
    const timeframe = parseTimeframe(params.get("timeframe"));

    const [overviews, detailed, news] = await Promise.all([
      getAllOverviews(),
      analyzeMarketDetailed(market, { timeframe }),
      getNews({ market, limit: 8 }),
    ]);
    const rows = detailed.rows;

    const topPotential = sortAnalyses(rows, "AI_SCORE").slice(0, 12);
    const earlyBreakout = sortAnalyses(
      rows.filter((r) => ["EARLY", "BREAKOUT", "CONFIRMED"].includes(r.breakout.status)),
      "BREAKOUT",
    ).slice(0, 8);
    const momentumLeaders = sortAnalyses(rows, "MOMENTUM").slice(0, 8);
    const byChange = sortAnalyses(rows, "CHANGE");

    const bullish = rows.filter((r) => r.aiScore.trend.includes("BULLISH")).length;
    const bearish = rows.filter((r) => r.aiScore.trend.includes("BEARISH")).length;
    const avgRisk = rows.length ? rows.reduce((s, r) => s + r.riskScore.score, 0) / rows.length : 0;
    const avgScore = rows.length ? rows.reduce((s, r) => s + r.aiScore.score, 0) / rows.length : 0;

    return ok({
      overviews,
      providers: providerStatuses(),
      mode: dataMode(),
      timeframe,
      market,
      topPotential,
      earlyBreakout,
      momentumLeaders,
      gainers: byChange.slice(0, 6),
      losers: [...byChange].reverse().slice(0, 6),
      volumeLeaders: sortAnalyses(rows, "VOLUME").slice(0, 6),
      riskRadar: [...rows].sort((a, b) => b.riskScore.score - a.riskScore.score).slice(0, 6),
      news: news.items,
      newsSentiment: news.aggregate,
      newsAvailable: news.available,
      newsReason: news.reason ?? null,
      newsQuality: news.quality,
      unavailable: detailed.unavailable.slice(0, 12),
      unavailableCount: detailed.unavailable.length,
      breadth: {
        bullish,
        bearish,
        neutral: rows.length - bullish - bearish,
        avgRisk: Math.round(avgRisk * 10) / 10,
        avgScore: Math.round(avgScore * 10) / 10,
        universe: rows.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
}
