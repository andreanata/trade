import { NextResponse } from "next/server";
import type { MarketId, Timeframe } from "@/types/market";
import { findAsset } from "@/data/universe";
import { parseTimeframe } from "@/lib/utils";
import { ProviderUnavailableError, SymbolNotFoundError } from "@/providers/types";
import { dataMode, providerStatus } from "@/providers";
import { sanitizeResponse } from "@/server/sanitize";
import { DatabaseNotConfiguredError, isDatabaseConfigured } from "@/db";

/**
 * All successful payloads pass through the sanitiser, so an API key, secret or
 * authorization header can never reach the browser even if a future refactor
 * accidentally puts one on an object.
 */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(sanitizeResponse(data), { status: 200, ...init });
}

export function fail(message: string, status = 400, detail?: string, extra?: Record<string, unknown>) {
  // Vendor error strings can contain a signed URL — scrub them too.
  return NextResponse.json(sanitizeResponse({ error: message, detail, ...(extra ?? {}) }), { status });
}

/**
 * Converts engine/provider failures into explicit API errors.
 * In REAL mode a vendor failure surfaces as DATA_UNAVAILABLE (503) — the API never
 * answers with demo data as a substitute.
 */
/**
 * Clean 503 for database-backed endpoints when DATABASE_URL is absent.
 * The rest of the terminal (market data, news, security) keeps working.
 */
export function databaseNotConfigured(feature = "Alerts") {
  return NextResponse.json(
    {
      ok: false,
      error: "DATABASE_NOT_CONFIGURED",
      message: `${feature} database is not configured.`,
    },
    { status: 503 },
  );
}

/** Guard for DB-backed handlers: returns a response when persistence is unavailable. */
export function requireDatabase(feature = "Alerts") {
  return isDatabaseConfigured() ? null : databaseNotConfigured(feature);
}

export function handleError(error: unknown) {
  if (error instanceof DatabaseNotConfiguredError) {
    return databaseNotConfigured();
  }
  if (error instanceof SymbolNotFoundError) {
    return fail("Asset not found.", 404, error.message, { code: "ASSET_NOT_FOUND" });
  }
  if (error instanceof ProviderUnavailableError) {
    return fail("DATA_UNAVAILABLE", 503, error.message, {
      code: "DATA_UNAVAILABLE",
      quality: "UNAVAILABLE",
      mode: dataMode(),
      providerId: error.providerId,
      market: error.market,
      providerStatus: error.market ? providerStatus(error.market) : null,
    });
  }
  const detail = error instanceof Error ? error.message : String(error);
  return fail("Unable to fetch market data.", 500, detail, { code: "INTERNAL_ERROR", mode: dataMode() });
}

export interface SymbolParams {
  symbol: string;
  market: MarketId;
  timeframe: Timeframe;
}

/**
 * Resolves a symbol + market from the query string.
 * The local reference list is used for resolution only — the caller still has to
 * obtain a real quote/series before anything is presented as real market data.
 */
export function resolveSymbol(searchParams: URLSearchParams): SymbolParams {
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) throw new SymbolNotFoundError("(empty)");
  const marketParam = (searchParams.get("market") ?? "").toUpperCase();
  const market =
    marketParam === "US" || marketParam === "CRYPTO" || marketParam === "MEME"
      ? (marketParam as MarketId)
      : (findAsset(symbol)?.market ?? null);
  if (!market) throw new SymbolNotFoundError(symbol);
  return {
    symbol: findAsset(symbol, market)?.symbol ?? symbol,
    market,
    timeframe: parseTimeframe(searchParams.get("timeframe")),
  };
}

export function numberParam(searchParams: URLSearchParams, key: string): number | undefined {
  const raw = searchParams.get(key);
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
