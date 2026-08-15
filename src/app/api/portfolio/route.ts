import type { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import type { MarketId, PortfolioPositionView } from "@/types/market";
import { db } from "@/db";
import { portfolioPositions } from "@/db/schema";
import { analyzeAsset } from "@/lib/engine/analyze";
import { findAsset } from "@/data/universe";
import { getUserKey } from "@/server/session";
import { fail, handleError, ok, requireDatabase } from "@/server/http";
import { round } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const unavailable = requireDatabase("Portfolio");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const rows = await db
      .select()
      .from(portfolioPositions)
      .where(eq(portfolioPositions.userKey, userKey))
      .orderBy(asc(portfolioPositions.id));

    const enriched: PortfolioPositionView[] = await Promise.all(
      rows.map(async (row) => {
        const asset = findAsset(row.symbol, row.market as MarketId);
        const invested = row.quantity * row.buyPrice;
        try {
          const analysis = await analyzeAsset(row.symbol, row.market as MarketId, { timeframe: "1D" });
          const currentValue = analysis.price * row.quantity;
          return {
            id: row.id,
            symbol: row.symbol,
            market: row.market as MarketId,
            quantity: row.quantity,
            buyPrice: row.buyPrice,
            buyDate: row.buyDate,
            notes: row.notes,
            name: analysis.name,
            currency: analysis.currency,
            currentPrice: analysis.price,
            invested: round(invested, 2),
            currentValue: round(currentValue, 2),
            profitLoss: round(currentValue - invested, 2),
            profitLossPercent: invested ? round(((currentValue - invested) / invested) * 100, 2) : 0,
            allocation: 0,
            aiScore: analysis.aiScore.score,
            riskScore: analysis.riskScore.score,
            quality: analysis.quality,
          };
        } catch {
          return {
            id: row.id,
            symbol: row.symbol,
            market: row.market as MarketId,
            quantity: row.quantity,
            buyPrice: row.buyPrice,
            buyDate: row.buyDate,
            notes: row.notes,
            name: asset?.name ?? row.symbol,
            currency: asset?.currency ?? "USD",
            currentPrice: null,
            invested: round(invested, 2),
            currentValue: null,
            profitLoss: null,
            profitLossPercent: null,
            allocation: 0,
            aiScore: null,
            riskScore: null,
            quality: "UNAVAILABLE" as const,
          };
        }
      }),
    );

    const totalValue = enriched.reduce((s, p) => s + (p.currentValue ?? p.invested), 0);
    for (const p of enriched) {
      p.allocation = totalValue ? round(((p.currentValue ?? p.invested) / totalValue) * 100, 2) : 0;
    }
    const totalInvested = enriched.reduce((s, p) => s + p.invested, 0);

    return ok({
      positions: enriched,
      summary: {
        invested: round(totalInvested, 2),
        currentValue: round(totalValue, 2),
        profitLoss: round(totalValue - totalInvested, 2),
        profitLossPercent: totalInvested ? round(((totalValue - totalInvested) / totalInvested) * 100, 2) : 0,
        positions: enriched.length,
      },
      note: "Positions are entered manually. MarketAI never connects to a broker account and never executes orders.",
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const unavailable = requireDatabase("Portfolio");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const body = (await request.json()) as {
      symbol?: string;
      market?: MarketId;
      quantity?: number;
      buyPrice?: number;
      buyDate?: string;
      notes?: string;
    };
    const asset = findAsset((body.symbol ?? "").toUpperCase(), body.market);
    if (!asset) return fail("Asset not found.", 404, body.symbol);
    const quantity = Number(body.quantity);
    const buyPrice = Number(body.buyPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) return fail("Quantity must be greater than zero.", 400);
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) return fail("Buy price must be greater than zero.", 400);

    const inserted = await db
      .insert(portfolioPositions)
      .values({
        userKey,
        symbol: asset.symbol,
        market: asset.market,
        quantity,
        buyPrice,
        buyDate: body.buyDate || new Date().toISOString().slice(0, 10),
        notes: body.notes ?? null,
      })
      .returning();
    return ok({ position: inserted[0] });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const unavailable = requireDatabase("Portfolio");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id)) return fail("Missing id.", 400);
    await db.delete(portfolioPositions).where(and(eq(portfolioPositions.userKey, userKey), eq(portfolioPositions.id, id)));
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
