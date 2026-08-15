"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AIAnalysisReport,
  AlertEvaluation,
  AlertMetric,
  AssetAnalysis,
  BacktestResult,
  Candle,
  DataQuality,
  LevelMap,
  MarketId,
  MarketOverview,
  NewsAggregate,
  NewsItem,
  PortfolioPositionView,
  ProviderStatus,
  ServiceStatus,
  StrategyId,
  Timeframe,
  TradeSetup,
  TrendLabel,
  UserSettings,
  WatchlistRow,
} from "@/types/market";

export class ApiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiRequestError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = "Unable to fetch market data.";
    try {
      const body = (await res.json()) as { error?: string; detail?: string; code?: string };
      if (body?.code === "DATA_UNAVAILABLE") {
        message = `DATA UNAVAILABLE — ${body.detail ?? "the market data provider could not be reached."}`;
      } else if (body?.error) {
        message = body.detail ? `${body.error} — ${body.detail}` : body.error;
      }
    } catch {
      /* keep default */
    }
    throw new ApiRequestError(message, res.status);
  }
  return (await res.json()) as T;
}

export interface ProvidersPayload {
  mode: "REAL" | "DEMO";
  mockMode: boolean;
  mockModeConfigured: boolean;
  warning: string | null;
  providers: ProviderStatus[];
  services: ServiceStatus[];
  newsConfigured: boolean;
  summary: { real: number; delayed: number; historical: number; demo: number; unavailable: number };
  checkedAt: string;
}

export interface DashboardPayload {
  overviews: MarketOverview[];
  providers: ProviderStatus[];
  mode: "REAL" | "DEMO";
  newsAvailable: boolean;
  newsReason: string | null;
  newsQuality: DataQuality;
  unavailable: { symbol: string; market: MarketId; reason: string }[];
  unavailableCount: number;
  timeframe: Timeframe;
  market: MarketId | "ALL";
  topPotential: AssetAnalysis[];
  earlyBreakout: AssetAnalysis[];
  momentumLeaders: AssetAnalysis[];
  gainers: AssetAnalysis[];
  losers: AssetAnalysis[];
  volumeLeaders: AssetAnalysis[];
  riskRadar: AssetAnalysis[];
  news: NewsItem[];
  newsSentiment: NewsAggregate;
  breadth: {
    bullish: number;
    bearish: number;
    neutral: number;
    avgRisk: number;
    avgScore: number;
    universe: number;
  };
  generatedAt: string;
}

export interface ScanPayload {
  rows: AssetAnalysis[];
  total: number;
  scanned: number;
  unavailableCount: number;
  unavailable: { symbol: string; market: MarketId; reason: string }[];
  mode: "REAL" | "DEMO";
  timeframe: Timeframe;
  quality: DataQuality;
  generatedAt: string;
  riskPreference?: UserSettings["riskPreference"];
}

export interface BreakoutPayload {
  rows: AssetAnalysis[];
  total: number;
  scanned: number;
  timeframe: Timeframe;
  market: MarketId | "ALL";
  quality: DataQuality;
  generatedAt: string;
  note: string;
}

export interface HistoryPayload {
  symbol: string;
  market: MarketId;
  timeframe: Timeframe;
  quality: DataQuality;
  dataSource: string;
  asOf: string | null;
  delaySeconds: number | null;
  mode: "REAL" | "DEMO";
  candles: Candle[];
  series: {
    ema20: (number | null)[];
    ema50: (number | null)[];
    ema200: (number | null)[];
    rsi: (number | null)[];
    macd: (number | null)[];
    macdSignal: (number | null)[];
    macdHistogram: (number | null)[];
    adx: (number | null)[];
    plusDi: (number | null)[];
    minusDi: (number | null)[];
    bbUpper: (number | null)[];
    bbLower: (number | null)[];
  };
  levels: LevelMap;
  setup: TradeSetup;
  currency: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  market: MarketId;
  sector: string;
  currency: string;
  price: number | null;
  changePercent: number | null;
  aiScore: number | null;
  trend: TrendLabel;
  riskScore: number | null;
  quality: DataQuality;
  dataSource?: string | null;
  /** False when the candidate could not be confirmed with a real quote. */
  verified: boolean;
  reason?: string;
}

