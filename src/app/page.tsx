import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  Flame,
  Gauge,
  LineChart,
  Newspaper,
  Radar,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

const FEATURES = [
  {
    icon: Brain,
    title: "AI Score",
    body: "A transparent 0–100 model combining RSI, MACD, EMA structure, volume, breakout conditions, ADX, price action and sentiment — with a full breakdown of every point awarded.",
  },
  {
    icon: Flame,
    title: "Early Breakout",
    body: "Detects assets pressing into resistance with expanding volume, higher lows, accumulation and rising ADX — before the move is obvious.",
  },
  {
    icon: LineChart,
    title: "Technical Analysis",
    body: "RSI, MACD, EMA/SMA 20-50-200, Bollinger Bands, ADX, ATR, OBV and volume analytics across 8 timeframes.",
  },
  {
    icon: ShieldAlert,
    title: "Risk Analysis",
    body: "Volatility, drawdown, liquidity, volume instability and overbought conditions rolled into a single LOW → EXTREME risk score.",
  },
  {
    icon: Gauge,
    title: "Backtesting",
    body: "Test RSI, MACD, EMA cross, breakout, momentum or combined AI-score strategies with equity curve, profit factor, Sharpe and drawdown.",
  },
  {
    icon: Newspaper,
    title: "Market News",
    body: "Headline sentiment aggregated per asset and market, feeding directly into the sentiment component of the AI Score.",
  },
];

const MARKETS = [
  { flag: "🐸", label: "Meme Coins", detail: "On-chain discovery · security scanned" },
  { flag: "🇺🇸", label: "United States", detail: "NVDA · AAPL · TSLA · AMD · PLTR" },
  { flag: "🪙", label: "Cryptocurrency", detail: "BTC · ETH · SOL · LINK · SUI" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-2 text-xs font-black text-white">
              M
            </span>
            <span className="text-sm font-black tracking-widest text-bright">MARKETAI</span>
            <span className="ml-2 rounded-md border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] font-bold text-warn">
              DEMO DATA
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/scanner"
              className="hidden rounded-lg px-3 py-2 text-sm text-muted transition hover:text-bright sm:block"
            >
              Scanner
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg bg-gradient-to-r from-brand to-brand-2 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Open Terminal
            </Link>
          </nav>
        </div>
      </header>

      <section className="grid-lines relative overflow-hidden border-b border-line">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] font-semibold text-brand">
            <Sparkles className="h-3 w-3" />
            AI market scanning · US Stocks · Crypto · Meme Coins
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight tracking-tight text-bright sm:text-6xl">
            Find Momentum Before the Market Moves.
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-muted sm:text-lg">
            AI-powered market scanning for US stocks, crypto, and meme coins. Technical scoring, early breakout
            detection, risk analytics and backtesting in one professional terminal.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_-18px_rgba(108,124,255,0.9)] transition hover:brightness-110"
            >
              Explore Market <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/scanner"
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel-2/70 px-5 py-3 text-sm font-semibold text-bright transition hover:border-brand/60"
            >
              <Radar className="h-4 w-4" /> Open Scanner
            </Link>
            <Link
              href="/ai-analyst"
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel-2/70 px-5 py-3 text-sm font-semibold text-bright transition hover:border-brand/60"
            >
              <Bot className="h-4 w-4" /> AI Analyst
            </Link>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            {MARKETS.map((m) => (
              <div key={m.label} className="panel p-4">
                <p className="text-2xl">{m.flag}</p>
                <p className="mt-2 text-sm font-semibold text-bright">{m.label}</p>
                <p className="num mt-1 text-[11px] text-dim">{m.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold text-bright">Everything a momentum desk needs</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every score is computed from live indicator math on OHLCV data — nothing is hardcoded, and every number can be
          traced back to its component.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <article key={f.title} className="panel p-5 transition hover:border-brand/40">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-bright">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{f.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-line bg-bg-soft/40">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="panel p-6">
            <h2 className="text-lg font-bold text-bright">Analysis only — never execution</h2>
            <p className="mt-2 text-sm text-muted">
              MarketAI provides analytical information only and does not provide guaranteed investment returns or execute
              trades. It is not a broker, it does not connect to brokerage accounts, it never requests broker credentials,
              and it never places orders.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-dim">
              {["Potential", "Momentum", "Technical Score", "AI Score", "Risk Score", "Breakout Probability", "Setup Quality"].map(
                (term) => (
                  <span key={term} className="rounded-md border border-line bg-panel-2/60 px-2 py-1">
                    {term}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line px-4 py-8 text-center text-[11px] leading-relaxed text-dim">
        <p className="mx-auto max-w-4xl">
          MarketAI is an analytical tool. Market data may be delayed or incomplete. Scores and signals are estimates based
          on technical and market data and are not financial advice or guarantees of future performance.
        </p>
        <p className="mt-3">
          <Link href="/dashboard" className="text-brand hover:underline">
            Enter the terminal →
          </Link>
        </p>
      </footer>
    </div>
  );
}
