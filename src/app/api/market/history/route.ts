import type { NextRequest } from "next/server";
import { indicatorSeries } from "@/lib/indicators";
import { analyzeAsset } from "@/lib/engine/analyze";
import { dataMode, getProvider, providerStatus } from "@/providers";
import { handleError, numberParam, ok, resolveSymbol } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Historical candles.
 * REAL mode returns vendor candles only. If the vendor does not support the
 * requested timeframe the request fails with DATA_UNAVAILABLE — candles are
 * never generated locally.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const { symbol, market, timeframe } = resolveSymbol(params);
    const bars = Math.min(Math.max(numberParam(params, "bars") ?? 240, 60), 600);
    const provider = getProvider(market);

    const series = await provider.getHistoricalData(symbol, timeframe, bars);
    const analysis = await analyzeAsset(symbol, market, { timeframe, bars });
    const indicators = indicatorSeries(series.candles);

    return ok({
      symbol,
      market,
      timeframe,
      quality: series.meta.quality,
      dataSource: series.meta.dataSource,
      asOf: series.meta.asOf,
      delaySeconds: series.meta.delaySeconds,
      mode: dataMode(),
      provider: providerStatus(market),
      candles: series.candles,
      series: indicators,
      levels: analysis.levels,
      setup: analysis.setup,
      breakout: analysis.breakout,
      currency: analysis.currency,
    });
  } catch (error) {
    return handleError(error);
  }
}
