"use client";

import { useState } from "react";
import { Flame, Info } from "lucide-react";
import { Badge, Card, ErrorState, Field, Input, Progress, QualityBadge, Segmented, SkeletonTable, StatTile } from "@/components/ui/kit";
import { AssetTable, BreakoutStatusBadge } from "@/components/market/widgets";
import { PageHeader } from "@/components/shell/app-shell";
import { useBreakoutScan } from "@/lib/api-client";
import type { MarketId, Timeframe } from "@/types/market";
import { TIMEFRAMES, formatPrice } from "@/lib/utils";

const STATUSES = ["ALL", "WATCH", "EARLY", "BREAKOUT", "CONFIRMED"] as const;

export default function BreakoutPage() {
  const [market, setMarket] = useState<MarketId | "ALL">("ALL");
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [minProbability, setMinProbability] = useState("45");
  const [maxDistance, setMaxDistance] = useState("6");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("ALL");

  const { data, isLoading, isError, refetch } = useBreakoutScan({
    market,
    timeframe,
    minProbability,
    maxDistance,
    status,
  });

  const top = data?.rows[0];

  return (
    <div className="space-y-4">
      <PageHeader
        title="🔥 Early Breakout Detector"
        description="Assets pressing into resistance with expanding volume, higher lows, accumulation and rising trend strength."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data && <QualityBadge quality={data.quality} />}
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
            <Segmented
              size="sm"
              value={timeframe}
              onChange={setTimeframe}
              options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
            />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Candidates" value={data?.total ?? "—"} tone="warn" sub={`Scanned ${data?.scanned ?? 0} assets`} />
        <StatTile
          label="Best model score"
          value={top ? `${top.breakout.probability.toFixed(0)}%` : "—"}
          tone="brand"
          sub={top ? `${top.symbol} · ${top.breakout.probabilityLabel.replace("_", " ")}` : "No candidate"}
        />
        <StatTile
          label="Volume confirmed"
          value={data ? data.rows.filter((r) => r.breakout.volumeConfirmed).length : "—"}
          tone="up"
          sub="Volume ≥ 1.5× average"
        />
        <StatTile
          label="Avg false-breakout risk"
          value={
            data && data.rows.length
              ? `${(data.rows.reduce((s, r) => s + r.breakout.falseBreakoutRisk, 0) / data.rows.length).toFixed(0)}/100`
              : "—"
          }
          tone="down"
        />
      </div>

      <Card title="Detector settings" bodyClassName="grid gap-3 p-4 sm:grid-cols-3">
        <Field label="Min breakout model score" hint="Weighted model output, 0–100">
          <Input inputMode="decimal" value={minProbability} onChange={(e) => setMinProbability(e.target.value)} />
        </Field>
        <Field label="Max distance to resistance (%)" hint="Filters out extended moves">
          <Input inputMode="decimal" value={maxDistance} onChange={(e) => setMaxDistance(e.target.value)} />
        </Field>
        <Field label="Status">
          <Segmented
            size="sm"
            value={status}
            onChange={setStatus}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </Field>
      </Card>

      <Card
        title="Breakout candidates"
        icon={<Flame className="h-4 w-4 text-warn" />}
        subtitle={data?.note}
        bodyClassName="p-2 sm:p-3"
      >
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <SkeletonTable rows={8} />
        ) : (
          <AssetTable
            rows={data?.rows ?? []}
            variant="breakout"
            emptyLabel="No breakout candidates found. Lower the minimum model score or widen the distance filter."
          />
        )}
      </Card>

      {data?.rows.slice(0, 3).map((row) => (
        <Card
          key={`checklist-${row.symbol}`}
          title={`${row.symbol} — breakout checklist`}
          subtitle={`${row.name} · ${row.market}`}
          actions={
            <div className="flex items-center gap-2">
              <BreakoutStatusBadge status={row.breakout.status} />
              <Badge tone="brand">{row.breakout.probability.toFixed(0)}/100</Badge>
            </div>
          }
          bodyClassName="space-y-3 p-4"
        >
          <div className="grid gap-2 sm:grid-cols-4">
            <StatTile label="Price" value={formatPrice(row.price, row.currency)} />
            <StatTile
              label="Resistance 1"
              value={row.breakout.resistance ? formatPrice(row.breakout.resistance, row.currency) : "N/A"}
              tone="down"
            />
            <StatTile
              label="Distance"
              value={row.breakout.distanceToResistance !== null ? `${row.breakout.distanceToResistance.toFixed(2)}%` : "N/A"}
              tone="warn"
            />
            <StatTile label="False breakout risk" value={`${row.breakout.falseBreakoutRisk.toFixed(0)}/100`} tone="down" />
          </div>
          <Progress value={row.breakout.probability} tone="brand" />
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {row.breakout.checklist.map((item) => (
              <li key={item.label} className="flex items-start gap-2 rounded-lg border border-line bg-panel-2/40 px-3 py-2">
                <span className={item.passed ? "text-up" : "text-dim"}>{item.passed ? "✓" : "○"}</span>
                <span>
                  <span className="block text-xs font-semibold text-bright">{item.label}</span>
                  <span className="block text-[11px] text-muted">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <div className="flex items-start gap-2 rounded-xl border border-line bg-panel-2/40 p-4 text-[11px] text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p>
          Breakout Probability bands: 0–30% Low · 31–60% Moderate · 61–80% High · 81–100% Very High. The score is a
          weighted model output built from technical conditions — it is not a statistical probability and does not
          guarantee that a breakout will occur.
        </p>
      </div>
    </div>
  );
}
