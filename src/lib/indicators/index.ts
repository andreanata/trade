import type {
  AdxSnapshot,
  BollingerSnapshot,
  Candle,
  MacdSnapshot,
  PriceActionSnapshot,
  TechnicalIndicators,
  VolumeSnapshot,
} from "@/types/market";
import { clamp, round } from "@/lib/utils";

export type MaybeNumber = number | null;

export function sma(values: number[], period: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i += 1) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function stdev(values: number[], period: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

/** Wilder-smoothed RSI. */
export function rsi(values: number[], period = 14): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: MaybeNumber[]; signal: MaybeNumber[]; histogram: MaybeNumber[] } {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: MaybeNumber[] = values.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f !== null && s !== null ? f - s : null;
  });
  const compact: number[] = [];
  const indices: number[] = [];
  macdLine.forEach((v, i) => {
    if (v !== null) {
      compact.push(v);
      indices.push(i);
    }
  });
  const signalCompact = ema(compact, signalPeriod);
  const signal: MaybeNumber[] = new Array(values.length).fill(null);
  signalCompact.forEach((v, i) => {
    if (v !== null) signal[indices[i]] = v;
  });
  const histogram: MaybeNumber[] = values.map((_, i) => {
    const m = macdLine[i];
    const s = signal[i];
    return m !== null && s !== null ? m - s : null;
  });
  return { macd: macdLine, signal, histogram };
}

export function trueRange(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
}

export function atr(candles: Candle[], period = 14): MaybeNumber[] {
  const tr = trueRange(candles);
  const out: MaybeNumber[] = new Array(candles.length).fill(null);
  if (candles.length < period) return out;
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i += 1) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): { upper: MaybeNumber[]; middle: MaybeNumber[]; lower: MaybeNumber[]; width: MaybeNumber[] } {
  const middle = sma(values, period);
  const dev = stdev(values, period);
  const upper: MaybeNumber[] = [];
  const lower: MaybeNumber[] = [];
  const width: MaybeNumber[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const m = middle[i];
    const d = dev[i];
    if (m === null || d === null) {
      upper.push(null);
      lower.push(null);
      width.push(null);
    } else {
      upper.push(m + mult * d);
      lower.push(m - mult * d);
      width.push(m === 0 ? 0 : ((2 * mult * d) / m) * 100);
    }
  }
  return { upper, middle, lower, width };
}

export function adx(
  candles: Candle[],
  period = 14,
): { adx: MaybeNumber[]; plusDi: MaybeNumber[]; minusDi: MaybeNumber[] } {
  const len = candles.length;
  const adxOut: MaybeNumber[] = new Array(len).fill(null);
  const plusOut: MaybeNumber[] = new Array(len).fill(null);
  const minusOut: MaybeNumber[] = new Array(len).fill(null);
  if (len < period * 2) return { adx: adxOut, plusDi: plusOut, minusDi: minusOut };

  const tr = trueRange(candles);
  const plusDm: number[] = new Array(len).fill(0);
  const minusDm: number[] = new Array(len).fill(0);
  for (let i = 1; i < len; i += 1) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
  }

  let smoothTr = 0;
  let smoothPlus = 0;
  let smoothMinus = 0;
  for (let i = 1; i <= period; i += 1) {
    smoothTr += tr[i];
    smoothPlus += plusDm[i];
    smoothMinus += minusDm[i];
  }

  const dxValues: { index: number; dx: number }[] = [];
  for (let i = period + 1; i < len; i += 1) {
    smoothTr = smoothTr - smoothTr / period + tr[i];
    smoothPlus = smoothPlus - smoothPlus / period + plusDm[i];
    smoothMinus = smoothMinus - smoothMinus / period + minusDm[i];
    const pDi = smoothTr === 0 ? 0 : (100 * smoothPlus) / smoothTr;
    const mDi = smoothTr === 0 ? 0 : (100 * smoothMinus) / smoothTr;
    plusOut[i] = pDi;
    minusOut[i] = mDi;
    const sum = pDi + mDi;
    const dx = sum === 0 ? 0 : (100 * Math.abs(pDi - mDi)) / sum;
    dxValues.push({ index: i, dx });
  }

  if (dxValues.length >= period) {
    let prev = dxValues.slice(0, period).reduce((a, b) => a + b.dx, 0) / period;
    adxOut[dxValues[period - 1].index] = prev;
    for (let i = period; i < dxValues.length; i += 1) {
      prev = (prev * (period - 1) + dxValues[i].dx) / period;
      adxOut[dxValues[i].index] = prev;
    }
  }
  return { adx: adxOut, plusDi: plusOut, minusDi: minusOut };
}

export function obv(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    out[i] = out[i - 1] + (diff > 0 ? candles[i].volume : diff < 0 ? -candles[i].volume : 0);
  }
  return out;
}

export function rateOfChange(values: number[], period: number): number {
  if (values.length <= period) return 0;
  const prev = values[values.length - 1 - period];
  if (!prev) return 0;
  return ((values[values.length - 1] - prev) / prev) * 100;
}

function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

