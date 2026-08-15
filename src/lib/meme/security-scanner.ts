import type { ChainId, SecurityFlag, SecurityStatus, TokenSecurity, HolderInfo } from "@/types/market";
import { TTL, cached, providerFetch } from "@/providers/http";
import { tokenSecurityVendor } from "@/server/env";
import { securityAuthHeaders } from "./security-auth";
import { GOPLUS_CHAIN_ID } from "./config";

/**
 * Token security scanner (contract / honeypot / tax / authority checks).
 *
 * Default vendor: GoPlus Security (public read-only API). Override with
 * TOKEN_SECURITY_API_BASE_URL / TOKEN_SECURITY_API_KEY.
 *
 * HARD RULES:
 *  - Only publicly available on-chain analysis is used. Nothing attempts to bypass
 *    or interact with token security mechanisms.
 *  - If the vendor cannot verify a token the status is UNVERIFIED / DATA_UNAVAILABLE.
 *    A token is NEVER assumed safe.
 */

// Credentials resolved server-side only (see src/server/env.ts).
const BASE_URL = () => tokenSecurityVendor().baseUrl ?? "";
const SOURCE = () => tokenSecurityVendor().dataSource;

export function securityConfigured(): boolean {
  // The default vendor is a public read-only endpoint, so a base URL is enough.
  return Boolean(BASE_URL());
}

function flag(
  key: string,
  label: string,
  triggered: boolean | null,
  severity: SecurityFlag["severity"],
  detail: string,
): SecurityFlag {
  return { key, label, triggered, severity, detail };
}

function bool(value: string | undefined | null): boolean | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

function pct(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  // GoPlus expresses taxes/percentages as decimal fractions (0.05 = 5%).
  return Math.round(n * 100 * 100) / 100;
}

function rawNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function unavailableSecurity(note: string, status: SecurityStatus = "DATA_UNAVAILABLE"): TokenSecurity {
  return {
    status,
    verified: null,
    honeypot: null,
    buyTax: null,
    sellTax: null,
    transferPausable: null,
    contractVerified: null,
    ownerAddress: null,
    ownershipRenounced: null,
    mintAuthority: null,
    freezeAuthority: null,
    proxyContract: null,
    blacklistFunction: null,
    antiWhaleModifiable: null,
    taxModifiable: null,
    cannotSellAll: null,
    lpLockedPercent: null,
    lpBurned: null,
    flags: [],
    criticalIssues: [],
    dataSource: SOURCE(),
    quality: "UNAVAILABLE",
    checkedAt: null,
    note,
  };
}

interface GoPlusEvmToken {
  is_honeypot?: string;
  honeypot_with_same_creator?: string;
  buy_tax?: string;
  sell_tax?: string;
  cannot_sell_all?: string;
  cannot_buy?: string;
  transfer_pausable?: string;
  is_blacklisted?: string;
  is_whitelisted?: string;
  is_proxy?: string;
  is_mintable?: string;
  is_open_source?: string;
  owner_address?: string;
  can_take_back_ownership?: string;
  owner_change_balance?: string;
  hidden_owner?: string;
  slippage_modifiable?: string;
  personal_slippage_modifiable?: string;
  anti_whale_modifiable?: string;
  is_anti_whale?: string;
  trading_cooldown?: string;
  holder_count?: string;
  lp_holder_count?: string;
  creator_percent?: string;
  owner_percent?: string;
  holders?: { address?: string; percent?: string; is_locked?: number; tag?: string }[];
  lp_holders?: { address?: string; percent?: string; is_locked?: number; tag?: string }[];
}

interface GoPlusSolanaToken {
  mintable?: { status?: string; authority?: unknown[] };
  freezable?: { status?: string; authority?: unknown[] };
  closable?: { status?: string };
  transfer_fee?: Record<string, unknown>;
  transfer_hook?: unknown[];
  non_transferable?: string;
  balance_mutable_authority?: { status?: string };
  default_account_state_upgradable?: { status?: string };
  metadata_mutable?: { status?: string };
  holders?: { account?: string; percent?: string; is_locked?: number }[];
  total_holder?: number;
  creators?: { address?: string }[];
}

export interface SecurityScanResult {
  security: TokenSecurity;
  holders: HolderInfo;
}

function emptyHolders(note: string): HolderInfo {
  return {
    holderCount: null,
    topHolderPercent: null,
    top10Percent: null,
    creatorPercent: null,
    lpHolderCount: null,
    concentrationStatus: "UNAVAILABLE",
    quality: "UNAVAILABLE",
    dataSource: note,
  };
}

