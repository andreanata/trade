/**
 * MarketAI data-integrity verification.
 *
 * Markets: US STOCKS · CRYPTO · MEME COINS (IDX removed).
 *
 * Proves:
 *   1. MOCK_MODE=true                       -> DEMO everywhere
 *   2. MOCK_MODE=false + working provider   -> REAL (LIVE / DELAYED / HISTORICAL)
 *   3. MOCK_MODE=false + failing provider   -> DATA_UNAVAILABLE, never DEMO
 *   4. Meme security veto                   -> dangerous tokens become AVOID, not BUY
 *
 * Usage: node scripts/verify-data-mode.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

const line = (l, v) => console.log(`  ${String(l).padEnd(28)} ${v}`);
let failures = 0;
function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

const providers = await get("/api/providers");
const mode = providers.body?.mode;
console.log(`\n=== MODE: ${mode} (${BASE}) ===`);
for (const s of providers.body?.services ?? []) {
  line(s.label, `${s.state} / ${s.quality} · ${s.dataSource}`);
}
const realMode = mode === "REAL";

check("IDX market is fully removed", !(providers.body?.providers ?? []).some((p) => p.market === "IDX"));

/* ------------------------------- US + CRYPTO ------------------------------ */
for (const [market, symbol] of [
  ["US", "AAPL"],
  ["CRYPTO", "BTC"],
]) {
  const quote = await get(`/api/market/quote?symbol=${symbol}&market=${market}`);
  const history = await get(`/api/market/history?symbol=${symbol}&market=${market}&timeframe=1D&bars=120`);
  console.log(`\n--- ${market} / ${symbol}`);
  if (quote.status === 200) {
    const q = quote.body.quote;
    const a = quote.body.analysis;
    line("price / change%", `${q.price} / ${q.changePercent}`);
    line("volume", q.volume);
    line("marketCap", q.marketCap === null ? "N/A (not supplied)" : q.marketCap);
    line("quality / source", `${quote.body.quality} / ${quote.body.dataSource}`);
    line("asOf / delay(s)", `${quote.body.asOf} / ${quote.body.delaySeconds}`);
    line("RSI / MACD / ADX", `${a.indicators.rsi} / ${a.indicators.macd.histogram} / ${a.indicators.adx.adx}`);
    line("AI / Risk / Breakout", `${a.aiScore.score} / ${a.riskScore.score} / ${a.breakout.probability}`);
    line("SIGNAL", `${a.signal.state} (${a.signal.score})`);
    line("candles", history.body?.candles?.length ?? 0);
    if (realMode) {
      check(`${market} is REAL`, a.meta.mode === "REAL" && a.quality !== "DEMO", a.quality);
      check(`${market} quality valid`, ["LIVE", "DELAYED", "HISTORICAL"].includes(quote.body.quality), quote.body.quality);
      check(`${market} candles real`, (history.body?.candles?.length ?? 0) > 30 && history.body.quality !== "DEMO");
    } else {
      check(`${market} labelled DEMO`, a.meta.mode === "DEMO" && a.quality === "DEMO");
    }
  } else {
    line("http / code", `${quote.status} / ${quote.body?.code}`);
    line("detail", (quote.body?.detail ?? "").slice(0, 100));
    check(`${market} failure = DATA_UNAVAILABLE (no demo)`, quote.status === 503 && quote.body?.code === "DATA_UNAVAILABLE");
    check(`${market} history = DATA_UNAVAILABLE`, history.status === 503 && history.body?.code === "DATA_UNAVAILABLE");
  }
}

/* -------------------------------- MEME ----------------------------------- */
console.log(`\n--- MEME COIN SCANNER`);
const meme = await get("/api/meme/discover?timeframe=1H");
if (meme.status === 200) {
  const b = meme.body.buckets;
  line("mode / quality", `${meme.body.mode} / ${meme.body.quality}`);
  line("discovered", meme.body.scanned);
  line("safeFiltered", b.safeFiltered.length);
  line("buyCandidates", b.buyCandidates.length);
  line("avoid (vetoed)", b.avoid.length);

  for (const row of b.trending.slice(0, 6)) {
    const m = row.memeProfile;
    line(
      `${row.symbol} (${row.token?.chain})`,
      `$${row.price} · liq ${m?.liquidity.usd ?? "N/A"} · sec ${m?.security.status} · risk ${m?.memeRisk.score} · ${row.signal.state}`,
    );
  }

  const dangerous = b.trending.filter(
    (r) =>
      r.memeProfile &&
      (r.memeProfile.security.status === "HONEYPOT_DETECTED" ||
        r.memeProfile.security.criticalIssues.length > 0 ||
        r.memeProfile.liquidity.status === "LOW_LIQUIDITY" ||
        r.memeProfile.liquidity.status === "CRITICAL"),
  );
  line("dangerous tokens found", dangerous.length);
  check(
    "Dangerous tokens are AVOID (never BUY)",
    dangerous.every((r) => r.signal.state === "AVOID"),
    `${dangerous.filter((r) => r.signal.state !== "AVOID").length} leaked`,
  );
  check(
    "No honeypot/critical token in safeFiltered",
    b.safeFiltered.every(
      (r) =>
        r.memeProfile?.security.status !== "HONEYPOT_DETECTED" &&
        (r.memeProfile?.security.criticalIssues.length ?? 0) === 0,
    ),
  );
  check("No AVOID token in buyCandidates", b.buyCandidates.every((r) => r.signal.state !== "AVOID"));
  check("No AVOID token in earlyBreakout", b.earlyBreakout.every((r) => r.signal.state !== "AVOID"));
  if (realMode) {
    check("Meme rows are REAL", b.trending.length > 0 && b.trending.every((r) => r.meta.mode === "REAL"));
    check(
      "Meme tokens identified by chain+address",
      b.trending.every((r) => r.token?.address && r.token?.chain),
    );
  }
} else {
  line("http / code", `${meme.status} / ${meme.body?.code}`);
  check("Meme failure = DATA_UNAVAILABLE (no demo)", meme.status === 503 && meme.body?.code === "DATA_UNAVAILABLE");
}

/* -------------------------------- NEWS ----------------------------------- */
const news = await get("/api/news?market=CRYPTO&limit=5");
console.log(`\n--- NEWS`);
line("available / quality", `${news.body?.available} / ${news.body?.quality}`);
line("items", news.body?.items?.length ?? 0);
if (realMode && !process.env.NEWS_API_KEY) {
  check("News without key = UNAVAILABLE (no fake headlines)", news.body?.available === false && (news.body?.items?.length ?? 0) === 0);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
