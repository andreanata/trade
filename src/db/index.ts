import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Database access — LAZILY initialised.
 *
 * DATABASE_URL is OPTIONAL. Nothing in this module runs at import time, so the
 * application builds and boots without a database. The connection is only created
 * on the first real query.
 *
 * Rationale: `next build` collects page data by importing every route handler.
 * Throwing at module scope (the previous behaviour) failed the whole build with
 * "Error: DATABASE_URL is required" even though market data needs no database.
 *
 *   DATABASE_URL present -> persistence works (alerts, watchlist, portfolio, settings)
 *   DATABASE_URL absent  -> the app still builds, starts and serves all market data;
 *                           only DB-backed endpoints report DATABASE_NOT_CONFIGURED.
 */

export class DatabaseNotConfiguredError extends Error {
  readonly code = "DATABASE_NOT_CONFIGURED" as const;
  constructor() {
    super("Alerts database is not configured.");
    this.name = "DatabaseNotConfiguredError";
  }
}

function databaseUrl(): string | undefined {
  const value = process.env.DATABASE_URL;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** True when a connection string is present. Never throws. */
export function isDatabaseConfigured(): boolean {
  return databaseUrl() !== undefined;
}

const globalForDb = globalThis as typeof globalThis & {
  __marketaiPool?: Pool;
  __marketaiDb?: NodePgDatabase<Record<string, never>>;
};

/** Creates (once) and returns the pool, or null when unconfigured. */
export function getPool(): Pool | null {
  const url = databaseUrl();
  if (!url) return null;
  if (!globalForDb.__marketaiPool) {
    globalForDb.__marketaiPool = new Pool({
      connectionString: url,
      // Keep serverless invocations from exhausting Postgres connection slots.
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 10_000),
    });
    // A pool-level error must never take the process down on Vercel.
    globalForDb.__marketaiPool.on("error", () => {});
  }
  return globalForDb.__marketaiPool;
}

/** Returns the Drizzle client, or null when DATABASE_URL is absent. */
export function getDb(): NodePgDatabase<Record<string, never>> | null {
  const pool = getPool();
  if (!pool) return null;
  if (!globalForDb.__marketaiDb) {
    globalForDb.__marketaiDb = drizzle(pool);
  }
  return globalForDb.__marketaiDb;
}

/** Returns the Drizzle client or throws DatabaseNotConfiguredError. */
export function requireDb(): NodePgDatabase<Record<string, never>> {
  const client = getDb();
  if (!client) throw new DatabaseNotConfiguredError();
  return client;
}

/**
 * Backwards-compatible `db` export.
 *
 * A Proxy defers connection creation to the first property access, so existing
 * `import { db } from "@/db"` call sites keep working unchanged while module
 * import stays completely side-effect free.
 */
export const db = new Proxy({} as NodePgDatabase<Record<string, never>>, {
  get(_target, property, receiver) {
    const client = requireDb();
    const value = Reflect.get(client as object, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** Lazy pool accessor kept for compatibility with the original export name. */
export const pool = new Proxy({} as Pool, {
  get(_target, property, receiver) {
    const instance = getPool();
    if (!instance) throw new DatabaseNotConfiguredError();
    const value = Reflect.get(instance as object, property, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
