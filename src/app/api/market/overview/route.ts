import type { NextRequest } from "next/server";
import type { MarketId } from "@/types/market";
import { analyzeMarketDetailed, getAllOverviews, getMarketOverview, sortAnalyses } from "@/lib/engine/analyze";
import { getNews } from "@/lib/news/news-service";
import { dataMode, providerStatuses } from "@/providers";
import { handleError, ok } from "@/server/http";
import { parseMarket, parseTimeframe } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const market = parseMarket(params.get("market"));
    const timeframe = parseTimeframe(params.get("timeframe"));
    const includeMovers = params.get("include") === "movers";

    if (market === "ALL" || !includeMovers) {
      const [overviews, news] = await Promise.all([getAllOverviews(), getNews({ market: "ALL", limit: 12 })]);
      return ok({
        overviews,
        providers: providerStatuses(),
        mode: dataMode(),
        newsSentiment: news.aggregate,
        newsAvailable: news.available,
      });
    }

    const [overview, detailed, news] = await Promise.all([
      getMarketOverview(market as MarketId),
      analyzeMarketDetailed(market as MarketId, { timeframe }),
      getNews({ market, limit: 10 }),
    ]);
    const rows = detailed.rows;
    const byChange = sortAnalyses(rows, "CHANGE");

    return ok({
      overview,
      providers: providerStatuses(),
      mode: dataMode(),
      newsSentiment: news.aggregate,
      newsAvailable: news.available,
      unavailable: detailed.unavailable.slice(0, 12),
      unavailableCount: detailed.unavailable.length,
      movers: {
        gainers: byChange.slice(0, 8),
        losers: [...byChange].reverse().slice(0, 8),
        mostVolume: sortAnalyses(rows, "VOLUME").slice(0, 8),
        mostMomentum: sortAnalyses(rows, "MOMENTUM").slice(0, 8),
        mostVolatile: [...rows].sort((a, b) => b.indicators.atrPercent - a.indicators.atrPercent).slice(0, 8),
        earlyBreakout: sortAnalyses(
          rows.filter((r) => r.breakout.status === "EARLY" || r.breakout.status === "BREAKOUT"),
          "BREAKOUT",
        ).slice(0, 8),
        oversold: rows.filter((r) => r.indicators.rsi < 32).sort((a, b) => a.indicators.rsi - b.indicators.rsi).slice(0, 8),
        overbought: rows.filter((r) => r.indicators.rsi > 68).sort((a, b) => b.indicators.rsi - a.indicators.rsi).slice(0, 8),
        topPotential: sortAnalyses(rows, "AI_SCORE").slice(0, 10),
      },
      universeSize: rows.length,
      timeframe,
    });
  } catch (error) {
    return handleError(error);
  }
}
