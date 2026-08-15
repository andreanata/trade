import type { NextRequest } from "next/server";
import { analyzeAsset } from "@/lib/engine/analyze";
import { dataMode, searchSymbols } from "@/providers";
import { handleError, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Symbol search.
 * REAL mode queries the vendor search endpoints first. Every candidate is then
 * validated with a real quote/analysis call: candidates that cannot be verified are
 * returned with `verified: false` and quality UNAVAILABLE instead of fake numbers.
 */
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const { assets, fromProvider, errors } = await searchSymbols(query, 10);

    const results = await Promise.all(
      assets.map(async (asset) => {
        try {
          const analysis = await analyzeAsset(asset.symbol, asset.market, { timeframe: "1D" });
          return {
            ...asset,
            price: analysis.price,
            changePercent: analysis.changePercent,
            aiScore: analysis.aiScore.score,
            trend: analysis.aiScore.trend,
            riskScore: analysis.riskScore.score,
            quality: analysis.quality,
            dataSource: analysis.meta.dataSource,
            verified: true,
          };
        } catch (error) {
          return {
            ...asset,
            price: null,
            changePercent: null,
            aiScore: null,
            trend: "NEUTRAL" as const,
            riskScore: null,
            quality: "UNAVAILABLE" as const,
            dataSource: null,
            verified: false,
            reason: error instanceof Error ? error.message : "Unavailable",
          };
        }
      }),
    );

    return ok({ query, results, fromProvider, mode: dataMode(), errors });
  } catch (error) {
    return handleError(error);
  }
}
