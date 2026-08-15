/**
 * MARKETAI — core domain types.
 * All analytical outputs are estimates derived from market data, never guarantees.
 */

/** MarketAI markets. IDX / Indonesian equities were removed and replaced by MEME. */
export type MarketId = "US" | "CRYPTO" | "MEME";

/** Chains supported by the meme-coin discovery + security stack. */
export type ChainId = "ethereum" | "solana" | "bsc" | "base";

/** Services shown on the provider dashboard (`GET /api/providers`). */
export type ServiceId =
  | "US_STOCKS"
  | "CRYPTO"
  | "DEX"
  | "TOKEN_SECURITY"
  | "NEWS";

/**
 * Observed provider state.
 *   LIVE           request succeeded and the payload is fresh
 *   CONNECTED      request succeeded (freshness not applicable, e.g. security scan)
 *   DELAYED        request succeeded but the data carries latency
 *   RATE_LIMITED   HTTP 429 — in cooldown, NOT live
 *   CONFIGURED     credentials present, no successful request yet
 *   ERROR          request failed for another reason
 *   UNAVAILABLE    provider unreachable / returned nothing usable
 *   NOT_CONFIGURED required env vars missing
 *   DEMO           MOCK_MODE demo dataset
 */
export type ServiceState =
  | "LIVE"
  | "CONNECTED"
  | "DELAYED"
  | "RATE_LIMITED"
  | "CONFIGURED"
  | "ERROR"
  | "NOT_CONFIGURED"
  | "FAILED"
  | "UNAVAILABLE"
  | "DEMO";

/**
 * Safe, public projection of a vendor connection.
 * Contains no API key, secret or authorization header — only booleans, the public
 * vendor label and the names of the env vars an operator still has to set.
 */
export interface ServiceStatus {
  service: ServiceId;
  label: string;
  dataSource: string;
  state: ServiceState;
  quality: DataQuality;
  message: string;
  /** Whether credentials are present — never the credentials themselves. */
  configured: boolean;
  hasKey: boolean;
  hasSecret: boolean;
  requiredEnv: string[];
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  /** Observed metrics — proof the state came from real traffic, not config. */
  lastRateLimitAt?: string | null;
  cooldownSecondsRemaining?: number | null;
  lastLatencyMs?: number | null;
  requests?: number;
  successes?: number;
  rateLimitHits?: number;
}

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D" | "1W";

export type DataQuality = "LIVE" | "DELAYED" | "HISTORICAL" | "DEMO" | "UNAVAILABLE";

export type DataMode = "REAL" | "DEMO";

/**
 * Provenance attached to every piece of market data that reaches the UI.
 * `mode` answers "is this real vendor data or the demo generator?" and can never
 * be REAL unless the value actually came from a configured vendor response.
 */
export interface DataMeta {
  mode: DataMode;
  quality: DataQuality;
  /** Human readable vendor name, e.g. "Twelve Data" or "CoinGecko". */
  dataSource: string;
  providerId: string;
  /** Timestamp of the underlying data point (not the request time). */
  asOf: string | null;
  /** Observed staleness in seconds when the vendor exposes it. */
  delaySeconds: number | null;
  note?: string | null;
}

export interface ProviderStatus {
  market: MarketId;
  providerId: string;
  dataSource: string;
  mode: DataMode;
  configured: boolean;
  /** REAL / DELAYED / HISTORICAL / DEMO / UNAVAILABLE */
  quality: DataQuality;
  state: "REAL" | "DELAYED" | "HISTORICAL" | "DEMO" | "UNAVAILABLE";
  message: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  requiredEnv: string[];
}

/* -------------------------------------------------------------------------- */
/* Meme coin: identity, security, liquidity, holders                           */
/* -------------------------------------------------------------------------- */

/** A meme token is identified by chain + contract address, never by symbol alone. */
export interface TokenRef {
  chain: ChainId;
  address: string;
  /** Primary trading pair used for price/OHLCV. */
  pairAddress: string | null;
  symbol: string;
  name: string;
  explorerUrl: string | null;
  dexUrl: string | null;
}

