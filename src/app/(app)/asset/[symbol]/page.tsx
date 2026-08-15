"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Activity, Bot, Gauge, Newspaper } from "lucide-react";
import { Badge, Button, Card, ErrorState, Progress, QualityBadge, SkeletonCard, SkeletonChart, StatTile } from "@/components/ui/kit";
import { ChangeText, LevelsGrid, RiskBadge, ScoreBadge, SetupCard, TrendBadge, WatchButton, BreakoutStatusBadge } from "@/components/market/widgets";
import { PriceChart } from "@/components/charts/price-chart";
import { PageHeader } from "@/components/shell/app-shell";
import { useAnalysis, useHistory } from "@/lib/api-client";
import { findAsset } from "@/data/universe";
import { parseMemeAssetId } from "@/lib/meme/config";
import { MemeTokenPanel } from "@/components/market/meme-token-panel";
import type { Timeframe } from "@/types/market";
import { formatCompact, formatPrice, formatTimeAgo, marketFlag } from "@/lib/utils";

export default function AssetDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params?.symbol ?? "").toString().toUpperCase();
  const memeRef = parseMemeAssetId(decodeURIComponent(symbol));
  const asset = memeRef ? null : findAsset(symbol);
  const market = memeRef ? ("MEME" as const) : asset?.market;
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");

  const { data, isLoading, isError, error, refetch } = useAnalysis(symbol, market, timeframe);
  // Meme tokens have no static reference entry — identity comes from the analysis payload.
  const displaySymbol = data?.analysis.symbol ?? asset?.symbol ?? memeRef?.address.slice(0, 8) ?? symbol;
  const displayName = data?.analysis.name ?? asset?.name ?? "Discovered token";
  const displayMarket = market ?? "MEME";
  const displaySector = data?.analysis.sector ?? asset?.sector ?? "N/A";
  const history = useHistory(symbol, market, timeframe, 300);
  const analysis = data?.analysis;

  if (!asset && !memeRef) {
    return (
      <div className="space-y-4">
        <PageHeader title="Asset not found." description={`No asset matches "${symbol}" in the configured universe.`} />
        <Link href="/scanner">
          <Button variant="outline">Back to scanner</Button>
        </Link>
      </div>
    );
  }

  const ind = analysis?.indicators;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${marketFlag(displayMarket)} ${displaySymbol}`}
        description={`${displayName} · ${displayMarket} · ${displaySector}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {analysis && <QualityBadge quality={analysis.quality} />}
            <WatchButton symbol={decodeURIComponent(symbol)} market={displayMarket} size="md" />
            <Link href={`/ai-analyst?symbol=${displaySymbol}`}>
              <Button variant="outline" size="sm">
                <Bot className="h-3.5 w-3.5" /> AI report
              </Button>
            </Link>
            <Link href={`/backtest?symbol=${displaySymbol}`}>
              <Button variant="outline" size="sm">
                <Gauge className="h-3.5 w-3.5" /> Backtest
              </Button>
            </Link>
          </div>
        }
      />

      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : "Unable to fetch market data."}
          onRetry={() => refetch()}
        />
      )}

      {analysis && (
        <p className="num text-[11px] text-dim">
          {analysis.meta.dataSource} · {analysis.meta.quality}
          {analysis.meta.delaySeconds !== null ? ` · ${analysis.meta.delaySeconds}s behind` : ""} · Updated{" "}
          {analysis.meta.asOf ? new Date(analysis.meta.asOf).toLocaleTimeString("en-GB", { hour12: false }) : "—"}
        </p>
      )}

      {isLoading || (!analysis && !isError) ? (
        <SkeletonCard rows={2} />
      ) : !analysis ? null : (
        <div className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-dim">Price</p>
            <p className="num text-2xl font-bold text-bright">{formatPrice(analysis.price, analysis.currency)}</p>
            <ChangeText value={analysis.changePercent} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-dim">AI Score</p>
            <div className="mt-1">
              <ScoreBadge score={analysis.aiScore} symbol={analysis.symbol} />
            </div>
            <Progress className="mt-2" value={analysis.aiScore.score} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-dim">Risk Score</p>
            <div className="mt-1">
              <RiskBadge risk={analysis.riskScore} />
            </div>
            <Progress className="mt-2" value={analysis.riskScore.score} tone={analysis.riskScore.score > 60 ? "down" : "warn"} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-dim">Trend / Momentum</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <TrendBadge trend={analysis.aiScore.trend} />
              <Badge tone="brand">{analysis.momentum.label}</Badge>
            </div>
            <p className="num mt-1 text-[11px] text-dim">Momentum {analysis.momentum.score.toFixed(0)}/100</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-dim">Breakout</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <BreakoutStatusBadge status={analysis.breakout.status} />
              <Badge tone="warn">{analysis.breakout.probability.toFixed(0)}/100</Badge>
            </div>
            <p className="num mt-1 text-[11px] text-dim">
              {analysis.breakout.distanceToResistance !== null
                ? `${analysis.breakout.distanceToResistance.toFixed(2)}% to R1`
                : "No clean resistance"}
            </p>
          </div>
        </div>
      )}

      {history.isError ? (
        <ErrorState
          message={history.error instanceof Error ? history.error.message : "Unable to fetch market data."}
          onRetry={() => history.refetch()}
        />
      ) : history.isLoading || !history.data ? (
        <SkeletonChart />
      ) : (
        <PriceChart
          symbol={displaySymbol}
          candles={history.data.candles}
          series={history.data.series}
          levels={history.data.levels}
          setup={history.data.setup}
          currency={history.data.currency}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          quality={history.data.quality}
          dataSource={history.data.dataSource}
          asOf={history.data.asOf}
          delaySeconds={history.data.delaySeconds}
        />
      )}

      {analysis?.memeProfile && <MemeTokenPanel profile={analysis.memeProfile} signal={analysis.signal} />}

      {analysis && ind && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card title="Momentum indicators" icon={<Activity className="h-4 w-4 text-brand" />} bodyClassName="space-y-2 p-4">
              <div className="grid grid-cols-2 gap-2">
                <StatTile label="RSI(14)" value={ind.rsi.toFixed(1)} tone={ind.rsi > 70 ? "down" : ind.rsi > 50 ? "up" : "warn"} sub={ind.rsiState} />
                <StatTile
                  label="MACD"
                  value={ind.macd.histogram.toFixed(4)}
                  tone={ind.macd.macd > ind.macd.signal ? "up" : "down"}
                  sub={`${ind.macd.crossover === "NONE" ? "no cross" : ind.macd.crossover.toLowerCase()} · hist ${ind.macd.histogramDirection.toLowerCase()}`}
                />
                <StatTile label="ADX(14)" value={ind.adx.adx.toFixed(1)} tone={ind.adx.adx > 25 ? "up" : "warn"} sub={ind.adx.strength.replace("_", " ")} />
                <StatTile label="ATR" value={`${ind.atrPercent.toFixed(2)}%`} tone="warn" sub={`ATR ${ind.atr.toFixed(4)}`} />
              </div>
            </Card>

            <Card title="Trend structure" bodyClassName="space-y-2 p-4">
              <div className="grid grid-cols-2 gap-2">
                <StatTile label="EMA20" value={formatPrice(ind.ema20, analysis.currency)} />
                <StatTile label="EMA50" value={formatPrice(ind.ema50, analysis.currency)} />
                <StatTile label="EMA200" value={formatPrice(ind.ema200, analysis.currency)} />
                <StatTile label="SMA20 / 50 / 200" value={`${ind.sma20.toFixed(2)}`} sub={`${ind.sma50.toFixed(2)} · ${ind.sma200.toFixed(2)}`} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={ind.emaAlignment === "BULLISH" ? "up" : ind.emaAlignment === "BEARISH" ? "down" : "neutral"}>
                  EMA {ind.emaAlignment}
                </Badge>
                {ind.goldenCross && <Badge tone="up">GOLDEN CROSS</Badge>}
                {ind.deathCross && <Badge tone="down">DEATH CROSS</Badge>}
                <Badge tone="neutral">{ind.priceAction.structure}</Badge>
              </div>
            </Card>

            <Card title="Volume & volatility" bodyClassName="space-y-2 p-4">
              <div className="grid grid-cols-2 gap-2">
                <StatTile label="Volume" value={formatCompact(ind.volume.volume)} sub={`${ind.volume.ratio.toFixed(2)}× avg`} />
                <StatTile label="Volume state" value={ind.volume.state} tone={ind.volume.ratio >= 1.5 ? "up" : "warn"} />
                <StatTile label="OBV flow" value={ind.volume.accumulation} tone={ind.volume.accumulation === "ACCUMULATION" ? "up" : "down"} sub={`slope ${ind.volume.obvSlope.toFixed(2)}%`} />
                <StatTile
                  label="Bollinger"
                  value={ind.bollinger.position.replace("_", " ")}
                  sub={`width pct ${ind.bollinger.widthPercentile.toFixed(0)}${ind.bollinger.squeeze ? " · squeeze" : ""}`}
                />
              </div>
            </Card>
          </div>

          <Card title="Support & Resistance" subtitle="Swing pivots clustered with ATR tolerance" bodyClassName="p-4">
            <LevelsGrid analysis={analysis} />
          </Card>

          <SetupCard analysis={analysis} />

          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Risk breakdown" bodyClassName="space-y-2 p-4">
              {analysis.riskScore.components.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">{c.label}</span>
                    <span className="num text-bright">
                      {c.score.toFixed(1)}/{c.max}
                    </span>
                  </div>
                  <Progress value={(c.score / c.max) * 100} tone={c.score / c.max > 0.6 ? "down" : "warn"} className="mt-1" />
                  <p className="mt-1 text-[11px] text-dim">{c.reason}</p>
                </div>
              ))}
            </Card>

            <Card title="Market data" bodyClassName="p-4">
              <div className="grid grid-cols-2 gap-2">
                <StatTile label="Open" value={formatPrice(analysis.quote.open, analysis.currency)} />
                <StatTile label="Prev close" value={formatPrice(analysis.quote.previousClose, analysis.currency)} />
                <StatTile label="Day high" value={formatPrice(analysis.quote.high, analysis.currency)} />
                <StatTile label="Day low" value={formatPrice(analysis.quote.low, analysis.currency)} />
                <StatTile label="52W high" value={analysis.quote.high52w ? formatPrice(analysis.quote.high52w, analysis.currency) : "N/A"} />
                <StatTile label="52W low" value={analysis.quote.low52w ? formatPrice(analysis.quote.low52w, analysis.currency) : "N/A"} />
                {Object.entries(analysis.quote.extras).map(([key, value]) => (
                  <StatTile
                    key={key}
                    label={key.replace(/([A-Z])/g, " $1").toUpperCase()}
                    value={
                      value === null
                        ? "N/A"
                        : typeof value === "number"
                          ? Math.abs(value) > 1e6
                            ? formatCompact(value)
                            : value.toLocaleString("en-US", { maximumFractionDigits: 4 })
                          : String(value)
                    }
                  />
                ))}
              </div>
            </Card>
          </div>

          <Card title="Signals detected" bodyClassName="flex flex-wrap gap-2 p-4">
            {analysis.aiScore.signals.length ? (
              analysis.aiScore.signals.map((signal) => (
                <Badge key={signal} tone="brand">
                  {signal}
                </Badge>
              ))
            ) : (
              <p className="text-xs text-muted">No notable signals on this timeframe.</p>
            )}
          </Card>

          <Card title="Related news" icon={<Newspaper className="h-4 w-4 text-info" />} bodyClassName="space-y-2 p-4">
            {data?.news.map((item) => (
              <div key={item.id} className="border-b border-line-soft pb-2 last:border-0">
                <p className="text-xs font-medium text-bright">{item.headline}</p>
                <p className="mt-1 flex items-center gap-2 text-[10px] text-dim">
                  <Badge tone={item.sentiment === "BULLISH" ? "up" : item.sentiment === "BEARISH" ? "down" : "neutral"}>
                    {item.sentiment}
                  </Badge>
                  {item.source} · {formatTimeAgo(item.publishedAt)}
                  <QualityBadge quality={item.quality} />
                </p>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