export interface MoversPayload {
  overview: MarketOverview;
  newsSentiment: NewsAggregate;
  universeSize: number;
  timeframe: Timeframe;
  movers: {
    gainers: AssetAnalysis[];
    losers: AssetAnalysis[];
    mostVolume: AssetAnalysis[];
    mostMomentum: AssetAnalysis[];
    mostVolatile: AssetAnalysis[];
    earlyBreakout: AssetAnalysis[];
    oversold: AssetAnalysis[];
    overbought: AssetAnalysis[];
    topPotential: AssetAnalysis[];
  };
}

const KEY = {
  dashboard: (market: string, tf: string) => ["dashboard", market, tf] as const,
  scan: (qs: string) => ["scan", qs] as const,
  breakout: (qs: string) => ["breakout", qs] as const,
  analysis: (symbol: string, tf: string) => ["analysis", symbol, tf] as const,
  history: (symbol: string, tf: string, bars: number) => ["history", symbol, tf, bars] as const,
  watchlist: (tf: string) => ["watchlist", tf] as const,
  portfolio: () => ["portfolio"] as const,
  alerts: () => ["alerts"] as const,
  news: (market: string) => ["news", market] as const,
  settings: () => ["settings"] as const,
  movers: (market: string, tf: string) => ["movers", market, tf] as const,
  search: (q: string) => ["search", q] as const,
};

export function useDashboard(market: MarketId | "ALL", timeframe: Timeframe) {
  return useQuery({
    queryKey: KEY.dashboard(market, timeframe),
    queryFn: () => request<DashboardPayload>(`/api/dashboard?market=${market}&timeframe=${timeframe}`),
    refetchInterval: 60_000,
  });
}

export function useScan(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      if (v !== undefined && v !== "" && v !== null) acc[k] = String(v);
      return acc;
    }, {}),
  ).toString();
  return useQuery({
    queryKey: KEY.scan(qs),
    queryFn: () => request<ScanPayload>(`/api/scanner/momentum?${qs}`),
    refetchInterval: 90_000,
  });
}

export function useBreakoutScan(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      if (v !== undefined && v !== "") acc[k] = String(v);
      return acc;
    }, {}),
  ).toString();
  return useQuery({
    queryKey: KEY.breakout(qs),
    queryFn: () => request<BreakoutPayload>(`/api/scanner/breakout?${qs}`),
    refetchInterval: 90_000,
  });
}


/**
 * Client cache windows per timeframe.
 *
 * A 1D candle does not change every 30 seconds, so re-requesting it on every
 * timeframe switch is wasted work. With these windows an already-fetched
 * timeframe renders straight from the React Query cache (<500ms, no request),
 * while fast timeframes still refresh often.
 */
function timeframeCache(timeframe: Timeframe): { staleTime: number; refetchInterval: number } {
  switch (timeframe) {
    case "1m":
    case "5m":
      return { staleTime: 30_000, refetchInterval: 60_000 };
    case "15m":
    case "30m":
      return { staleTime: 60_000, refetchInterval: 120_000 };
    case "1H":
    case "4H":
      return { staleTime: 5 * 60_000, refetchInterval: 5 * 60_000 };
    default:
      return { staleTime: 10 * 60_000, refetchInterval: 15 * 60_000 };
  }
}

export function useAnalysis(symbol: string, market: MarketId | undefined, timeframe: Timeframe) {
  return useQuery({
    queryKey: KEY.analysis(`${market ?? ""}:${symbol}`, timeframe),
    queryFn: () =>
      request<{ analysis: AssetAnalysis; news: NewsItem[]; newsSentiment: NewsAggregate }>(
        `/api/technical/analyze?symbol=${encodeURIComponent(symbol)}${market ? `&market=${market}` : ""}&timeframe=${timeframe}`,
      ),
    enabled: Boolean(symbol),
    // Show the previous timeframe's analysis while the new one loads instead of
    // blanking the panel — no full-page reload on a timeframe change.
    placeholderData: keepPreviousData,
    ...timeframeCache(timeframe),
  });
}