function concentrationStatus(top10: number | null): HolderInfo["concentrationStatus"] {
  if (top10 === null) return "UNAVAILABLE";
  if (top10 >= 60) return "EXTREME";
  if (top10 >= 30) return "CONCENTRATED";
  if (top10 >= 15) return "MODERATE";
  return "DISTRIBUTED";
}

function summarise(flags: SecurityFlag[], honeypot: boolean | null, verified: boolean | null): {
  status: SecurityStatus;
  criticalIssues: string[];
} {
  const criticalIssues = flags.filter((f) => f.triggered === true && f.severity === "CRITICAL").map((f) => f.label);
  const highIssues = flags.filter((f) => f.triggered === true && f.severity === "HIGH").map((f) => f.label);
  const mediumIssues = flags.filter((f) => f.triggered === true && f.severity === "MEDIUM");

  if (honeypot === true) return { status: "HONEYPOT_DETECTED", criticalIssues: ["Honeypot detected", ...criticalIssues] };
  if (criticalIssues.length) return { status: "HIGH_RISK", criticalIssues };
  if (highIssues.length >= 2) return { status: "HIGH_RISK", criticalIssues: highIssues };
  if (highIssues.length === 1) return { status: "MEDIUM_RISK", criticalIssues: [] };
  if (mediumIssues.length >= 2) return { status: "MEDIUM_RISK", criticalIssues: [] };
  if (verified === null) return { status: "UNVERIFIED", criticalIssues: [] };
  if (mediumIssues.length === 1) return { status: "LOW_RISK", criticalIssues: [] };
  // Every automated check the vendor could run has passed. This is explicitly
  // "checks passed", NOT a guarantee that the token is safe.
  return { status: "SAFE_CHECK_PASSED", criticalIssues: [] };
}

