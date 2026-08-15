import type { NextRequest } from "next/server";
import type { ScannerFilters, ScannerTag, SortKey } from "@/types/market";
import { runScan } from "@/lib/engine/analyze";
import { handleError, numberParam, ok } from "@/server/http";
import { parseMarket, parseTimeframe } from "@/lib/utils";
import { getUserKey, loadSettings } from "@/server/session";

export const dynamic = "force-dynamic";

const SORTS: SortKey[] = ["AI_SCORE", "MOMENTUM", "VOLUME", "CHANGE", "RISK_ASC", "BREAKOUT"];

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const sortParam = (p.get("sort") ?? "AI_SCORE").toUpperCase() as SortKey;
    const tags = (p.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean) as ScannerTag[];

    const filters: ScannerFilters = {
      market: parseMarket(p.get("market")),
      timeframe: parseTimeframe(p.get("timeframe")),
      sector: p.get("sector") ?? undefined,
      minPrice: numberParam(p, "minPrice"),
      maxPrice: numberParam(p, "maxPrice"),
      minChange: numberParam(p, "minChange"),
      maxChange: numberParam(p, "maxChange"),
      minVolumeRatio: numberParam(p, "minVolumeRatio"),
      minRsi: numberParam(p, "minRsi"),
      maxRsi: numberParam(p, "maxRsi"),
      macd: (p.get("macd") as ScannerFilters["macd"]) ?? "ANY",
      minAdx: numberParam(p, "minAdx"),
      minAiScore: numberParam(p, "minAiScore"),
      maxRisk: numberParam(p, "maxRisk"),
      minBreakout: numberParam(p, "minBreakout"),
      trend: (p.get("trend") as ScannerFilters["trend"]) ?? "ANY",
      tags: tags.length ? tags : undefined,
      sort: SORTS.includes(sortParam) ? sortParam : "AI_SCORE",
      limit: numberParam(p, "limit") ?? 60,
    };

    const settings = await loadSettings(await getUserKey());
    const result = await runScan(filters, settings.riskPreference);
    return ok({ ...result, filters, riskPreference: settings.riskPreference });
  } catch (error) {
    return handleError(error);
  }
}
