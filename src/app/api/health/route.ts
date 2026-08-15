import { getDb, isDatabaseConfigured } from "@/db";
import { sql } from "drizzle-orm";
import { TTL, cached } from "@/providers/http";
import { dataMode, serviceStatuses } from "@/providers";

export const dynamic = "force-dynamic";

/**
 * Health probe — CACHED.
 *
 * The result is memoised for TTL.HEALTH so mounting components can poll this
 * endpoint without triggering a database round-trip (or provider probes) on every
 * render. Provider states come from the passive health registry: reading them
 * performs no outbound vendor request at all.
 *
 * The service is healthy even without a database: DATABASE_URL is optional and
 * only gates persistence features (alerts, watchlist, portfolio, settings).
 */
async function probe() {
  let database: "CONNECTED" | "NOT_CONFIGURED" | "ERROR" = "NOT_CONFIGURED";
  if (isDatabaseConfigured()) {
    try {
      const client = getDb();
      if (!client) throw new Error("no client");
      await client.execute(sql`select 1`);
      database = "CONNECTED";
    } catch {
      database = "ERROR";
    }
  }

  const services = serviceStatuses().map((s) => ({
    service: s.service,
    state: s.state,
    quality: s.quality,
    dataSource: s.dataSource,
    cooldownSecondsRemaining: s.cooldownSecondsRemaining ?? null,
  }));

  return {
    ok: true,
    mode: dataMode(),
    database,
    message:
      database === "NOT_CONFIGURED"
        ? "Running without persistence; market data endpoints are unaffected."
        : undefined,
    services,
    checkedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const payload = await cached("health:probe", TTL.HEALTH, probe);
  return Response.json(payload);
}