async function scanEvm(chain: ChainId, address: string): Promise<SecurityScanResult> {
  const chainId = GOPLUS_CHAIN_ID[chain];
  if (!chainId) return { security: unavailableSecurity(`Unsupported chain ${chain}`), holders: emptyHolders(SOURCE()) };

  const url = `${BASE_URL()}/token_security/${chainId}?contract_addresses=${address.toLowerCase()}`;
  const body = await providerFetch<{ code?: number; message?: string; result?: Record<string, GoPlusEvmToken> }>(url, {
    providerId: "token-security",
    headers: await securityAuthHeaders(),
    timeoutMs: 12_000,
  });

  const token = body?.result?.[address.toLowerCase()];
  if (!token || Object.keys(token).length === 0) {
    return {
      security: unavailableSecurity("Security vendor has no record for this contract.", "UNVERIFIED"),
      holders: emptyHolders(SOURCE()),
    };
  }

  const honeypot = bool(token.is_honeypot);
  const buyTax = pct(token.buy_tax);
  const sellTax = pct(token.sell_tax);
  const openSource = bool(token.is_open_source);
  const mintable = bool(token.is_mintable);
  const proxy = bool(token.is_proxy);
  const pausable = bool(token.transfer_pausable);
  const blacklist = bool(token.is_blacklisted);
  const hiddenOwner = bool(token.hidden_owner);
  const takeBackOwnership = bool(token.can_take_back_ownership);
  const slippageModifiable = bool(token.slippage_modifiable);
  const antiWhaleModifiable = bool(token.anti_whale_modifiable);
  const cannotSellAll = bool(token.cannot_sell_all);
  const cannotBuy = bool(token.cannot_buy);
  const ownerAddress = token.owner_address ?? null;
  const renounced =
    ownerAddress === null
      ? null
      : /^0x0{40}$/i.test(ownerAddress) || ownerAddress === "" || /0x0{38}dead$/i.test(ownerAddress);

  const flags: SecurityFlag[] = [
    flag("honeypot", "Honeypot", honeypot, "CRITICAL", honeypot === null ? "Vendor could not evaluate honeypot risk." : honeypot ? "Simulation indicates the token cannot be sold." : "Honeypot simulation passed."),
    flag("cannot_buy", "Buying blocked", cannotBuy, "CRITICAL", cannotBuy ? "Contract blocks buying." : "Buying is not blocked."),
    flag("cannot_sell_all", "Cannot sell all", cannotSellAll, "CRITICAL", cannotSellAll ? "Holders cannot sell their full balance." : "Full-balance sells are allowed."),
    flag("hidden_owner", "Hidden owner", hiddenOwner, "CRITICAL", hiddenOwner ? "Contract has a hidden owner." : "No hidden owner detected."),
    flag("take_back_ownership", "Ownership reclaimable", takeBackOwnership, "HIGH", takeBackOwnership ? "Ownership can be reclaimed after renouncement." : "Ownership cannot be reclaimed."),
    flag("pausable", "Transfers pausable", pausable, "HIGH", pausable ? "Transfers can be paused by the owner." : "Transfers cannot be paused."),
    flag("blacklist", "Blacklist function", blacklist, "HIGH", blacklist ? "Contract can blacklist addresses." : "No blacklist function detected."),
    flag("mintable", "Mint function", mintable, "HIGH", mintable ? "Supply can be minted by the owner." : "No mint function detected."),
    flag("tax_modifiable", "Tax modifiable", slippageModifiable, "HIGH", slippageModifiable ? "Trading tax can be changed by the owner." : "Trading tax is fixed."),
    flag("not_verified", "Contract not verified", openSource === null ? null : !openSource, "HIGH", openSource ? "Source code is verified." : "Source code is not verified."),
    flag("proxy", "Proxy contract", proxy, "MEDIUM", proxy ? "Upgradeable proxy — logic can change." : "Not a proxy contract."),
    flag("anti_whale_modifiable", "Max tx/wallet modifiable", antiWhaleModifiable, "MEDIUM", antiWhaleModifiable ? "Max transaction/wallet limits can be changed." : "Limits are not modifiable."),
    flag(
      "high_tax",
      "High trading tax",
      buyTax === null && sellTax === null ? null : (buyTax ?? 0) > 10 || (sellTax ?? 0) > 10,
      "HIGH",
      buyTax === null && sellTax === null ? "Tax data unavailable." : `Buy tax ${buyTax ?? "?"}% / sell tax ${sellTax ?? "?"}%.`,
    ),
  ];

  const { status, criticalIssues } = summarise(flags, honeypot, openSource);

  const holdersList = Array.isArray(token.holders) ? token.holders : [];
  const top10 = holdersList.length
    ? Math.round(holdersList.slice(0, 10).reduce((s, h) => s + (Number(h.percent) || 0), 0) * 100 * 100) / 100
    : null;
  const topHolder = holdersList.length ? pct(holdersList[0]?.percent) : null;
  const lpHolders = Array.isArray(token.lp_holders) ? token.lp_holders : [];
  const lpLocked = lpHolders.length
    ? Math.round(lpHolders.filter((h) => h.is_locked === 1).reduce((s, h) => s + (Number(h.percent) || 0), 0) * 100 * 100) / 100
    : null;
  const lpBurned = lpHolders.some((h) => (h.tag ?? "").toLowerCase().includes("burn")) || null;

  const checkedAt = new Date().toISOString();
  return {
    security: {
      status,
      verified: openSource,
      honeypot,
      buyTax,
      sellTax,
      transferPausable: pausable,
      contractVerified: openSource,
      ownerAddress,
      ownershipRenounced: renounced,
      mintAuthority: mintable,
      freezeAuthority: null, // EVM has no freeze authority concept
      proxyContract: proxy,
      blacklistFunction: blacklist,
      antiWhaleModifiable,
      taxModifiable: slippageModifiable,
      cannotSellAll,
      lpLockedPercent: lpLocked,
      lpBurned,
      flags,
      criticalIssues,
      dataSource: SOURCE(),
      quality: "LIVE",
      checkedAt,
      note: null,
    },
    holders: {
      holderCount: rawNumber(token.holder_count),
      topHolderPercent: topHolder,
      top10Percent: top10,
      creatorPercent: pct(token.creator_percent),
      lpHolderCount: rawNumber(token.lp_holder_count),
      concentrationStatus: concentrationStatus(top10),
      quality: top10 === null && token.holder_count === undefined ? "UNAVAILABLE" : "LIVE",
      dataSource: SOURCE(),
    },
  };
}

