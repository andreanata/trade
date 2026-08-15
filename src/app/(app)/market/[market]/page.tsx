"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Layers } from "lucide-react";
import { Badge, Card, ErrorState, QualityBadge, Segmented, SkeletonCard, SkeletonTable, StatTile } from "@/components/ui/kit";
import { AssetTable, MarketOverviewCard, MiniAssetRow } from "@/components/market/widgets";
import { PageHeader } from "@/components/shell/app-shell";
import { useMovers } from "@/lib/api-client";
import { MemeScanner } from "@/components/market/meme-scanner";
import type { MarketId, Timeframe } from "@/types/market";
import { TIMEFRAMES, formatCompact } from "@/lib/utils";

const TABS = [
  { value: "topPotential", label: "Top Potential" },
  { value: "gainers", label: "Top Gainers" },
  { value: "losers", label: "Top Losers" },
  { value: "mostVolume", label: "Most Volume" },
  { value: "mostMomentum", label: "Most Momentum" },
  { value: "mostVolatile", label: "Most Volatile" },
  { value: "earlyBreakout", label: "Early Breakout" },
  { value: "oversold", label: "Oversold" },
  { value: "overbought", label: "Overbought" },
] as const;

type TabKey = (typeof TABS)[number]["value"];

const TITLES: Record<MarketId, { title: string; description: string }> = {
  US: {
    title: "🇺🇸 US Stocks",
    description: "US large caps and high-beta names scanned across trend, momentum and volatility.",
  },
  CRYPTO: {
    title: "🪙 Crypto Market",
    description: "Digital assets scanned 24/7 for momentum, liquidity and breakout structure.",
  },
  MEME: {
    title: "🐸 Meme Coin Scanner",
    description:
      "Tokens discovered on-chain, then filtered for liquidity, contract security, honeypot risk and holder concentration before any signal is issued.",
  },
};

export default function MarketPage() {
  const params = useParams<{ market: string }>();
  const raw = (params?.market ?? "us").toString().toUpperCase();
  const market: MarketId = raw === "CRYPTO" ? "CRYPTO" : raw === "MEME" ? "MEME" : "US";
  const isMeme = market === "MEME";
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [tab, setTab] = useState<TabKey>("topPotential");

  const { data, isLoading, isError, refetch } = useMovers(market, timeframe);
  const meta = TITLES[market];
  const rows = data?.movers[tab] ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data && <QualityBadge quality={data.overview.quality} />}
            <Segmented
              size="sm"
              value={timeframe}
              onChange={setTimeframe}
              options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
            />
          </div>
        }
      />

      {isMeme ? (
        <MemeScanner />
      ) : (
        <>
      {isError && <ErrorState onRetry={() => refetch()} />}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {isLoading || !data ? <SkeletonCard rows={3} /> : <MarketOverviewCard overview={data.overview} />}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading || !data ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} rows={1} />)
          ) : (
            <>
              <StatTile label="Universe" value={data.universeSize} sub="Assets analysed" />
              <StatTile
                label="Advancers / Decliners"
                value={`${data.overview.advancers}/${data.overview.decliners}`}
                tone={data.overview.advancers >= data.overview.decliners ? "up" : "down"}
                sub="Market breadth"
              />
              <StatTile
                label="News sentiment"
                value={data.newsSentiment.label}
                tone={data.newsSentiment.label === "BULLISH" ? "up" : data.newsSentiment.label === "BEARISH" ? "down" : "warn"}
                sub={`Net ${data.newsSentiment.netScore}`}
              />
              {market === "US" && (
                <StatTile
                  label="Movers > 2%"
                  value={data.overview.extras.preMarketMovers === null ? "N/A" : String(data.overview.extras.preMarketMovers)}
                  sub="Pre/after-hours: N/A (vendor does not expose it)"
                />
              )}
              {market === "CRYPTO" && (
                <StatTile
                  label="24h turnover"
                  value={
                    data.overview.extras.totalVolume24h === null
                      ? "N/A"
                      : formatCompact(Number(data.overview.extras.totalVolume24h))
                  }
                  sub={
                    data.overview.extras.aggregatedMarketCap === null
                      ? "Market cap: N/A"
                      : `Market cap ${formatCompact(Number(data.overview.extras.aggregatedMarketCap))}`
                  }
                />
              )}
              {isMeme && (
                <StatTile
                  label="Pooled liquidity"
                  value={
                    data.overview.extras.totalLiquidity === null
                      ? "N/A"
                      : formatCompact(Number(data.overview.extras.totalLiquidity))
                  }
                  tone="warn"
                  sub={`${data.overview.extras.verifiedCount ?? 0} passed checks · ${data.overview.extras.avoidCount ?? 0} AVOID`}
                />
              )}
            </>
          )}
        </div>
      </div>

      <Card
        title="Market screens"
        icon={<Layers className="h-4 w-4 text-brand" />}
        actions={
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                aria-pressed={tab === t.value}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  tab === t.value ? "bg-brand/20 text-brand" : "text-dim hover:bg-panel-2 hover:text-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
        bodyClassName="p-2 sm:p-3"
      >
        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : (
          <AssetTable
            rows={rows}
            variant={tab === "earlyBreakout" ? "breakout" : "default"}
            emptyLabel="No assets match this screen right now."
          />
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Sector snapshot" bodyClassName="p-2">
          {isLoading || !data ? (
            <SkeletonTable rows={4} />
          ) : (
            Object.entries(
              data.movers.topPotential.reduce<Record<string, number>>((acc, row) => {
                acc[row.sector] = (acc[row.sector] ?? 0) + row.aiScore.score;
                return acc;
              }, {}),
            )
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([sector, score]) => (
                <div key={sector} className="flex items-center justify-between px-2 py-2 text-xs">
                  <span className="text-muted">{sector}</span>
                  <Badge tone="brand">{(score / 10).toFixed(0)} pts</Badge>
                </div>
              ))
          )}
        </Card>
        <Card title="Momentum leaders" bodyClassName="p-2">
          {isLoading || !data
            ? <SkeletonTable rows={4} />
            : data.movers.mostMomentum.slice(0, 5).map((row) => <MiniAssetRow key={row.symbol} row={row} metric="momentum" />)}
        </Card>
        <Card title="Volume leaders" bodyClassName="p-2">
          {isLoading || !data
            ? <SkeletonTable rows={4} />
            : data.movers.mostVolume.slice(0, 5).map((row) => <MiniAssetRow key={row.symbol} row={row} metric="volume" />)}
        </Card>
      </div>
        </>
      )}
    </div>
  );
}
