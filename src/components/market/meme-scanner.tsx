"use client";

import { useState } from "react";
import { Filter, Flame, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  QualityBadge,
  Segmented,
  SkeletonTable,
  StatTile,
} from "@/components/ui/kit";
import { AssetTable } from "@/components/market/widgets";
import { useMemeScanner } from "@/lib/api-client";
import type { Timeframe } from "@/types/market";
import { formatCompact } from "@/lib/utils";

const BUCKETS = [
  { value: "trending", label: "Trending" },
  { value: "safeFiltered", label: "Safe Filtered" },
  { value: "buyCandidates", label: "Buy Candidates" },
  { value: "earlyBreakout", label: "Early Breakout" },
  { value: "highMomentum", label: "High Momentum" },
  { value: "highRisk", label: "High Risk" },
  { value: "avoid", label: "Avoid" },
] as const;

type BucketKey = (typeof BUCKETS)[number]["value"];

const TF: Timeframe[] = ["5m", "15m", "1H", "4H", "1D"];

/**
 * MEME COIN SCANNER.
 * Discovery → liquidity → security → holders → technicals → signal.
 * Tokens that fail the safety filter never appear in Safe Filtered / Buy Candidates
 * / Early Breakout, regardless of how bullish their chart looks.
 */
export function MemeScanner() {
  const [timeframe, setTimeframe] = useState<Timeframe>("1H");
  const [bucket, setBucket] = useState<BucketKey>("safeFiltered");
  const [allowUnverified, setAllowUnverified] = useState(false);
  const [minLiquidity, setMinLiquidity] = useState("100000");
  const [minVolume, setMinVolume] = useState("50000");
  const [maxRisk, setMaxRisk] = useState("70");
  const [maxBuyTax, setMaxBuyTax] = useState("10");
  const [maxSellTax, setMaxSellTax] = useState("10");
  const [maxHolderConcentration, setMaxHolderConcentration] = useState("20");
  const [minHolders, setMinHolders] = useState("200");
  const [minTokenAgeHours, setMinTokenAgeHours] = useState("24");

  const { data, isLoading, isError, error, refetch, isFetching } = useMemeScanner({
    timeframe,
    allowUnverified,
    minLiquidity,
    minVolume,
    maxRisk,
    maxBuyTax,
    maxSellTax,
    maxHolderConcentration,
    minHolders,
    minTokenAgeHours,
  });

  const rows = data?.buckets[bucket] ?? [];
  const b = data?.buckets;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Tokens discovered" value={data?.scanned ?? "—"} sub={`${data?.unavailableCount ?? 0} unavailable`} />
        <StatTile label="Passed safety filter" value={b?.safeFiltered.length ?? "—"} tone="up" />
        <StatTile label="Buy candidates" value={b?.buyCandidates.length ?? "—"} tone="brand" sub="After security veto" />
        <StatTile label="Early breakout" value={b?.earlyBreakout.length ?? "—"} tone="warn" />
        <StatTile label="AVOID (vetoed)" value={b?.avoid.length ?? "—"} tone="down" sub="Honeypot / critical risk" />
      </div>

      <Card
        title="Safety filters"
        icon={<Filter className="h-4 w-4 text-brand" />}
        subtitle="Conservative defaults. Tokens failing these checks cannot become buy candidates."
        actions={
          <div className="flex items-center gap-2">
            {data && <QualityBadge quality={data.quality} />}
            <Segmented
              size="sm"
              value={timeframe}
              onChange={setTimeframe}
              options={TF.map((t) => ({ value: t, label: t }))}
            />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Scanning…" : "Rescan"}
            </Button>
          </div>
        }
        bodyClassName="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field label="Min liquidity (USD)">
          <Input inputMode="decimal" value={minLiquidity} onChange={(e) => setMinLiquidity(e.target.value)} />
        </Field>
        <Field label="Min 24h volume (USD)">
          <Input inputMode="decimal" value={minVolume} onChange={(e) => setMinVolume(e.target.value)} />
        </Field>
        <Field label="Max meme risk">
          <Input inputMode="decimal" value={maxRisk} onChange={(e) => setMaxRisk(e.target.value)} />
        </Field>
        <Field label="Max buy tax (%)">
          <Input inputMode="decimal" value={maxBuyTax} onChange={(e) => setMaxBuyTax(e.target.value)} />
        </Field>
        <Field label="Max sell tax (%)">
          <Input inputMode="decimal" value={maxSellTax} onChange={(e) => setMaxSellTax(e.target.value)} />
        </Field>
        <Field label="Max top-10 holders (%)">
          <Input
            inputMode="decimal"
            value={maxHolderConcentration}
            onChange={(e) => setMaxHolderConcentration(e.target.value)}
          />
        </Field>
        <Field label="Min holder count">
          <Input inputMode="decimal" value={minHolders} onChange={(e) => setMinHolders(e.target.value)} />
        </Field>
        <Field label="Min token age (hours)">
          <Input inputMode="decimal" value={minTokenAgeHours} onChange={(e) => setMinTokenAgeHours(e.target.value)} />
        </Field>
        <label className="col-span-full flex cursor-pointer items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] text-warn">
          <input
            type="checkbox"
            checked={allowUnverified}
            onChange={(e) => setAllowUnverified(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-warn)]"
          />
          Allow unverified tokens (default off — tokens whose contract security cannot be verified are not buyable)
        </label>
      </Card>

      <Card
        title="Meme coin scanner"
        icon={bucket === "avoid" ? <ShieldAlert className="h-4 w-4 text-down" /> : <ShieldCheck className="h-4 w-4 text-up" />}
        subtitle={
          bucket === "safeFiltered"
            ? "Passed liquidity, security, tax and holder checks. Checks passed ≠ guaranteed safe."
            : bucket === "avoid"
              ? "Vetoed by the security engine — never shown as buy candidates."
              : undefined
        }
        actions={
          <div className="flex flex-wrap gap-1">
            {BUCKETS.map((t) => (
              <button
                key={t.value}
                onClick={() => setBucket(t.value)}
                aria-pressed={bucket === t.value}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  bucket === t.value ? "bg-brand/20 text-brand" : "text-dim hover:bg-panel-2 hover:text-muted"
                }`}
              >
                {t.label}
                {b ? ` ${b[t.value].length}` : ""}
              </button>
            ))}
          </div>
        }
        bodyClassName="p-2 sm:p-3"
      >
        {isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Unable to fetch meme market data."}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <SkeletonTable rows={8} />
        ) : !rows.length ? (
          <EmptyState
            title="No tokens in this bucket."
            description="Loosen the safety filters, or wait for the next discovery cycle. MarketAI will not show a token it could not verify as if it were safe."
          />
        ) : (
          <AssetTable rows={rows} variant={bucket === "earlyBreakout" ? "breakout" : "default"} />
        )}
      </Card>

      {data && data.unavailableCount > 0 && (
        <div className="rounded-xl border border-down/30 bg-down/5 px-4 py-3 text-[11px] text-down">
          <span className="font-semibold">DATA UNAVAILABLE for {data.unavailableCount} token(s).</span>{" "}
          {data.unavailable
            .slice(0, 2)
            .map((u) => `${u.symbol} — ${u.reason}`)
            .join(" · ")}
        </div>
      )}

      {b && (
        <Card title="Liquidity snapshot" icon={<Flame className="h-4 w-4 text-warn" />} bodyClassName="p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {b.safeFiltered.slice(0, 3).map((row) => (
              <div key={row.assetId} className="rounded-lg border border-line bg-panel-2/50 p-3">
                <p className="text-sm font-semibold text-bright">{row.symbol}</p>
                <p className="num mt-1 text-[11px] text-muted">
                  Liquidity {formatCompact(row.memeProfile?.liquidity.usd ?? null)} · Vol{" "}
                  {formatCompact(row.memeProfile?.activity.volume24h ?? null)}
                </p>
                <p className="num mt-1 text-[11px] text-dim">
                  Top10 {row.memeProfile?.holders.top10Percent?.toFixed(1) ?? "N/A"}% · Holders{" "}
                  {row.memeProfile?.holders.holderCount ?? "N/A"}
                </p>
                <Badge tone="neutral" className="mt-2">
                  {row.token?.chain ?? "—"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="rounded-xl border border-warn/25 bg-warn/5 p-3 text-[11px] leading-relaxed text-warn">
        {data?.disclaimer ??
          "Meme coins carry extreme risk. Security checks reduce but cannot eliminate smart-contract, liquidity, manipulation and rug-pull risk."}
      </p>
    </div>
  );
}