export function useHistory(symbol: string, market: MarketId | undefined, timeframe: Timeframe, bars = 240) {
  return useQuery({
    queryKey: KEY.history(`${market ?? ""}:${symbol}`, timeframe, bars),
    queryFn: () =>
      request<HistoryPayload>(
        `/api/market/history?symbol=${encodeURIComponent(symbol)}${market ? `&market=${market}` : ""}&timeframe=${timeframe}&bars=${bars}`,
      ),
    enabled: Boolean(symbol),
    // Keeps the chart painted during a timeframe switch; an already-cached
    // timeframe is served from memory with no provider request at all.
    placeholderData: keepPreviousData,
    ...timeframeCache(timeframe),
  });
}

export function useMovers(market: MarketId, timeframe: Timeframe) {
  return useQuery({
    queryKey: KEY.movers(market, timeframe),
    queryFn: () => request<MoversPayload>(`/api/market/overview?market=${market}&timeframe=${timeframe}&include=movers`),
    refetchInterval: 90_000,
  });
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: KEY.search(query),
    queryFn: () => request<{ results: SearchResult[] }>(`/api/market/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  });
}

export function useNewsFeed(market: MarketId | "ALL", symbol?: string) {
  return useQuery({
    queryKey: KEY.news(`${market}:${symbol ?? ""}`),
    queryFn: () =>
      request<{
        items: NewsItem[];
        aggregate: NewsAggregate;
        available: boolean;
        quality: DataQuality;
        reason?: string;
        dataSource?: string;
      }>(`/api/news?market=${market}${symbol ? `&symbol=${symbol}` : ""}&limit=30`),
    refetchInterval: 120_000,
  });
}

export function useWatchlist(timeframe: Timeframe = "1D") {
  return useQuery({
    queryKey: KEY.watchlist(timeframe),
    queryFn: () => request<{ rows: WatchlistRow[] }>(`/api/watchlist?timeframe=${timeframe}`),
    refetchInterval: 60_000,
  });
}

export function useWatchlistMutations(timeframe: Timeframe = "1D") {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["watchlist"] });

  const add = useMutation({
    mutationFn: (input: { symbol: string; market: MarketId }) =>
      request(`/api/watchlist`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (input: { id?: number; symbol?: string }) =>
      request(`/api/watchlist?${input.id ? `id=${input.id}` : `symbol=${input.symbol}`}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (order: number[]) => request(`/api/watchlist`, { method: "PATCH", body: JSON.stringify({ order }) }),
    onSuccess: invalidate,
  });
  return { add, remove, reorder, timeframe };
}

export function usePortfolio() {
  return useQuery({
    queryKey: KEY.portfolio(),
    queryFn: () =>
      request<{
        positions: PortfolioPositionView[];
        summary: {
          invested: number;
          currentValue: number;
          profitLoss: number;
          profitLossPercent: number;
          positions: number;
        };
        note: string;
      }>(`/api/portfolio`),
    refetchInterval: 60_000,
  });
}

