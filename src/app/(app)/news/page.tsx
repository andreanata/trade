"use client";

import { useState } from "react";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { Badge, Card, EmptyState, ErrorState, QualityBadge, Segmented, SkeletonTable, StatTile } from "@/components/ui/kit";
import { PageHeader } from "@/components/shell/app-shell";
import { useNewsFeed } from "@/lib/api-client";
import type { MarketId, SentimentLabel } from "@/types/market";
import { formatTimeAgo } from "@/lib/utils";

export default function NewsPage() {
  const [market, setMarket] = useState<MarketId | "ALL">("ALL");
  const [filter, setFilter] = useState<SentimentLabel | "ALL">("ALL");
  const { data, isLoading, isError, refetch } = useNewsFeed(market);

  const items = (data?.items ?? []).filter((i) => filter === "ALL" || i.sentiment === filter);
  const aggregate = data?.aggregate;

  return (
    <div className="space-y-4">
      <PageHeader
        title="📰 Market News & Sentiment"
        description="Headline sentiment aggregated per market. Sentiment feeds the AI Score sentiment component."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <QualityBadge quality={data?.quality ?? "UNAVAILABLE"} source={data?.dataSource} />
            <Segmented
              value={market}
              onChange={setMarket}
              options={[
                { value: "ALL", label: "All" },
                { value: "US", label: "US Stocks" },
                { value: "CRYPTO", label: "Crypto" },
                { value: "MEME", label: "Meme Coins" },
              ]}
            />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Aggregate"
          value={aggregate?.label ?? "—"}
          tone={aggregate?.label === "BULLISH" ? "up" : aggregate?.label === "BEARISH" ? "down" : "warn"}
          sub={`Net score ${aggregate?.netScore ?? 0}`}
        />
        <StatTile label="Bullish" value={aggregate?.bullish ?? 0} tone="up" />
        <StatTile label="Neutral" value={aggregate?.neutral ?? 0} tone="warn" />
        <StatTile label="Bearish" value={aggregate?.bearish ?? 0} tone="down" />
      </div>

      <Card
        title="Headlines"
        icon={<Newspaper className="h-4 w-4 text-info" />}
        actions={
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ALL", label: "All" },
              { value: "BULLISH", label: "Positive" },
              { value: "NEUTRAL", label: "Neutral" },
              { value: "BEARISH", label: "Negative" },
            ]}
          />
        }
        bodyClassName="p-2 sm:p-3"
      >
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <SkeletonTable rows={6} />
        ) : data && !data.available ? (
          <EmptyState
            title="DATA UNAVAILABLE"
            description={
              data.reason ??
              "No news vendor is configured. Set NEWS_API_KEY to enable real headlines — MarketAI will not invent coverage."
            }
          />
        ) : !items.length ? (
          <EmptyState title="No headlines match this filter." />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-line bg-panel-2/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug text-bright">{item.headline}</p>
                    <p className="mt-1 text-xs text-muted">{item.summary}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-dim">
                      <span className="font-semibold text-muted">{item.source}</span>
                      <span>{formatTimeAgo(item.publishedAt)}</span>
                      {item.symbols.map((s) => (
                        <Link key={s} href={`/asset/${s}`} className="rounded border border-line px-1.5 py-0.5 text-brand hover:underline">
                          {s}
                        </Link>
                      ))}
                      <QualityBadge quality={item.quality} />
                    </p>
                  </div>
                  <Badge tone={item.sentiment === "BULLISH" ? "up" : item.sentiment === "BEARISH" ? "down" : "neutral"}>
                    {item.sentiment} {item.sentimentScore > 0 ? "+" : ""}
                    {item.sentimentScore.toFixed(0)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="rounded-xl border border-warn/25 bg-warn/5 p-3 text-[11px] text-warn">
        In REAL mode a licensed news vendor is required (<code className="num">NEWS_API_KEY</code>). Without it this module
        reports DATA UNAVAILABLE. Demo headlines are only ever served when <code className="num">MOCK_MODE=true</code>, and
        are always labelled DEMO.
      </p>
    </div>
  );
}
