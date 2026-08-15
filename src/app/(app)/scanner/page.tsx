"use client";

import { useMemo, useState } from "react";
import { Filter, Radar, RotateCcw } from "lucide-react";
import { Badge, Button, Card, ErrorState, Field, Input, QualityBadge, Segmented, Select, SkeletonTable } from "@/components/ui/kit";
import { AssetTable } from "@/components/market/widgets";
import { PageHeader } from "@/components/shell/app-shell";
import { useScan } from "@/lib/api-client";
import type { MarketId, ScannerTag, SortKey, Timeframe } from "@/types/market";
import { TIMEFRAMES } from "@/lib/utils";
import { listSectors } from "@/data/universe";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "AI_SCORE", label: "Highest AI Score" },
  { value: "MOMENTUM", label: "Highest Momentum" },
  { value: "VOLUME", label: "Highest Volume" },
  { value: "CHANGE", label: "Highest Change" },
  { value: "RISK_ASC", label: "Lowest Risk" },
  { value: "BREAKOUT", label: "Highest Breakout Probability" },
];

const TAGS: { value: ScannerTag; label: string }[] = [
  { value: "BULLISH_TREND", label: "Bullish trend" },
  { value: "BEARISH_TREND", label: "Bearish trend" },
  { value: "MOMENTUM_INCREASING", label: "Momentum ↑" },
  { value: "MOMENTUM_DECREASING", label: "Momentum ↓" },
  { value: "VOLUME_SPIKE", label: "Volume spike" },
  { value: "BREAKOUT", label: "Breakout" },
  { value: "APPROACHING_BREAKOUT", label: "Approaching breakout" },
  { value: "OVERSOLD", label: "Oversold" },
  { value: "OVERBOUGHT", label: "Overbought" },
  { value: "ACCUMULATION", label: "Accumulation" },
  { value: "DISTRIBUTION", label: "Distribution" },
  { value: "SQUEEZE", label: "BB squeeze" },
];

interface StrategyRule {
  id: string;
  label: string;
  apply: (state: FilterState) => FilterState;
}

interface FilterState {
  market: MarketId | "ALL";
  timeframe: Timeframe;
  sector: string;
  minPrice: string;
  maxPrice: string;
  minChange: string;
  minVolumeRatio: string;
  minRsi: string;
  maxRsi: string;
  macd: "ANY" | "BULLISH" | "BEARISH";
  minAdx: string;
  minAiScore: string;
  maxRisk: string;
  minBreakout: string;
  trend: "ANY" | "BULLISH" | "BEARISH";
  sort: SortKey;
  tags: ScannerTag[];
}

const DEFAULTS: FilterState = {
  market: "ALL",
  timeframe: "1D",
  sector: "ALL",
  minPrice: "",
  maxPrice: "",
  minChange: "",
  minVolumeRatio: "",
  minRsi: "",
  maxRsi: "",
  macd: "ANY",
  minAdx: "",
  minAiScore: "",
  maxRisk: "",
  minBreakout: "",
  trend: "ANY",
  sort: "AI_SCORE",
  tags: [],
};

const STRATEGY_RULES: StrategyRule[] = [
  { id: "rsi", label: "RSI > 50", apply: (s) => ({ ...s, minRsi: "50" }) },
  { id: "macd", label: "MACD bullish", apply: (s) => ({ ...s, macd: "BULLISH" }) },
  { id: "ema", label: "EMA20 > EMA50 (bullish trend)", apply: (s) => ({ ...s, trend: "BULLISH" }) },
  { id: "vol", label: "Volume ratio > 1.5", apply: (s) => ({ ...s, minVolumeRatio: "1.5" }) },
  { id: "adx", label: "ADX > 25", apply: (s) => ({ ...s, minAdx: "25" }) },
  { id: "score", label: "AI Score > 75", apply: (s) => ({ ...s, minAiScore: "75" }) },
];

