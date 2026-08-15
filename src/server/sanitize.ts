/**
 * Response sanitiser — the last line of defence before data leaves the server.
 *
 * Every API payload passes through `sanitizeResponse()` (see `ok()` in server/http.ts).
 * Any property whose name looks like a credential is removed, and any string value
 * that matches a configured secret is redacted, so a refactor can never accidentally
 * expose an API key, secret or authorization header to the browser.
 */

const FORBIDDEN_KEYS = new Set(
  [
    "apikey",
    "api_key",
    "apisecret",
    "api_secret",
    "secret",
    "clientsecret",
    "client_secret",
    "authorization",
    "auth",
    "accesstoken",
    "access_token",
    "refreshtoken",
    "refresh_token",
    "bearer",
    "password",
    "passwd",
    "privatekey",
    "private_key",
    "credentials",
    "appsecret",
    "app_secret",
    "signature",
    "sign",
  ].map((k) => k.toLowerCase()),
);

/** Env vars whose values must never appear verbatim in a response body. */
const SECRET_ENV_NAMES = [
  "US_API_KEY",
  "CRYPTO_API_KEY",
  "DEX_API_KEY",
  "TOKEN_SECURITY_API_KEY",
  "TOKEN_SECURITY_API_SECRET",
  "NEWS_API_KEY",
  "MARKET_DATA_API_KEY",
  "MEME_DISCOVERY_API_KEY",
  "MEME_DEX_API_KEY",
  "CRYPTO_MARKETCAP_API_KEY",
  "AI_API_KEY",
  "DATABASE_URL",
  "SUPABASE_ANON_KEY",
];

const REDACTED = "[REDACTED]";

function secretValues(): string[] {
  const values: string[] = [];
  for (const name of SECRET_ENV_NAMES) {
    const value = process.env[name];
    // Ignore trivially short values so we never mangle ordinary text.
    if (value && value.trim().length >= 8) values.push(value.trim());
  }
  return values;
}

function scrubString(value: string, secrets: string[]): string {
  let out = value;
  for (const secret of secrets) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  // Strip credentials embedded in URLs / query strings.
  out = out.replace(/([?&](?:apikey|api_key|token|key|secret)=)[^&\s]+/gi, `$1${REDACTED}`);
  return out;
}

function walk(value: unknown, secrets: string[], depth: number): unknown {
  if (depth > 12) return value;
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return scrubString(value, secrets);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) return value.map((item) => walk(item, secrets, depth + 1));

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(source)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) continue; // dropped entirely
      out[key] = walk(child, secrets, depth + 1);
    }
    return out;
  }

  return value;
}

/** Removes credential-shaped keys and redacts any configured secret value. */
export function sanitizeResponse<T>(payload: T): T {
  const secrets = secretValues();
  return walk(payload, secrets, 0) as T;
}

/** Exposed for tests / verification tooling. */
export const __sanitizerInternals = { FORBIDDEN_KEYS, SECRET_ENV_NAMES };
