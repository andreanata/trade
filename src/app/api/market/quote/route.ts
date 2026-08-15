import type { NextRequest } from "next/server";
import { analyzeAsset } from "@/lib/engine/analyze";
import { dataMode, getProvider, providerStatus } from "@/providers";
import { handleError, ok, resolveSymbol } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Real quote + full analysis.
 * REAL mode: everything comes from the configured vendor; a failure returns
 * DATA_UNAVAILABLE (503) rather than a demo quote.
 */
export async function GET(request: NextRequest) {
  try {
    const { symbol, market, timeframe } = resolveSymbol(request.nextUrl.searchParams);
    const provider = getProvider(market);
    const [quote, analysis, status] = await Promise.all([
      provider.getQuote(symbol),
      analyzeAsset(symbol, market, { timeframe }),
      provider.getMarketStatus(),
    ]);

    return ok({
      quote,
      analysis,
      status,
      quality: quote.meta.quality,
      dataSource: quote.meta.dataSource,
      asOf: quote.meta.asOf,
      delaySeconds: quote.meta.delaySeconds,
      mode: dataMode(),
      provider: providerStatus(market),
    });
  } catch (error) {
    return handleError(error);
  }
}
