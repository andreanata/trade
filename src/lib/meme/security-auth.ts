import { createHash } from "node:crypto";
import { TTL, cached, providerFetch } from "@/providers/http";
import { tokenSecurityVendor } from "@/server/env";

/**
 * Token-security vendor authentication (server-side only).
 *
 * GoPlus-compatible flow: when TOKEN_SECURITY_API_KEY *and*
 * TOKEN_SECURITY_API_SECRET are both configured, an access token is negotiated with
 * sign = sha1(app_key + timestamp + app_secret) and cached until it expires.
 *
 * The resulting header is used for outbound vendor calls only — it is never
 * returned to the client and is stripped by the response sanitiser regardless.
 */

interface TokenResponse {
  code?: number;
  message?: string;
  result?: { access_token?: string; expires_in?: number };
}

async function negotiateAccessToken(baseUrl: string, appKey: string, appSecret: string): Promise<string | null> {
  const time = Math.floor(Date.now() / 1000);
  const sign = createHash("sha1").update(`${appKey}${time}${appSecret}`).digest("hex");
  try {
    const res = await fetch(`${baseUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_key: appKey, sign, time }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as TokenResponse;
    return body?.result?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the Authorization headers for the security vendor.
 *  - key + secret -> negotiated access token (cached)
 *  - key only     -> the key is sent directly
 *  - neither      -> no auth header (public read-only tier)
 */
export async function securityAuthHeaders(): Promise<Record<string, string> | undefined> {
  const config = tokenSecurityVendor();
  if (!config.baseUrl) return undefined;

  if (config.apiKey && config.apiSecret) {
    const token = await cached(`token-security:auth:${config.apiKey.slice(0, 6)}`, TTL.FUNDAMENTALS, () =>
      negotiateAccessToken(config.baseUrl as string, config.apiKey as string, config.apiSecret as string),
    ).catch(() => null);
    if (token) return { Authorization: token };
  }

  if (config.apiKey) return { Authorization: config.apiKey };
  return undefined;
}

/** True when the vendor can be reached at all (public tier counts as reachable). */
export function securityReachable(): boolean {
  return Boolean(tokenSecurityVendor().baseUrl);
}

/** True when authenticated access (key, optionally with secret) is configured. */
export function securityAuthenticated(): boolean {
  return Boolean(tokenSecurityVendor().apiKey);
}

export { providerFetch };
