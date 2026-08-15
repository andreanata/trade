import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { MarketId, Timeframe } from "@/types/market";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Deterministic 32-bit string hash (FNV-1a style). */
export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic pseudo random value in [0,1) for a given integer index + seed. */
export function noiseAt(seed: number, index: number): number {
  let t = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

export function gaussianAt(seed: number, index: number): number {
  const u = Math.max(1e-9, noiseAt(seed, index * 2));
  const v = noiseAt(seed, index * 2 + 1);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const TIMEFRAMES: Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1H",
  "4H",
  "1D",
  "1W",
];

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
  "1W": 604_800_000,
};

export function isTimeframe(value: string | null | undefined): value is Timeframe {
  return !!value && (TIMEFRAMES as string[]).includes(value);
}

export function parseTimeframe(value: string | null | undefined, fallback: Timeframe = "1D"): Timeframe {
  return isTimeframe(value) ? value : fallback;
}

export function parseMarket(value: string | null | undefined): MarketId | "ALL" {
  const upper = (value ?? "").toUpperCase();
  if (upper === "US" || upper === "CRYPTO" || upper === "MEME") return upper;
  return "ALL";
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function safeNumber(value: unknown, fallback = 0): number {
  const num = typeof value === "string" ? Number(value) : (value as number);
  return typeof num === "number" && Number.isFinite(num) ? num : fallback;
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPrice(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  if (currency === "IDR") {
    return `Rp ${value.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
  }
  const decimals = value >= 1000 ? 2 : value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

export function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function marketLabel(market: MarketId): string {
  if (market === "US") return "US STOCKS";
  if (market === "CRYPTO") return "CRYPTO";
  return "MEME COINS";
}

export function marketFlag(market: MarketId): string {
  if (market === "US") return "🇺🇸";
  if (market === "CRYPTO") return "🪙";
  return "🐸";
}

export function toneForChange(value: number): "up" | "down" | "flat" {
  if (value > 0.0001) return "up";
  if (value < -0.0001) return "down";
  return "flat";
}
