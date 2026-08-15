"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldAlert, Star, StarOff, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { AssetAnalysis, MarketId, RiskScore, AIScore, MarketOverview } from "@/types/market";
import { Badge, Button, Card, Modal, Progress, QualityBadge, StatTile } from "@/components/ui/kit";
import { useWatchlist, useWatchlistMutations } from "@/lib/api-client";
import { cn, formatCompact, formatPercent, formatPrice, marketFlag } from "@/lib/utils";

export function Sparkline({
  values,
  className,
  width = 96,
  height = 28,
}: {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (!values.length) return <div className={cn("h-7 w-24", className)} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / range) * height).toFixed(2)}`);
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={up ? "var(--color-up)" : "var(--color-down)"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChangeText({ value, className }: { value: number | null; className?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className={cn("num text-dim", className)}>N/A</span>;
  const tone = value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted";
  return <span className={cn("num font-semibold", tone, className)}>{formatPercent(value)}</span>;
}

export function TrendBadge({ trend }: { trend: AssetAnalysis["aiScore"]["trend"] }) {
  const bullish = trend.includes("BULLISH");
  const bearish = trend.includes("BEARISH");
  return (
    <Badge tone={bullish ? "up" : bearish ? "down" : "neutral"}>
      {bullish ? <TrendingUp className="h-3 w-3" /> : bearish ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {trend.replace("STRONG_", "S. ").replace("_", " ")}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: RiskScore }) {
  const tone = risk.label === "LOW" ? "up" : risk.label === "MEDIUM" ? "warn" : "down";
  return (
    <Badge tone={tone} title={risk.notes[0]}>
      {risk.label} {risk.score.toFixed(0)}
    </Badge>
  );
}

export function ScoreBadge({
  score,
  symbol,
  compact = false,
}: {
  score: AIScore;
  symbol: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tone = score.score >= 75 ? "up" : score.score >= 55 ? "brand" : score.score >= 40 ? "warn" : "down";
  const color =
    score.score >= 75 ? "text-up" : score.score >= 55 ? "text-brand" : score.score >= 40 ? "text-warn" : "text-down";

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Show AI Score breakdown for ${symbol}`}
        className={cn(
          "num inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel-2/70 px-2 py-1 text-sm font-bold transition hover:border-brand/60",
          color,
        )}
      >
        {score.score.toFixed(0)}
        {!compact && <span className="text-[10px] font-semibold text-dim">/100</span>}
        <Badge tone={tone} className="ml-0.5 hidden sm:inline-flex">
          {score.grade}
        </Badge>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${symbol} — AI Score breakdown`} size="lg">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-line bg-panel-2/60 p-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-dim">Total AI Score</p>
              <p className={cn("num text-3xl font-bold", color)}>{score.score.toFixed(0)}/100</p>
              <p className="mt-1 text-xs text-muted">
                Grade {score.grade} · Setup quality {score.setupQuality.toLowerCase()} · Trend{" "}
                {score.trend.replace("_", " ").toLowerCase()} · Momentum {score.momentum.toLowerCase()}
              </p>
            </div>
            <div className="hidden w-40 sm:block">
              <Progress value={score.score} tone={tone === "brand" ? "brand" : tone} />
            </div>
          </div>
          <div className="space-y-2">
            {score.components.map((c) => (
              <div key={c.key} className="rounded-lg border border-line bg-panel-2/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-bright">{c.label}</p>
                  <p className="num text-sm font-bold text-brand">
                    +{c.score.toFixed(1)}/{c.max}
                  </p>
                </div>
                <Progress className="mt-2" value={(c.score / c.max) * 100} />
                <p className="mt-2 text-xs text-muted">{c.reason}</p>
              </div>
            ))}
          </div>
          <p className="rounded-lg border border-line bg-panel-2/40 p-3 text-[11px] text-dim">
            Scores are computed from technical and market data at request time. They are analytical estimates, not
            financial advice or a guarantee of future performance.
          </p>
        </div>
      </Modal>
    </>
  );
}

export function WatchButton({ symbol, market, size = "sm" }: { symbol: string; market: MarketId; size?: "sm" | "md" }) {
  const { data } = useWatchlist();
  const { add, remove } = useWatchlistMutations();
  const existing = data?.rows.find((r) => r.symbol === symbol && r.market === market);
  const busy = add.isPending || remove.isPending;

  return (
    <Button
      variant={existing ? "subtle" : "outline"}
      size={size}
      disabled={busy}
      aria-label={existing ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (existing) remove.mutate({ id: existing.id });
        else add.mutate({ symbol, market });
      }}
    >
      {existing ? <Star className="h-3.5 w-3.5 fill-warn text-warn" /> : <StarOff className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{existing ? "Watching" : "Watch"}</span>
    </Button>
  );
}

const HEAD_CLASS = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-dim";

export function AssetTable({
  rows,
  variant = "default",
  emptyLabel = "No assets match your filters.",
}: {
  rows: AssetAnalysis[];
  variant?: "default" | "breakout";
  emptyLabel?: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-panel-2/40 px-4 py-10 text-center text-sm text-muted">
        {emptyLabel}
      </div>
    );
  }

  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className={HEAD_CLASS}>Asset</th>
              <th className={HEAD_CLASS}>Price</th>
              <th className={HEAD_CLASS}>Change</th>
              {variant === "breakout" ? (
                <>
                  <th className={HEAD_CLASS}>Resistance</th>
                  <th className={HEAD_CLASS}>Distance</th>
                  <th className={HEAD_CLASS}>Vol Ratio</th>
                  <th className={HEAD_CLASS}>RSI</th>
                  <th className={HEAD_CLASS}>ADX</th>
                  <th className={HEAD_CLASS}>Status</th>
                  <th className={HEAD_CLASS}>Breakout</th>
                </>
              ) : (
                <>
                  <th className={HEAD_CLASS}>Volume</th>
                  <th className={HEAD_CLASS}>RSI</th>
                  <th className={HEAD_CLASS}>MACD</th>
                  <th className={HEAD_CLASS}>Trend</th>
                  <th className={HEAD_CLASS}>Momentum</th>
                </>
              )}
              <th className={HEAD_CLASS}>Risk</th>
              <th className={HEAD_CLASS}>Security</th>
              <th className={HEAD_CLASS}>AI Score</th>
              <th className={HEAD_CLASS}>Signal</th>
              <th className={HEAD_CLASS} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.market}-${row.assetId}`} className="border-b border-line-soft transition hover:bg-panel-2/70">
                <td className="px-3 py-2.5">
                  <Link href={`/asset/${row.assetId}?market=${row.market}`} className="flex items-center gap-2">
                    <span className="text-base leading-none">{marketFlag(row.market)}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-bright">{row.symbol}</span>
                      <span className="block max-w-[160px] truncate text-[11px] text-dim">{row.name}</span>
                    </span>
                  </Link>
                </td>
                <td className="num px-3 py-2.5 text-sm text-bright">{formatPrice(row.price, row.currency)}</td>
                <td className="px-3 py-2.5 text-sm">
                  <ChangeText value={row.changePercent} />
                </td>
                {variant === "breakout" ? (
                  <>
                    <td className="num px-3 py-2.5 text-sm text-muted">
                      {row.breakout.resistance ? formatPrice(row.breakout.resistance, row.currency) : "N/A"}
                    </td>
                    <td className="num px-3 py-2.5 text-sm text-muted">
                      {row.breakout.distanceToResistance !== null
                        ? `${row.breakout.distanceToResistance.toFixed(2)}%`
                        : "N/A"}
                    </td>
                    <td className="num px-3 py-2.5 text-sm text-muted">{row.indicators.volume.ratio.toFixed(2)}×</td>
                    <td className="num px-3 py-2.5 text-sm text-muted">{row.indicators.rsi.toFixed(1)}</td>
                    <td className="num px-3 py-2.5 text-sm text-muted">{row.indicators.adx.adx.toFixed(1)}</td>
                    <td className="px-3 py-2.5">
                      <BreakoutStatusBadge status={row.breakout.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="num text-sm font-bold text-bright">{row.breakout.probability.toFixed(0)}%</span>
                        <Progress className="w-16" value={row.breakout.probability} tone="brand" />
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="num px-3 py-2.5 text-sm text-muted">
                      {formatCompact(row.volume)}
                      <span className="ml-1 text-[10px] text-dim">{row.indicators.volume.ratio.toFixed(2)}×</span>
                    </td>
                    <td className="num px-3 py-2.5 text-sm text-muted">{row.indicators.rsi.toFixed(1)}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={row.indicators.macd.macd > row.indicators.macd.signal ? "up" : "down"}>
                        {row.indicators.macd.macd > row.indicators.macd.signal ? "BULL" : "BEAR"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <TrendBadge trend={row.aiScore.trend} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="num text-xs text-muted">{row.momentum.score.toFixed(0)}</span>
                        <Progress className="w-14" value={row.momentum.score} tone={row.momentum.score > 60 ? "up" : "warn"} />
                      </div>
                    </td>
                  </>
                )}
                <td className="px-3 py-2.5">
                  <RiskBadge
                    risk={
                      row.memeProfile
                        ? { ...row.riskScore, score: row.memeProfile.memeRisk.score, label: row.memeProfile.memeRisk.label }
                        : row.riskScore
                    }
                  />
                </td>
                <td className="px-3 py-2.5">
                  {row.memeProfile ? (
                    <SecurityBadge status={row.memeProfile.security.status} note={row.memeProfile.security.note} />
                  ) : (
                    <span className="text-[11px] text-dim">N/A</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <ScoreBadge score={row.aiScore} symbol={row.symbol} />
                </td>
                <td className="px-3 py-2.5">
                  <SignalBadge signal={row.signal} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <WatchButton symbol={row.assetId} market={row.market} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <Link
            key={`${row.market}-${row.assetId}-m`}
            href={`/asset/${row.assetId}?market=${row.market}`}
            className="block rounded-xl border border-line bg-panel-2/60 p-3 transition active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-bright">
                  <span>{marketFlag(row.market)}</span>
                  {row.symbol}
                </p>
                <p className="truncate text-[11px] text-dim">{row.name}</p>
              </div>
              <div className="text-right">
                <p className="num text-sm font-semibold text-bright">{formatPrice(row.price, row.currency)}</p>
                <ChangeText value={row.changePercent} className="text-xs" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SignalBadge signal={row.signal} compact />
              <ScoreBadge score={row.aiScore} symbol={row.symbol} compact />
              <TrendBadge trend={row.aiScore.trend} />
              <RiskBadge risk={row.riskScore} />
              {row.memeProfile && <SecurityBadge status={row.memeProfile.security.status} />}
              {variant === "breakout" && <BreakoutStatusBadge status={row.breakout.status} />}
            </div>
            <div className="num mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted">
              <span>RSI {row.indicators.rsi.toFixed(1)}</span>
              <span>ADX {row.indicators.adx.adx.toFixed(1)}</span>
              <span>Vol {row.indicators.volume.ratio.toFixed(2)}×</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

const SIGNAL_TONE: Record<string, "up" | "down" | "warn" | "brand" | "neutral"> = {
  STRONG_BUY: "up",
  BUY: "up",
  WATCH: "brand",
  NEUTRAL: "neutral",
  SELL: "down",
  STRONG_SELL: "down",
  AVOID: "down",
};

/** Final data-driven signal. AVOID always wins over a bullish chart. */
export function SignalBadge({ signal, compact = false }: { signal: AssetAnalysis["signal"]; compact?: boolean }) {
  const tone = SIGNAL_TONE[signal.state] ?? "neutral";
  const title =
    signal.vetoes.length > 0 ? signal.vetoes.join(" | ") : `${signal.summary} (confidence ${signal.confidence})`;
  return (
    <Badge tone={tone} title={title} className={signal.state === "AVOID" ? "font-black" : undefined}>
      {signal.state === "AVOID" && <ShieldAlert className="h-3 w-3" />}
      {signal.state.replace("_", " ")}
      {!compact && <span className="ml-0.5 opacity-70">{signal.score.toFixed(0)}</span>}
    </Badge>
  );
}

const SECURITY_TONE: Record<string, "up" | "down" | "warn" | "brand" | "neutral"> = {
  SAFE_CHECK_PASSED: "up",
  LOW_RISK: "up",
  MEDIUM_RISK: "warn",
  HIGH_RISK: "down",
  HONEYPOT_DETECTED: "down",
  UNVERIFIED: "neutral",
  DATA_UNAVAILABLE: "neutral",
};

/** Security status. "SAFE_CHECK_PASSED" means checks passed, never "guaranteed safe". */
export function SecurityBadge({ status, note }: { status: string; note?: string | null }) {
  const tone = SECURITY_TONE[status] ?? "neutral";
  const label = status === "SAFE_CHECK_PASSED" ? "CHECKS PASSED" : status.replace(/_/g, " ");
  return (
    <Badge tone={tone} title={note ?? "Automated contract checks — not a safety guarantee."}>
      {label}
    </Badge>
  );
}

export function BreakoutStatusBadge({ status }: { status: AssetAnalysis["breakout"]["status"] }) {
  const tone =
    status === "CONFIRMED" ? "up" : status === "BREAKOUT" ? "up" : status === "EARLY" ? "brand" : status === "FAILED" ? "down" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

export function MarketOverviewCard({ overview }: { overview: MarketOverview }) {
  const changePercent = overview.changePercent;
  const tone = (changePercent ?? 0) > 0 ? "up" : (changePercent ?? 0) < 0 ? "down" : "neutral";
  const href = `/market/${overview.market.toLowerCase()}`;
  const unavailable = overview.quality === "UNAVAILABLE" || overview.indexValue === null;
  return (
    <Link href={href} className="group block">
      <div className="panel h-full p-4 transition duration-200 group-hover:border-brand/50 group-hover:shadow-[0_16px_40px_-24px_rgba(108,124,255,0.8)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted">
              <span className="text-base">{marketFlag(overview.market)}</span>
              {overview.indexName}
            </p>
            <p className="num mt-2 text-2xl font-bold text-bright">
              {overview.indexValue === null
                ? "N/A"
                : overview.indexValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <QualityBadge quality={overview.quality} source={overview.meta.dataSource} compact />
            <Badge tone={overview.status.isOpen ? "up" : "muted"}>
              <span className={cn("h-1.5 w-1.5 rounded-full", overview.status.isOpen ? "bg-up animate-live-dot" : "bg-dim")} />
              {overview.status.isOpen ? "MARKET OPEN" : overview.status.state.replace("_", " ")}
            </Badge>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <ChangeText value={overview.changePercent} className="text-base" />
            <p className="num text-[11px] text-dim">
              {overview.change === null
                ? "N/A"
                : `${overview.change > 0 ? "+" : ""}${overview.change.toLocaleString("en-US", { maximumFractionDigits: 2 })} pts`}
            </p>
          </div>
          <Sparkline values={overview.sparkline} width={120} height={34} />
        </div>

        {unavailable && overview.unavailableReason && (
          <p className="mt-2 rounded-lg border border-down/30 bg-down/5 px-2 py-1.5 text-[10px] leading-snug text-down">
            {overview.unavailableReason}
          </p>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[11px]">
          <div>
            <p className="text-dim">Sentiment</p>
            <p className={cn("font-semibold", tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-warn")}>
              {overview.sentiment}
            </p>
          </div>
          <div>
            <p className="text-dim">Regime</p>
            <p className="font-semibold text-bright">{overview.regime.replace("_", " ")}</p>
          </div>
          <div>
            <p className="text-dim">Breadth</p>
            <p className="num font-semibold text-bright">
              <span className="text-up">{overview.advancers}</span>
              <span className="text-dim">/</span>
              <span className="text-down">{overview.decliners}</span>
            </p>
          </div>
        </div>
        <p className="num mt-2 text-[11px] text-dim">
          Turnover {overview.volume === null ? "N/A" : formatCompact(overview.volume)} · {overview.status.localTime} ·{" "}
          {overview.meta.dataSource}
        </p>
      </div>
    </Link>
  );
}

export function MiniAssetRow({ row, metric }: { row: AssetAnalysis; metric?: "score" | "breakout" | "momentum" | "volume" | "risk" }) {
  const value =
    metric === "breakout"
      ? `${row.breakout.probability.toFixed(0)}%`
      : metric === "momentum"
        ? row.momentum.score.toFixed(0)
        : metric === "volume"
          ? `${row.indicators.volume.ratio.toFixed(2)}×`
          : metric === "risk"
            ? row.riskScore.score.toFixed(0)
            : row.aiScore.score.toFixed(0);
  return (
    <Link
      href={`/asset/${row.assetId}?market=${row.market}`}
      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-panel-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm">{marketFlag(row.market)}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-bright">{row.symbol}</p>
          <p className="truncate text-[11px] text-dim">{row.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Sparkline values={row.sparkline} width={56} height={20} />
        <div className="text-right">
          <p className="num text-sm font-semibold text-bright">{value}</p>
          <ChangeText value={row.changePercent} className="text-[11px]" />
        </div>
      </div>
    </Link>
  );
}

export function LevelsGrid({ analysis }: { analysis: AssetAnalysis }) {
  const c = analysis.currency;
  const items = [
    { label: "Resistance 2", value: analysis.levels.resistance2?.price ?? null, tone: "down" as const },
    { label: "Resistance 1", value: analysis.levels.resistance1?.price ?? null, tone: "down" as const },
    { label: "Support 1", value: analysis.levels.support1?.price ?? null, tone: "up" as const },
    { label: "Support 2", value: analysis.levels.support2?.price ?? null, tone: "up" as const },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map((item) => (
        <StatTile
          key={item.label}
          label={item.label}
          value={item.value === null ? "N/A" : formatPrice(item.value, c)}
          tone={item.tone}
          sub={
            item.value === null
              ? "No clean level detected"
              : `${(((item.value - analysis.price) / analysis.price) * 100).toFixed(2)}% from spot`
          }
        />
      ))}
    </div>
  );
}

export function SetupCard({ analysis }: { analysis: AssetAnalysis }) {
  const c = analysis.currency;
  const s = analysis.setup;
  return (
    <Card
      title="Potential Setup"
      subtitle={s.method}
      actions={<Badge tone={s.bias === "LONG" ? "up" : s.bias === "SHORT" ? "down" : "neutral"}>{s.bias}</Badge>}
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <StatTile label="Entry zone" value={`${formatPrice(s.entryLow, c)} – ${formatPrice(s.entryHigh, c)}`} tone="brand" />
        <StatTile label="Stop loss" value={formatPrice(s.stopLoss, c)} tone="down" />
        <StatTile label="Risk / Reward" value={`${s.riskReward.toFixed(2)}R`} tone={s.riskReward >= 2 ? "up" : "warn"} />
        <StatTile label="TP1" value={formatPrice(s.takeProfit1, c)} tone="up" />
        <StatTile label="TP2" value={formatPrice(s.takeProfit2, c)} tone="up" />
        <StatTile label="TP3" value={formatPrice(s.takeProfit3, c)} tone="up" />
      </div>
      <p className="mt-3 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[11px] text-warn">
        {s.disclaimer} MarketAI never places orders and is not connected to any broker account.
      </p>
    </Card>
  );
}
