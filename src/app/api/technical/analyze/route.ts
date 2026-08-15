import type { NextRequest } from "next/server";
import { analyzeAsset } from "@/lib/engine/analyze";
import { getNews } from "@/lib/news/news-service";
import { dataMode, providerStatus } from "@/providers";
import { handleError, ok, resolveSymbol } from "@/server/http";
import { getUserKey, loadSettings } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Full technical analysis. Every indicator, level and score below is computed
 * from the provider's OHLCV — in REAL mode that is vendor data only.
 */
export async function GET(request: NextRequest) {
  try {
    const { symbol, market, timeframe } = resolveSymbol(request.nextUrl.searchParams);
    const settings = await loadSettings(await getUserKey());
    const analysis = await analyzeAsset(symbol, market, {
      timeframe,
      riskPreference: settings.riskPreference,
    });
    const news = await getNews({ market, symbol, limit: 5 });

    return ok({
      analysis,
      news: news.items,
      newsSentiment: news.aggregate,
      newsAvailable: news.available,
      newsReason: news.reason ?? null,
      mode: dataMode(),
      quality: analysis.meta.quality,
      dataSource: analysis.meta.dataSource,
      asOf: analysis.meta.asOf,
      provider: providerStatus(market),
    });
  } catch (error) {
    return handleError(error);
  }
}
