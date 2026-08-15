import type { LiquidityInfo, TradingActivity } from "@/types/market";
import { round } from "@/lib/utils";

/**
 * Liquidity + trading-activity evaluation for meme tokens.
 * Values must originate from a real DEX data provider. Nothing is estimated:
 * missing figures stay null and the status becomes UNAVAILABLE.
 */

export interface LiquidityInput {
  liquidityUsd: number | null;
  baseReserve: number | null;
  quoteReserve: number | null;
  pairAddress: string | null;
  dex: string | null;
  marketCap: number | null;
  minRequiredUsd: number;
}

export function evaluateLiquidity(input: LiquidityInput): LiquidityInfo {
  const usd = input.liquidityUsd;
  const ratio = usd !== null && input.marketCap ? round(usd / input.marketCap, 4) : null;

  let status: LiquidityInfo["status"];
  if (usd === null) status = "UNAVAILABLE";
  else if (usd < input.minRequiredUsd * 0.1) status = "CRITICAL";
  else if (usd < input.minRequiredUsd) status = "LOW_LIQUIDITY";
  else if (usd >= input.minRequiredUsd * 5) status = "DEEP";
  else status = "ADEQUATE";

  return {
    usd,
    baseReserve: input.baseReserve,
    quoteReserve: input.quoteReserve,
    pairAddress: input.pairAddress,
    dex: input.dex,
    liquidityRatio: ratio,
    status,
    minRequiredUsd: input.minRequiredUsd,
    quality: usd === null ? "UNAVAILABLE" : "LIVE",
  };
}

export interface ActivityInput {
  volume24h: number | null;
  volume6h: number | null;
  volume1h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  marketCap: number | null;
  minVolumeUsd: number;
}

export function evaluateActivity(input: ActivityInput): TradingActivity {
  const { volume24h, volume6h, volume1h, buys24h, sells24h, marketCap } = input;
  const txns = buys24h !== null && sells24h !== null ? buys24h + sells24h : null;
  const buySellRatio = buys24h !== null && sells24h ? round(buys24h / Math.max(1, sells24h), 2) : null;
  const volumeToMarketCap = volume24h !== null && marketCap ? round(volume24h / marketCap, 4) : null;

  // Volume ratio = last hour annualised against the 24h average hourly volume.
  const avgHourly = volume24h !== null ? volume24h / 24 : null;
  const volumeRatio = volume1h !== null && avgHourly ? round(volume1h / avgHourly, 2) : null;

  let state: TradingActivity["state"];
  if (volume24h === null) state = "UNAVAILABLE";
  else if (volumeRatio !== null && volumeRatio >= 2.5) state = "VOLUME_SPIKE";
  else if (volume24h < input.minVolumeUsd) state = "LOW_ACTIVITY";
  else state = "ACTIVE";

  return {
    volume24h,
    volume6h,
    volume1h,
    buys24h,
    sells24h,
    buySellRatio,
    txns24h: txns,
    volumeToMarketCap,
    volumeRatio,
    state,
  };
}
