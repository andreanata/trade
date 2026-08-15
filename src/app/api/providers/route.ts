import {
  dataMode,
  isMockMode,
  isMockModeConfigured,
  mockModeWarning,
  providerStatuses,
  serviceStatuses,
} from "@/providers";
import { handleError, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/providers — vendor connection dashboard.
 *
 * Reports one row per service:
 *   US_STOCKS · CRYPTO · DEX · TOKEN_SECURITY · NEWS
 *
 * with state CONNECTED / NOT_CONFIGURED / FAILED / UNAVAILABLE (DEMO in mock mode).
 *
 * SECURITY: the payload contains no API key, secret or authorization header —
 * only `configured` / `hasKey` / `hasSecret` booleans plus the names of the env
 * vars that still need to be set. Every response also passes through the
 * sanitiser in `ok()`.
 */
export async function GET() {
  try {
    const services = serviceStatuses();
    return ok({
      mode: dataMode(),
      mockMode: isMockMode(),
      // Was the mode declared, or inferred from NODE_ENV? Production never
      // silently falls back to DEMO, so an inferred mode is surfaced here.
      mockModeConfigured: isMockModeConfigured(),
      warning: mockModeWarning(),
      services,
      // Per-market provider health (US / CRYPTO / MEME) kept for the header chips.
      providers: providerStatuses(),
      summary: {
        connected: services.filter((s) => s.state === "CONNECTED").length,
        delayed: services.filter((s) => s.state === "DELAYED").length,
        notConfigured: services.filter((s) => s.state === "NOT_CONFIGURED").length,
        failed: services.filter((s) => s.state === "FAILED").length,
        unavailable: services.filter((s) => s.state === "UNAVAILABLE").length,
        demo: services.filter((s) => s.state === "DEMO").length,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
}
