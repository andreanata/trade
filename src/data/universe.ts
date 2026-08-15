import type { Asset, MarketId } from "@/types/market";

/**
 * Reference universe for US equities and major crypto assets.
 *
 * This list is only a *resolution* aid (symbol -> market/name) and the seed list for
 * demo mode. In REAL mode every symbol is verified against the provider before it is
 * shown, and provider search can return symbols that are not listed here.
 *
 * Meme coins are NOT listed here: they are discovered dynamically on-chain and are
 * always identified by chain + contract address (see src/providers/memecoin-provider.ts).
 */
export interface UniverseAsset extends Asset {
  basePrice: number;
  baseVolume: number;
  /** Relative volatility multiplier used by the demo series generator. */
  volatility: number;
}

const US: UniverseAsset[] = [
  ["NVDA", "NVIDIA Corporation", "Semiconductors", 178.4, 210_000_000, 1.7],
  ["AAPL", "Apple Inc.", "Technology", 246.8, 58_000_000, 1.0],
  ["MSFT", "Microsoft Corporation", "Technology", 468.2, 22_000_000, 0.95],
  ["TSLA", "Tesla, Inc.", "Consumer Discretionary", 348.6, 96_000_000, 1.9],
  ["AMZN", "Amazon.com, Inc.", "Consumer Discretionary", 232.1, 42_000_000, 1.1],
  ["GOOGL", "Alphabet Inc.", "Technology", 198.7, 28_000_000, 1.05],
  ["META", "Meta Platforms, Inc.", "Technology", 612.4, 16_000_000, 1.25],
  ["AMD", "Advanced Micro Devices", "Semiconductors", 168.9, 54_000_000, 1.7],
  ["AVGO", "Broadcom Inc.", "Semiconductors", 232.5, 26_000_000, 1.4],
  ["NFLX", "Netflix, Inc.", "Communication", 892.3, 4_200_000, 1.3],
  ["JPM", "JPMorgan Chase & Co.", "Financials", 268.4, 9_800_000, 0.9],
  ["V", "Visa Inc.", "Financials", 322.6, 6_400_000, 0.8],
  ["UNH", "UnitedHealth Group", "Healthcare", 342.8, 5_100_000, 1.2],
  ["XOM", "Exxon Mobil Corporation", "Energy", 118.2, 16_000_000, 1.0],
  ["COIN", "Coinbase Global", "Financials", 268.9, 12_000_000, 2.2],
  ["PLTR", "Palantir Technologies", "Technology", 82.4, 68_000_000, 2.0],
  ["MU", "Micron Technology", "Semiconductors", 118.6, 22_000_000, 1.7],
  ["SMCI", "Super Micro Computer", "Technology", 38.7, 48_000_000, 2.4],
  ["ARM", "Arm Holdings", "Semiconductors", 142.3, 8_600_000, 1.8],
  ["CRWD", "CrowdStrike Holdings", "Technology", 372.5, 4_100_000, 1.5],
  ["SHOP", "Shopify Inc.", "Technology", 118.9, 9_400_000, 1.7],
  ["UBER", "Uber Technologies", "Industrials", 74.2, 18_000_000, 1.3],
  ["BA", "The Boeing Company", "Industrials", 178.6, 8_200_000, 1.4],
  ["DIS", "The Walt Disney Company", "Communication", 112.4, 11_000_000, 1.1],
  ["KO", "The Coca-Cola Company", "Consumer Staples", 68.9, 14_000_000, 0.6],
  ["PFE", "Pfizer Inc.", "Healthcare", 26.4, 34_000_000, 0.9],
  ["MARA", "MARA Holdings", "Financials", 18.6, 42_000_000, 2.6],
  ["RIVN", "Rivian Automotive", "Consumer Discretionary", 14.8, 38_000_000, 2.3],
  ["SOFI", "SoFi Technologies", "Financials", 16.2, 52_000_000, 2.0],
  ["INTC", "Intel Corporation", "Semiconductors", 24.6, 68_000_000, 1.6],
].map(([symbol, name, sector, basePrice, baseVolume, volatility]) => ({
  symbol: symbol as string,
  name: name as string,
  market: "US" as MarketId,
  sector: sector as string,
  currency: "USD",
  basePrice: basePrice as number,
  baseVolume: baseVolume as number,
  volatility: volatility as number,
}));

