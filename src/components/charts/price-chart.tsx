"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import type { Candle, DataQuality, LevelMap, Timeframe, TradeSetup } from "@/types/market";
import { Badge, Button, QualityBadge, Segmented, SkeletonChart } from "@/components/ui/kit";
import { TIMEFRAMES, cn, formatCompact, formatPrice } from "@/lib/utils";

export interface ChartSeries {
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
}

interface Props {
  symbol: string;
  candles: Candle[];
  series: ChartSeries;
  levels?: LevelMap;
  setup?: TradeSetup;
  currency: string;
  timeframe: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  quality: DataQuality;
  loading?: boolean;
  /** Provenance shown under the chart so users can see how fresh the data is. */
  dataSource?: string | null;
  asOf?: string | null;
  delaySeconds?: number | null;
}

const PAD_RIGHT = 62;
const PAD_LEFT = 6;

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(880);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 880;
      setWidth(Math.max(320, w));
    });
    observer.observe(el);
    setWidth(Math.max(320, el.clientWidth));
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function formatTime(time: number, timeframe: Timeframe) {
  const d = new Date(time);
  if (timeframe === "1D" || timeframe === "1W") {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function PriceChart({
  symbol,
  candles,
  series,
  levels,
  setup,
  currency,
  timeframe,
  onTimeframeChange,
  quality,
  loading,
  dataSource,
  asOf,
  delaySeconds,
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [visibleCount, setVisibleCount] = useState(120);
  const [offset, setOffset] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [toggles, setToggles] = useState({
    ema20: true,
    ema50: true,
    ema200: true,
    bb: false,
    levels: true,
    setup: true,
    rsi: true,
    macd: true,
    adx: false,
  });
  const dragRef = useRef<{ x: number; offset: number } | null>(null);

  const priceHeight = fullscreen ? 420 : 300;
  const volumeHeight = 64;
  const panelHeight = 78;
  const panels = [toggles.rsi && "rsi", toggles.macd && "macd", toggles.adx && "adx"].filter(Boolean) as string[];
  const totalHeight = priceHeight + volumeHeight + panels.length * panelHeight + 22;

  const total = candles.length;
  const maxOffset = Math.max(0, total - visibleCount);
  const start = Math.max(0, Math.min(total - visibleCount, total - visibleCount - offset));
  const view = useMemo(() => candles.slice(Math.max(0, start), Math.max(0, start) + visibleCount), [candles, start, visibleCount]);

  const innerWidth = Math.max(120, width - PAD_RIGHT - PAD_LEFT);
  const barWidth = innerWidth / Math.max(1, view.length);
  const candleWidth = Math.max(1.5, Math.min(14, barWidth * 0.68));

  const { min, max } = useMemo(() => {
    if (!view.length) return { min: 0, max: 1 };
    let lo = Math.min(...view.map((c) => c.low));
    let hi = Math.max(...view.map((c) => c.high));
    const extras: number[] = [];
    const sliceIdx = (arr: (number | null)[]) =>
      arr.slice(start, start + visibleCount).filter((v): v is number => v !== null);
    if (toggles.ema20) extras.push(...sliceIdx(series.ema20));
    if (toggles.ema50) extras.push(...sliceIdx(series.ema50));
    if (toggles.ema200) extras.push(...sliceIdx(series.ema200));
    if (toggles.bb) extras.push(...sliceIdx(series.bbUpper), ...sliceIdx(series.bbLower));
    if (extras.length) {
      lo = Math.min(lo, ...extras);
      hi = Math.max(hi, ...extras);
    }
    const pad = (hi - lo) * 0.08 || hi * 0.02 || 1;
    return { min: lo - pad, max: hi + pad };
  }, [view, series, start, visibleCount, toggles]);

  const maxVolume = useMemo(() => Math.max(1, ...view.map((c) => c.volume)), [view]);

  const xFor = useCallback((i: number) => PAD_LEFT + i * barWidth + barWidth / 2, [barWidth]);
  const yFor = useCallback(
    (price: number) => {
      const range = max - min || 1;
      return ((max - price) / range) * priceHeight;
    },
    [max, min, priceHeight],
  );

  const linePath = useCallback(
    (values: (number | null)[]) => {
      const slice = values.slice(start, start + visibleCount);
      let d = "";
      let started = false;
      slice.forEach((v, i) => {
        if (v === null) {
          started = false;
          return;
        }
        const x = xFor(i);
        const y = yFor(v);
        d += `${started ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
        started = true;
      });
      return d;
    },
    [start, visibleCount, xFor, yFor],
  );

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - PAD_LEFT;
    const index = Math.floor(x / barWidth);
    setHover(index >= 0 && index < view.length ? index : null);
    if (dragRef.current) {
      const delta = Math.round((event.clientX - dragRef.current.x) / Math.max(2, barWidth));
      setOffset(Math.max(0, Math.min(maxOffset, dragRef.current.offset + delta)));
    }
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    if (Math.abs(event.deltaY) < 1) return;
    setVisibleCount((prev) => {
      const next = event.deltaY > 0 ? prev * 1.15 : prev / 1.15;
      return Math.round(Math.max(30, Math.min(total, next)));
    });
  };

  const hoverCandle = hover !== null ? view[hover] : null;
  const hoverAbsIndex = hover !== null ? start + hover : null;

  if (loading) return <SkeletonChart />;
  if (!candles.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
        Unable to fetch market data.
      </div>
    );
  }

  const gridLines = 5;

  return (
    <div
      className={cn(
        "panel flex flex-col",
        fullscreen && "fixed inset-2 z-[120] overflow-auto shadow-2xl md:inset-6",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-bright">{symbol}</span>
          <Badge tone="neutral">{timeframe}</Badge>
          <QualityBadge quality={quality} />
          <span className="hidden text-[11px] text-dim sm:inline">Candlestick · Volume · EMA · S/R — rendered by MarketAI</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {onTimeframeChange && (
            <Segmented
              size="sm"
              ariaLabel="Timeframe"
              value={timeframe}
              onChange={(tf) => onTimeframeChange(tf)}
              options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
            />
          )}
          <Button variant="ghost" size="sm" aria-label="Zoom in" onClick={() => setVisibleCount((v) => Math.max(30, Math.round(v / 1.3)))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Zoom out"
            onClick={() => setVisibleCount((v) => Math.min(total, Math.round(v * 1.3)))}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Reset view"
            onClick={() => {
              setVisibleCount(120);
              setOffset(0);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Toggle fullscreen" onClick={() => setFullscreen((f) => !f)}>
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
        {(
          [
            ["ema20", "EMA20"],
            ["ema50", "EMA50"],
            ["ema200", "EMA200"],
            ["bb", "Bollinger"],
            ["levels", "S/R"],
            ["setup", "Setup"],
            ["rsi", "RSI"],
            ["macd", "MACD"],
            ["adx", "ADX"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setToggles((t) => ({ ...t, [key]: !t[key] }))}
            aria-pressed={toggles[key]}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition",
              toggles[key] ? "border-brand/50 bg-brand/15 text-brand" : "border-line bg-panel-2/60 text-dim hover:text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div ref={ref} className="relative w-full select-none px-1 pb-1">
        <svg
          width={width}
          height={totalHeight}
          className="touch-pan-y"
          onMouseMove={handleMove}
          onMouseLeave={() => {
            setHover(null);
            dragRef.current = null;
          }}
          onMouseDown={(e) => {
            dragRef.current = { x: e.clientX, offset };
          }}
          onMouseUp={() => {
            dragRef.current = null;
          }}
          onWheel={handleWheel}
          role="img"
          aria-label={`${symbol} price chart`}
        >
          {/* price grid */}
          {Array.from({ length: gridLines + 1 }).map((_, i) => {
            const y = (priceHeight / gridLines) * i;
            const price = max - ((max - min) / gridLines) * i;
            return (
              <g key={`grid-${i}`}>
                <line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={y} y2={y} stroke="#141c2c" strokeWidth={1} />
                <text x={width - PAD_RIGHT + 6} y={y + 3} fill="#5b6780" fontSize={10} className="num">
                  {price >= 1000 ? price.toFixed(0) : price >= 1 ? price.toFixed(2) : price.toFixed(5)}
                </text>
              </g>
            );
          })}

          {/* bollinger */}
          {toggles.bb && (
            <>
              <path d={linePath(series.bbUpper)} fill="none" stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
              <path d={linePath(series.bbLower)} fill="none" stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
            </>
          )}

          {/* candles */}
          {view.map((candle, i) => {
            const x = xFor(i);
            const up = candle.close >= candle.open;
            const color = up ? "var(--color-up)" : "var(--color-down)";
            const yHigh = yFor(candle.high);
            const yLow = yFor(candle.low);
            const yOpen = yFor(candle.open);
            const yClose = yFor(candle.close);
            const top = Math.min(yOpen, yClose);
            const height = Math.max(1, Math.abs(yClose - yOpen));
            return (
              <g key={candle.time}>
                <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
                <rect x={x - candleWidth / 2} y={top} width={candleWidth} height={height} fill={color} rx={0.5} />
              </g>
            );
          })}

          {/* moving averages */}
          {toggles.ema20 && <path d={linePath(series.ema20)} fill="none" stroke="#f5b02e" strokeWidth={1.4} />}
          {toggles.ema50 && <path d={linePath(series.ema50)} fill="none" stroke="#6c7cff" strokeWidth={1.4} />}
          {toggles.ema200 && <path d={linePath(series.ema200)} fill="none" stroke="#a855f7" strokeWidth={1.4} />}

          {/* support / resistance */}
          {toggles.levels &&
            levels &&
            [levels.resistance1, levels.resistance2, levels.support1, levels.support2]
              .filter((l): l is NonNullable<typeof l> => Boolean(l))
              .filter((l) => l.price >= min && l.price <= max)
              .map((level) => {
                const y = yFor(level.price);
                const isRes = level.kind === "RESISTANCE";
                return (
                  <g key={`${level.kind}-${level.price}`}>
                    <line
                      x1={PAD_LEFT}
                      x2={width - PAD_RIGHT}
                      y1={y}
                      y2={y}
                      stroke={isRes ? "var(--color-down)" : "var(--color-up)"}
                      strokeWidth={1}
                      strokeDasharray="6 4"
                      opacity={0.65}
                    />
                    <text x={PAD_LEFT + 4} y={y - 4} fill={isRes ? "#f6465d" : "#16c784"} fontSize={9} className="num">
                      {isRes ? "R" : "S"} {level.price >= 1000 ? level.price.toFixed(0) : level.price.toFixed(2)}
                    </text>
                  </g>
                );
              })}

          {/* setup markers */}
          {toggles.setup && setup && (
            <>
              {[setup.entryLow, setup.entryHigh].every((p) => p >= min && p <= max) && (
                <rect
                  x={PAD_LEFT}
                  y={yFor(Math.max(setup.entryHigh, setup.entryLow))}
                  width={width - PAD_RIGHT - PAD_LEFT}
                  height={Math.max(2, Math.abs(yFor(setup.entryLow) - yFor(setup.entryHigh)))}
                  fill="rgba(108,124,255,0.12)"
                  stroke="rgba(108,124,255,0.4)"
                  strokeWidth={0.8}
                />
              )}
              {setup.stopLoss >= min && setup.stopLoss <= max && (
                <line
                  x1={PAD_LEFT}
                  x2={width - PAD_RIGHT}
                  y1={yFor(setup.stopLoss)}
                  y2={yFor(setup.stopLoss)}
                  stroke="#f6465d"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
              )}
              {[setup.takeProfit1, setup.takeProfit2]
                .filter((p) => p >= min && p <= max)
                .map((tp, i) => (
                  <line
                    key={`tp-${i}`}
                    x1={PAD_LEFT}
                    x2={width - PAD_RIGHT}
                    y1={yFor(tp)}
                    y2={yFor(tp)}
                    stroke="#16c784"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    opacity={0.8}
                  />
                ))}
            </>
          )}

          {/* volume pane */}
          <g transform={`translate(0, ${priceHeight + 8})`}>
            {view.map((candle, i) => {
              const h = (candle.volume / maxVolume) * (volumeHeight - 10);
              const up = candle.close >= candle.open;
              return (
                <rect
                  key={`vol-${candle.time}`}
                  x={xFor(i) - candleWidth / 2}
                  y={volumeHeight - 10 - h}
                  width={candleWidth}
                  height={Math.max(0.5, h)}
                  fill={up ? "rgba(22,199,132,0.5)" : "rgba(246,70,93,0.5)"}
                />
              );
            })}
            <text x={PAD_LEFT + 2} y={10} fill="#5b6780" fontSize={9}>
              VOLUME
            </text>
          </g>

          {/* indicator panes */}
          {panels.map((panel, panelIndex) => {
            const top = priceHeight + volumeHeight + 12 + panelIndex * panelHeight;
            const inner = panelHeight - 18;
            if (panel === "rsi") {
              const slice = series.rsi.slice(start, start + visibleCount);
              const path = slice
                .map((v, i) => (v === null ? "" : `${i === 0 || slice[i - 1] === null ? "M" : "L"}${xFor(i).toFixed(1)},${(inner - (v / 100) * inner).toFixed(1)}`))
                .join("");
              return (
                <g key="rsi" transform={`translate(0, ${top})`}>
                  <line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={inner - (70 / 100) * inner} y2={inner - (70 / 100) * inner} stroke="#3d1420" strokeDasharray="3 3" />
                  <line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={inner - (30 / 100) * inner} y2={inner - (30 / 100) * inner} stroke="#0f3b2c" strokeDasharray="3 3" />
                  <path d={path} fill="none" stroke="#a855f7" strokeWidth={1.2} />
                  <text x={PAD_LEFT + 2} y={10} fill="#5b6780" fontSize={9}>
                    RSI(14) {series.rsi[hoverAbsIndex ?? series.rsi.length - 1]?.toFixed(1) ?? "—"}
                  </text>
                </g>
              );
            }
            if (panel === "macd") {
              const hist = series.macdHistogram.slice(start, start + visibleCount);
              const macdSlice = series.macd.slice(start, start + visibleCount);
              const signalSlice = series.macdSignal.slice(start, start + visibleCount);
              const allVals = [...hist, ...macdSlice, ...signalSlice].filter((v): v is number => v !== null);
              const bound = Math.max(0.0001, ...allVals.map((v) => Math.abs(v)));
              const yv = (v: number) => inner / 2 - (v / bound) * (inner / 2 - 4);
              const toPath = (arr: (number | null)[]) =>
                arr.map((v, i) => (v === null ? "" : `${i === 0 || arr[i - 1] === null ? "M" : "L"}${xFor(i).toFixed(1)},${yv(v).toFixed(1)}`)).join("");
              return (
                <g key="macd" transform={`translate(0, ${top})`}>
                  <line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={inner / 2} y2={inner / 2} stroke="#1a2438" />
                  {hist.map((v, i) =>
                    v === null ? null : (
                      <rect
                        key={`h-${i}`}
                        x={xFor(i) - candleWidth / 2}
                        y={Math.min(inner / 2, yv(v))}
                        width={candleWidth}
                        height={Math.max(0.5, Math.abs(inner / 2 - yv(v)))}
                        fill={v >= 0 ? "rgba(22,199,132,0.55)" : "rgba(246,70,93,0.55)"}
                      />
                    ),
                  )}
                  <path d={toPath(macdSlice)} fill="none" stroke="#6c7cff" strokeWidth={1.2} />
                  <path d={toPath(signalSlice)} fill="none" stroke="#f5b02e" strokeWidth={1.2} />
                  <text x={PAD_LEFT + 2} y={10} fill="#5b6780" fontSize={9}>
                    MACD(12,26,9)
                  </text>
                </g>
              );
            }
            const adxSlice = series.adx.slice(start, start + visibleCount);
            const plus = series.plusDi.slice(start, start + visibleCount);
            const minus = series.minusDi.slice(start, start + visibleCount);
            const scale = (v: number) => inner - (Math.min(60, v) / 60) * inner;
            const toPath = (arr: (number | null)[]) =>
              arr.map((v, i) => (v === null ? "" : `${i === 0 || arr[i - 1] === null ? "M" : "L"}${xFor(i).toFixed(1)},${scale(v).toFixed(1)}`)).join("");
            return (
              <g key="adx" transform={`translate(0, ${top})`}>
                <line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={scale(25)} y2={scale(25)} stroke="#1a2438" strokeDasharray="3 3" />
                <path d={toPath(adxSlice)} fill="none" stroke="#e9eefb" strokeWidth={1.3} />
                <path d={toPath(plus)} fill="none" stroke="#16c784" strokeWidth={1} opacity={0.8} />
                <path d={toPath(minus)} fill="none" stroke="#f6465d" strokeWidth={1} opacity={0.8} />
                <text x={PAD_LEFT + 2} y={10} fill="#5b6780" fontSize={9}>
                  ADX(14) {series.adx[hoverAbsIndex ?? series.adx.length - 1]?.toFixed(1) ?? "—"}
                </text>
              </g>
            );
          })}

          {/* time axis */}
          {view
            .map((c, i) => ({ c, i }))
            .filter(({ i }) => i % Math.max(1, Math.floor(view.length / 6)) === 0)
            .map(({ c, i }) => (
              <text key={`t-${c.time}`} x={xFor(i)} y={totalHeight - 4} fill="#5b6780" fontSize={9} textAnchor="middle">
                {formatTime(c.time, timeframe)}
              </text>
            ))}

          {/* crosshair */}
          {hover !== null && hoverCandle && (
            <g pointerEvents="none">
              <line x1={xFor(hover)} x2={xFor(hover)} y1={0} y2={totalHeight - 16} stroke="#3b4a6b" strokeDasharray="3 3" />
              <line
                x1={PAD_LEFT}
                x2={width - PAD_RIGHT}
                y1={yFor(hoverCandle.close)}
                y2={yFor(hoverCandle.close)}
                stroke="#3b4a6b"
                strokeDasharray="3 3"
              />
            </g>
          )}
        </svg>

        {hover !== null && hoverCandle && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-line bg-panel-3/95 px-3 py-2 text-[11px] shadow-xl"
            style={{ left: Math.min(Math.max(8, xFor(hover) - 70), Math.max(8, width - 190)) }}
          >
            <p className="num font-semibold text-bright">{formatTime(hoverCandle.time, timeframe)}</p>
            <div className="num mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted">
              <span>O {formatPrice(hoverCandle.open, currency)}</span>
              <span>H {formatPrice(hoverCandle.high, currency)}</span>
              <span>L {formatPrice(hoverCandle.low, currency)}</span>
              <span className={hoverCandle.close >= hoverCandle.open ? "text-up" : "text-down"}>
                C {formatPrice(hoverCandle.close, currency)}
              </span>
              <span className="col-span-2">Vol {formatCompact(hoverCandle.volume)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2 text-[11px] text-dim">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 bg-[#f5b02e]" /> EMA20
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 bg-[#6c7cff]" /> EMA50
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 bg-[#a855f7]" /> EMA200
        </span>
        <span className="hidden sm:inline">Scroll to zoom · drag to pan · hover for OHLCV</span>
        <span className="num ml-auto flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {dataSource && <span>Provider: {dataSource}</span>}
          {asOf && (
            <span title={asOf}>
              Data timestamp: {new Date(asOf).toISOString().replace("T", " ").slice(0, 19)} UTC
            </span>
          )}
          {delaySeconds !== null && delaySeconds !== undefined && (
            <span
              className={
                quality === "LIVE" ? "text-up" : quality === "DELAYED" ? "text-warn" : "text-dim"
              }
            >
              Last updated: {delaySeconds}s ago
            </span>
          )}
          <span
            className={
              quality === "LIVE"
                ? "text-up"
                : quality === "DELAYED"
                  ? "text-warn"
                  : quality === "UNAVAILABLE"
                    ? "text-down"
                    : "text-info"
            }
          >
            {quality === "LIVE" ? "LIVE" : quality === "DELAYED" ? "DELAYED" : quality}
          </span>
        </span>
      </div>
    </div>
  );
}