async function scanSolana(address: string): Promise<SecurityScanResult> {
  const url = `${BASE_URL()}/solana/token_security?contract_addresses=${address}`;
  const body = await providerFetch<{ code?: number; result?: Record<string, GoPlusSolanaToken> }>(url, {
    providerId: "token-security",
    headers: await securityAuthHeaders(),
    timeoutMs: 12_000,
  });

  const token = body?.result?.[address];
  if (!token || Object.keys(token).length === 0) {
    return {
      security: unavailableSecurity("Security vendor has no record for this mint.", "UNVERIFIED"),
      holders: emptyHolders(SOURCE()),
    };
  }

  const mintAuthority = token.mintable?.status === "1";
  const freezeAuthority = token.freezable?.status === "1";
  const closable = token.closable?.status === "1";
  const nonTransferable = token.non_transferable === "1";
  const balanceMutable = token.balance_mutable_authority?.status === "1";
  const metadataMutable = token.metadata_mutable?.status === "1";
  const transferHook = Array.isArray(token.transfer_hook) && token.transfer_hook.length > 0;

  const flags: SecurityFlag[] = [
    flag("non_transferable", "Non-transferable token", nonTransferable, "CRITICAL", nonTransferable ? "Token transfers are disabled." : "Transfers are enabled."),
    flag("freeze_authority", "Freeze authority active", freezeAuthority, "CRITICAL", freezeAuthority ? "Accounts can be frozen by the authority." : "Freeze authority is revoked."),
    flag("mint_authority", "Mint authority active", mintAuthority, "HIGH", mintAuthority ? "Supply can still be minted." : "Mint authority is revoked."),
    flag("balance_mutable", "Balance mutable", balanceMutable, "HIGH", balanceMutable ? "An authority can modify balances." : "Balances are not mutable."),
    flag("closable", "Account closable", closable, "MEDIUM", closable ? "Token accounts can be closed by an authority." : "Accounts cannot be force-closed."),
    flag("transfer_hook", "Transfer hook", transferHook, "MEDIUM", transferHook ? "A transfer hook program is attached." : "No transfer hook."),
    flag("metadata_mutable", "Metadata mutable", metadataMutable, "LOW", metadataMutable ? "Token metadata can be changed." : "Metadata is immutable."),
  ];

  // Solana SPL tokens are not "source verified" the way EVM contracts are; we treat
  // a fully revoked-authority token as the strongest available assurance.
  const verified = !mintAuthority && !freezeAuthority ? true : null;
  const { status, criticalIssues } = summarise(flags, nonTransferable ? true : null, verified);

  const holdersList = Array.isArray(token.holders) ? token.holders : [];
  const top10 = holdersList.length
    ? Math.round(holdersList.slice(0, 10).reduce((s, h) => s + (Number(h.percent) || 0), 0) * 100 * 100) / 100
    : null;
  const topHolder = holdersList.length ? pct(holdersList[0]?.percent) : null;

  return {
    security: {
      status,
      verified,
      honeypot: nonTransferable ? true : null,
      buyTax: null,
      sellTax: null,
      transferPausable: freezeAuthority,
      contractVerified: null,
      ownerAddress: token.creators?.[0]?.address ?? null,
      ownershipRenounced: !mintAuthority && !freezeAuthority ? true : false,
      mintAuthority,
      freezeAuthority,
      proxyContract: null,
      blacklistFunction: null,
      antiWhaleModifiable: null,
      taxModifiable: null,
      cannotSellAll: nonTransferable,
      lpLockedPercent: null,
      lpBurned: null,
      flags,
      criticalIssues,
      dataSource: SOURCE(),
      quality: "LIVE",
      checkedAt: new Date().toISOString(),
      note: "Solana checks cover mint/freeze authority and transfer restrictions.",
    },
    holders: {
      holderCount: typeof token.total_holder === "number" ? token.total_holder : null,
      topHolderPercent: topHolder,
      top10Percent: top10,
      creatorPercent: null,
      lpHolderCount: null,
      concentrationStatus: concentrationStatus(top10),
      quality: top10 === null && token.total_holder === undefined ? "UNAVAILABLE" : "LIVE",
      dataSource: SOURCE(),
    },
  };
}

/**
 * Runs the security + holder scan for a token.
 * Never throws: a failure is expressed as DATA_UNAVAILABLE so callers can apply
 * the "unverified is not buyable" rule instead of assuming safety.
 */
export async function scanTokenSecurity(chain: ChainId, address: string): Promise<SecurityScanResult> {
  if (!securityConfigured()) {
    return {
      security: unavailableSecurity("TOKEN_SECURITY_API_BASE_URL is not configured."),
      holders: emptyHolders("not configured"),
    };
  }
  const key = `meme:security:${chain}:${address.toLowerCase()}`;
  try {
    return await cached(key, TTL.FUNDAMENTALS, () =>
      chain === "solana" ? scanSolana(address) : scanEvm(chain, address),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { security: unavailableSecurity(message), holders: emptyHolders(SOURCE()) };
  }
}

export function securitySourceLabel(): string {
  return SOURCE();
}