export type SecurityStatus =
  | "SAFE_CHECK_PASSED"
  | "LOW_RISK"
  | "MEDIUM_RISK"
  | "HIGH_RISK"
  | "HONEYPOT_DETECTED"
  | "UNVERIFIED"
  | "DATA_UNAVAILABLE";

export interface SecurityFlag {
  key: string;
  label: string;
  /** true = problem detected, false = check passed, null = provider had no data */
  triggered: boolean | null;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  detail: string;
}

export interface TokenSecurity {
  status: SecurityStatus;
  /** Null whenever the security vendor could not answer — never assumed safe. */
  verified: boolean | null;
  honeypot: boolean | null;
  buyTax: number | null;
  sellTax: number | null;
  transferPausable: boolean | null;
  contractVerified: boolean | null;
  ownerAddress: string | null;
  ownershipRenounced: boolean | null;
  mintAuthority: boolean | null;
  freezeAuthority: boolean | null;
  proxyContract: boolean | null;
  blacklistFunction: boolean | null;
  antiWhaleModifiable: boolean | null;
  taxModifiable: boolean | null;
  cannotSellAll: boolean | null;
  lpLockedPercent: number | null;
  lpBurned: boolean | null;
  flags: SecurityFlag[];
  criticalIssues: string[];
  dataSource: string;
  quality: DataQuality;
  checkedAt: string | null;
  note: string | null;
}

export interface LiquidityInfo {
  usd: number | null;
  baseReserve: number | null;
  quoteReserve: number | null;
  pairAddress: string | null;
  dex: string | null;
  /** liquidity / marketCap */
  liquidityRatio: number | null;
  status: "DEEP" | "ADEQUATE" | "LOW_LIQUIDITY" | "CRITICAL" | "UNAVAILABLE";
  minRequiredUsd: number;
  quality: DataQuality;
}

export interface HolderInfo {
  holderCount: number | null;
  topHolderPercent: number | null;
  top10Percent: number | null;
  creatorPercent: number | null;
  lpHolderCount: number | null;
  concentrationStatus: "DISTRIBUTED" | "MODERATE" | "CONCENTRATED" | "EXTREME" | "UNAVAILABLE";
  quality: DataQuality;
  dataSource: string;
}

export interface TradingActivity {
  volume24h: number | null;
  volume6h: number | null;
  volume1h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  buySellRatio: number | null;
  txns24h: number | null;
  volumeToMarketCap: number | null;
  volumeRatio: number | null;
  state: "VOLUME_SPIKE" | "ACTIVE" | "LOW_ACTIVITY" | "UNAVAILABLE";
}

export interface MemeRiskScore {
  score: number; // 0 = lower detected risk, 100 = extreme detected risk
  label: RiskLabel;
  components: ScoreComponent[];
  criticalIssues: string[];
  notes: string[];
  /** True when a hard security/liquidity veto applies. */
  vetoed: boolean;
}

export interface MemeTokenProfile {
  token: TokenRef;
  price: number | null;
  priceChange24h: number | null;
  priceChange1h: number | null;
  marketCap: number | null;
  fdv: number | null;
  pairCreatedAt: string | null;
  tokenAgeHours: number | null;
  liquidity: LiquidityInfo;
  activity: TradingActivity;
  security: TokenSecurity;
  holders: HolderInfo;
  memeRisk: MemeRiskScore;
  quality: DataQuality;
  meta: DataMeta;
}

/* -------------------------------------------------------------------------- */
/* Signal engine                                                               */
/* -------------------------------------------------------------------------- */

export type SignalState =
  | "STRONG_BUY"
  | "BUY"
  | "WATCH"
  | "NEUTRAL"
  | "SELL"
  | "STRONG_SELL"
  | "AVOID";

export interface SignalComponent {
  key: string;
  label: string;
  weightPercent: number;
  score: number; // 0..100 for this component
  contribution: number; // weighted points
  reason: string;
}