export default function ScannerPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULTS);
  const [activeRules, setActiveRules] = useState<string[]>([]);
  const sectors = useMemo(() => listSectors(filters.market), [filters.market]);

  const effective = useMemo(() => {
    let state = { ...filters };
    for (const rule of STRATEGY_RULES) {
      if (activeRules.includes(rule.id)) state = rule.apply(state);
    }
    return state;
  }, [filters, activeRules]);

  const { data, isLoading, isError, refetch, isFetching } = useScan({
    market: effective.market,
    timeframe: effective.timeframe,
    sector: effective.sector === "ALL" ? undefined : effective.sector,
    minPrice: effective.minPrice,
    maxPrice: effective.maxPrice,
    minChange: effective.minChange,
    minVolumeRatio: effective.minVolumeRatio,
    minRsi: effective.minRsi,
    maxRsi: effective.maxRsi,
    macd: effective.macd,
    minAdx: effective.minAdx,
    minAiScore: effective.minAiScore,
    maxRisk: effective.maxRisk,
    minBreakout: effective.minBreakout,
    trend: effective.trend,
    tags: effective.tags.join(","),
    sort: effective.sort,
    limit: 60,
  });

  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Momentum Scanner"
        description="Filter the full universe by trend, momentum, volume, volatility, AI Score, risk and breakout conditions."
        actions={
          <div className="flex items-center gap-2">
            {data && <QualityBadge quality={data.quality} />}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCcw className="h-3.5 w-3.5" /> {isFetching ? "Scanning…" : "Rescan"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Filters" icon={<Filter className="h-4 w-4 text-brand" />} bodyClassName="space-y-3 p-4">
            <Field label="Market">
              <Segmented
                size="sm"
                value={filters.market}
                onChange={(v) => set("market", v)}
                options={[
                  { value: "ALL", label: "All" },
                  { value: "MEME", label: "Meme" },
                  { value: "US", label: "US" },
                  { value: "CRYPTO", label: "Crypto" },
                ]}
              />
            </Field>
            <Field label="Timeframe">
              <Segmented
                size="sm"
                value={filters.timeframe}
                onChange={(v) => set("timeframe", v)}
                options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
              />
            </Field>
            <Field label="Sector">
              <Select value={filters.sector} onChange={(e) => set("sector", e.target.value)}>
                <option value="ALL">All sectors</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Min price">
                <Input inputMode="decimal" value={filters.minPrice} onChange={(e) => set("minPrice", e.target.value)} placeholder="0" />
              </Field>
              <Field label="Max price">
                <Input inputMode="decimal" value={filters.maxPrice} onChange={(e) => set("maxPrice", e.target.value)} placeholder="∞" />
              </Field>
              <Field label="Min change %">
                <Input inputMode="decimal" value={filters.minChange} onChange={(e) => set("minChange", e.target.value)} placeholder="-100" />
              </Field>
              <Field label="Min vol ratio">
                <Input inputMode="decimal" value={filters.minVolumeRatio} onChange={(e) => set("minVolumeRatio", e.target.value)} placeholder="1.0" />
              </Field>
              <Field label="RSI min">
                <Input inputMode="decimal" value={filters.minRsi} onChange={(e) => set("minRsi", e.target.value)} placeholder="0" />
              </Field>
              <Field label="RSI max">
                <Input inputMode="decimal" value={filters.maxRsi} onChange={(e) => set("maxRsi", e.target.value)} placeholder="100" />
              </Field>
              <Field label="Min ADX">
                <Input inputMode="decimal" value={filters.minAdx} onChange={(e) => set("minAdx", e.target.value)} placeholder="0" />
              </Field>
              <Field label="Min AI Score">
                <Input inputMode="decimal" value={filters.minAiScore} onChange={(e) => set("minAiScore", e.target.value)} placeholder="0" />
              </Field>
              <Field label="Max risk">
                <Input inputMode="decimal" value={filters.maxRisk} onChange={(e) => set("maxRisk", e.target.value)} placeholder="100" />
              </Field>
              <Field label="Min breakout %">
                <Input inputMode="decimal" value={filters.minBreakout} onChange={(e) => set("minBreakout", e.target.value)} placeholder="0" />
              </Field>
            </div>
            <Field label="MACD">
              <Segmented
                size="sm"
                value={filters.macd}
                onChange={(v) => set("macd", v)}
                options={[
                  { value: "ANY", label: "Any" },
                  { value: "BULLISH", label: "Bullish" },
                  { value: "BEARISH", label: "Bearish" },
                ]}
              />
            </Field>
            <Field label="Trend">
              <Segmented
                size="sm"
                value={filters.trend}
                onChange={(v) => set("trend", v)}
                options={[
                  { value: "ANY", label: "Any" },
                  { value: "BULLISH", label: "Bullish" },
                  { value: "BEARISH", label: "Bearish" },
                ]}
              />
            </Field>
            <Field label="Signals">
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map((tag) => {
                  const active = filters.tags.includes(tag.value);
                  return (
                    <button
                      key={tag.value}
                      aria-pressed={active}
                      onClick={() =>
                        set(
                          "tags",
                          active ? filters.tags.filter((t) => t !== tag.value) : [...filters.tags, tag.value],
                        )
                      }
                      className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                        active ? "border-brand/50 bg-brand/15 text-brand" : "border-line bg-panel-2/60 text-dim hover:text-muted"
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Button variant="subtle" size="sm" className="w-full" onClick={() => { setFilters(DEFAULTS); setActiveRules([]); }}>
              Reset filters
            </Button>
          </Card>

          <Card title="Strategy Builder" subtitle="Toggle rules to compose a setup" bodyClassName="space-y-2 p-4">
            <p className="rounded-lg border border-line bg-panel-2/50 p-2 text-[11px] text-muted">
              IF {activeRules.length ? STRATEGY_RULES.filter((r) => activeRules.includes(r.id)).map((r) => r.label).join(" AND ") : "…"}{" "}
              THEN <span className="font-semibold text-brand">Potential Bullish Setup</span>
            </p>
            {STRATEGY_RULES.map((rule) => {
              const active = activeRules.includes(rule.id);
              return (
                <label key={rule.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-panel-2/40 px-3 py-2 text-xs">
                  <span className={active ? "text-bright" : "text-muted"}>{rule.label}</span>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => setActiveRules((prev) => (active ? prev.filter((r) => r !== rule.id) : [...prev, rule.id]))}
                    className="h-4 w-4 accent-[var(--color-brand)]"
                  />
                </label>
              );
            })}
          </Card>
        </div>

        <Card
          title="Scan results"
          icon={<Radar className="h-4 w-4 text-brand" />}
          subtitle={data ? `${data.total} of ${data.scanned} assets match · ${data.timeframe}` : "Running scan…"}
          actions={
            <div className="flex items-center gap-2">
              {data?.riskPreference && <Badge tone="neutral">{data.riskPreference}</Badge>}
              <Select className="w-56" value={filters.sort} onChange={(e) => set("sort", e.target.value as SortKey)}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          }
          bodyClassName="p-2 sm:p-3"
        >
          {data && data.unavailableCount > 0 && (
            <div className="mb-2 rounded-lg border border-down/30 bg-down/5 px-3 py-2 text-[11px] text-down">
              DATA UNAVAILABLE for {data.unavailableCount} asset(s):{" "}
              {data.unavailable
                .slice(0, 2)
                .map((u) => `${u.symbol} — ${u.reason}`)
                .join(" · ")}
              . Unavailable assets are excluded from the scan instead of being demo-filled.
            </div>
          )}
          {isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <SkeletonTable rows={8} />
          ) : (
            <AssetTable rows={data?.rows ?? []} />
          )}
        </Card>
      </div>
    </div>
  );
}
