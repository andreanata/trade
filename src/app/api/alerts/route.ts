import type { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import type { AlertMetric, AlertRule, MarketId, Timeframe } from "@/types/market";
import { db } from "@/db";
import { alertRules } from "@/db/schema";
import { evaluateAlerts } from "@/lib/engine/alerts";
import { findAsset } from "@/data/universe";
import { getUserKey } from "@/server/session";
import { fail, handleError, ok, requireDatabase } from "@/server/http";
import { parseTimeframe } from "@/lib/utils";

export const dynamic = "force-dynamic";

function toRule(row: typeof alertRules.$inferSelect): AlertRule {
  return {
    id: row.id,
    symbol: row.symbol,
    market: row.market as MarketId,
    metric: row.metric as AlertMetric,
    threshold: row.threshold,
    timeframe: row.timeframe as Timeframe,
    active: row.active,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    lastTriggeredAt: row.lastTriggeredAt ? row.lastTriggeredAt.toISOString() : null,
  };
}

export async function GET() {
  try {
    const unavailable = requireDatabase("Alerts");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const rows = await db
      .select()
      .from(alertRules)
      .where(eq(alertRules.userKey, userKey))
      .orderBy(desc(alertRules.id));
    const rules = rows.map(toRule);
    const evaluations = await evaluateAlerts(rules);

    const triggeredIds = evaluations.filter((e) => e.triggered && e.active).map((e) => e.id);
    if (triggeredIds.length) {
      await Promise.all(
        triggeredIds.map((id) =>
          db
            .update(alertRules)
            .set({ lastTriggeredAt: new Date() })
            .where(and(eq(alertRules.userKey, userKey), eq(alertRules.id, id))),
        ),
      );
    }

    return ok({
      alerts: evaluations,
      triggeredCount: evaluations.filter((e) => e.triggered && e.active).length,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const unavailable = requireDatabase("Alerts");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const body = (await request.json()) as {
      symbol?: string;
      market?: MarketId;
      metric?: AlertMetric;
      threshold?: number;
      timeframe?: string;
      note?: string;
    };
    const asset = findAsset((body.symbol ?? "").toUpperCase(), body.market);
    if (!asset) return fail("Asset not found.", 404, body.symbol);
    if (!body.metric) return fail("Alert metric is required.", 400);

    const inserted = await db
      .insert(alertRules)
      .values({
        userKey,
        symbol: asset.symbol,
        market: asset.market,
        metric: body.metric,
        threshold: Number.isFinite(Number(body.threshold)) ? Number(body.threshold) : 0,
        timeframe: parseTimeframe(body.timeframe),
        note: body.note ?? null,
      })
      .returning();
    return ok({ alert: toRule(inserted[0]) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const unavailable = requireDatabase("Alerts");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const body = (await request.json()) as { id?: number; active?: boolean; threshold?: number };
    if (!body.id) return fail("Missing alert id.", 400);
    await db
      .update(alertRules)
      .set({
        ...(body.active === undefined ? {} : { active: body.active }),
        ...(body.threshold === undefined ? {} : { threshold: Number(body.threshold) }),
      })
      .where(and(eq(alertRules.userKey, userKey), eq(alertRules.id, body.id)));
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const unavailable = requireDatabase("Alerts");
    if (unavailable) return unavailable;
    const userKey = await getUserKey();
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id)) return fail("Missing id.", 400);
    await db.delete(alertRules).where(and(eq(alertRules.userKey, userKey), eq(alertRules.id, id)));
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
