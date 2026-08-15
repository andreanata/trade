import type { NextRequest } from "next/server";
import { analyzeMarket, sortAnalyses } from "@/lib/engine/analyze";
import { handleError, numberParam, ok } from "@/server/http";
import { parseMarket, parseTimeframe } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const market = parseMarket(p.get("market"));
    const timeframe = parseTimeframe(p.get("timeframe"));
    const minProbability = numberParam(p, "minProbability") ?? 45;
    const maxDistance = numberParam(p, "maxDistance") ?? 6;
    const status = (p.get("status") ?? "ALL").toUpperCase();

    const rows = await analyzeMarket(market, { timeframe });
    const candidates = rows.filter((r) => {
      if (r.breakout.probability < minProbability) return false;
      const distance = r.breakout.distanceToResistance;
      if (distance !== null && distance > maxDistance) return false;
      if (status !== "ALL" && r.breakout.status !== status) return false;
      return true;
    });

    return ok({
      rows: sortAnalyses(candidates, "BREAKOUT").slice(0, 40),
      total: candidates.length,
      scanned: rows.length,
      timeframe,
      market,
      quality: rows[0]?.quality ?? "DEMO",
      generatedAt: new Date().toISOString(),
      note: "Breakout Probability is a weighted model score derived from technical conditions. It is not a statistical guarantee that a breakout will occur.",
    });
  } catch (error) {
    return handleError(error);
  }
}
