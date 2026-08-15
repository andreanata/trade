import type { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import type { MarketId, WatchlistRow } from "@/types/market";
import { db } from "@/db";
import { watchlistItems } from "@/db/schema";
import { analyzeAsset } from "@/lib/engine/analyze";
import { findAsset } from "@/data/universe";
import { getUserKey } from "@/server/session";
import { fail, handleError, ok, requireDatabase } from "@/server/http";
import { parseTimeframe } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const unavailable = requireDatabase("Watchlist");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const timeframe = parseTimeframe(request.nextUrl.searchParams.get("timeframe"));
    const items = await db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.userKey, userKey))
      .orderBy(asc(watchlistItems.sortOrder), asc(watchlistItems.id));

    const rows: WatchlistRow[] = await Promise.all(
      items.map(async (item) => {
        const base = {
          id: item.id,
          symbol: item.symbol,
          market: item.market as MarketId,
          sortOrder: item.sortOrder,
        };
        try {
          return { ...base, analysis: await analyzeAsset(item.symbol, item.market as MarketId, { timeframe }) };
        } catch {
          return { ...base, analysis: null };
        }
      }),
    );
    return ok({ rows, timeframe });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const unavailable = requireDatabase("Watchlist");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const body = (await request.json()) as { symbol?: string; market?: MarketId };
    const asset = findAsset((body.symbol ?? "").toUpperCase(), body.market);
    if (!asset) return fail("Asset not found.", 404, body.symbol);

    const existing = await db
      .select()
      .from(watchlistItems)
      .where(
        and(
          eq(watchlistItems.userKey, userKey),
          eq(watchlistItems.symbol, asset.symbol),
          eq(watchlistItems.market, asset.market),
        ),
      )
      .limit(1);
    if (existing[0]) return ok({ item: existing[0], created: false });

    const count = await db.select().from(watchlistItems).where(eq(watchlistItems.userKey, userKey));
    const inserted = await db
      .insert(watchlistItems)
      .values({ userKey, symbol: asset.symbol, market: asset.market, sortOrder: count.length })
      .returning();
    return ok({ item: inserted[0], created: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const unavailable = requireDatabase("Watchlist");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const body = (await request.json()) as { order?: number[] };
    if (!body.order?.length) return fail("Nothing to reorder.", 400);
    await Promise.all(
      body.order.map((id, index) =>
        db
          .update(watchlistItems)
          .set({ sortOrder: index })
          .where(and(eq(watchlistItems.userKey, userKey), eq(watchlistItems.id, id))),
      ),
    );
    return ok({ reordered: body.order.length });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const unavailable = requireDatabase("Watchlist");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const params = request.nextUrl.searchParams;
    const id = Number(params.get("id"));
    const symbol = params.get("symbol")?.toUpperCase();

    if (Number.isFinite(id) && id > 0) {
      await db.delete(watchlistItems).where(and(eq(watchlistItems.userKey, userKey), eq(watchlistItems.id, id)));
    } else if (symbol) {
      await db.delete(watchlistItems).where(and(eq(watchlistItems.userKey, userKey), eq(watchlistItems.symbol, symbol)));
    } else {
      return fail("Missing id or symbol.", 400);
    }
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
