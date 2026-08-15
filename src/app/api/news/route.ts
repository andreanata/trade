import type { NextRequest } from "next/server";
import { getNews } from "@/lib/news/news-service";
import { dataMode } from "@/providers";
import { handleError, numberParam, ok } from "@/server/http";
import { parseMarket } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * News + sentiment.
 * REAL mode requires NEWS_API_KEY. Without it the endpoint answers 503
 * DATA_UNAVAILABLE — demo headlines are never served as real coverage.
 */
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const market = parseMarket(p.get("market"));
    const symbol = p.get("symbol") ?? undefined;
    const limit = numberParam(p, "limit") ?? 24;

    const result = await getNews({ market, symbol: symbol?.toUpperCase(), limit });

    if (!result.available) {
      return ok(
        {
          items: [],
          aggregate: result.aggregate,
          quality: "UNAVAILABLE",
          available: false,
          code: "DATA_UNAVAILABLE",
          reason: result.reason ?? "News data unavailable.",
          dataSource: result.meta.dataSource,
          mode: dataMode(),
        },
        { status: 200 },
      );
    }

    return ok({
      items: result.items,
      aggregate: result.aggregate,
      quality: result.quality,
      available: true,
      dataSource: result.meta.dataSource,
      asOf: result.meta.asOf,
      mode: dataMode(),
    });
  } catch (error) {
    return handleError(error);
  }
}
