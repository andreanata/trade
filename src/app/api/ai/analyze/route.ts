import type { NextRequest } from "next/server";
import type { MarketId } from "@/types/market";
import { generateAnalysis, type AnalysisType } from "@/lib/ai/analyst";
import { findAsset } from "@/data/universe";
import { handleError, fail, ok } from "@/server/http";
import { parseTimeframe } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPES: AnalysisType[] = ["FULL", "TECHNICAL", "BREAKOUT", "RISK"];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      symbol?: string;
      market?: MarketId;
      timeframe?: string;
      analysisType?: string;
    };
    const symbol = (body.symbol ?? "").trim().toUpperCase();
    if (!symbol) return fail("Asset not found.", 404, "Missing symbol");
    const asset = findAsset(symbol, body.market);
    if (!asset) return fail("Asset not found.", 404, symbol);
    const type = TYPES.includes((body.analysisType ?? "FULL") as AnalysisType)
      ? ((body.analysisType ?? "FULL") as AnalysisType)
      : "FULL";
    const report = await generateAnalysis(asset.symbol, asset.market, parseTimeframe(body.timeframe), type);
    return ok(report);
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  try {
    const symbol = (p.get("symbol") ?? "").trim().toUpperCase();
    const asset = findAsset(symbol, (p.get("market") as MarketId) ?? undefined);
    if (!asset) return fail("Asset not found.", 404, symbol);
    const report = await generateAnalysis(
      asset.symbol,
      asset.market,
      parseTimeframe(p.get("timeframe")),
      (p.get("analysisType") as AnalysisType) ?? "FULL",
    );
    return ok(report);
  } catch (error) {
    return handleError(error);
  }
}
