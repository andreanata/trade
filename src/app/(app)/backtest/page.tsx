"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { FlaskConical, Play } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, QualityBadge, Segmented, Select, StatTile } from "@/components/ui/kit";
import { PageHeader } from "@/components/shell/app-shell";
import { useBacktestMutation } from "@/lib/api-client";
import { UNIVERSE, findAsset } from "@/data/universe";
import type { MarketId, StrategyId, Timeframe } from "@/types/market";
import { TIMEFRAMES, formatPercent } from "@/lib/utils";

const STRATEGIES: { value: StrategyId; label: string; detail: string }[] = [
  { value: "RSI", label: "RSI reversal", detail: "Enter when RSI(14) crosses back above 35, exit above 70 or below 25." },
  { value: "MACD", label: "MACD crossover", detail: "Enter on bullish MACD crossover, exit on bearish crossover." },
  { value: "EMA_CROSS", label: "EMA 20/50 cross", detail: "Enter when EMA20 crosses above EMA50, exit on the inverse cross." },
  { value: "BREAKOUT", label: "Breakout", detail: "Enter on a 20-bar high break with volume > 1.4× average above EMA50." },
  { value: "MOMENTUM", label: "Momentum", detail: "Enter on 10-bar ROC > 2.5% with RSI > 52 and expanding MACD histogram." },
  { value: "AI_SCORE", label: "Combined AI Score", detail: "Enter when the composite bar-by-bar score ≥ 68, exit ≤ 42." },
];