const CRYPTO: UniverseAsset[] = [
  ["BTC", "Bitcoin", "Store of Value", 96500, 32_000_000_000, 1.2],
  ["ETH", "Ethereum", "Smart Contract", 3480, 18_000_000_000, 1.45],
  ["SOL", "Solana", "Smart Contract", 208.4, 4_800_000_000, 1.9],
  ["BNB", "BNB", "Exchange", 682.3, 2_100_000_000, 1.3],
  ["XRP", "XRP", "Payments", 2.34, 5_200_000_000, 1.8],
  ["ADA", "Cardano", "Smart Contract", 0.92, 1_400_000_000, 1.8],
  ["AVAX", "Avalanche", "Smart Contract", 38.6, 780_000_000, 2.0],
  ["DOGE", "Dogecoin", "Meme", 0.36, 2_600_000_000, 2.3],
  ["LINK", "Chainlink", "Oracle", 24.8, 940_000_000, 1.8],
  ["DOT", "Polkadot", "Interoperability", 7.42, 420_000_000, 1.8],
  ["TON", "Toncoin", "Smart Contract", 5.62, 320_000_000, 1.9],
  ["NEAR", "NEAR Protocol", "Smart Contract", 6.18, 380_000_000, 2.0],
  ["APT", "Aptos", "Smart Contract", 9.84, 260_000_000, 2.1],
  ["ARB", "Arbitrum", "Scaling", 0.86, 310_000_000, 2.1],
  ["OP", "Optimism", "Scaling", 1.94, 240_000_000, 2.1],
  ["INJ", "Injective", "DeFi", 24.6, 210_000_000, 2.3],
  ["SUI", "Sui", "Smart Contract", 4.28, 640_000_000, 2.2],
  ["SEI", "Sei", "Smart Contract", 0.42, 180_000_000, 2.4],
  ["TIA", "Celestia", "Modular", 5.16, 160_000_000, 2.4],
  ["FET", "Artificial Superintelligence", "AI/DePIN", 1.42, 280_000_000, 2.4],
  ["LTC", "Litecoin", "Payments", 108.4, 560_000_000, 1.4],
  ["ATOM", "Cosmos", "Interoperability", 6.84, 190_000_000, 1.8],
  ["FIL", "Filecoin", "Storage", 4.92, 170_000_000, 2.0],
  ["AAVE", "Aave", "DeFi", 312.6, 240_000_000, 1.9],
].map(([symbol, name, sector, basePrice, baseVolume, volatility]) => ({
  symbol: symbol as string,
  name: name as string,
  market: "CRYPTO" as MarketId,
  sector: sector as string,
  currency: "USD",
  basePrice: basePrice as number,
  baseVolume: baseVolume as number,
  volatility: volatility as number,
}));

/**
 * Demo-mode meme tokens. Used ONLY when MOCK_MODE=true so the meme UI can run
 * without on-chain calls. In REAL mode tokens come from live discovery.
 */
const MEME_DEMO: UniverseAsset[] = [
  ["PEPE", "Pepe (demo)", "Meme", 0.0000182, 1_800_000_000, 2.8],
  ["WIF", "dogwifhat (demo)", "Meme", 2.18, 620_000_000, 2.8],
  ["BONK", "Bonk (demo)", "Meme", 0.0000241, 480_000_000, 2.9],
  ["FLOKI", "Floki (demo)", "Meme", 0.000132, 210_000_000, 2.9],
  ["BRETT", "Brett (demo)", "Meme", 0.081, 90_000_000, 3.0],
  ["POPCAT", "Popcat (demo)", "Meme", 0.42, 120_000_000, 3.0],
].map(([symbol, name, sector, basePrice, baseVolume, volatility]) => ({
  symbol: symbol as string,
  name: name as string,
  market: "MEME" as MarketId,
  sector: sector as string,
  currency: "USD",
  basePrice: basePrice as number,
  baseVolume: baseVolume as number,
  volatility: volatility as number,
}));

export const UNIVERSE: UniverseAsset[] = [...US, ...CRYPTO, ...MEME_DEMO];

const BY_KEY = new Map<string, UniverseAsset>();
for (const asset of UNIVERSE) {
  BY_KEY.set(`${asset.market}:${asset.symbol}`, asset);
  if (!BY_KEY.has(asset.symbol)) BY_KEY.set(asset.symbol, asset);
}

export function getUniverse(market?: MarketId | "ALL"): UniverseAsset[] {
  if (!market || market === "ALL") return UNIVERSE;
  return UNIVERSE.filter((a) => a.market === market);
}

export function findAsset(symbol: string, market?: MarketId): UniverseAsset | null {
  const upper = symbol.toUpperCase();
  if (market) return BY_KEY.get(`${market}:${upper}`) ?? null;
  return BY_KEY.get(upper) ?? null;
}

export function listSectors(market?: MarketId | "ALL"): string[] {
  const set = new Set(getUniverse(market).map((a) => a.sector));
  return Array.from(set).sort();
}

export const INDEX_DEFINITIONS: Record<
  MarketId,
  { indexName: string; label: string; base: number; volatility: number; currency: string }
> = {
  US: { indexName: "NASDAQ COMPOSITE", label: "United States Market", base: 19850, volatility: 0.9, currency: "USD" },
  CRYPTO: { indexName: "TOTAL CRYPTO CAP", label: "Global Crypto Market", base: 3.42e12, volatility: 1.6, currency: "USD" },
  MEME: { indexName: "MEME MARKET", label: "Meme Coin Market", base: 62_000_000_000, volatility: 2.6, currency: "USD" },
};