export interface TradingSignal {
  state: SignalState;
  score: number; // 0..100 composite conviction
  components: SignalComponent[];
  positives: string[];
  negatives: string[];
  /** Security / liquidity vetoes that forced the state down to AVOID. */
  vetoes: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
  disclaimer: string;
}

export type TrendLabel =
  | "STRONG_BULLISH"
  | "BULLISH"
  | "NEUTRAL"
  | "BEARISH"
  | "STRONG_BEARISH";

export type MomentumLabel =
  | "ACCELERATING"
  | "INCREASING"
  | "STABLE"
  | "DECREASING"
  | "FADING";

export type RiskLabel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export type BreakoutStatus =
  | "WATCH"
  | "EARLY"
  | "BREAKOUT"
  | "CONFIRMED"
  | "FAILED";

export type VolumeState = "NORMAL" | "ELEVATED" | "HIGH" | "EXTREME";

export type MarketRegime =
  | "BULL"
  | "BEAR"
  | "SIDEWAYS"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY";

export type SentimentLabel = "BULLISH" | "NEUTRAL" | "BEARISH";

export interface Asset {
  symbol: string;
  name: string;
  market: MarketId;
  sector: string;
  currency: string;
  /** Crypto / US extras where the provider supplies them, otherwise null. */
  marketCap?: number | null;
  peRatio?: number | null;
  eps?: number | null;
  dividendYield?: number | null;
}

export interface Quote {
  symbol: string;
  name: string;
  market: MarketId;
  sector: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  avgVolume20: number;
  volumeRatio: number;
  high52w: number | null;
  low52w: number | null;
  marketCap: number | null;
  quality: DataQuality;
  asOf: string;
  meta: DataMeta;
  /** Market specific extras. Null when the provider does not expose them. */
  extras: Record<string, number | string | null>;
}

