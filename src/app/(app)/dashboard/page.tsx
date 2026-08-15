"use client";

import Link from "next/link";
import { AlertTriangle, Bot, Flame, Gauge, Newspaper, Rocket, TrendingDown, TrendingUp } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, QualityBadge, Segmented, SkeletonCard, SkeletonTable, StatTile } from "@/components/ui/kit";
import { AssetTable, MarketOverviewCard, MiniAssetRow } from "@/components/market/widgets";
import { PageHeader } from "@/components/shell/app-shell";
import { useTerminal } from "@/components/providers";
import { useDashboard } from "@/lib/api-client";
import type { MarketId, Timeframe } from "@/types/market";
import { TIMEFRAMES, formatTimeAgo } from "@/lib/utils";

const MARKET_OPTIONS: { value: MarketId | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "US", label: "🇺🇸 US Stocks" },
  { value: "CRYPTO", label: "🪙 Crypto" },
  { value: "MEME", label: "🐸 Meme Coins" },
];

export default function DashboardPage() {
  const { market, timeframe, setMarket, setTimeframe } = useTerminal();
  const { data, isLoading, isError, refetch } = useDashboard(market, timeframe);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Market Terminal"
        description="Momentum, breakout potential, security risk and signals across US stocks, crypto and meme coins — recomputed from real OHLCV on every scan."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={market} options={MARKET_OPTIONS} onChange={setMarket} ariaLabel="Market filter" />
            <Segmented
              size="sm"
              value={timeframe}
              options={TIMEFRAMES.map((tf) => ({ value: tf as Timeframe, label: tf }))}
              onChange={setTimeframe}
              ariaLabel="Timeframe"
            />
          </div>
        }
      />

      {isError && <ErrorState onRetry={() => refetch()} />}

      {/* Per-market provider status — every market can use a different vendor */}
      {data && (
        <section className="panel flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-dim">Data status</span>
          {data.providers.map((p) => (
            <div key={p.market} className="flex items-center gap-2 rounded-lg border border-line bg-panel-2/50 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-bright">{p.market}</span>
              <span className="text-[11px] text-muted">{p.dataSource}</span>
              <QualityBadge quality={p.quality} compact />
            </div>
          ))}
          <span className="num ml-auto text-[11px] text-dim">
            Mode {data.mode} · Updated {new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour12: false })}
          </span>
        </section>
      )}

      {data && data.unavailableCount > 0 && (
        <div className="rounded-xl border border-down/30 bg-down/5 px-4 py-3 text-[11px] text-down">
          <span className="font-semibold">DATA UNAVAILABLE for {data.unavailableCount} asset(s).</span>{" "}
          {data.unavailable
            .slice(0, 3)
            .map((u) => `${u.symbol} (${u.reason})`)
            .join(" · ")}
          . These assets are omitted — MarketAI never substitutes demo values for real data.
        </div>
      )}

      {/* 📊 MARKET OVERVIEW */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted">
          📊 Market Overview
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} rows={2} />)
            : data?.overviews.map((o) => <MarketOverviewCard key={o.market} overview={o} />)}
        </div>
      </section>

      {/* Breadth + sentiment strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {isLoading || !data ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} rows={1} />)
        ) : (
          <>
            <StatTile
              label="📈 Bullish assets"
              value={`${data.breadth.bullish}/${data.breadth.universe}`}
              tone="up"
              sub={`${data.breadth.bearish} bearish · ${data.breadth.neutral} neutral`}
            />
            <StatTile label="🤖 Avg AI Score" value={data.breadth.avgScore.toFixed(1)} tone="brand" sub="Universe average" />
            <StatTile
              label="⚠️ Avg Risk"
              value={data.breadth.avgRisk.toFixed(1)}
              tone={data.breadth.avgRisk > 55 ? "down" : data.breadth.avgRisk > 40 ? "warn" : "up"}
              sub="0 = calm · 100 = extreme"
            />
            <StatTile
              label="📰 News sentiment"
              value={data.newsAvailable ? data.newsSentiment.label : "N/A"}
              tone={
                !data.newsAvailable
                  ? "muted"
                  : data.newsSentiment.label === "BULLISH"
                    ? "up"
                    : data.newsSentiment.label === "BEARISH"
                      ? "down"
                      : "warn"
              }
              sub={data.newsAvailable ? `Net score ${data.newsSentiment.netScore}` : "News vendor unavailable"}
            />
            <StatTile
              label="🔥 Breakout candidates"
              value={data.earlyBreakout.length}
              tone="warn"
              sub={`Scanned ${data.breadth.universe} assets`}
            />
          </>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {/* 🚀 TOP POTENTIAL */}
          <Card
            title="🚀 TOP POTENTIAL"
            subtitle="Highest AI Score — click a score to see the full breakdown"
            icon={<Rocket className="h-4 w-4 text-brand" />}
            actions={
              <>
                {data && <QualityBadge quality={data.topPotential[0]?.quality ?? "DEMO"} />}
                <Link href="/scanner">
                  <Button variant="outline" size="sm">
                    Open scanner
                  </Button>
                </Link>
              </>
            }
            bodyClassName="p-2 sm:p-3"
          >
            {isLoading ? <SkeletonTable /> : <AssetTable rows={data?.topPotential ?? []} />}
          </Card>

          {/* 🔥 EARLY BREAKOUT */}
          <Card
            title="🔥 EARLY BREAKOUT"
            subtitle="Approaching resistance with volume, structure and trend confirmation"
            icon={<Flame className="h-4 w-4 text-warn" />}
            actions={
              <Link href="/breakout">
                <Button variant="outline" size="sm">
                  Full detector
                </Button>
              </Link>
            }
            bodyClassName="p-2 sm:p-3"
          >
            {isLoading ? (
              <SkeletonTable rows={4} />
            ) : (
              <AssetTable
                rows={data?.earlyBreakout ?? []}
                variant="breakout"
                emptyLabel="No breakout candidates found for this market and timeframe."
              />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="📈 Momentum Leaders" icon={<TrendingUp className="h-4 w-4 text-up" />} bodyClassName="p-2">
            {isLoading ? (
              <SkeletonTable rows={4} />
            ) : data?.momentumLeaders.length ? (
              data.momentumLeaders.slice(0, 6).map((row) => <MiniAssetRow key={row.symbol} row={row} metric="momentum" />)
            ) : (
              <EmptyState title="No momentum leaders yet." />
            )}
          </Card>

          <Card title="Top Gainers / Losers" icon={<TrendingDown className="h-4 w-4 text-down" />} bodyClassName="p-2">
            {isLoading ? (
              <SkeletonTable rows={4} />
            ) : (
              <div className="space-y-1">
                {data?.gainers.slice(0, 4).map((row) => <MiniAssetRow key={`g-${row.symbol}`} row={row} />)}
                <div className="my-2 border-t border-line" />
                {data?.losers.slice(0, 4).map((row) => <MiniAssetRow key={`l-${row.symbol}`} row={row} />)}
              </div>
            )}
          </Card>

          <Card title="⚠️ Risk Radar" icon={<AlertTriangle className="h-4 w-4 text-warn" />} bodyClassName="p-2">
            {isLoading ? (
              <SkeletonTable rows={3} />
            ) : (
              data?.riskRadar.slice(0, 5).map((row) => <MiniAssetRow key={`r-${row.symbol}`} row={row} metric="risk" />)
            )}
          </Card>

          <Card
            title="📰 Market News"
            icon={<Newspaper className="h-4 w-4 text-info" />}
            actions={data && <Badge tone={data.newsSentiment.label === "BULLISH" ? "up" : data.newsSentiment.label === "BEARISH" ? "down" : "warn"}>{data.newsSentiment.label}</Badge>}
            bodyClassName="p-3"
          >
            {isLoading ? (
              <SkeletonTable rows={3} />
            ) : !data?.newsAvailable ? (
              <p className="rounded-lg border border-down/30 bg-down/5 p-3 text-[11px] text-down">
                DATA UNAVAILABLE — {data?.newsReason ?? "no news vendor configured."}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {data?.news.slice(0, 5).map((item) => (
                  <li key={item.id} className="border-b border-line-soft pb-2 last:border-0">
                    <p className="text-xs font-medium leading-snug text-bright">{item.headline}</p>
                    <p className="mt-1 flex items-center gap-2 text-[10px] text-dim">
                      <Badge tone={item.sentiment === "BULLISH" ? "up" : item.sentiment === "BEARISH" ? "down" : "neutral"}>
                        {item.sentiment}
                      </Badge>
                      {item.source} · {formatTimeAgo(item.publishedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/news" className="mt-3 block text-[11px] text-brand hover:underline">
              All headlines →
            </Link>
          </Card>

          <Card title="Quick actions" icon={<Gauge className="h-4 w-4 text-brand" />} bodyClassName="p-3">
            <div className="grid grid-cols-2 gap-2">
              <Link href="/ai-analyst">
                <Button variant="outline" size="sm" className="w-full">
                  <Bot className="h-3.5 w-3.5" /> AI Analyst
                </Button>
              </Link>
              <Link href="/backtest">
                <Button variant="outline" size="sm" className="w-full">
                  <Gauge className="h-3.5 w-3.5" /> Backtest
                </Button>
              </Link>
              <Link href="/watchlist">
                <Button variant="outline" size="sm" className="w-full">
                  Watchlist
                </Button>
              </Link>
              <Link href="/alerts">
                <Button variant="outline" size="sm" className="w-full">
                  Alerts
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {data && (
        <p className="text-center text-[11px] text-dim">
          Scan generated {formatTimeAgo(data.generatedAt)} · {data.breadth.universe} assets analysed on {data.timeframe}
        </p>
      )}
    </div>
  );
}
