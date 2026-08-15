import type {
  HolderInfo,
  LiquidityInfo,
  MemeRiskScore,
  RiskLabel,
  ScoreComponent,
  TokenSecurity,
  TradingActivity,
} from "@/types/market";
import { clamp, round } from "@/lib/utils";
import type { MemeThresholds } from "./config";

/**
 * MEME RISK SCORE — 0 (lower detected risk) .. 100 (extreme detected risk).
 *
 * Weights: Liquidity 20 · Contract Security 20 · Holder Concentration 15 ·
 *          Buy/Sell Tax 10 · Trading Activity 10 · LP Security 10 ·
 *          Volume Quality 10 · Token Age 5
 *
 * Any critical security issue forces the score high automatically.
 * Missing data is treated as *unknown risk*, never as "safe".
 */
export const MEME_RISK_WEIGHTS = {
  liquidity: 20,
  security: 20,
  holders: 15,
  tax: 10,
  activity: 10,
  lp: 10,
  volumeQuality: 10,
  age: 5,
} as const;

export interface MemeRiskInput {
  liquidity: LiquidityInfo;
  security: TokenSecurity;
  holders: HolderInfo;
  activity: TradingActivity;
  marketCap: number | null;
  tokenAgeHours: number | null;
  thresholds: MemeThresholds;
}

function liquidityComponent(input: MemeRiskInput): ScoreComponent {
  const max = MEME_RISK_WEIGHTS.liquidity;
  const { usd, status } = input.liquidity;
  const min = input.thresholds.minLiquidityUsd;
  if (usd === null) {
    return { key: "liquidity", label: "Liquidity", score: max * 0.8, max, reason: "Liquidity data unavailable — treated as unknown risk." };
  }
  const ratio = usd / Math.max(1, min);
  const score = ratio >= 5 ? max * 0.05 : ratio >= 2 ? max * 0.18 : ratio >= 1 ? max * 0.35 : ratio >= 0.4 ? max * 0.7 : max;
  return {
    key: "liquidity",
    label: "Liquidity",
    score: round(score, 1),
    max,
    reason: `Pool liquidity $${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })} vs $${min.toLocaleString("en-US")} minimum (${status.replace("_", " ").toLowerCase()}).`,
  };
}

function securityComponent(input: MemeRiskInput): ScoreComponent {
  const max = MEME_RISK_WEIGHTS.security;
  const s = input.security;
  let score: number;
  let reason: string;

  switch (s.status) {
    case "HONEYPOT_DETECTED":
      score = max;
      reason = "Honeypot detected by the security vendor.";
      break;
    case "HIGH_RISK":
      score = max * 0.85;
      reason = `High-risk contract: ${s.criticalIssues.slice(0, 3).join(", ") || "multiple critical checks failed"}.`;
      break;
    case "MEDIUM_RISK":
      score = max * 0.5;
      reason = "Some contract checks failed (owner privileges or modifiable parameters).";
      break;
    case "LOW_RISK":
      score = max * 0.25;
      reason = "Minor contract observations only.";
      break;
    case "SAFE_CHECK_PASSED":
      score = max * 0.1;
      reason = "All automated contract checks passed (not a safety guarantee).";
      break;
    case "UNVERIFIED":
      score = max * 0.7;
      reason = "Contract could not be verified by the security vendor — treated as unknown risk.";
      break;
    default:
      score = max * 0.8;
      reason = "Security data unavailable — treated as unknown risk.";
  }

  const triggered = s.flags.filter((f) => f.triggered === true && (f.severity === "CRITICAL" || f.severity === "HIGH")).length;
  if (triggered > 0) score = Math.max(score, max * Math.min(1, 0.45 + triggered * 0.15));

  return { key: "security", label: "Contract security", score: round(score, 1), max, reason };
}

