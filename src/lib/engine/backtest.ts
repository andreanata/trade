import type {
  BacktestRequest,
  BacktestResult,
  BacktestTrade,
  Candle,
  StrategyId,
} from "@/types/market";
import { adx as adxSeriesFn, ema, macd as macdFn, rsi as rsiFn, sma } from "@/lib/indicators";
import { getProvider } from "@/providers";
import { findAsset } from "@/data/universe";
import { SymbolNotFoundError } from "@/providers/types";
import { round } from "@/lib/utils";

interface SignalContext {
  index: number;
  candles: Candle[];
  rsi: (number | null)[];
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  hist: (number | null)[];
  ema20: (number | null)[];
  ema50: (number | null)[];
  ema200: (number | null)[];
  adx: (number | null)[];
  volMa: (number | null)[];
  high20: number[];
}

type Rule = (ctx: SignalContext) => { enter: boolean; exit: boolean };

function rolling20High(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i += 1) {
    const start = Math.max(0, i - 20);
    let max = -Infinity;
    for (let j = start; j < i; j += 1) max = Math.max(max, candles[j].high);
    out[i] = Number.isFinite(max) ? max : candles[i].high;
  }
  return out;
}

const STRATEGIES: Record<StrategyId, Rule> = {
  RSI: ({ index, rsi }) => {
    const now = rsi[index] ?? 50;
    const prev = rsi[index - 1] ?? now;
    return { enter: prev < 35 && now >= 35, exit: now > 70 || now < 25 };
  },
  MACD: ({ index, macdLine, signalLine }) => {
    const m = macdLine[index] ?? 0;
    const s = signalLine[index] ?? 0;
    const pm = macdLine[index - 1] ?? m;
    const ps = signalLine[index - 1] ?? s;
    return { enter: pm <= ps && m > s, exit: pm >= ps && m < s };
  },
  EMA_CROSS: ({ index, ema20, ema50 }) => {
    const f = ema20[index] ?? 0;
    const s = ema50[index] ?? 0;
    const pf = ema20[index - 1] ?? f;
    const ps = ema50[index - 1] ?? s;
    return { enter: pf <= ps && f > s, exit: pf >= ps && f < s };
  },
  BREAKOUT: ({ index, candles, high20, volMa, ema50 }) => {
    const c = candles[index];
    const vol = volMa[index] ?? c.volume;
    const enter = c.close > high20[index] && c.volume > vol * 1.4 && c.close > (ema50[index] ?? 0);
    const exit = c.close < (ema20Fallback(index, ema50) ?? 0) * 0.985;
    return { enter, exit };
  },
  MOMENTUM: ({ index, candles, rsi, hist }) => {
    if (index < 12) return { enter: false, exit: false };
    const roc = ((candles[index].close - candles[index - 10].close) / candles[index - 10].close) * 100;
    const r = rsi[index] ?? 50;
    const h = hist[index] ?? 0;
    const ph = hist[index - 1] ?? h;
    return { enter: roc > 2.5 && r > 52 && h > ph, exit: roc < -1.5 || r < 45 };
  },
  AI_SCORE: ({ index, candles, rsi, macdLine, signalLine, ema20, ema50, ema200, adx, volMa }) => {
    const c = candles[index];
    const r = rsi[index] ?? 50;
    const m = macdLine[index] ?? 0;
    const s = signalLine[index] ?? 0;
    const e20 = ema20[index] ?? c.close;
    const e50 = ema50[index] ?? c.close;
    const e200 = ema200[index] ?? c.close;
    const a = adx[index] ?? 15;
    const v = volMa[index] ?? c.volume;
    let score = 0;
    if (r >= 50 && r <= 72) score += 22;
    else if (r > 72) score += 8;
    if (m > s) score += 20;
    if (m > 0) score += 6;
    if (e20 > e50) score += 14;
    if (e50 > e200) score += 10;
    if (c.close > e20) score += 8;
    if (c.volume > v * 1.3) score += 12;
    if (a > 22) score += 8;
    return { enter: score >= 68, exit: score <= 42 };
  },
};

function ema20Fallback(index: number, series: (number | null)[]): number | null {
  return series[index] ?? null;
}