export function usePortfolioMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["portfolio"] });
  const add = useMutation({
    mutationFn: (input: {
      symbol: string;
      market: MarketId;
      quantity: number;
      buyPrice: number;
      buyDate: string;
      notes?: string;
    }) => request(`/api/portfolio`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => request(`/api/portfolio?id=${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  return { add, remove };
}

export function useAlerts() {
  return useQuery({
    queryKey: KEY.alerts(),
    queryFn: () => request<{ alerts: AlertEvaluation[]; triggeredCount: number }>(`/api/alerts`),
    refetchInterval: 45_000,
  });
}

export function useAlertMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["alerts"] });
  const create = useMutation({
    mutationFn: (input: {
      symbol: string;
      market: MarketId;
      metric: AlertMetric;
      threshold: number;
      timeframe: Timeframe;
      note?: string;
    }) => request(`/api/alerts`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: (input: { id: number; active: boolean }) =>
      request(`/api/alerts`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => request(`/api/alerts?id=${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  return { create, toggle, remove };
}

export function useSettings() {
  return useQuery({
    queryKey: KEY.settings(),
    queryFn: () =>
      request<{
        settings: UserSettings;
        providers: ProviderStatus[];
        services: ServiceStatus[];
        mockMode: boolean;
        mockModeConfigured: boolean;
        warning: string | null;
        mode: "REAL" | "DEMO";
        newsConfigured: boolean;
      }>(`/api/settings`),
    staleTime: 60_000,
  });
}

/** Per-market provider health used by the header status bar and dashboard. */
export function useProviders() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: () => request<ProvidersPayload>(`/api/providers`),
    refetchInterval: 60_000,
  });
}

export interface MemeDiscoverPayload {
  mode: "REAL" | "DEMO";
  timeframe: Timeframe;
  thresholds: Record<string, number | boolean>;
  allowUnverified: boolean;
  scanned: number;
  unavailable: { symbol: string; market: MarketId; reason: string }[];
  unavailableCount: number;
  quality: DataQuality;
  buckets: {
    trending: AssetAnalysis[];
    safeFiltered: AssetAnalysis[];
    earlyBreakout: AssetAnalysis[];
    highMomentum: AssetAnalysis[];
    buyCandidates: AssetAnalysis[];
    highRisk: AssetAnalysis[];
    avoid: AssetAnalysis[];
  };
  generatedAt: string;
  disclaimer: string;
}

/** Meme coin scanner. Polls slowly — discovery + security scans are expensive. */
export function useMemeScanner(params: Record<string, string | number | boolean | undefined>) {
  const qs = new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      if (v !== undefined && v !== "" && v !== null) acc[k] = String(v);
      return acc;
    }, {}),
  ).toString();
  return useQuery({
    queryKey: ["meme-scan", qs],
    queryFn: () => request<MemeDiscoverPayload>(`/api/meme/discover?${qs}`),
    refetchInterval: 180_000,
    staleTime: 120_000,
  });
}

export interface MemeTokenPayload {
  analysis: AssetAnalysis;
  token: AssetAnalysis["token"];
  profile: AssetAnalysis["memeProfile"];
  news: NewsItem[];
  newsSentiment: NewsAggregate;
  newsAvailable: boolean;
  newsReason: string | null;
  mode: "REAL" | "DEMO";
  demo: boolean;
  disclaimer: string;
}

export function useMemeToken(id: string, timeframe: Timeframe, allowUnverified = false) {
  return useQuery({
    queryKey: ["meme-token", id, timeframe, allowUnverified],
    queryFn: () =>
      request<MemeTokenPayload>(
        `/api/meme/token?id=${encodeURIComponent(id)}&timeframe=${timeframe}&allowUnverified=${allowUnverified}`,
      ),
    enabled: Boolean(id),
    refetchInterval: 90_000,
  });
}

export function useSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserSettings>) =>
      request<{ settings: UserSettings }>(`/api/settings`, { method: "PUT", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["scan"] });
    },
  });
}

export function useBacktestMutation() {
  return useMutation({
    mutationFn: (input: {
      symbol: string;
      market: MarketId;
      timeframe: Timeframe;
      strategy: StrategyId;
      bars?: number;
      initialCapital?: number;
    }) => request<BacktestResult>(`/api/backtest`, { method: "POST", body: JSON.stringify(input) }),
  });
}

export function useAiAnalysisMutation() {
  return useMutation({
    mutationFn: (input: { symbol: string; market: MarketId; timeframe: Timeframe; analysisType: string }) =>
      request<AIAnalysisReport>(`/api/ai/analyze`, { method: "POST", body: JSON.stringify(input) }),
  });
}