function holderComponent(input: MemeRiskInput): ScoreComponent {
  const max = MEME_RISK_WEIGHTS.holders;
  const h = input.holders;
  if (h.concentrationStatus === "UNAVAILABLE") {
    return { key: "holders", label: "Holder concentration", score: max * 0.7, max, reason: "Holder distribution unavailable — treated as unknown risk." };
  }
  const top10 = h.top10Percent ?? 0;
  const limit = input.thresholds.maxHolderConcentration;
  let score = clamp((top10 / Math.max(1, limit * 3)) * max, 0, max);
  if (h.topHolderPercent !== null && h.topHolderPercent > input.thresholds.maxTopHolderPercent) score = Math.max(score, max * 0.6);
  if (h.holderCount !== null && h.holderCount < input.thresholds.minHolderCount) score = Math.max(score, max * 0.55);
  return {
    key: "holders",
    label: "Holder concentration",
    score: round(score, 1),
    max,
    reason: `Top 10 hold ${h.top10Percent?.toFixed(1) ?? "?"}%, largest ${h.topHolderPercent?.toFixed(1) ?? "?"}%, ${h.holderCount ?? "?"} holders (${h.concentrationStatus.toLowerCase()}).`,
  };
}

function taxComponent(input: MemeRiskInput): ScoreComponent {
  const max = MEME_RISK_WEIGHTS.tax;
  const { buyTax, sellTax } = input.security;
  if (buyTax === null && sellTax === null) {
    const na = input.security.status === "DATA_UNAVAILABLE" || input.security.status === "UNVERIFIED";
    return {
      key: "tax",
      label: "Buy/Sell tax",
      score: na ? max * 0.6 : max * 0.15,
      max,
      reason: na ? "Tax data unavailable — treated as unknown risk." : "Chain does not expose transfer taxes for this token type.",
    };
  }
  const worst = Math.max(buyTax ?? 0, sellTax ?? 0);
  const limit = Math.max(input.thresholds.maxBuyTax, input.thresholds.maxSellTax);
  const score = worst >= 50 ? max : clamp((worst / Math.max(1, limit * 2)) * max, 0, max);
  return {
    key: "tax",
    label: "Buy/Sell tax",
    score: round(score, 1),
    max,
    reason: `Buy tax ${buyTax ?? "?"}% / sell tax ${sellTax ?? "?"}% (limit ${limit}%).`,
  };
}

function activityComponent(input: MemeRiskInput): ScoreComponent {
  const max = MEME_RISK_WEIGHTS.activity;
  const a = input.activity;
  if (a.state === "UNAVAILABLE") {
    return { key: "activity", label: "Trading activity", score: max * 0.7, max, reason: "Trading activity unavailable." };
  }
  let score = a.state === "LOW_ACTIVITY" ? max * 0.8 : max * 0.2;
  if (a.buySellRatio !== null && (a.buySellRatio < 0.5 || a.buySellRatio > 4)) score = Math.max(score, max * 0.55);
  if (a.txns24h !== null && a.txns24h < 100) score = Math.max(score, max * 0.6);
  return {
    key: "activity",
    label: "Trading activity",
    score: round(score, 1),
    max,
    reason: `${a.txns24h ?? "?"} txns/24h, buy/sell ratio ${a.buySellRatio ?? "?"} (${a.state.replace("_", " ").toLowerCase()}).`,
  };
}

function lpComponent(input: MemeRiskInput): ScoreComponent {
  const max = MEME_RISK_WEIGHTS.lp;
  const { lpLockedPercent, lpBurned } = input.security;
  if (lpBurned === true) {
    return { key: "lp", label: "LP security", score: round(max * 0.1, 1), max, reason: "Liquidity pool tokens are burned." };
  }
  if (lpLockedPercent === null) {
    return { key: "lp", label: "LP security", score: round(max * 0.65, 1), max, reason: "LP lock/burn status unavailable — treated as unknown risk." };
  }
  const score = lpLockedPercent >= 95 ? max * 0.08 : lpLockedPercent >= 70 ? max * 0.3 : lpLockedPercent >= 40 ? max * 0.6 : max * 0.9;
  return { key: "lp", label: "LP security", score: round(score, 1), max, reason: `${lpLockedPercent.toFixed(1)}% of LP is locked.` };
}

