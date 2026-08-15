"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, BellRing, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, QualityBadge, Segmented, Select, SkeletonTable, StatTile } from "@/components/ui/kit";
import { PageHeader } from "@/components/shell/app-shell";
import { useAlertMutations, useAlerts } from "@/lib/api-client";
import { ALERT_METRICS } from "@/lib/engine/alerts";
import { UNIVERSE } from "@/data/universe";
import type { AlertMetric, MarketId, Timeframe } from "@/types/market";
import { TIMEFRAMES, formatTimeAgo, marketFlag } from "@/lib/utils";

export default function AlertsPage() {
  const { data, isLoading, isError, refetch } = useAlerts();
  const { create, toggle, remove } = useAlertMutations();
  const [market, setMarket] = useState<MarketId>("CRYPTO");
  const [symbol, setSymbol] = useState("BTC");
  const [metric, setMetric] = useState<AlertMetric>("AI_SCORE_ABOVE");
  const [threshold, setThreshold] = useState("85");
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [note, setNote] = useState("");

  const options = UNIVERSE.filter((a) => a.market === market);
  const metricMeta = ALERT_METRICS.find((m) => m.value === metric);
  const alerts = data?.alerts ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Alert Engine"
        description="Rule-based alerts evaluated against the same analytics engine that powers the scanner. Alerts are informational only."
        actions={
          <Badge tone={data?.triggeredCount ? "down" : "neutral"}>
            <BellRing className="h-3 w-3" /> {data?.triggeredCount ?? 0} triggered
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total alerts" value={alerts.length} />
        <StatTile label="Active" value={alerts.filter((a) => a.active).length} tone="brand" />
        <StatTile label="Currently triggered" value={alerts.filter((a) => a.triggered && a.active).length} tone="down" />
      </div>

      <Card title="Create alert" icon={<Plus className="h-4 w-4 text-brand" />} bodyClassName="space-y-3 p-4">
        <div className="grid gap-3 lg:grid-cols-5">
          <Field label="Market">
            <Segmented
              size="sm"
              value={market}
              onChange={(v) => {
                setMarket(v);
                setSymbol(UNIVERSE.find((a) => a.market === v)?.symbol ?? "");
              }}
              options={[
                { value: "US", label: "US Stocks" },
                { value: "CRYPTO", label: "Crypto" },
                { value: "MEME", label: "Meme Coins" },
              ]}
            />
          </Field>
          <Field label="Asset">
            <Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {options.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} — {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Condition">
            <Select value={metric} onChange={(e) => setMetric(e.target.value as AlertMetric)}>
              {ALERT_METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Threshold" hint={metricMeta?.needsThreshold ? `Unit: ${metricMeta.unit || "value"}` : "Not required"}>
            <Input
              inputMode="decimal"
              value={threshold}
              disabled={!metricMeta?.needsThreshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </Field>
          <Field label="Timeframe">
            <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Watching for breakout confirmation" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={create.isPending || !symbol}
            onClick={() =>
              create.mutate(
                {
                  symbol,
                  market,
                  metric,
                  threshold: Number(threshold) || 0,
                  timeframe,
                  note: note || undefined,
                },
                { onSuccess: () => setNote("") },
              )
            }
          >
            {create.isPending ? "Creating…" : "Create alert"}
          </Button>
          <p className="text-[11px] text-dim">
            Example: “Notify me when BTC AI Score &gt; 85” or “Notify when NVDA breaks Resistance 1”.
          </p>
        </div>
      </Card>

      <Card title="Your alerts" icon={<Bell className="h-4 w-4 text-brand" />} bodyClassName="p-2 sm:p-3">
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <SkeletonTable rows={4} />
        ) : !alerts.length ? (
          <EmptyState title="No alerts configured." description="Create your first rule above to monitor score, price or breakout conditions." />
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl border p-3 transition ${
                  alert.triggered && alert.active ? "border-down/50 bg-down/5" : "border-line bg-panel-2/50"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/asset/${alert.symbol}?market=${alert.market}`} className="text-sm font-semibold text-bright">
                      {marketFlag(alert.market)} {alert.symbol}
                    </Link>
                    <p className="text-[11px] text-muted">
                      {ALERT_METRICS.find((m) => m.value === alert.metric)?.label} {alert.threshold ? alert.threshold : ""} ·{" "}
                      {alert.timeframe}
                    </p>
                    {alert.note && <p className="mt-1 text-[11px] text-dim">{alert.note}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-[11px] text-muted">{alert.message}</span>
                    <QualityBadge quality={alert.quality} />
                    <Badge tone={alert.triggered && alert.active ? "down" : "neutral"}>
                      {alert.triggered ? "TRIGGERED" : "WAITING"}
                    </Badge>
                    <Button
                      variant={alert.active ? "subtle" : "outline"}
                      size="sm"
                      onClick={() => toggle.mutate({ id: alert.id, active: !alert.active })}
                    >
                      {alert.active ? "Pause" : "Resume"}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => remove.mutate(alert.id)} aria-label={`Delete alert ${alert.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {alert.lastTriggeredAt && (
                  <p className="mt-1 text-[10px] text-dim">Last triggered {formatTimeAgo(alert.lastTriggeredAt)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
