"use client";

import Link from "next/link";
import { useState } from "react";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Progress, QualityBadge, Segmented, Select, SkeletonTable, StatTile } from "@/components/ui/kit";
import { PageHeader } from "@/components/shell/app-shell";
import { usePortfolio, usePortfolioMutations } from "@/lib/api-client";
import { UNIVERSE } from "@/data/universe";
import type { MarketId } from "@/types/market";
import { formatPercent, formatPrice, marketFlag } from "@/lib/utils";

export default function PortfolioPage() {
  const { data, isLoading, isError, refetch } = usePortfolio();
  const { add, remove } = usePortfolioMutations();
  const [market, setMarket] = useState<MarketId>("US");
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const options = UNIVERSE.filter((a) => a.market === market);
  const summary = data?.summary;

  const submit = () => {
    setError(null);
    const qty = Number(quantity);
    const price = Number(buyPrice);
    if (!symbol) return setError("Select an asset first.");
    if (!Number.isFinite(qty) || qty <= 0) return setError("Quantity must be greater than zero.");
    if (!Number.isFinite(price) || price <= 0) return setError("Buy price must be greater than zero.");
    add.mutate(
      { symbol, market, quantity: qty, buyPrice: price, buyDate },
      {
        onSuccess: () => {
          setSymbol("");
          setQuantity("");
          setBuyPrice("");
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Portfolio"
        description="Manually tracked positions valued against current analytical prices. MarketAI never connects to a broker account."
        actions={data && <QualityBadge quality={data.positions[0]?.quality ?? "DEMO"} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)
        ) : (
          <>
            <StatTile label="Invested" value={summary.invested.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
            <StatTile label="Current value" value={summary.currentValue.toLocaleString("en-US", { maximumFractionDigits: 2 })} tone="brand" />
            <StatTile
              label="Profit / Loss"
              value={summary.profitLoss.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              tone={summary.profitLoss >= 0 ? "up" : "down"}
            />
            <StatTile
              label="Return"
              value={formatPercent(summary.profitLossPercent)}
              tone={summary.profitLossPercent >= 0 ? "up" : "down"}
              sub={`${summary.positions} position(s)`}
            />
          </>
        )}
      </div>

      <Card title="Add position" icon={<Plus className="h-4 w-4 text-brand" />} bodyClassName="space-y-3 p-4">
        <div className="grid gap-3 lg:grid-cols-5">
          <Field label="Market">
            <Segmented
              size="sm"
              value={market}
              onChange={(v) => {
                setMarket(v);
                setSymbol("");
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
              <option value="">Select…</option>
              {options.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} — {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity">
            <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="100" />
          </Field>
          <Field label="Buy price">
            <Input inputMode="decimal" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Buy date">
            <Input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-xs text-down">{error}</p>}
        <Button onClick={submit} disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add position"}
        </Button>
      </Card>

      <Card title="Positions" icon={<Briefcase className="h-4 w-4 text-brand" />} subtitle={data?.note} bodyClassName="p-2 sm:p-3">
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <SkeletonTable rows={4} />
        ) : !data?.positions.length ? (
          <EmptyState
            title="No positions yet."
            description="Add your first manually tracked position above to see allocation and P/L analytics."
          />
        ) : (
          <div className="space-y-2">
            {data.positions.map((p) => (
              <div key={p.id} className="rounded-xl border border-line bg-panel-2/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link href={`/asset/${p.symbol}?market=${p.market}`} className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-bright">
                      {marketFlag(p.market)} {p.symbol}
                    </p>
                    <p className="num truncate text-[11px] text-dim">
                      {p.quantity} @ {formatPrice(p.buyPrice, p.currency)} · {p.buyDate}
                    </p>
                  </Link>
                  <div className="num grid grid-cols-2 gap-x-6 gap-y-1 text-right text-[11px] sm:grid-cols-4">
                    <span className="text-muted">
                      Now
                      <span className="ml-1 text-bright">{p.currentPrice === null ? "N/A" : formatPrice(p.currentPrice, p.currency)}</span>
                    </span>
                    <span className="text-muted">
                      Value
                      <span className="ml-1 text-bright">{p.currentValue === null ? "N/A" : p.currentValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                    </span>
                    <span className={p.profitLoss !== null && p.profitLoss >= 0 ? "text-up" : "text-down"}>
                      {p.profitLoss === null ? "N/A" : p.profitLoss.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </span>
                    <span className={p.profitLossPercent !== null && p.profitLossPercent >= 0 ? "text-up" : "text-down"}>
                      {p.profitLossPercent === null ? "N/A" : formatPercent(p.profitLossPercent)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.aiScore !== null && <Badge tone="brand">AI {p.aiScore.toFixed(0)}</Badge>}
                    {p.riskScore !== null && <Badge tone={p.riskScore > 60 ? "down" : "warn"}>RISK {p.riskScore.toFixed(0)}</Badge>}
                    <Button variant="danger" size="sm" onClick={() => remove.mutate(p.id)} aria-label={`Remove ${p.symbol}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={p.allocation} />
                  <span className="num text-[11px] text-dim">{p.allocation.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