function lastNumber(arr: MaybeNumber[], fallback = 0): number {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const v = arr[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return fallback;
}

function nthLastNumber(arr: MaybeNumber[], n: number, fallback = 0): number {
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const v = arr[i];
    if (v !== null && Number.isFinite(v)) {
      if (count === n) return v;
      count += 1;
    }
  }
  return fallback;
}

function percentileRank(values: number[], value: number): number {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return 50;
  const below = valid.filter((v) => v <= value).length;
  return (below / valid.length) * 100;
}

export function analyzePriceAction(candles: Candle[]): PriceActionSnapshot {
  const window = candles.slice(-40);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 2; i < window.length - 2; i += 1) {
    const c = window[i];
    if (c.high > window[i - 1].high && c.high > window[i - 2].high && c.high > window[i + 1].high && c.high > window[i + 2].high) {
      highs.push(c.high);
    }
    if (c.low < window[i - 1].low && c.low < window[i - 2].low && c.low < window[i + 1].low && c.low < window[i + 2].low) {
      lows.push(c.low);
    }
  }
  const higherHighs = highs.length >= 2 && highs[highs.length - 1] > highs[highs.length - 2];
  const higherLows = lows.length >= 2 && lows[lows.length - 1] > lows[lows.length - 2];
  const lowerHighs = highs.length >= 2 && highs[highs.length - 1] < highs[highs.length - 2];
  const lowerLows = lows.length >= 2 && lows[lows.length - 1] < lows[lows.length - 2];

  const recent20 = candles.slice(-20);
  const high20 = Math.max(...recent20.map((c) => c.high));
  const low20 = Math.min(...recent20.map((c) => c.low));
  const current = last(candles);
  const range = current.high - current.low || 1;
  const bodyStrength = clamp((Math.abs(current.close - current.open) / range) * 100, 0, 100);

  let consecutiveUpBars = 0;
  for (let i = candles.length - 1; i >= 1; i -= 1) {
    if (candles[i].close > candles[i - 1].close) consecutiveUpBars += 1;
    else break;
  }

  const structure: PriceActionSnapshot["structure"] =
    higherHighs && higherLows ? "UPTREND" : lowerHighs && lowerLows ? "DOWNTREND" : "RANGE";

  return {
    higherHighs,
    higherLows,
    lowerHighs,
    lowerLows,
    structure,
    distanceFrom20BarHigh: round(((high20 - current.close) / high20) * 100, 2),
    distanceFrom20BarLow: round(((current.close - low20) / (low20 || 1)) * 100, 2),
    bodyStrength: round(bodyStrength, 1),
    consecutiveUpBars,
  };
}

