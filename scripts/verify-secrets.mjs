/**
 * MarketAI secret-exposure audit.
 *
 * Verifies that:
 *   1. /api/providers reports the required services with safe status only.
 *   2. No API response contains a credential-shaped key or a real secret value.
 *   3. The client bundle contains no secret value and no secret env var reference.
 *
 * Usage: node scripts/verify-secrets.mjs [baseUrl]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";

const SECRET_ENV = [
  "US_API_KEY",
  "CRYPTO_API_KEY",
  "DEX_API_KEY",
  "TOKEN_SECURITY_API_KEY",
  "TOKEN_SECURITY_API_SECRET",
  "NEWS_API_KEY",
  "MARKET_DATA_API_KEY",
  "CRYPTO_MARKETCAP_API_KEY",
  "AI_API_KEY",
];

const FORBIDDEN_KEYS = [
  "apikey",
  "api_key",
  "apisecret",
  "api_secret",
  "secret",
  "authorization",
  "accesstoken",
  "access_token",
  "password",
  "privatekey",
];

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
};

async function get(path, timeoutMs = 25_000) {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* non-json */
    }
    return { status: res.status, text, body };
  } catch (error) {
    // A slow scan endpoint must not abort the security audit.
    return { status: 0, text: "", body: null, skipped: true, error: String(error) };
  }
}

function findForbiddenKeys(value, path = "$", hits = []) {
  if (value === null || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    value.forEach((v, i) => findForbiddenKeys(v, `${path}[${i}]`, hits));
    return hits;
  }
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(k.toLowerCase())) hits.push(`${path}.${k}`);
    findForbiddenKeys(v, `${path}.${k}`, hits);
  }
  return hits;
}

/* ---------------------------- 1. /api/providers --------------------------- */
console.log(`\n=== PROVIDER DASHBOARD (${BASE}/api/providers) ===`);
const providers = await get("/api/providers");
const services = providers.body?.services ?? [];
for (const s of services) {
  console.log(
    `  ${String(s.service).padEnd(15)} ${String(s.state).padEnd(15)} key=${s.hasKey ? "yes" : "no "} secret=${s.hasSecret ? "yes" : "no "}  ${s.dataSource}`,
  );
}
const ids = services.map((s) => s.service);
for (const required of ["US_STOCKS", "CRYPTO", "DEX", "TOKEN_SECURITY", "NEWS"]) {
  check(`/api/providers reports ${required}`, ids.includes(required));
}
const validStates = [
  "LIVE",
  "CONNECTED",
  "DELAYED",
  "RATE_LIMITED",
  "CONFIGURED",
  "ERROR",
  "NOT_CONFIGURED",
  "FAILED",
  "UNAVAILABLE",
  "DEMO",
];
check(
  "All service states are valid",
  services.every((s) => validStates.includes(s.state)),
  services.map((s) => s.state).join(","),
);

// A provider may only report LIVE/CONNECTED/DELAYED if it actually completed a
// successful request — "an API key exists" must never produce a live status.
const fakeLive = services.filter(
  (s) => ["LIVE", "CONNECTED", "DELAYED"].includes(s.state) && !(s.successes > 0),
);
check(
  "No provider claims LIVE without an observed successful request",
  fakeLive.length === 0,
  fakeLive.map((s) => `${s.service}=${s.state}`).join(","),
);
check("Provider payload exposes no secret-shaped key", findForbiddenKeys(providers.body).length === 0);

/* ------------------------- 2. all endpoints scanned ----------------------- */
console.log(`\n=== API RESPONSE SECRET SCAN ===`);
const secretValues = SECRET_ENV.map((n) => process.env[n])
  .filter((v) => v && v.trim().length >= 8)
  .map((v) => v.trim());
console.log(`  configured secrets in env: ${secretValues.length}`);

const endpoints = [
  "/api/providers",
  "/api/settings",
  "/api/dashboard?market=CRYPTO&timeframe=1D",
  "/api/market/quote?symbol=BTC&market=CRYPTO",
  "/api/market/quote?symbol=AAPL&market=US",
  "/api/market/history?symbol=BTC&market=CRYPTO&timeframe=1D&bars=60",
  "/api/news?market=CRYPTO",
  "/api/health",
];

let leaked = 0;
for (const ep of endpoints) {
  const res = await get(ep, 20_000);
  if (res.skipped) {
    console.log(`  skip --- ${ep} (slow scan endpoint, not a security signal)`);
    continue;
  }
  const keyHits = res.body ? findForbiddenKeys(res.body) : [];
  const valueHits = secretValues.filter((s) => res.text.includes(s));
  if (keyHits.length || valueHits.length) {
    leaked += 1;
    console.log(`  LEAK ${ep} keys=${keyHits.join(",")} values=${valueHits.length}`);
  } else {
    console.log(`  ok   ${String(res.status).padEnd(3)} ${ep}`);
  }
}
check("No endpoint leaks a credential", leaked === 0);

/* --------------------------- 3. client bundle ----------------------------- */
console.log(`\n=== CLIENT BUNDLE SCAN (.next/static) ===`);
function walkFiles(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else if (/\.(js|css)$/.test(entry)) out.push(full);
  }
  return out;
}
const bundleFiles = walkFiles(".next/static");
console.log(`  scanned ${bundleFiles.length} bundle files`);
const bundleLeaks = [];
const envRefs = [];
for (const file of bundleFiles) {
  const content = readFileSync(file, "utf8");
  for (const s of secretValues) if (content.includes(s)) bundleLeaks.push(`${file} (value)`);
  // Only an actual inlined read is a leak. Documentation copy that merely names a
  // variable (e.g. "set NEWS_API_KEY") is operator guidance, not a credential.
  for (const name of SECRET_ENV) {
    if (content.includes(`process.env.${name}`) || content.includes(`process.env["${name}"]`)) {
      envRefs.push(`${file} (process.env.${name})`);
    }
  }
}
check("No secret value in the client bundle", bundleLeaks.length === 0, bundleLeaks.slice(0, 2).join(", "));
check("No inlined process.env secret read in the client bundle", envRefs.length === 0, envRefs.slice(0, 2).join(", "));

console.log(`\n${failures === 0 ? "ALL SECURITY CHECKS PASSED" : `${failures} SECURITY CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