function volumeQualityComponent(input: MemeRiskInput): ScoreComponent {
  const max = MEME_RISK_WEIGHTS.volumeQuality;
  const vmc = input.activity.volumeToMarketCap;
  const liqUsd = input.liquidity.usd;
  const vol = input.activity.volume24h;
  if (vmc === null || vol === null) {
    return { key: "volumeQuality", label: "Volume quality", score: max * 0.6, max, reason: "Volume / market-cap ratio unavailable." };
  }
  // Extremely high turnover vs liquidity can indicate wash trading.
  const turnoverVsLiquidity = liqUsd ? vol / liqUsd : null;
  let score = vmc < 0.01 ? max * 0.7 : vmc > 3 ? max * 0.8 : max * 0.2;
  if (turnoverVsLiquidity !== null && turnoverVsLiquidity > 20) score = Math.max(score, max * 0.85);
  return {
    key: "volumeQuality",
    label: "Volume quality",
    score: round(score, 1),
    max,
    reason: `Volume/market cap ${(vmc * 100).toFixed(1)}%${turnoverVsLiquidity !== null ? `, volume/liquidity ${turnoverVsLiquidity.toFixed(1)}×` : ""}.`,
  };
}

function ageComponent(input: MemeRiskInput): ScoreComponent {
  const max = MEME_RISK_WEIGHTS.age;
  const hours = input.tokenAgeHours;
  if (hours === null) {
    return { key: "age", label: "Token age", score: max * 0.7, max, reason: "Token age unavailable." };
  }
  const score = hours >= 24 * 90 ? max * 0.05 : hours >= 24 * 14 ? max * 0.25 : hours >= 24 ? max * 0.6 : max;
  const display = hours >= 48 ? `${Math.round(hours / 24)} days` : `${Math.round(hours)} hours`;
  return { key: "age", label: "Token age", score: round(score, 1), max, reason: `Pair created ${display} ago.` };
}

export function calculateMemeRiskScore(input: MemeRiskInput): MemeRiskScore {
  const components = [
    liquidityComponent(input),
    securityComponent(input),
    holderComponent(input),
    taxComponent(input),
    activityComponent(input),
    lpComponent(input),
    volumeQualityComponent(input),
    ageComponent(input),
  ];

  let score = components.reduce((s, c) => s + c.score, 0);
  const criticalIssues: string[] = [...input.security.criticalIssues];
  const notes: string[] = [];
  let vetoed = false;

  // Hard escalations — a critical finding cannot produce a low risk score.
  if (input.security.status === "HONEYPOT_DETECTED") {
    score = Math.max(score, 95);
    criticalIssues.push("Honeypot detected");
    vetoed = true;
  }
  if (input.security.criticalIssues.length > 0) {
    score = Math.max(score, 82);
    vetoed = true;
  }
  if (input.liquidity.status === "CRITICAL") {
    score = Math.max(score, 80);
    criticalIssues.push("Liquidity critically low");
    vetoed = true;
  }
  if (input.liquidity.status === "LOW_LIQUIDITY") {
    score = Math.max(score, 62);
    notes.push(`Liquidity is below the $${input.thresholds.minLiquidityUsd.toLocaleString("en-US")} minimum.`);
  }
  if (input.holders.concentrationStatus === "EXTREME") {
    score = Math.max(score, 72);
    criticalIssues.push("Extreme holder concentration");
  }
  const worstTax = Math.max(input.security.buyTax ?? 0, input.security.sellTax ?? 0);
  if (worstTax > Math.max(input.thresholds.maxBuyTax, input.thresholds.maxSellTax)) {
    score = Math.max(score, 68);
    notes.push(`Trading tax ${worstTax}% exceeds the configured limit.`);
  }
  if (input.security.status === "UNVERIFIED" || input.security.status === "DATA_UNAVAILABLE") {
    notes.push("Security checks could not be completed — the token is treated as unverified, not as safe.");
  }
  if (!notes.length) notes.push("No dominant risk factor beyond the scored components.");

  const final = round(clamp(score, 0, 100), 1);
  const label: RiskLabel = final < 30 ? "LOW" : final < 50 ? "MEDIUM" : final < 72 ? "HIGH" : "EXTREME";

  return { score: final, label, components, criticalIssues: [...new Set(criticalIssues)], notes, vetoed };
}
