"use client";

import { useState } from "react";
import { Copy, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import type { MemeTokenProfile, TradingSignal } from "@/types/market";
import { Badge, Button, Card, Progress, StatTile } from "@/components/ui/kit";
import { SecurityBadge } from "@/components/market/widgets";
import { CHAIN_LABEL } from "@/lib/meme/config";
import { formatCompact, formatPrice } from "@/lib/utils";

function yesNo(value: boolean | null, trueLabel = "Yes", falseLabel = "No"): string {
  if (value === null) return "N/A";
  return value ? trueLabel : falseLabel;
}

/**
 * Meme token detail: identity (chain + contract), liquidity, holders, contract
 * security and the MEME RISK SCORE. Missing vendor data always renders as N/A.
 */
export function MemeTokenPanel({ profile, signal }: { profile: MemeTokenProfile; signal: TradingSignal }) {
  const [copied, setCopied] = useState(false);
  const t = profile.token;
  const s = profile.security;
  const l = profile.liquidity;
  const h = profile.holders;
  const a = profile.activity;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-3">
      {signal.vetoes.length > 0 && (
        <div className="rounded-xl border border-down/50 bg-down/10 p-4">
          <p className="flex items-center gap-2 text-sm font-black text-down">
            <ShieldAlert className="h-4 w-4" /> SIGNAL: AVOID
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-down">
            {signal.vetoes.map((v) => (
              <li key={v}>• {v}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            Security and liquidity vetoes override bullish technical readings. This token is not presented as a buy
            candidate.
          </p>
        </div>
      )}

      <Card
        title="Token identity"
        subtitle="Identified by chain + contract address, never by ticker alone."
        actions={<Badge tone="neutral">{CHAIN_LABEL[t.chain]}</Badge>}
        bodyClassName="space-y-3 p-4"
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <StatTile label="Symbol" value={t.symbol} />
          <StatTile label="Name" value={t.name} />
          <StatTile label="Chain" value={CHAIN_LABEL[t.chain]} />
        </div>
        <div className="rounded-lg border border-line bg-panel-2/60 p-3">
          <p className="text-[10px] uppercase tracking-widest text-dim">Contract address</p>
          <p className="num mt-1 break-all text-xs text-bright">{t.address}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copy}>
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy address"}
            </Button>
            {t.explorerUrl && (
              <a href={t.explorerUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5" /> Explorer
                </Button>
              </a>
            )}
            {t.dexUrl && (
              <a href={t.dexUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5" /> DEX pair
                </Button>
              </a>
            )}
          </div>
          <p className="mt-2 text-[10px] text-dim">
            Tokens sharing a ticker are different assets. Always verify this address before acting on any analysis.
          </p>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Liquidity & activity" bodyClassName="grid grid-cols-2 gap-2 p-4">
          <StatTile
            label="Liquidity"
            value={l.usd === null ? "N/A" : `$${formatCompact(l.usd)}`}
            tone={l.status === "DEEP" || l.status === "ADEQUATE" ? "up" : "down"}
            sub={l.status.replace("_", " ")}
          />
          <StatTile label="Market cap" value={profile.marketCap === null ? "N/A" : `$${formatCompact(profile.marketCap)}`} />
          <StatTile label="24h volume" value={a.volume24h === null ? "N/A" : `$${formatCompact(a.volume24h)}`} sub={a.state.replace("_", " ")} />
          <StatTile label="Volume / mcap" value={a.volumeToMarketCap === null ? "N/A" : `${(a.volumeToMarketCap * 100).toFixed(1)}%`} />
          <StatTile
            label="Buy / sell (24h)"
            value={a.buys24h === null || a.sells24h === null ? "N/A" : `${a.buys24h} / ${a.sells24h}`}
            sub={a.buySellRatio === null ? "Ratio N/A" : `Ratio ${a.buySellRatio}`}
          />
          <StatTile
            label="Token age"
            value={profile.tokenAgeHours === null ? "N/A" : profile.tokenAgeHours >= 48 ? `${Math.round(profile.tokenAgeHours / 24)}d` : `${Math.round(profile.tokenAgeHours)}h`}
            sub={l.dex ? `DEX ${l.dex}` : undefined}
          />
        </Card>

        <Card
          title="Contract security"
          icon={s.status === "HONEYPOT_DETECTED" || s.status === "HIGH_RISK" ? <ShieldAlert className="h-4 w-4 text-down" /> : <ShieldCheck className="h-4 w-4 text-up" />}
          actions={<SecurityBadge status={s.status} note={s.note} />}
          bodyClassName="space-y-2 p-4"
        >
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Honeypot" value={s.honeypot === null ? "UNVERIFIED" : s.honeypot ? "DETECTED" : "Not detected"} tone={s.honeypot ? "down" : s.honeypot === null ? "warn" : "up"} />
            <StatTile label="Contract verified" value={yesNo(s.contractVerified)} />
            <StatTile label="Buy tax" value={s.buyTax === null ? "N/A" : `${s.buyTax}%`} />
            <StatTile label="Sell tax" value={s.sellTax === null ? "N/A" : `${s.sellTax}%`} />
            <StatTile label="Ownership renounced" value={yesNo(s.ownershipRenounced)} />
            <StatTile label="Mint authority" value={yesNo(s.mintAuthority, "Active", "Revoked")} />
            <StatTile label="Freeze authority" value={yesNo(s.freezeAuthority, "Active", "Revoked")} />
            <StatTile label="Transfers pausable" value={yesNo(s.transferPausable)} />
            <StatTile label="LP locked" value={s.lpLockedPercent === null ? "N/A" : `${s.lpLockedPercent}%`} sub={s.lpBurned ? "LP burned" : undefined} />
            <StatTile label="Proxy contract" value={yesNo(s.proxyContract)} />
          </div>
          {s.flags.length > 0 && (
            <div className="space-y-1">
              {s.flags
                .filter((f) => f.triggered === true)
                .slice(0, 6)
                .map((f) => (
                  <p key={f.key} className="text-[11px] text-down">
                    ⚠ {f.label} — {f.detail}
                  </p>
                ))}
            </div>
          )}
          <p className="text-[10px] text-dim">
            Source: {s.dataSource}
            {s.checkedAt ? ` · checked ${new Date(s.checkedAt).toLocaleTimeString("en-GB", { hour12: false })}` : ""}.
            Automated checks only — they reduce but cannot eliminate risk.
          </p>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Holder distribution" bodyClassName="grid grid-cols-2 gap-2 p-4">
          <StatTile label="Holder count" value={h.holderCount === null ? "N/A" : h.holderCount.toLocaleString("en-US")} />
          <StatTile label="Top holder" value={h.topHolderPercent === null ? "N/A" : `${h.topHolderPercent.toFixed(2)}%`} tone={(h.topHolderPercent ?? 0) > 10 ? "down" : "up"} />
          <StatTile label="Top 10 holders" value={h.top10Percent === null ? "N/A" : `${h.top10Percent.toFixed(2)}%`} tone={(h.top10Percent ?? 0) > 20 ? "down" : "up"} />
          <StatTile label="Concentration" value={h.concentrationStatus} />
          <StatTile label="Creator holds" value={h.creatorPercent === null ? "N/A" : `${h.creatorPercent.toFixed(2)}%`} />
          <StatTile label="LP holders" value={h.lpHolderCount === null ? "N/A" : String(h.lpHolderCount)} />
        </Card>

        <Card
          title="Meme risk score"
          actions={<Badge tone={profile.memeRisk.score > 70 ? "down" : profile.memeRisk.score > 45 ? "warn" : "up"}>{profile.memeRisk.score.toFixed(0)}/100 · {profile.memeRisk.label}</Badge>}
          bodyClassName="space-y-2 p-4"
        >
          {profile.memeRisk.components.map((c) => (
            <div key={c.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{c.label}</span>
                <span className="num text-bright">
                  {c.score.toFixed(1)}/{c.max}
                </span>
              </div>
              <Progress className="mt-1" value={(c.score / c.max) * 100} tone={c.score / c.max > 0.6 ? "down" : "warn"} />
              <p className="mt-1 text-[11px] text-dim">{c.reason}</p>
            </div>
          ))}
          {profile.memeRisk.notes.map((n) => (
            <p key={n} className="text-[11px] text-warn">
              {n}
            </p>
          ))}
        </Card>
      </div>

      <Card title="Signal breakdown" subtitle={signal.summary} bodyClassName="space-y-2 p-4">
        {signal.components.map((c) => (
          <div key={c.key}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">
                {c.label} <span className="text-dim">({c.weightPercent}%)</span>
              </span>
              <span className="num text-bright">+{c.contribution.toFixed(2)}</span>
            </div>
            <Progress className="mt-1" value={c.score} />
            <p className="mt-1 text-[11px] text-dim">{c.reason}</p>
          </div>
        ))}
        <p className="rounded-lg border border-warn/25 bg-warn/5 p-3 text-[11px] text-warn">{signal.disclaimer}</p>
      </Card>
    </div>
  );
}