export function computeIndicators(candles: Candle[]): TechnicalIndicators {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const price = last(closes);

  const rsiSeries = rsi(closes, 14);
  const rsiValue = lastNumber(rsiSeries, 50);
  const rsiPrev = nthLastNumber(rsiSeries, 1, rsiValue);

  const macdSeries = macd(closes);
  const macdValue = lastNumber(macdSeries.macd);
  const signalValue = lastNumber(macdSeries.signal);
  const hist = lastNumber(macdSeries.histogram);
  const prevHist = nthLastNumber(macdSeries.histogram, 1, hist);
  const prevMacd = nthLastNumber(macdSeries.macd, 1, macdValue);
  const prevSignal = nthLastNumber(macdSeries.signal, 1, signalValue);
  const crossover: MacdSnapshot["crossover"] =
    prevMacd <= prevSignal && macdValue > signalValue
      ? "BULLISH"
      : prevMacd >= prevSignal && macdValue < signalValue
        ? "BEARISH"
        : "NONE";

  const ema20v = lastNumber(ema(closes, 20), price);
  const ema50v = lastNumber(ema(closes, 50), price);
  const ema200v = lastNumber(ema(closes, 200), price);
  const sma20v = lastNumber(sma(closes, 20), price);
  const sma50v = lastNumber(sma(closes, 50), price);
  const sma200v = lastNumber(sma(closes, 200), price);

  const sma50Series = sma(closes, 50);
  const sma200Series = sma(closes, 200);
  const prevSma50 = nthLastNumber(sma50Series, 1, sma50v);
  const prevSma200 = nthLastNumber(sma200Series, 1, sma200v);
  const goldenCross = prevSma50 <= prevSma200 && sma50v > sma200v;
  const deathCross = prevSma50 >= prevSma200 && sma50v < sma200v;

  const bb = bollinger(closes, 20, 2);
  const bbUpper = lastNumber(bb.upper, price * 1.02);
  const bbMiddle = lastNumber(bb.middle, price);
  const bbLower = lastNumber(bb.lower, price * 0.98);
  const bbWidth = lastNumber(bb.width, 4);
  const widthHistory = bb.width.filter((v): v is number => v !== null).slice(-120);
  const widthPct = percentileRank(widthHistory, bbWidth);
  const prevWidth = nthLastNumber(bb.width, 3, bbWidth);

  const bbRange = bbUpper - bbLower || 1;
  const posRatio = (price - bbLower) / bbRange;
  const position: BollingerSnapshot["position"] =
    price > bbUpper
      ? "ABOVE_UPPER"
      : price < bbLower
        ? "BELOW_LOWER"
        : posRatio > 0.78
          ? "NEAR_UPPER"
          : posRatio < 0.22
            ? "NEAR_LOWER"
            : "MIDDLE";

  const adxSeries = adx(candles, 14);
  const adxValue = lastNumber(adxSeries.adx, 15);
  const adxPrev = nthLastNumber(adxSeries.adx, 3, adxValue);
  const plusDi = lastNumber(adxSeries.plusDi, 20);
  const minusDi = lastNumber(adxSeries.minusDi, 20);
  const adxSnapshot: AdxSnapshot = {
    adx: round(adxValue, 2),
    plusDi: round(plusDi, 2),
    minusDi: round(minusDi, 2),
    rising: adxValue > adxPrev,
    strength: adxValue < 20 ? "WEAK" : adxValue < 25 ? "DEVELOPING" : adxValue < 40 ? "STRONG" : "VERY_STRONG",
  };

  const atrValue = lastNumber(atr(candles, 14), price * 0.02);
  const volAvg20 = lastNumber(sma(volumes, 20), volumes[volumes.length - 1] || 1);
  const currentVolume = last(volumes);
  const ratio = volAvg20 > 0 ? currentVolume / volAvg20 : 1;
  const prevAvg = nthLastNumber(sma(volumes, 20), 5, volAvg20);
  const acceleration = prevAvg > 0 ? ((volAvg20 - prevAvg) / prevAvg) * 100 : 0;
  const obvSeries = obv(candles);
  const obvRecent = obvSeries.slice(-20);
  const obvSlope =
    obvRecent.length > 1 && Math.abs(obvRecent[0]) > 0
      ? ((obvRecent[obvRecent.length - 1] - obvRecent[0]) / Math.abs(obvRecent[0] || 1)) * 100
      : 0;

  const volumeSnapshot: VolumeSnapshot = {
    volume: currentVolume,
    average20: volAvg20,
    ratio: round(ratio, 2),
    acceleration: round(acceleration, 2),
    state: ratio >= 3 ? "EXTREME" : ratio >= 2 ? "HIGH" : ratio >= 1.4 ? "ELEVATED" : "NORMAL",
    obvSlope: round(obvSlope, 2),
    accumulation:
      obvRecent[obvRecent.length - 1] > obvRecent[0] * 1.001 || obvSlope > 1
        ? "ACCUMULATION"
        : obvRecent[obvRecent.length - 1] < obvRecent[0] * 0.999 || obvSlope < -1
          ? "DISTRIBUTION"
          : "NEUTRAL",
  };

  const emaAlignment: TechnicalIndicators["emaAlignment"] =
    ema20v > ema50v && ema50v > ema200v ? "BULLISH" : ema20v < ema50v && ema50v < ema200v ? "BEARISH" : "MIXED";

  return {
    price: round(price, 6),
    rsi: round(rsiValue, 2),
    rsiPrevious: round(rsiPrev, 2),
    rsiState: rsiValue < 30 ? "OVERSOLD" : rsiValue < 50 ? "WEAK" : rsiValue <= 70 ? "BULLISH" : "OVERBOUGHT",
    macd: {
      macd: round(macdValue, 6),
      signal: round(signalValue, 6),
      histogram: round(hist, 6),
      previousHistogram: round(prevHist, 6),
      crossover,
      histogramDirection: hist > prevHist ? "INCREASING" : hist < prevHist ? "DECREASING" : "FLAT",
      aboveZero: macdValue > 0,
    },
    ema20: round(ema20v, 6),
    ema50: round(ema50v, 6),
    ema200: round(ema200v, 6),
    sma20: round(sma20v, 6),
    sma50: round(sma50v, 6),
    sma200: round(sma200v, 6),
    emaAlignment,
    goldenCross,
    deathCross,
    bollinger: {
      upper: round(bbUpper, 6),
      middle: round(bbMiddle, 6),
      lower: round(bbLower, 6),
      width: round(bbWidth, 3),
      widthPercentile: round(widthPct, 1),
      squeeze: widthPct < 25,
      expansion: bbWidth > prevWidth * 1.15,
      position,
    },
    adx: adxSnapshot,
    atr: round(atrValue, 6),
    atrPercent: round((atrValue / price) * 100, 2),
    volume: volumeSnapshot,
    priceAction: analyzePriceAction(candles),
  };
}

export function indicatorSeries(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const macdSeries = macd(closes);
  const adxSeries = adx(candles, 14);
  return {
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    rsi: rsi(closes, 14),
    macd: macdSeries.macd,
    macdSignal: macdSeries.signal,
    macdHistogram: macdSeries.histogram,
    adx: adxSeries.adx,
    plusDi: adxSeries.plusDi,
    minusDi: adxSeries.minusDi,
    bbUpper: bollinger(closes, 20, 2).upper,
    bbLower: bollinger(closes, 20, 2).lower,
  };
}
