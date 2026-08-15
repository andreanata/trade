import type { NextRequest } from "next/server";
import { analyzeAsset } from "@/lib/engine/analyze";
import { getNews } from "@/lib/news/news-service";
import { dataMode, getMemeProvider, isMockMode, providerStatus } from "@/providers";
import { memeThresholds } from "@/lib/meme/config";
import { fail, handleError, ok } from "@/server/http";
import { parseTimeframe } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Meme token detail: identity (chain + contract address), market data, liquidity,
 * holders, contract security, MEME RISK SCORE, technicals and the final signal.
 */
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const id = (p.get("id") ?? p.get("symbol") ?? "").trim();
    if (!id) return fail("Asset not found.", 404, "Missing token id (chain-address).");
    const timeframe = parseTimeframe(p.get("timeframe"), "1H");
    const allowUnverified = p.get("allowUnverified") === "true";

    const analysis = await analyzeAsset(id, "MEME", { timeframe, allowUnverified });
    const token = analysis.token;

    // News relevance for a meme token = symbol + project name + contract address.
    const news = await getNews({
      market: "MEME",
      symbol: analysis.symbol,
      relevanceTerms: token ? [token.symbol, token.name, token.address] : [analysis.symbol],
      limit: 6,
    });

    const provider = getMemeProvider();
    return ok({
      analysis,
      token,
      profile: analysis.memeProfile,
      thresholds: memeThresholds(),
      news: news.items,
      newsSentiment: news.aggregate,
      newsAvailable: news.available,
      newsReason: news.reason ?? null,
      mode: dataMode(),
      demo: isMockMode(),
      provider: providerStatus("MEME"),
      discoveryEnabled: Boolean(provider),
      disclaimer:
        "Market signals are probabilistic and can be wrong. Meme coins carry extreme risk. Security checks reduce but cannot eliminate smart-contract, liquidity, manipulation, and rug-pull risk.",
    });
  } catch (error) {
    return handleError(error);
  }
}