export async function runBacktest(req: BacktestRequest): Promise<BacktestResult> {
  const asset = findAsset(req.symbol, req.market);
  if (!asset) throw new SymbolNotFoundError(req.symbol);
  const provider = getProvider(req.market);
  const bars = Math.min(Math.max(req.bars ?? 400, 120), 800);
  const candles = await provider.getCandles(req.symbol, req.timeframe, bars);
  if (candles.length < 60) throw new Error("Not enough history to backtest this timeframe.");

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const macdSeries = macdFn(closes);
  const ctxBase = {
    candles,
    rsi: rsiFn(closes, 14),
    macdLine: macdSeries.macd,
    signalLine: macdSeries.signal,
    hist: macdSeries.histogram,
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    adx: adxSeriesFn(candles, 14).adx,
    volMa: sma(volumes, 20),
    high20: rolling20High(candles),
  };

  const rule = STRATEGIES[req.strategy] ?? STRATEGIES.AI_SCORE;
  const initialCapital = req.initialCapital ?? 10_000;
  const fee = (req.feePercent ?? 0.1) / 100;

  let capital = initialCapital;
  let position: { entryPrice: number; entryTime: number; entryIndex: number } | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; equity: number; benchmark: number }[] = [];
  const startIndex = 205;
  const benchmarkBase = candles[Math.min(startIndex, candles.length - 1)].close;

  for (let i = startIndex; i < candles.length; i += 1) {
    const candle = candles[i];
    const signal = rule({ index: i, ...ctxBase });

    if (!position && signal.enter) {
      position = { entryPrice: candle.close, entryTime: candle.time, entryIndex: i };
    } else if (position) {
      const stopHit = candle.low <= position.entryPrice * 0.92;
      const shouldExit = signal.exit || stopHit || i === candles.length - 1;
      if (shouldExit) {
        const exitPrice = stopHit ? position.entryPrice * 0.92 : candle.close;
        const grossReturn = (exitPrice - position.entryPrice) / position.entryPrice;
        const netReturn = grossReturn - fee * 2;
        const pnl = capital * netReturn;
        capital += pnl;
        trades.push({
          entryTime: position.entryTime,
          exitTime: candle.time,
          entryPrice: round(position.entryPrice, 6),
          exitPrice: round(exitPrice, 6),
          returnPercent: round(netReturn * 100, 2),
          pnl: round(pnl, 2),
          bars: i - position.entryIndex,
          reason: stopHit ? "Stop loss (-8%)" : signal.exit ? "Strategy exit signal" : "End of series",
        });
        position = null;
      }
    }

    const openEquity = position ? capital * (1 + (candle.close - position.entryPrice) / position.entryPrice) : capital;
    equityCurve.push({
      time: candle.time,
      equity: round(openEquity, 2),
      benchmark: round(initialCapital * (candle.close / benchmarkBase), 2),
    });
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    const dd = ((peak - point.equity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  const periodReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i += 1) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) periodReturns.push((equityCurve[i].equity - prev) / prev);
  }
  const meanRet = periodReturns.reduce((a, b) => a + b, 0) / (periodReturns.length || 1);
  const variance = periodReturns.reduce((a, b) => a + (b - meanRet) ** 2, 0) / (periodReturns.length || 1);
  const sd = Math.sqrt(variance);
  const annualFactor = req.timeframe === "1D" ? Math.sqrt(252) : req.timeframe === "1W" ? Math.sqrt(52) : Math.sqrt(252 * 6);
  const sharpe = sd > 0 ? (meanRet / sd) * annualFactor : 0;

  const finalCandle = candles[candles.length - 1];

  return {
    symbol: asset.symbol,
    market: req.market,
    timeframe: req.timeframe,
    strategy: req.strategy,
    from: new Date(candles[startIndex]?.time ?? candles[0].time).toISOString(),
    to: new Date(finalCandle.time).toISOString(),
    initialCapital,
    finalCapital: round(capital, 2),
    totalReturn: round(((capital - initialCapital) / initialCapital) * 100, 2),
    buyHoldReturn: round(((finalCandle.close - benchmarkBase) / benchmarkBase) * 100, 2),
    winRate: trades.length ? round((wins.length / trades.length) * 100, 1) : 0,
    lossRate: trades.length ? round((losses.length / trades.length) * 100, 1) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 2) : grossProfit > 0 ? 99.99 : 0,
    maxDrawdown: round(maxDrawdown, 2),
    sharpeRatio: round(sharpe, 2),
    trades: trades.slice(-60),
    tradeCount: trades.length,
    equityCurve: equityCurve.filter((_, i) => i % Math.max(1, Math.floor(equityCurve.length / 220)) === 0),
    quality: provider.isDemo ? "DEMO" : "DELAYED",
  };
}
