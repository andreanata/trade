import type { ChainId } from "@/types/market";
import { tuning } from "@/server/env";

/** Conservative defaults. All are overridable through env / user filters. */
export interface MemeThresholds {
  minLiquidityUsd: number;
  minVolume24hUsd: number;
  minMarketCapUsd: number;
  maxHolderConcentration: number; // top-10 %
  maxTopHolderPercent: number;
  minHolderCount: number;
  maxBuyTax: number;
  maxSellTax: number;
  minTokenAgeHours: number;
  requireSecurityVerification: boolean;
  /** When false (default) UNVERIFIED tokens can never be BUY candidates. */
  allowUnverifiedTokens: boolean;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function memeThresholds(overrides: Partial<MemeThresholds> = {}): MemeThresholds {
  // Undefined overrides (e.g. absent query params) must never wipe a default.
  const clean = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(v as number)),
  ) as Partial<MemeThresholds>;

  const base: MemeThresholds = {
    minLiquidityUsd: num("MEME_MIN_LIQUIDITY_USD", 100_000),
    minVolume24hUsd: num("MEME_MIN_VOLUME_USD", 50_000),
    minMarketCapUsd: num("MEME_MIN_MARKETCAP_USD", 200_000),
    maxHolderConcentration: num("MEME_MAX_HOLDER_CONCENTRATION", 20),
    maxTopHolderPercent: num("MEME_MAX_TOP_HOLDER_PERCENT", 10),
    minHolderCount: num("MEME_MIN_HOLDER_COUNT", 200),
    maxBuyTax: num("MEME_MAX_BUY_TAX", 10),
    maxSellTax: num("MEME_MAX_SELL_TAX", 10),
    minTokenAgeHours: num("MEME_MIN_TOKEN_AGE_HOURS", 24),
    requireSecurityVerification: tuning.memeRequireSecurity,
    allowUnverifiedTokens: tuning.memeAllowUnverified,
  };
  return { ...base, ...clean };
}

/** Chains supported by the discovery + security stack. */
export const SUPPORTED_CHAINS: ChainId[] = ["ethereum", "solana", "bsc", "base"];

/** DexScreener chain slug -> internal ChainId */
export const DEX_CHAIN_MAP: Record<string, ChainId> = {
  ethereum: "ethereum",
  solana: "solana",
  bsc: "bsc",
  base: "base",
};

/** Internal ChainId -> GeckoTerminal network slug (OHLCV) */
export const GT_NETWORK: Record<ChainId, string> = {
  ethereum: "eth",
  solana: "solana",
  bsc: "bsc",
  base: "base",
};

/** Internal ChainId -> GoPlus numeric chain id. Solana uses a dedicated endpoint. */
export const GOPLUS_CHAIN_ID: Record<ChainId, string | null> = {
  ethereum: "1",
  bsc: "56",
  base: "8453",
  solana: null,
};

export const EXPLORER: Record<ChainId, (address: string) => string> = {
  ethereum: (a) => `https://etherscan.io/token/${a}`,
  bsc: (a) => `https://bscscan.com/token/${a}`,
  base: (a) => `https://basescan.org/token/${a}`,
  solana: (a) => `https://solscan.io/token/${a}`,
};

export const CHAIN_LABEL: Record<ChainId, string> = {
  ethereum: "Ethereum",
  solana: "Solana",
  bsc: "BNB Chain",
  base: "Base",
};

export function isChainId(value: string): value is ChainId {
  return (SUPPORTED_CHAINS as string[]).includes(value);
}

/** Canonical asset id for a meme token: chain + contract address (never symbol alone). */
export function memeAssetId(chain: ChainId, address: string): string {
  return `${chain}-${address}`;
}

export function parseMemeAssetId(assetId: string): { chain: ChainId; address: string } | null {
  const idx = assetId.indexOf("-");
  if (idx <= 0) return null;
  const chain = assetId.slice(0, idx);
  const address = assetId.slice(idx + 1);
  if (!isChainId(chain) || !address) return null;
  return { chain, address };
}
