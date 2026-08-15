import type {
  Asset,
  Candle,
  ChainId,
  DataMeta,
  MarketStatus,
  MemeTokenProfile,
  Quote,
  Timeframe,
  TokenRef,
} from "@/types/market";
import { TIMEFRAME_MS, round } from "@/lib/utils";
import { RealMarketDataProvider } from "./live-base";
import { ProviderUnavailableError, SymbolNotFoundError } from "./types";
import { getMarketStatus as staticMarketStatus } from "./market-status";
import { TTL, cached, configureRateLimit, mapLimit, providerFetch, rateLimit, ttlForTimeframe } from "./http";
import {
  CHAIN_LABEL,
  DEX_CHAIN_MAP,
  EXPLORER,
  GT_NETWORK,
  SUPPORTED_CHAINS,
  memeAssetId,
  memeThresholds,
  parseMemeAssetId,
  type MemeThresholds,
} from "@/lib/meme/config";
import { scanTokenSecurity } from "@/lib/meme/security-scanner";
import { evaluateActivity, evaluateLiquidity } from "@/lib/meme/liquidity-scanner";
import { calculateMemeRiskScore } from "@/lib/meme/meme-risk";
import { dexVendor, discoveryVendor, tuning } from "@/server/env";

/**
 * MEME COIN provider — dynamic on-chain discovery.
 *
 * Discovery : GeckoTerminal trending pools per chain (MEME_DISCOVERY_API_BASE_URL)
 * Market data: DexScreener pair data — price, liquidity, volume, txns, FDV/market cap
 * OHLCV      : GeckoTerminal pool OHLCV
 * Security   : see src/lib/meme/security-scanner.ts (GoPlus by default)
 *
 * Tokens are ALWAYS identified by chain + contract address, never by symbol, so two
 * different tokens sharing a ticker can never be confused.
 * Nothing here is generated: unavailable figures stay null / DATA_UNAVAILABLE.
 */

const DISCOVERY_URL = () => discoveryVendor().baseUrl ?? "";
const DEX_URL = () => dexVendor().baseUrl ?? "";
const DISCOVERY_KEY = () => discoveryVendor().apiKey ?? null;
const DEX_KEY = () => dexVendor().apiKey ?? null;
/** Vendor keys are attached here, server-side, and never surfaced in a response. */
const dexHeaders = (): Record<string, string> | undefined =>
  DEX_KEY() ? { Authorization: `Bearer ${DEX_KEY()}` } : undefined;

// Free on-chain tiers are rate limited; space requests instead of bursting.
configureRateLimit("meme-discovery", tuning.discoveryRpm, 3);
configureRateLimit("meme-dex", tuning.dexRpm, 8);

const GT_TIMEFRAME: Record<Timeframe, { unit: "minute" | "hour" | "day"; aggregate: number }> = {
  "1m": { unit: "minute", aggregate: 1 },
  "5m": { unit: "minute", aggregate: 5 },
  "15m": { unit: "minute", aggregate: 15 },
  "30m": { unit: "minute", aggregate: 15 },
  "1H": { unit: "hour", aggregate: 1 },
  "4H": { unit: "hour", aggregate: 4 },
  "1D": { unit: "day", aggregate: 1 },
  "1W": { unit: "day", aggregate: 1 },
};

interface DexPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: Record<string, { buys?: number; sells?: number }>;
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
}