export interface Candle {
  time: number; // epoch ms of bar open
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Series {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  quality: DataQuality;
  meta: DataMeta;
}

export interface MacdSnapshot {
  macd: number;
  signal: number;
  histogram: number;
  previousHistogram: number;
  crossover: "BULLISH" | "BEARISH" | "NONE";
  histogramDirection: "INCREASING" | "DECREASING" | "FLAT";
  aboveZero: boolean;
}

export interface BollingerSnapshot {
  upper: number;
  middle: number;
  lower: number;
  width: number;
  widthPercentile: number;
  squeeze: boolean;
  expansion: boolean;
  position: "ABOVE_UPPER" | "NEAR_UPPER" | "MIDDLE" | "NEAR_LOWER" | "BELOW_LOWER";
}

export interface AdxSnapshot {
  adx: number;
  plusDi: number;
  minusDi: number;
  rising: boolean;
  strength: "WEAK" | "DEVELOPING" | "STRONG" | "VERY_STRONG";
}

export interface VolumeSnapshot {
  volume: number;
  average20: number;
  ratio: number;
  acceleration: number;
  state: VolumeState;
  obvSlope: number;
  accumulation: "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL";
}

export interface TechnicalIndicators {
  price: number;
  rsi: number;
  rsiPrevious: number;
  rsiState: "OVERSOLD" | "WEAK" | "BULLISH" | "OVERBOUGHT";
  macd: MacdSnapshot;
  ema20: number;
  ema50: number;
  ema200: number;
  sma20: number;
  sma50: number;
  sma200: number;
  emaAlignment: "BULLISH" | "MIXED" | "BEARISH";
  goldenCross: boolean;
  deathCross: boolean;
  bollinger: BollingerSnapshot;
  adx: AdxSnapshot;
  atr: number;
  atrPercent: number;
  volume: VolumeSnapshot;
  priceAction: PriceActionSnapshot;
}

export interface PriceActionSnapshot {
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  structure: "UPTREND" | "DOWNTREND" | "RANGE";
  distanceFrom20BarHigh: number;
  distanceFrom20BarLow: number;
  bodyStrength: number;
  consecutiveUpBars: number;
}

export interface Level {
  price: number;
  strength: number; // 0..100
  touches: number;
  kind: "SUPPORT" | "RESISTANCE";
}

export interface LevelMap {
  support1: Level | null;
  support2: Level | null;
  resistance1: Level | null;
  resistance2: Level | null;
  all: Level[];
}

export interface ScoreComponent {
  key: string;
  label: string;
  score: number;
  max: number;
  reason: string;
}

export interface AIScore {
  score: number; // 0..100
  grade: "A+" | "A" | "B" | "C" | "D";
  components: ScoreComponent[];
  trend: TrendLabel;
  momentum: MomentumLabel;
  signals: string[];
  setupQuality: "PREMIUM" | "GOOD" | "AVERAGE" | "POOR";
}

export interface RiskScore {
  score: number; // 0..100, higher = riskier
  label: RiskLabel;
  components: ScoreComponent[];
  notes: string[];
}

export interface BreakoutSignal {
  status: BreakoutStatus;
  probability: number; // 0..100 model score, not a statistical guarantee
  probabilityLabel: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  resistance: number | null;
  distanceToResistance: number | null;
  volumeConfirmed: boolean;
  falseBreakoutRisk: number; // 0..100
  retest: boolean;
  strength: number; // 0..100
  checklist: { label: string; passed: boolean; detail: string }[];
}

export interface TradeSetup {
  bias: "LONG" | "NEUTRAL" | "SHORT";
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskReward: number;
  method: string;
  disclaimer: string;
}

export interface MomentumSignal {
  label: MomentumLabel;
  score: number; // 0..100
  roc5: number;
  roc10: number;
  roc20: number;
  rsiSlope: number;
  volumeTrend: number;
}

export interface AssetAnalysis {
  /** Canonical route/storage key. Equals `symbol` for US/CRYPTO, `chain-address` for MEME. */
  assetId: string;
  symbol: string;
  name: string;
  market: MarketId;
  sector: string;
  currency: string;
  /** Present only for meme tokens — identity is chain + contract address. */
  token?: TokenRef | null;
  memeProfile?: MemeTokenProfile | null;
  /** Final data-driven signal (security/liquidity can veto it down to AVOID). */
  signal: TradingSignal;
  timeframe: Timeframe;
  quality: DataQuality;
  meta: DataMeta;
  asOf: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  quote: Quote;
  indicators: TechnicalIndicators;
  levels: LevelMap;
  aiScore: AIScore;
  riskScore: RiskScore;
  momentum: MomentumSignal;
  breakout: BreakoutSignal;
  setup: TradeSetup;
  regime: MarketRegime;
  sparkline: number[];
  tags: ScannerTag[];
}

export type ScannerTag =
  | "BULLISH_TREND"
  | "BEARISH_TREND"
  | "MOMENTUM_INCREASING"
  | "MOMENTUM_DECREASING"
  | "VOLUME_SPIKE"
  | "BREAKOUT"
  | "APPROACHING_BREAKOUT"
  | "OVERSOLD"
  | "OVERBOUGHT"
  | "ACCUMULATION"
  | "DISTRIBUTION"
  | "SQUEEZE";

export interface ScannerFilters {
  market?: MarketId | "ALL";
  timeframe?: Timeframe;
  sector?: string;
  minPrice?: number;
  maxPrice?: number;
  minChange?: number;
  maxChange?: number;
  minVolumeRatio?: number;
  minRsi?: number;
  maxRsi?: number;
  macd?: "BULLISH" | "BEARISH" | "ANY";
  minAdx?: number;
  minAiScore?: number;
  maxRisk?: number;
  minBreakout?: number;
  trend?: "BULLISH" | "BEARISH" | "ANY";
  tags?: ScannerTag[];
  sort?: SortKey;
  limit?: number;
}

export type SortKey =
  | "AI_SCORE"
  | "MOMENTUM"
  | "VOLUME"
  | "CHANGE"
  | "RISK_ASC"
  | "BREAKOUT";

export interface MarketOverview {
  market: MarketId;
  label: string;
  indexName: string;
  /** Null when the provider could not supply the index/proxy value. */
  indexValue: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  sentiment: SentimentLabel;
  regime: MarketRegime | "UNKNOWN";
  status: MarketStatus;
  quality: DataQuality;
  meta: DataMeta;
  advancers: number;
  decliners: number;
  sparkline: number[];
  unavailableReason?: string | null;
  extras: Record<string, number | string | null>;
}

export interface MarketStatus {
  market: MarketId;
  isOpen: boolean;
  state: "OPEN" | "CLOSED" | "PRE_MARKET" | "AFTER_HOURS";
  localTime: string;
  timezone: string;
  nextEvent: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string | null;
  publishedAt: string;
  symbols: string[];
  market: MarketId | "GLOBAL";
  sentiment: SentimentLabel;
  sentimentScore: number; // -100..100
  quality: DataQuality;
}

export interface NewsAggregate {
  bullish: number;
  neutral: number;
  bearish: number;
  netScore: number;
  label: SentimentLabel;
}

export interface PortfolioPosition {
  id: number;
  symbol: string;
  market: MarketId;
  quantity: number;
  buyPrice: number;
  buyDate: string;
  notes: string | null;
}

export interface PortfolioPositionView extends PortfolioPosition {
  name: string;
  currency: string;
  currentPrice: number | null;
  invested: number;
  currentValue: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  allocation: number;
  aiScore: number | null;
  riskScore: number | null;
  quality: DataQuality;
}

export type AlertMetric =
  | "PRICE_ABOVE"
  | "PRICE_BELOW"
  | "RSI_ABOVE"
  | "RSI_BELOW"
  | "MACD_BULLISH_CROSS"
  | "MACD_BEARISH_CROSS"
  | "VOLUME_RATIO_ABOVE"
  | "BREAKOUT_PROBABILITY_ABOVE"
  | "AI_SCORE_ABOVE"
  | "RISK_SCORE_BELOW"
  | "RESISTANCE_BREAK";

export interface AlertRule {
  id: number;
  symbol: string;
  market: MarketId;
  metric: AlertMetric;
  threshold: number;
  timeframe: Timeframe;
  active: boolean;
  note: string | null;
  createdAt: string;
  lastTriggeredAt: string | null;
}

export interface AlertEvaluation extends AlertRule {
  triggered: boolean;
  currentValue: number | null;
  message: string;
  quality: DataQuality;
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  market: MarketId;
  sortOrder: number;
}

export interface WatchlistRow extends WatchlistItem {
  analysis: AssetAnalysis | null;
}

export type StrategyId =
  | "RSI"
  | "MACD"
  | "EMA_CROSS"
  | "BREAKOUT"
  | "MOMENTUM"
  | "AI_SCORE";

export interface BacktestRequest {
  symbol: string;
  market: MarketId;
  timeframe: Timeframe;
  strategy: StrategyId;
  bars?: number;
  initialCapital?: number;
  feePercent?: number;
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  returnPercent: number;
  pnl: number;
  bars: number;
  reason: string;
}

export interface BacktestResult {
  symbol: string;
  market: MarketId;
  timeframe: Timeframe;
  strategy: StrategyId;
  from: string;
  to: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  buyHoldReturn: number;
  winRate: number;
  lossRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
  tradeCount: number;
  equityCurve: { time: number; equity: number; benchmark: number }[];
  quality: DataQuality;
}

export interface AIAnalysisSection {
  title: string;
  body: string;
  tone: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
}

export interface AIAnalysisReport {
  symbol: string;
  name: string;
  market: MarketId;
  timeframe: Timeframe;
  analysisType: string;
  generatedAt: string;
  engine: string;
  sections: AIAnalysisSection[];
  scenarios: {
    bullish: string;
    neutral: string;
    bearish: string;
  };
  conclusion: string;
  aiScore: number;
  riskScore: number;
  quality: DataQuality;
  disclaimer: string;
}

export interface UserSettings {
  theme: "dark" | "light";
  currency: "IDR" | "USD";
  defaultTimeframe: Timeframe;
  defaultMarket: MarketId;
  riskPreference: "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
  notifications: boolean;
  dataProvider: "AUTO" | "MOCK";
  demoMode: boolean;
}

export interface ApiError {
  error: string;
  detail?: string;
}
