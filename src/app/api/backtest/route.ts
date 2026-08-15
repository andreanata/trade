import type { NextRequest } from "next/server";
import type { MarketId, StrategyId } from "@/types/market";
import { runBacktest } from "@/lib/engine/backtest";
import { findAsset } from "@/data/universe";
import { db, isDatabaseConfigured } from "@/db";
import { backtestRuns } from "@/db/schema";
import { getUserKey } from "@/server/session";
import { fail, handleError, ok } from "@/server/http";
import { parseTimeframe } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STRATEGIES: StrategyId[] = ["RSI", "MACD", "EMA_CROSS", "BREAKOUT", "MOMENTUM", "AI_SCORE"];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      symbol?: string;
      market?: MarketId;
      timeframe?: string;
      strategy?: StrategyId;
      bars?: number;
      initialCapital?: number;
    };
    const asset = findAsset((body.symbol ?? "").toUpperCase(), body.market);
    if (!asset) return fail("Asset not found.", 404, body.symbol);
    const strategy = STRATEGIES.includes(body.strategy as StrategyId) ? (body.strategy as StrategyId) : "AI_SCORE";

    const result = await runBacktest({
      symbol: asset.symbol,
      market: asset.market,
      timeframe: parseTimeframe(body.timeframe),
      strategy,
      bars: body.bars,
      initialCapital: body.initialCapital,
    });

    try {
      // Persistence is optional: the backtest result is returned either way.
      if (isDatabaseConfigured()) {
      const userKey = await getUserKey();
      await db.insert(backtestRuns).values({
        userKey,
        symbol: result.symbol,
        market: result.market,
        timeframe: result.timeframe,
        strategy: result.strategy,
        summary: {
          totalReturn: result.totalReturn,
          winRate: result.winRate,
          profitFactor: result.profitFactor,
          maxDrawdown: result.maxDrawdown,
          sharpeRatio: result.sharpeRatio,
          tradeCount: result.tradeCount,
        },
      });
      }
    } catch {
      // Persistence is best-effort; the backtest result is still returned.
    }

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
