# 🚀 MARKETAI — AI Market Scanner

Professional market-analysis terminal for **🇺🇸 US stocks**, **🪙 crypto** and **🐸 meme coins**.
MarketAI scans the universe for momentum, breakout potential, trend quality, volume expansion and risk — and explains
every number it produces.

> MarketAI is an **analysis tool only**. It is not a broker, it never connects to a brokerage account, never asks for
> broker credentials, and never executes orders.

---

## Features

| Module | What it does |
| --- | --- |
| 📊 **Dashboard** | Market overview for US Stocks / Crypto / Meme Coins, breadth, sentiment, top opportunities, early breakout, momentum leaders, risk radar |
| 🚀 **Top Potential** | Ranks assets by AI Score with sortable momentum / volume / change / risk columns |
| 🔎 **Momentum Scanner** | Full filter set (market, sector, price, change, volume ratio, RSI, MACD, ADX, AI Score, risk, breakout) + strategy builder |
| 🔥 **Early Breakout** | Detects assets pressing into resistance with volume expansion, higher lows, accumulation and rising ADX, with a per-asset checklist |
| 🤖 **AI Score** | 0–100 weighted model (RSI 15 · MACD 15 · EMA Trend 15 · Volume 15 · Breakout 15 · ADX 10 · Price Action 10 · Sentiment 5) with full breakdown per component |
| ⚠️ **Risk Score** | Volatility, drawdown, volume instability, liquidity, distance from resistance, overbought, regime → LOW / MEDIUM / HIGH / EXTREME |
| 📈 **Asset detail** | Candlestick + volume + EMA20/50/200 + Bollinger + S/R + setup markers, RSI / MACD / ADX panes, zoom, pan, crosshair, fullscreen |
| 🧪 **Backtest** | RSI, MACD, EMA cross, breakout, momentum and combined AI-score strategies with equity curve, profit factor, Sharpe, drawdown |
| 🤖 **AI Analyst** | Structured, data-grounded report (trend, momentum, technicals, volume, S/R, breakout, risk, scenarios, conclusion) |
| 📰 **News sentiment** | Headline sentiment per asset/market feeding the AI Score sentiment component |
| ⭐ **Watchlist / 💼 Portfolio / 🔔 Alerts** | Persisted per session in PostgreSQL, with live analytics on every row |

### Terminology

Potential · Momentum · Bullish/Bearish · Technical Score · AI Score · Risk Score · Breakout Probability · Setup Quality.
Never "guaranteed", "sure profit" or "100% accurate" — every output is an estimate.

---

## Tech stack

- **Next.js (App Router)** with React 19 + TypeScript — Vercel-native serverless API routes
- **Tailwind CSS v4** design system (dark financial terminal theme)
- **TanStack Query** for server state, React Context for terminal preferences
- **Recharts** for equity curves, custom SVG engine for the candlestick terminal chart
- **Lucide React** icons
- **Drizzle ORM + PostgreSQL** (Supabase-compatible) for watchlist, portfolio, alerts, settings, backtest history

---

## Folder structure

```
src/
├── app/
│   ├── (app)/                # terminal shell: dashboard, market, scanner, breakout,
│   │                         # asset detail, watchlist, portfolio, alerts, news,
│   │                         # backtest, ai-analyst, settings
│   ├── api/                  # serverless route handlers
│   │   ├── market/{quote,history,search,overview}
│   │   ├── scanner/{momentum,breakout}
│   │   ├── technical/analyze
│   │   ├── ai/analyze
│   │   ├── {dashboard,news,backtest,alerts,watchlist,portfolio,settings,health}
│   ├── layout.tsx            # SEO metadata + providers
│   └── page.tsx              # landing page
├── components/
│   ├── charts/               # candlestick/volume/indicator chart engine
│   ├── market/               # score badges, tables, overview cards, setup cards
│   ├── shell/                # sidebar, header, global search, mobile nav
│   └── ui/                   # design-system primitives (card, badge, skeleton, …)
├── data/universe.ts          # reference universe (US / Crypto); meme tokens are discovered on-chain
├── lib/meme/                 # config, security-scanner, liquidity-scanner, holder-scanner, meme-risk
├── db/                       # Drizzle schema + client
├── lib/
│   ├── ai/                   # analyst report generator (+ optional LLM layer)
│   ├── engine/               # analyze, scoring, breakout, levels, backtest, regime, alerts
│   ├── indicators/           # RSI, MACD, EMA/SMA, Bollinger, ADX, ATR, OBV, price action
│   ├── mock/                 # deterministic synthetic OHLCV generator
│   └── news/                 # news + sentiment module
├── providers/                # MarketDataProvider abstraction (mock / us / crypto / memecoin)
├── server/                   # session, settings, HTTP helpers
└── types/market.ts           # Asset, Quote, Candle, TechnicalIndicators, AIScore, …
```