function BacktestInner() {
  const search = useSearchParams();
  const initialSymbol = (search.get("symbol") ?? "NVDA").toUpperCase();
  const initialAsset = findAsset(initialSymbol) ?? findAsset("NVDA");

  const [market, setMarket] = useState<MarketId>(initialAsset?.market ?? "US");
  const [symbol, setSymbol] = useState(initialAsset?.symbol ?? "NVDA");
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [strategy, setStrategy] = useState<StrategyId>("AI_SCORE");
  const [capital, setCapital] = useState("10000");
  const [bars, setBars] = useState("500");

  const mutation = useBacktestMutation();
  const result = mutation.data;
  const options = UNIVERSE.filter((a) => a.market === market);
  // Derived during render — avoids a setState-in-effect cascade when the market changes.
  const activeSymbol = options.some((o) => o.symbol === symbol) ? symbol : (options[0]?.symbol ?? "");

  const run = () =>
    mutation.mutate({
      symbol: activeSymbol,
      market,
      timeframe,
      strategy,
      bars: Number(bars) || 500,
      initialCapital: Number(capital) || 10000,
    });

  return (
    <div className="space-y-4">
      <PageHeader
        title="🧪 Backtest Engine"
        description="Simulate rule-based strategies on historical bars. Results are computed from the same series the scanner uses — no synthetic performance."
        actions={result && <QualityBadge quality={result.quality} />}
      />

      <Card title="Configuration" icon={<FlaskConical className="h-4 w-4 text-brand" />} bodyClassName="space-y-3 p-4">
        <div className="grid gap-3 lg:grid-cols-6">
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
                  {a.symbol}
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
          <Field label="Strategy">
            <Select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyId)}>
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Initial capital">
            <Input inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} />
          </Field>
          <Field label="Bars (range)">
            <Input inputMode="numeric" value={bars} onChange={(e) => setBars(e.target.value)} />
          </Field>
        </div>
        <p className="rounded-lg border border-line bg-panel-2/50 p-2 text-[11px] text-muted">
          {STRATEGIES.find((s) => s.value === strategy)?.detail} A fixed −8% stop and 0.1% round-trip fee are applied.
        </p>
        <Button onClick={run} disabled={mutation.isPending || !activeSymbol}>
          <Play className="h-3.5 w-3.5" /> {mutation.isPending ? "Running…" : "Run backtest"}
        </Button>
        {mutation.isError && <p className="text-xs text-down">Unable to run this backtest. Try a different timeframe.</p>}
      </Card>

      {!result ? (
        <EmptyState title="No backtest yet." description="Configure a strategy and run it to see equity curve and trade statistics." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Initial capital" value={result.initialCapital.toLocaleString("en-US")} />
            <StatTile
              label="Final capital"
              value={result.finalCapital.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              tone={result.finalCapital >= result.initialCapital ? "up" : "down"}
            />
            <StatTile label="Total return" value={formatPercent(result.totalReturn)} tone={result.totalReturn >= 0 ? "up" : "down"} sub={`Buy & hold ${formatPercent(result.buyHoldReturn)}`} />
            <StatTile label="Win rate" value={`${result.winRate.toFixed(1)}%`} tone={result.winRate >= 50 ? "up" : "warn"} sub={`Loss rate ${result.lossRate.toFixed(1)}%`} />
            <StatTile label="Trades" value={result.tradeCount} sub={`${result.from.slice(0, 10)} → ${result.to.slice(0, 10)}`} />
            <StatTile label="Profit factor" value={result.profitFactor.toFixed(2)} tone={result.profitFactor >= 1.5 ? "up" : "warn"} />
            <StatTile label="Max drawdown" value={`${result.maxDrawdown.toFixed(2)}%`} tone="down" />
            <StatTile label="Sharpe ratio" value={result.sharpeRatio.toFixed(2)} tone={result.sharpeRatio > 1 ? "up" : "warn"} />
            <StatTile label="Strategy" value={result.strategy.replace("_", " ")} tone="brand" sub={`${result.symbol} · ${result.timeframe}`} />
            <StatTile label="Market" value={result.market} />
          </div>

          <Card title="Equity curve" subtitle="Strategy equity vs buy & hold benchmark" bodyClassName="p-3">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.equityCurve} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="#141c2c" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(t: number) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    stroke="#5b6780"
                    fontSize={10}
                    minTickGap={40}
                  />
                  <YAxis stroke="#5b6780" fontSize={10} width={54} domain={["auto", "auto"]} />
                  <RTooltip
                    contentStyle={{ background: "#0e1524", border: "1px solid #1a2438", borderRadius: 10, fontSize: 12 }}
                    labelFormatter={(t) => new Date(Number(t)).toLocaleString("en-GB")}
                  />
                  <Line type="monotone" dataKey="equity" stroke="#6c7cff" strokeWidth={2} dot={false} name="Strategy" />
                  <Line type="monotone" dataKey="benchmark" stroke="#7d8aa5" strokeWidth={1.2} dot={false} strokeDasharray="4 3" name="Buy & hold" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Trades" subtitle={`${result.trades.length} most recent closed trades`} bodyClassName="p-2 sm:p-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] uppercase tracking-widest text-dim">
                    <th className="px-3 py-2">Entry</th>
                    <th className="px-3 py-2">Exit</th>
                    <th className="px-3 py-2">Entry price</th>
                    <th className="px-3 py-2">Exit price</th>
                    <th className="px-3 py-2">Bars</th>
                    <th className="px-3 py-2">Return</th>
                    <th className="px-3 py-2">P/L</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={`${t.entryTime}-${i}`} className="border-b border-line-soft">
                      <td className="num px-3 py-2 text-muted">{new Date(t.entryTime).toLocaleDateString("en-GB")}</td>
                      <td className="num px-3 py-2 text-muted">{new Date(t.exitTime).toLocaleDateString("en-GB")}</td>
                      <td className="num px-3 py-2 text-bright">{t.entryPrice}</td>
                      <td className="num px-3 py-2 text-bright">{t.exitPrice}</td>
                      <td className="num px-3 py-2 text-muted">{t.bars}</td>
                      <td className={`num px-3 py-2 font-semibold ${t.returnPercent >= 0 ? "text-up" : "text-down"}`}>
                        {formatPercent(t.returnPercent)}
                      </td>
                      <td className={`num px-3 py-2 ${t.pnl >= 0 ? "text-up" : "text-down"}`}>{t.pnl.toFixed(2)}</td>
                      <td className="px-3 py-2 text-dim">{t.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!result.trades.length && (
              <p className="px-3 py-6 text-center text-xs text-muted">This strategy produced no trades on the selected range.</p>
            )}
          </Card>

          <p className="rounded-xl border border-warn/25 bg-warn/5 p-3 text-[11px] text-warn">
            <Badge tone="warn" className="mr-2">
              Note
            </Badge>
            Backtests are simplified simulations without slippage modelling or intrabar execution detail. Past performance
            of a rule set is not indicative of future results.
          </p>
        </>
      )}
    </div>
  );
}

export default function BacktestPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
      <BacktestInner />
    </Suspense>
  );
}
