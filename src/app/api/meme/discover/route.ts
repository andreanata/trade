import type { NextRequest } from "next/server";
import { analyzeMarketDetailed, sortAnalyses } from "@/lib/engine/analyze";
import { dataMode, isMockMode, providerStatus } from "@/providers";
import { memeThresholds } from "@/lib/meme/config";
import { handleError, numberParam, ok } from "@/server/http";
import { parseTimeframe } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * MEME COIN SCANNER — server-side discovery + safety filtering.
 *
 * Tokens are discovered on-chain, then every one is scored for liquidity, contract
 * security, honeypot risk and holder concentration BEFORE it can appear in any
 * buy-oriented bucket. HONEYPOT_DETECTED / critical risk can never reach
 * safeFiltered, earlyBreakout or buyCandidates.
 */
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const timeframe = parseTimeframe(p.get("timeframe"), "1H");
    const allowUnverified = p.get("allowUnverified") === "true";

    const thresholds = memeThresholds({
      minLiquidityUsd: numberParam(p, "minLiquidity"),
      minVolume24hUsd: numberParam(p, "minVolume"),
      maxHolderConcentration: numberParam(p, "maxHolderConcentration"),
      maxTopHolderPercent: numberParam(p, "maxTopHolder"),
      minHolderCount: numberParam(p, "minHolders"),
      maxBuyTax: numberParam(p, "maxBuyTax"),
      maxSellTax: numberParam(p, "maxSellTax"),
      minTokenAgeHours: numberParam(p, "minTokenAgeHours"),
      allowUnverifiedTokens: allowUnverified,
    });
    const maxRisk = numberParam(p, "maxRisk") ?? 100;

    const detailed = await analyzeMarketDetailed("MEME", {
      timeframe,
      memeThresholds: thresholds,
      allowUnverified,
    });
    const rows = sortAnalyses(detailed.rows, "AI_SCORE");

    const passesFilters = (r: (typeof rows)[number]) => {
      const m = r.memeProfile;
      if (!m) return false;
      if (m.memeRisk.score > maxRisk) return false;
      if (m.liquidity.usd !== null && m.liquidity.usd < thresholds.minLiquidityUsd) return false;
      if (m.activity.volume24h !== null && m.activity.volume24h < thresholds.minVolume24hUsd) return false;
      if (m.holders.top10Percent !== null && m.holders.top10Percent > thresholds.maxHolderConcentration) return false;
      if (m.holders.holderCount !== null && m.holders.holderCount < thresholds.minHolderCount) return false;
      if ((m.security.buyTax ?? 0) > thresholds.maxBuyTax) return false;
      if ((m.security.sellTax ?? 0) > thresholds.maxSellTax) return false;
      if (m.tokenAgeHours !== null && m.tokenAgeHours < thresholds.minTokenAgeHours) return false;
      return true;
    };

    const notAvoid = rows.filter((r) => r.signal.state !== "AVOID");
    const verified = notAvoid.filter(
      (r) =>
        r.memeProfile &&
        r.memeProfile.security.status !== "HONEYPOT_DETECTED" &&
        r.memeProfile.security.status !== "HIGH_RISK" &&
        (allowUnverified ||
          (r.memeProfile.security.status !== "UNVERIFIED" && r.memeProfile.security.status !== "DATA_UNAVAILABLE")),
    );
    const safeFiltered = verified.filter(passesFilters);

    return ok({
      mode: dataMode(),
      timeframe,
      thresholds,
      allowUnverified,
      scanned: rows.length,
      unavailable: detailed.unavailable.slice(0, 15),
      unavailableCount: detailed.unavailable.length,
      provider: providerStatus("MEME"),
      quality: rows[0]?.quality ?? (isMockMode() ? "DEMO" : "UNAVAILABLE"),
      buckets: {
        trending: rows.slice(0, 20),
        safeFiltered: safeFiltered.slice(0, 20),
        earlyBreakout: sortAnalyses(
          safeFiltered.filter((r) => ["EARLY", "BREAKOUT", "CONFIRMED"].includes(r.breakout.status)),
          "BREAKOUT",
        ).slice(0, 12),
        highMomentum: sortAnalyses(safeFiltered, "MOMENTUM").slice(0, 12),
        buyCandidates: safeFiltered
          .filter((r) => r.signal.state === "STRONG_BUY" || r.signal.state === "BUY")
          .slice(0, 12),
        highRisk: rows.filter((r) => (r.memeProfile?.memeRisk.label ?? "") === "HIGH").slice(0, 12),
        avoid: rows.filter((r) => r.signal.state === "AVOID").slice(0, 20),
      },
      generatedAt: new Date().toISOString(),
      disclaimer:
        "Meme coins carry extreme risk. Security checks reduce but cannot eliminate smart-contract, liquidity, manipulation and rug-pull risk.",
    });
  } catch (error) {
    return handleError(error);
  }
}