---

## Environment variables

Copy `.env.example` → `.env` and fill in what you need:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL / Supabase connection string |
| `MOCK_MODE` | `true` (default) forces the deterministic demo dataset |
| `MARKET_DATA_BASE_URL` / `MARKET_DATA_API_KEY` | Shared market-data vendor |
| `US_API_*`, `CRYPTO_API_*` | Per-market vendor overrides |
| `MEME_DISCOVERY_API_*`, `MEME_DEX_API_BASE_URL` | Meme discovery + DEX pair data |
| `TOKEN_SECURITY_API_*` | Honeypot / contract / holder scanner |
| `MEME_MIN_LIQUIDITY_USD`, `MEME_MAX_BUY_TAX`, `MEME_MAX_SELL_TAX`, `MEME_MAX_HOLDER_CONCENTRATION` | Safety thresholds |
| `NEWS_API_KEY` | Licensed news vendor |
| `AI_API_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Optional LLM narrative layer |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Optional Supabase integration |

**Security:** secrets are only read server-side inside API route handlers. Nothing sensitive is exposed to the browser
bundle; only `NEXT_PUBLIC_*` values reach the client.

---

## Data modes — REAL vs DEMO

| `MOCK_MODE` | Behaviour |
| --- | --- |
| `false` (recommended) | **REAL data only.** Every quote, candle, volume, market cap, indicator and score comes from a configured vendor. If a vendor is missing, rate-limited, unauthorised, timing out or malformed, the API returns **HTTP 503 `DATA_UNAVAILABLE`**. There is **no demo fallback**. |
| `true` | Deterministic demo dataset, stamped `mode: "DEMO"` / `quality: "DEMO"` on every payload and labelled **DEMO DATA** / **DEMO MODE** in the UI. |

### Data quality badges

| Badge | Meaning |
| --- | --- |
| 🟢 `LIVE` | Real vendor data, underlying point ≤ 2 minutes old |
| 🟡 `DELAYED` | Real vendor data, 2–30 minutes old |
| 🔵 `HISTORICAL` | Real vendor data, last close / historical bars |
| 🟣 `DEMO DATA` | Synthetic dataset (only when `MOCK_MODE=true`) |
| 🔴 `DATA UNAVAILABLE` | Provider could not deliver real data — nothing is substituted |

Every payload carries provenance: `meta { mode, quality, dataSource, providerId, asOf, delaySeconds }`. Freshness is
computed from the vendor timestamp, so a market is never labelled LIVE just because a vendor is configured. Each market
reports its own status (`GET /api/providers`) because US Stocks, Crypto and Meme Coins use different vendors.

### Meme coin safety pipeline

`discovery -> liquidity -> contract security -> honeypot -> holders -> taxes -> technicals -> MEME RISK SCORE -> signal`

Security and liquidity hold **veto power**: `HONEYPOT_DETECTED`, `CRITICAL_CONTRACT_RISK`, `LIQUIDITY_TOO_LOW`,
`EXTREME_RISK` or a tax above the configured limit force the final signal to **AVOID**, no matter how bullish the
chart is. Tokens whose security cannot be verified are `UNVERIFIED` and are **not buyable** unless the user
explicitly enables "Allow unverified tokens".

Signal states: `STRONG BUY` / `BUY` / `WATCH` / `NEUTRAL` / `SELL` / `STRONG SELL` / `AVOID`.

Signal weights: Technical 30 - Momentum 15 - Volume 15 - Trend 10 - Breakout 10 - Market structure 5 -
News/Sentiment 5 - Risk & security 10.

MEME RISK SCORE weights: Liquidity 20 - Contract security 20 - Holder concentration 15 - Buy/Sell tax 10 -
Trading activity 10 - LP security 10 - Volume quality 10 - Token age 5.

> Meme coins carry extreme risk. Security checks reduce but cannot eliminate smart-contract, liquidity,
> manipulation and rug-pull risk. `SAFE_CHECK_PASSED` means the automated checks passed - never that a token is
> guaranteed safe.

## Data provider setup

All providers implement one interface:

```ts
interface MarketDataProvider {
  getQuote(symbol): Promise<Quote>;
  getHistoricalData(symbol, timeframe, bars): Promise<Series>;
  getCandles(symbol, timeframe, bars): Promise<Candle[]>;
  getVolume(symbol, timeframe): Promise<VolumeInfo>;
  searchSymbols(query): Promise<Asset[]>;
  getMarketStatus(): Promise<MarketStatus>;
  status(): ProviderStatus;
  getQuotes?(symbols): Promise<Map<string, Quote>>;        // batched
  getCandlesBatch?(symbols, tf, bars): Promise<Map<string, Candle[]>>;
}
```

| Market | Implementation | Vendor | Env |
| --- | --- | --- | --- |
| 🇺🇸 US | `USMarketDataProvider` | Twelve Data or compatible | `US_API_BASE_URL`, `US_API_KEY` |
| 🪙 Crypto | `CryptoMarketDataProvider` + `CoinGeckoClient` | **CoinGecko** (`/coins/markets`, `/coins/{id}/ohlc`, `/coins/{id}/market_chart`) | `CRYPTO_API_BASE_URL`, `CRYPTO_API_KEY` (public tier needs no key) |
| 🐸 Meme | `MemeCoinProvider` | GeckoTerminal (discovery + OHLCV) + DexScreener (price/liquidity/volume) | `MEME_DISCOVERY_API_BASE_URL`, `MEME_DEX_API_BASE_URL` |
| 🛡 Token security | `scanTokenSecurity` | GoPlus-compatible (honeypot, taxes, authorities, holders) | `TOKEN_SECURITY_API_BASE_URL` |
| 📰 News | NewsAPI-compatible | real headlines + lexicon sentiment | `NEWS_API_BASE_URL`, `NEWS_API_KEY` |

Crypto market cap, circulating supply and total supply come directly from the primary CoinGecko `/coins/markets`
response — there is no second market-cap request and nothing is derived from an assumed supply. Fields the vendor does
not publish stay `null` and the UI renders `N/A`.

**Crypto timeframes.** CoinGecko's published granularities are mapped honestly: `30m` and `4H` use its native OHLC
endpoint; `5m`, `15m`, `1H`, `1D` and `1W` are bucketed/aggregated from its real timestamped price samples; `1m` is
**not published** and returns `DATA_UNAVAILABLE`. CoinGecko reports a rolling 24h volume series rather than per-bar
traded volume, and every candle series says so in `meta.note`. No candle is ever fabricated. The same rule applies to pre-market/after-hours, foreign flow, funding rate and open interest.

Only vendors whose terms of service allow it may be used. MarketAI never scrapes broker applications (including Ajaib),
never touches private broker sessions, never stores broker credentials and never places orders.

### How to add your API keys

1. Copy `.env.example` → `.env`.
2. Set `MOCK_MODE=false`.
3. Paste your key into `US_API_KEY` (or the shared `MARKET_DATA_API_KEY`) for US stocks.
4. Crypto works with no key: `CRYPTO_API_BASE_URL=https://api.coingecko.com/api/v3` (use the `pro-api` host for a paid plan).
5. Optional: `CRYPTO_MARKETCAP_BASE_URL` for real market cap, `NEWS_API_KEY` for real news.
6. Restart. Open **Settings → Data providers** or `GET /api/providers` to confirm each market's state.

