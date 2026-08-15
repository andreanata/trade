"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, Progress, Segmented, Select, SkeletonTable } from "@/components/ui/kit";
import { ChangeText, RiskBadge, ScoreBadge, TrendBadge } from "@/components/market/widgets";
import { PageHeader } from "@/components/shell/app-shell";
import { useWatchlist, useWatchlistMutations } from "@/lib/api-client";
import { UNIVERSE } from "@/data/universe";
import type { MarketId, Timeframe } from "@/types/market";
import { TIMEFRAMES, formatCompact, formatPrice, marketFlag } from "@/lib/utils";

export default function WatchlistPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState<MarketId>("US");
  const { data, isLoading, isError, refetch } = useWatchlist(timeframe);
  const { add, remove, reorder } = useWatchlistMutations(timeframe);

  const rows = data?.rows ?? [];
  const options = UNIVERSE.filter((a) => a.market === market);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((r) => r.id));
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Watchlist"
        description="Track assets with live technical scoring. Add, remove and reorder — data is stored per browser session."
        actions={
          <Segmented
            size="sm"
            value={timeframe}
            onChange={setTimeframe}
            options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
          />
        }
      />

      <Card title="Add asset" icon={<Plus className="h-4 w-4 text-brand" />} bodyClassName="grid gap-3 p-4 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
        <Segmented
          size="sm"
          value={market}
          onChange={setMarket}
          options={[
            { value: "US", label: "US Stocks" },
            { value: "CRYPTO", label: "Crypto" },
            { value: "MEME", label: "Meme Coins" },
          ]}
        />
        <Select value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Select asset">
          <option value="">Select an asset…</option>
          {options.map((a) => (
            <option key={a.symbol} value={a.symbol}>
              {a.symbol} — {a.name}
            </option>
          ))}
        </Select>
        <Button
          disabled={!symbol || add.isPending}
          onClick={() => {
            if (!symbol) return;
            add.mutate({ symbol, market });
            setSymbol("");
          }}
        >
          Add to watchlist
        </Button>
      </Card>

      <Card
        title="Tracked assets"
        icon={<Star className="h-4 w-4 text-warn" />}
        subtitle={`${rows.length} asset(s) · ${timeframe}`}
        bodyClassName="p-2 sm:p-3"
      >
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <SkeletonTable rows={5} />
        ) : !rows.length ? (
          <EmptyState
            title="Your watchlist is empty."
            description="Add an asset above, or use the ⭐ button on any scanner row."
            action={
              <Link href="/scanner">
                <Button variant="outline" size="sm">
                  Open scanner
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => {
              const a = row.analysis;
              return (
                <div key={row.id} className="rounded-xl border border-line bg-panel-2/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <button aria-label="Move up" onClick={() => move(index, -1)} className="text-dim hover:text-bright">
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button aria-label="Move down" onClick={() => move(index, 1)} className="text-dim hover:text-bright">
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                      <Link href={`/asset/${row.symbol}?market=${row.market}`} className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-bright">
                          {marketFlag(row.market)} {row.symbol}
                        </p>
                        <p className="truncate text-[11px] text-dim">{a?.name ?? "Data unavailable"}</p>
                      </Link>
                    </div>

                    {a ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-right">
                          <p className="num text-sm font-semibold text-bright">{formatPrice(a.price, a.currency)}</p>
                          <ChangeText value={a.changePercent} className="text-[11px]" />
                        </div>
                        <div className="num hidden text-[11px] text-muted sm:block">
                          RSI {a.indicators.rsi.toFixed(1)} · Vol {a.indicators.volume.ratio.toFixed(2)}× ·{" "}
                          {formatCompact(a.volume)}
                        </div>
                        <Badge tone={a.indicators.macd.macd > a.indicators.macd.signal ? "up" : "down"}>
                          MACD {a.indicators.macd.macd > a.indicators.macd.signal ? "BULL" : "BEAR"}
                        </Badge>
                        <TrendBadge trend={a.aiScore.trend} />
                        <RiskBadge risk={a.riskScore} />
                        <ScoreBadge score={a.aiScore} symbol={a.symbol} />
                      </div>
                    ) : (
                      <Badge tone="down">DATA UNAVAILABLE</Badge>
                    )}

                    <Button variant="danger" size="sm" onClick={() => remove.mutate({ id: row.id })} aria-label={`Remove ${row.symbol}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {a && <Progress className="mt-2" value={a.aiScore.score} />}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
