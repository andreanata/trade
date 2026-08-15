"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bot, Sparkles } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Progress, QualityBadge, Segmented, Select, SkeletonCard, StatTile } from "@/components/ui/kit";
import { PageHeader } from "@/components/shell/app-shell";
import { useAiAnalysisMutation } from "@/lib/api-client";
import { UNIVERSE, findAsset } from "@/data/universe";
import type { MarketId, Timeframe } from "@/types/market";
import { TIMEFRAMES, formatTimeAgo } from "@/lib/utils";

const TYPES = [
  { value: "FULL", label: "Full report" },
  { value: "TECHNICAL", label: "Technical only" },
  { value: "BREAKOUT", label: "Breakout focus" },
  { value: "RISK", label: "Risk focus" },
];

function AnalystInner() {
  const search = useSearchParams();
  const initial = findAsset((search.get("symbol") ?? "BTC").toUpperCase()) ?? findAsset("BTC");
  const [market, setMarket] = useState<MarketId>(initial?.market ?? "CRYPTO");
  const [symbol, setSymbol] = useState(initial?.symbol ?? "BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [analysisType, setAnalysisType] = useState("FULL");

  const mutation = useAiAnalysisMutation();
  const report = mutation.data;
  const options = UNIVERSE.filter((a) => a.market === market);
  // Derived during render — avoids a setState-in-effect cascade when the market changes.
  const activeSymbol = options.some((o) => o.symbol === symbol) ? symbol : (options[0]?.symbol ?? "");

  return (
    <div className="space-y-4">
      <PageHeader
        title="🤖 AI Market Analyst"
        description="Structured market data is fed into the analyst engine — every figure in the report comes from the analytics pipeline, never invented."
        actions={report && <QualityBadge quality={report.quality} />}
      />

      <Card title="Analysis request" icon={<Bot className="h-4 w-4 text-brand" />} bodyClassName="space-y-3 p-4">
        <div className="grid gap-3 lg:grid-cols-5">
          <Field label="Market">
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
          </Field>
          <Field label="Asset">
            <Select value={activeSymbol} onChange={(e) => setSymbol(e.target.value)}>
              {options.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} — {a.name}
                </option>
              ))}
            </Select>
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
          <Field label="Analysis type">
            <Select value={analysisType} onChange={(e) => setAnalysisType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={mutation.isPending || !activeSymbol}
              onClick={() => mutation.mutate({ symbol: activeSymbol, market, timeframe, analysisType })}
            >
              <Sparkles className="h-3.5 w-3.5" /> {mutation.isPending ? "Analysing…" : "Generate analysis"}
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-dim">
          Engine: rule-based analyst by default. Configure <code className="num">AI_API_KEY</code> +{" "}
          <code className="num">AI_API_BASE_URL</code> to add an LLM narrative layer on top of the same structured data.
        </p>
      </Card>

      {mutation.isPending && <SkeletonCard rows={6} />}
      {mutation.isError && <p className="text-xs text-down">Unable to generate the report. Try another asset.</p>}

      {!report && !mutation.isPending && (
        <EmptyState title="No report generated yet." description="Pick an asset and press Generate analysis." />
      )}

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatTile label="AI Score" value={report.aiScore.toFixed(0)} tone="brand" sub={`${report.symbol} · ${report.timeframe}`} />
            <StatTile label="Risk Score" value={report.riskScore.toFixed(0)} tone={report.riskScore > 60 ? "down" : "warn"} />
            <StatTile label="Engine" value={report.engine.includes("LLM") ? "LLM + rules" : "Rule engine"} />
            <StatTile label="Generated" value={formatTimeAgo(report.generatedAt)} sub={report.analysisType} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {report.sections.map((section) => (
              <Card key={section.title} title={section.title} bodyClassName="p-4">
                <p className="text-xs leading-relaxed text-muted">{section.body}</p>
                <Badge
                  tone={section.tone === "POSITIVE" ? "up" : section.tone === "NEGATIVE" ? "down" : "neutral"}
                  className="mt-3"
                >
                  {section.tone}
                </Badge>
              </Card>
            ))}
          </div>

          <Card title="Potential scenarios" bodyClassName="grid gap-3 p-4 lg:grid-cols-3">
            <div className="rounded-xl border border-up/25 bg-up/5 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-up">Bullish scenario</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{report.scenarios.bullish}</p>
            </div>
            <div className="rounded-xl border border-warn/25 bg-warn/5 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-warn">Neutral scenario</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{report.scenarios.neutral}</p>
            </div>
            <div className="rounded-xl border border-down/25 bg-down/5 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-down">Bearish scenario</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{report.scenarios.bearish}</p>
            </div>
          </Card>

          <Card title="Conclusion" bodyClassName="space-y-3 p-4">
            <p className="text-sm leading-relaxed text-bright">{report.conclusion}</p>
            <Progress value={report.aiScore} />
            <div className="flex flex-wrap gap-2">
              <Link href={`/asset/${report.symbol}?market=${report.market}`}>
                <Button variant="outline" size="sm">
                  Open asset detail
                </Button>
              </Link>
              <Link href={`/backtest?symbol=${report.symbol}`}>
                <Button variant="outline" size="sm">
                  Backtest this asset
                </Button>
              </Link>
            </div>
            <p className="rounded-lg border border-warn/25 bg-warn/5 p-3 text-[11px] text-warn">{report.disclaimer}</p>
          </Card>
        </>
      )}
    </div>
  );
}

export default function AiAnalystPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
      <AnalystInner />
    </Suspense>
  );
}