`REAL_SCAN_LIMIT` caps how many symbols per market a scan requests, and `REAL_BATCH_SIZE` controls vendor batching —
both exist to stay inside vendor rate limits. Quotes cache for 15s, intraday candles 60s, daily 5m, historical 15m, with
in-flight de-duplication, negative caching, bounded retries and backoff for 429/5xx/timeouts.

### Verifying data integrity

```bash
node scripts/verify-data-mode.mjs http://localhost:3000
```

Asserts DEMO labelling in demo mode, `LIVE/DELAYED/HISTORICAL` + `mode: REAL` in real mode, and `503 DATA_UNAVAILABLE`
(never demo) when a vendor key is missing or invalid.

---

## Local development

```bash
npm install
cp .env.example .env      # set DATABASE_URL
npx drizzle-kit push      # create tables
npm run dev               # http://localhost:3000
```

## Production build

```bash
npm run build
npm run start
```

## Vercel deployment

1. Push the repository to GitHub and import it in Vercel (framework preset: **Next.js**).
2. Add the environment variables from `.env.example` in *Project → Settings → Environment Variables*.
3. Point `DATABASE_URL` at a hosted PostgreSQL/Supabase instance and run `npx drizzle-kit push` once against it.
4. Deploy — API routes run as serverless functions, no long-lived server required.

Health check: `GET /api/health`.

---

## API surface

`/api/market/quote` · `/api/market/history` · `/api/market/search` · `/api/market/overview` · `/api/dashboard` ·
`/api/scanner/momentum` · `/api/scanner/breakout` · `/api/technical/analyze` · `/api/news` · `/api/ai/analyze` ·
`/api/backtest` · `/api/alerts` · `/api/watchlist` · `/api/portfolio` · `/api/settings` · `/api/health`

---

## Disclaimer

MarketAI is an analytical tool. Market data may be delayed or incomplete. Scores and signals are estimates based on
technical and market data and are **not financial advice or guarantees of future performance**. MarketAI does not
execute trades, does not connect to broker accounts, and does not store broker credentials.