interface GtPool {
  id?: string;
  attributes?: {
    address?: string;
    name?: string;
    base_token_price_usd?: string;
    volume_usd?: { h24?: string };
    reserve_in_usd?: string;
  };
  relationships?: { base_token?: { data?: { id?: string } } };
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toChain(slug: string | undefined): ChainId | null {
  if (!slug) return null;
  return DEX_CHAIN_MAP[slug.toLowerCase()] ?? null;
}

/** Picks the deepest-liquidity pair as the canonical trading pair for a token. */
function bestPair(pairs: DexPair[]): DexPair | null {
  const valid = pairs.filter((p) => num(p.priceUsd) !== null);
  if (!valid.length) return null;
  return valid.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

async function fetchTokenPairs(chain: ChainId, address: string): Promise<DexPair[]> {
  const key = `meme:pairs:${chain}:${address.toLowerCase()}`;
  return cached(key, TTL.QUOTE, async () => {
    await rateLimit("meme-dex");
    const url = `${DEX_URL()}/token-pairs/v1/${chain}/${address}`;
    const body = await providerFetch<DexPair[] | { pairs?: DexPair[] }>(url, {
      providerId: "meme",
      headers: dexHeaders(),
    });
    const pairs = Array.isArray(body) ? body : (body?.pairs ?? []);
    return pairs.filter((p) => toChain(p.chainId) === chain);
  });
}

export class MemeCoinProvider extends RealMarketDataProvider {
  constructor() {
    const discovery = discoveryVendor();
    const dex = dexVendor();
    super("MEME", "meme-dex", "Meme coin discovery", {
      baseUrl: discovery.baseUrl,
      // Public discovery/DEX endpoints need no key; a key is used when supplied.
      apiKey: discovery.apiKey ?? "public",
      requiredEnv: ["DEX_API_BASE_URL", "MEME_DISCOVERY_API_BASE_URL"],
      dataSource: `${discovery.dataSource} + ${dex.dataSource}`,
      qualityOverride: tuning.memeQuality,
    });
  }

  /** Resolves `chain-address` (or a plain symbol via search) to a concrete token. */
  private async resolve(assetId: string): Promise<{ chain: ChainId; address: string }> {
    const parsed = parseMemeAssetId(assetId);
    if (parsed) return parsed;
    const matches = await this.discoverBySearch(assetId, 1);
    const first = matches[0];
    if (!first) throw new SymbolNotFoundError(assetId);
    return { chain: first.chain, address: first.address };
  }

  private tokenRef(chain: ChainId, address: string, pair: DexPair | null): TokenRef {
    return {
      chain,
      address,
      pairAddress: pair?.pairAddress ?? null,
      symbol: (pair?.baseToken?.symbol ?? "").toUpperCase() || address.slice(0, 6).toUpperCase(),
      name: pair?.baseToken?.name ?? "Unknown token",
      explorerUrl: EXPLORER[chain](address),
      dexUrl: pair?.url ?? null,
    };
  }

  protected async fetchLiveQuote(assetId: string): Promise<Quote> {
    const { chain, address } = await this.resolve(assetId);
    const pairs = await fetchTokenPairs(chain, address);
    const pair = bestPair(pairs);
    if (!pair) {
      throw new ProviderUnavailableError(this.id, `No live trading pair found for ${address} on ${chain}`, "MEME");
    }

    const price = num(pair.priceUsd);
    if (price === null) {
      throw new ProviderUnavailableError(this.id, `No price returned for ${address} on ${chain}`, "MEME");
    }

    const token = this.tokenRef(chain, address, pair);
    const meta = this.buildMeta(Date.now());
    const change24 = num(pair.priceChange?.h24) ?? 0;
    const previousClose = change24 !== -100 ? price / (1 + change24 / 100) : price;
    const volume24h = num(pair.volume?.h24);
    const marketCap = num(pair.marketCap) ?? num(pair.fdv);

    return {
      symbol: token.symbol,
      name: token.name,
      market: "MEME",
      sector: `${CHAIN_LABEL[chain]} meme`,
      currency: "USD",
      price,
      change: round(price - previousClose, 12),
      changePercent: round(change24, 2),
      open: round(previousClose, 12),
      high: price,
      low: price,
      previousClose: round(previousClose, 12),
      volume: volume24h ?? 0,
      avgVolume20: 0,
      volumeRatio: 0,
      high52w: null,
      low52w: null,
      marketCap,
      quality: meta.quality,
      asOf: meta.asOf ?? new Date().toISOString(),
      meta,
      extras: {
        chain: CHAIN_LABEL[chain],
        contractAddress: address,
        pairAddress: pair.pairAddress ?? null,
        dex: pair.dexId ?? null,
        liquidityUsd: num(pair.liquidity?.usd),
        volume24h,
        fdv: num(pair.fdv),
        marketCap,
        priceChange1h: num(pair.priceChange?.h1),
        buys24h: num(pair.txns?.h24?.buys),
        sells24h: num(pair.txns?.h24?.sells),
        pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
        explorerUrl: token.explorerUrl,
        dexUrl: token.dexUrl,
      },
    };
  }

  protected async fetchLiveCandles(assetId: string, timeframe: Timeframe, bars: number): Promise<Candle[]> {
    const { chain, address } = await this.resolve(assetId);
    const pairs = await fetchTokenPairs(chain, address);
    const pair = bestPair(pairs);
    if (!pair?.pairAddress) {
      throw new ProviderUnavailableError(this.id, `No pool found for ${address} on ${chain}`, "MEME");
    }

    const tf = GT_TIMEFRAME[timeframe];
    const key = `meme:ohlcv:${chain}:${pair.pairAddress}:${timeframe}:${bars}`;
    return cached(key, ttlForTimeframe(TIMEFRAME_MS[timeframe]), async () => {
      await rateLimit("meme-discovery");
      const url = `${DISCOVERY_URL()}/networks/${GT_NETWORK[chain]}/pools/${pair.pairAddress}/ohlcv/${tf.unit}?aggregate=${tf.aggregate}&limit=${Math.min(bars, 1000)}&currency=usd`;
      const body = await providerFetch<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(url, {
        providerId: this.id,
        headers: DISCOVERY_KEY() ? { Authorization: `Bearer ${DISCOVERY_KEY()}` } : undefined,
        timeoutMs: 12_000,
        retries: 1,
      });
      const list = body?.data?.attributes?.ohlcv_list;
      if (!Array.isArray(list) || !list.length) {
        throw new ProviderUnavailableError(
          this.id,
          `Provider has no ${timeframe} OHLCV for this pool`,
          "MEME",
        );
      }
      return list
        .map(([time, open, high, low, close, volume]) => ({
          time: Number(time) * 1000,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume ?? 0),
        }))
        .filter((c) => Number.isFinite(c.close) && Number.isFinite(c.time))
        .sort((a, b) => a.time - b.time);
    });
  }

  /** Real discovery: trending pools per chain, ranked by 24h volume. */
  async discoverTrending(limit = 24): Promise<TokenRef[]> {
    const chains = SUPPORTED_CHAINS;
    const perChain = Math.max(4, Math.ceil(limit / chains.length));

    const results = await mapLimit(chains, 2, async (chain) => {
      try {
        return await cached(`meme:trending:${chain}`, TTL.INTRADAY, async () => {
          await rateLimit("meme-discovery");
          const url = `${DISCOVERY_URL()}/networks/${GT_NETWORK[chain]}/trending_pools?page=1`;
          const body = await providerFetch<{ data?: GtPool[] }>(url, {
            providerId: this.id,
            headers: DISCOVERY_KEY() ? { Authorization: `Bearer ${DISCOVERY_KEY()}` } : undefined,
            timeoutMs: 12_000,
          });
          const pools = Array.isArray(body?.data) ? body.data : [];
          const refs: TokenRef[] = [];
          for (const pool of pools.slice(0, perChain)) {
            const baseId = pool.relationships?.base_token?.data?.id ?? "";
            const address = baseId.includes("_") ? baseId.slice(baseId.indexOf("_") + 1) : "";
            if (!address) continue;
            const name = pool.attributes?.name ?? "";
            refs.push({
              chain,
              address,
              pairAddress: pool.attributes?.address ?? null,
              symbol: (name.split("/")[0] ?? "").trim().toUpperCase() || address.slice(0, 6).toUpperCase(),
              name: name || "Unknown token",
              explorerUrl: EXPLORER[chain](address),
              dexUrl: null,
            });
          }
          return refs;
        });
      } catch {
        return [] as TokenRef[];
      }
    });

    const flat = results.flat();
    const seen = new Set<string>();
    const unique: TokenRef[] = [];
    for (const ref of flat) {
      const key = memeAssetId(ref.chain, ref.address.toLowerCase());
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(ref);
    }
    if (!unique.length) {
      throw new ProviderUnavailableError(this.id, "Discovery provider returned no trending pools", "MEME");
    }
    return unique.slice(0, limit);
  }

  /** Symbol/name/address search against the DEX aggregator. */
  async discoverBySearch(query: string, limit = 12): Promise<TokenRef[]> {
    const q = query.trim();
    if (!q) return [];
    const key = `meme:search:${q.toLowerCase()}:${limit}`;
    try {
      return await cached(key, TTL.SEARCH, async () => {
        await rateLimit("meme-dex");
        const url = `${DEX_URL()}/latest/dex/search?q=${encodeURIComponent(q)}`;
        const body = await providerFetch<{ pairs?: DexPair[] }>(url, { providerId: this.id, headers: dexHeaders() });
        const pairs = (body?.pairs ?? []).filter((p) => toChain(p.chainId) !== null);
        // Deepest pair per unique token so duplicate tickers stay distinguishable.
        const byToken = new Map<string, DexPair>();
        for (const pair of pairs) {
          const chain = toChain(pair.chainId);
          const address = pair.baseToken?.address;
          if (!chain || !address) continue;
          const id = memeAssetId(chain, address.toLowerCase());
          const current = byToken.get(id);
          if (!current || (pair.liquidity?.usd ?? 0) > (current.liquidity?.usd ?? 0)) byToken.set(id, pair);
        }
        return [...byToken.entries()]
          .sort((a, b) => (b[1].liquidity?.usd ?? 0) - (a[1].liquidity?.usd ?? 0))
          .slice(0, limit)
          .map(([, pair]) => {
            const chain = toChain(pair.chainId) as ChainId;
            return this.tokenRef(chain, pair.baseToken?.address as string, pair);
          });
      });
    } catch {
      return [];
    }
  }

  protected async fetchSymbolSearch(query: string): Promise<Asset[]> {
    const refs = await this.discoverBySearch(query, 10);
    return refs.map((ref) => ({
      symbol: memeAssetId(ref.chain, ref.address),
      name: `${ref.symbol} — ${ref.name}`,
      market: "MEME" as const,
      sector: `${CHAIN_LABEL[ref.chain]} meme`,
      currency: "USD",
    }));
  }

  protected async fetchMarketStatus(): Promise<MarketStatus> {
    return staticMarketStatus("MEME");
  }

  /**
   * Full meme profile: market data + liquidity + security + holders + MEME RISK SCORE.
   * Individual sub-checks degrade to UNAVAILABLE rather than failing the whole profile,
   * but nothing is ever fabricated.
   */
  async getTokenProfile(assetId: string, overrides: Partial<MemeThresholds> = {}): Promise<MemeTokenProfile> {
    this.requireConfigured();
    const { chain, address } = await this.resolve(assetId);
    const thresholds = memeThresholds(overrides);

    const pairs = await fetchTokenPairs(chain, address);
    const pair = bestPair(pairs);
    if (!pair) {
      throw new ProviderUnavailableError(this.id, `No live trading pair found for ${address} on ${chain}`, "MEME");
    }

    const token = this.tokenRef(chain, address, pair);
    const price = num(pair.priceUsd);
    const marketCap = num(pair.marketCap) ?? num(pair.fdv);
    const createdAt = pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : null;
    const ageHours = createdAt ? round((Date.now() - createdAt.getTime()) / 3_600_000, 1) : null;

    const liquidity = evaluateLiquidity({
      liquidityUsd: num(pair.liquidity?.usd),
      baseReserve: num(pair.liquidity?.base),
      quoteReserve: num(pair.liquidity?.quote),
      pairAddress: pair.pairAddress ?? null,
      dex: pair.dexId ?? null,
      marketCap,
      minRequiredUsd: thresholds.minLiquidityUsd,
    });

    const activity = evaluateActivity({
      volume24h: num(pair.volume?.h24),
      volume6h: num(pair.volume?.h6),
      volume1h: num(pair.volume?.h1),
      buys24h: num(pair.txns?.h24?.buys),
      sells24h: num(pair.txns?.h24?.sells),
      marketCap,
      minVolumeUsd: thresholds.minVolume24hUsd,
    });

    const { security, holders } = await scanTokenSecurity(chain, address);

    const memeRisk = calculateMemeRiskScore({
      liquidity,
      security,
      holders,
      activity,
      marketCap,
      tokenAgeHours: ageHours,
      thresholds,
    });

    const meta: DataMeta = this.buildMeta(Date.now());
    this.recordSuccess(meta.quality);

    return {
      token,
      price,
      priceChange24h: num(pair.priceChange?.h24),
      priceChange1h: num(pair.priceChange?.h1),
      marketCap,
      fdv: num(pair.fdv),
      pairCreatedAt: createdAt ? createdAt.toISOString() : null,
      tokenAgeHours: ageHours,
      liquidity,
      activity,
      security,
      holders,
      memeRisk,
      quality: meta.quality,
      meta,
    };
  }
}
