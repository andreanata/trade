import type { HolderInfo } from "@/types/market";
import type { MemeThresholds } from "./config";

/**
 * Holder distribution evaluation.
 * Holder data comes from the token-security vendor. When it is missing the result
 * stays UNAVAILABLE — the app never claims a token is well distributed without data.
 */

export interface HolderAssessment {
  info: HolderInfo;
  warnings: string[];
  /** true = distribution breaches the configured limits */
  breached: boolean;
  /** true = the vendor supplied no holder data at all */
  unknown: boolean;
}

export function assessHolders(info: HolderInfo, thresholds: MemeThresholds): HolderAssessment {
  const warnings: string[] = [];
  let breached = false;

  const unknown =
    info.holderCount === null && info.top10Percent === null && info.topHolderPercent === null;

  if (unknown) {
    warnings.push("Holder distribution data is unavailable — concentration risk cannot be ruled out.");
    return { info, warnings, breached: false, unknown: true };
  }

  if (info.top10Percent !== null && info.top10Percent > thresholds.maxHolderConcentration) {
    warnings.push(
      `Top 10 holders control ${info.top10Percent.toFixed(1)}% (limit ${thresholds.maxHolderConcentration}%).`,
    );
    breached = true;
  }
  if (info.topHolderPercent !== null && info.topHolderPercent > thresholds.maxTopHolderPercent) {
    warnings.push(
      `Largest holder controls ${info.topHolderPercent.toFixed(1)}% (limit ${thresholds.maxTopHolderPercent}%).`,
    );
    breached = true;
  }
  if (info.holderCount !== null && info.holderCount < thresholds.minHolderCount) {
    warnings.push(`Only ${info.holderCount} holders (minimum ${thresholds.minHolderCount}).`);
    breached = true;
  }
  if (info.creatorPercent !== null && info.creatorPercent > 5) {
    warnings.push(`Creator still holds ${info.creatorPercent.toFixed(1)}% of supply.`);
  }
  if (info.concentrationStatus === "EXTREME") {
    warnings.push("Holder concentration is extreme.");
    breached = true;
  }

  return { info, warnings, breached, unknown: false };
}
