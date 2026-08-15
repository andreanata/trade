import type { Asset, DataMeta, MarketId, ProviderStatus, ServiceStatus } from "@/types/market";
import { UNIVERSE } from "@/data/universe";
import { CryptoMarketDataProvider } from "./crypto-provider";
import { MemeCoinProvider } from "./memecoin-provider";
import { MockMarketDataProvider } from "./mock-provider";
import { USMarketDataProvider } from "./us-provider";
import type { MarketDataProvider } from "./types";
import { buildServiceStatuses } from "./service-status";
import {
  isMockMode as envIsMockMode,
  isMockModeConfigured as envIsMockModeConfigured,
  mockModeWarning as envMockModeWarning,
} from "@/server/env";

export * from "./types";
export * from "./http";
export { MockMarketDataProvider } from "./mock-provider";
export { USMarketDataProvider } from "./us-provider";
export { CryptoMarketDataProvider } from "./crypto-provider";
export { MemeCoinProvider } from "./memecoin-provider";
export { RealMarketDataProvider } from "./live-base";
export { getMarketStatus } from "./market-status";

/** MarketAI markets: US stocks, crypto and meme coins. */
export const MARKETS: MarketId[] = ["US", "CRYPTO", "MEME"];

/**
 * MOCK_MODE=true  → deterministic demo dataset for every market (labelled DEMO).
 * MOCK_MODE=false → real vendors only. A failing vendor yields DATA_UNAVAILABLE;
 *                   it never silently degrades to the demo generator.
 */
export function isMockMode(): boolean {
  return envIsMockMode();
}

/** True when MOCK_MODE was explicitly declared by the operator. */
export function isMockModeConfigured(): boolean {
  return envIsMockModeConfigured();
}

/** Operator warning when the data mode was inferred rather than declared. */
export function mockModeWarning(): string | null {
  return envMockModeWarning();
}

export function dataMode(): "REAL" | "DEMO" {
  return isMockMode() ? "DEMO" : "REAL";
}

const mockRegistry: Record<MarketId, MarketDataProvider> = {
  US: new MockMarketDataProvider("US"),
  CRYPTO: new MockMarketDataProvider("CRYPTO"),
  MEME: new MockMarketDataProvider("MEME"),
};

let realRegistry: Record<MarketId, MarketDataProvider> | null = null;

function getRealRegistry(): Record<MarketId, MarketDataProvider> {
  if (!realRegistry) {
    realRegistry = {
      US: new USMarketDataProvider(),
      CRYPTO: new CryptoMarketDataProvider(),
      MEME: new MemeCoinProvider(),
    };
  }
  return realRegistry;
}

export function getProvider(market: MarketId): MarketDataProvider {
  return isMockMode() ? mockRegistry[market] : getRealRegistry()[market];
}

/** Typed accessor for meme-specific capabilities (discovery, security profile). */
export function getMemeProvider(): MemeCoinProvider | null {
  if (isMockMode()) return null;
  return getRealRegistry().MEME as MemeCoinProvider;
}

/** Per-market provider status — every market can have a different vendor/state. */
export function providerStatuses(): ProviderStatus[] {
  return MARKETS.map((market) => getProvider(market).status());
}

export function providerStatus(market: MarketId): ProviderStatus {
  return getProvider(market).status();
}

/**
 * Provider dashboard: US_STOCKS · CRYPTO · DEX · TOKEN_SECURITY · NEWS.
 * Runtime health from the live providers is merged with the server-side vendor
 * configuration. No API key or secret is included in the result.
 */
export function serviceStatuses(): ServiceStatus[] {
  const signal = (market: MarketId) => {
    const status = getProvider(market).status();
    return {
      lastSuccessAt: status.lastSuccessAt,
      lastErrorAt: status.lastErrorAt,
      lastError: status.lastError,
      quality: status.quality,
    };
  };
  return buildServiceStatuses({
    us: signal("US"),
    crypto: signal("CRYPTO"),
    dex: signal("MEME"),
  });
}

export function unavailableMetaFor(market: MarketId, note: string): DataMeta {
  const provider = getProvider(market);
  return {
    mode: dataMode(),
    quality: "UNAVAILABLE",
    dataSource: provider.status().dataSource,
    providerId: provider.id,
    asOf: null,
    delaySeconds: null,
    note,
  };
}

function localMatches(query: string, limit: number, market?: MarketId): Asset[] {
  const q = query.trim().toUpperCase();
  return UNIVERSE.filter((a) => (market ? a.market === market : true))
    .filter((a) => !q || a.symbol.includes(q) || a.name.toUpperCase().includes(q) || a.sector.toUpperCase().includes(q))
    .sort((a, b) => {
      const aRank = a.symbol === q ? 0 : a.symbol.startsWith(q) ? 1 : 2;
      const bRank = b.symbol === q ? 0 : b.symbol.startsWith(q) ? 1 : 2;
      return aRank - bRank || a.symbol.localeCompare(b.symbol);
    })
    .slice(0, limit)
    .map(({ symbol, name, market: m, sector, currency }) => ({ symbol, name, market: m, sector, currency }));
}

export interface SymbolSearchResult {
  assets: Asset[];
  /** True when a vendor search endpoint answered; false when only the local reference list was used. */
  fromProvider: boolean;
  errors: { market: MarketId; message: string }[];
}

/**
 * Global symbol search across US stocks, crypto and meme coins.
 * REAL mode asks each configured vendor first. The local reference list is only a
 * resolution fallback — callers must still verify candidates with a real quote
 * before presenting them as real.
 */
export async function searchSymbols(query: string, limit = 12): Promise<SymbolSearchResult> {
  if (isMockMode()) {
    return { assets: localMatches(query, limit), fromProvider: false, errors: [] };
  }

  const errors: { market: MarketId; message: string }[] = [];
  const perMarket = await Promise.all(
    MARKETS.map(async (market) => {
      const provider = getProvider(market);
      if (!provider.configured) {
        errors.push({ market, message: `${market} provider not configured` });
        return [] as Asset[];
      }
      try {
        return await provider.searchSymbols(query);
      } catch (error) {
        errors.push({ market, message: error instanceof Error ? error.message : String(error) });
        return [] as Asset[];
      }
    }),
  );

  const seen = new Set<string>();
  const merged: Asset[] = [];
  for (const asset of perMarket.flat()) {
    const key = `${asset.market}:${asset.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(asset);
  }

  if (merged.length) return { assets: merged.slice(0, limit), fromProvider: true, errors };
  return { assets: localMatches(query, limit), fromProvider: false, errors };
}

export async function searchAllSymbols(query: string, limit = 12): Promise<Asset[]> {
  const { assets } = await searchSymbols(query, limit);
  return assets;
}
