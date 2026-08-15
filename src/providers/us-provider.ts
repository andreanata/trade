import { TwelveDataEquityProvider } from "./equity-provider";
import { tuning, usVendor } from "@/server/env";

/**
 * US equities provider.
 *
 * Configure with US_API_BASE_URL + US_API_KEY (or the shared MARKET_DATA_* pair).
 * Any Twelve Data compatible vendor works. Keys are read server-side only.
 */
export class USMarketDataProvider extends TwelveDataEquityProvider {
  constructor() {
    // Credentials are resolved server-side only; nothing here reaches the client.
    const config = usVendor();
    super({
      market: "US",
      id: "us-stocks",
      label: "US equities",
      dataSource: config.dataSource,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      requiredEnv: config.requiredEnv,
      exchange: tuning.usExchange,
      country: tuning.usCountry,
      currency: "USD",
      qualityOverride: tuning.usQuality,
      batchSize: tuning.realBatchSize,
    });
  }
}
