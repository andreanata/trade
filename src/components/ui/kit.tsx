"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataQuality } from "@/types/market";

export function Card({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-wide text-bright">{title}</h2>
              {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

type Tone = "up" | "down" | "neutral" | "brand" | "warn" | "muted" | "info";

const TONE_CLASS: Record<Tone, string> = {
  up: "bg-up/12 text-up border-up/30",
  down: "bg-down/12 text-down border-down/30",
  neutral: "bg-panel-3 text-muted border-line",
  brand: "bg-brand/15 text-brand border-brand/35",
  warn: "bg-warn/12 text-warn border-warn/30",
  muted: "bg-panel-2 text-dim border-line",
  info: "bg-info/12 text-info border-info/30",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-2.5 py-1.5 text-xs",
        size === "md" && "px-3.5 py-2 text-sm",
        size === "lg" && "px-5 py-2.5 text-sm",
        variant === "primary" &&
          "bg-gradient-to-r from-brand to-brand-2 text-white shadow-[0_8px_24px_-12px_rgba(108,124,255,0.9)] hover:brightness-110",
        variant === "outline" && "border border-line bg-panel-2/70 text-bright hover:border-brand/60 hover:bg-panel-3",
        variant === "ghost" && "text-muted hover:bg-panel-2 hover:text-bright",
        variant === "subtle" && "bg-panel-3 text-bright hover:bg-panel-3/70",
        variant === "danger" && "border border-down/40 bg-down/10 text-down hover:bg-down/20",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-line bg-panel-2/80 px-3 py-2 text-sm text-bright placeholder:text-dim outline-none transition focus:border-brand/70",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={cn(
        "w-full appearance-none rounded-lg border border-line bg-panel-2/80 px-3 py-2 text-sm text-bright outline-none transition focus:border-brand/70",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-dim">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-panel-2/70 p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md font-semibold transition",
            size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
            value === option.value
              ? "bg-gradient-to-r from-brand/90 to-brand-2/90 text-white"
              : "text-muted hover:bg-panel-3 hover:text-bright",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone = "brand", className }: { value: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const bar =
    tone === "up" ? "bg-up" : tone === "down" ? "bg-down" : tone === "warn" ? "bg-warn" : "bg-gradient-to-r from-brand to-brand-2";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-panel-3", className)}>
      <div className={cn("h-full rounded-full transition-all duration-500", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="panel space-y-3 p-4">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return <Skeleton className={cn("h-[360px] w-full", className)} />;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-panel-2/40 px-6 py-12 text-center">
      <div className="text-dim">{icon ?? <Info className="h-6 w-6" />}</div>
      <div>
        <p className="text-sm font-semibold text-bright">{title}</p>
        {description && <p className="mt-1 max-w-md text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-down/30 bg-down/5 px-6 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-down" />
      <p className="text-sm font-semibold text-bright">{message ?? "Unable to fetch market data."}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

const QUALITY_META: Record<
  DataQuality,
  { dot: string; label: string; tone: Tone; title: string }
> = {
  LIVE: { dot: "🟢", label: "LIVE", tone: "up", title: "Real-time vendor data (≤2 minutes old)" },
  DELAYED: { dot: "🟡", label: "DELAYED", tone: "warn", title: "Real vendor data, delayed (2–30 minutes old)" },
  HISTORICAL: { dot: "🔵", label: "HISTORICAL", tone: "info", title: "Real vendor data, last close / historical bars" },
  DEMO: { dot: "🟣", label: "DEMO DATA", tone: "brand", title: "Synthetic dataset — not live market data" },
  UNAVAILABLE: { dot: "🔴", label: "DATA UNAVAILABLE", tone: "down", title: "The provider could not deliver real data" },
};

export function QualityBadge({
  quality,
  className,
  source,
  compact = false,
}: {
  quality: DataQuality;
  className?: string;
  source?: string | null;
  compact?: boolean;
}) {
  const meta = QUALITY_META[quality] ?? QUALITY_META.UNAVAILABLE;
  return (
    <Badge tone={meta.tone} className={className} title={source ? `${meta.title} · ${source}` : meta.title}>
      <span aria-hidden>{meta.dot}</span>
      {compact ? meta.label.split(" ")[0] : meta.label}
    </Badge>
  );
}

/** Market · provider · quality · last update, as shown in the header and cards. */
export function DataStatusLine({
  market,
  source,
  quality,
  asOf,
  className,
}: {
  market: string;
  source: string;
  quality: DataQuality;
  asOf?: string | null;
  className?: string;
}) {
  const meta = QUALITY_META[quality] ?? QUALITY_META.UNAVAILABLE;
  const updated = asOf ? new Date(asOf).toLocaleTimeString("en-GB", { hour12: false }) : "—";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]", className)}>
      <span className="font-semibold text-bright">{market}</span>
      <span className="text-dim">·</span>
      <span className="text-muted">{source}</span>
      <span className="text-dim">·</span>
      <span
        className={cn(
          "font-semibold",
          meta.tone === "up" && "text-up",
          meta.tone === "warn" && "text-warn",
          meta.tone === "info" && "text-info",
          meta.tone === "brand" && "text-brand",
          meta.tone === "down" && "text-down",
        )}
      >
        {meta.dot} {meta.label}
      </span>
      <span className="text-dim">·</span>
      <span className="num text-dim">Updated {updated}</span>
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-panel-2/60 p-3", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-dim">{label}</p>
      <p
        className={cn(
          "num mt-1 text-lg font-semibold",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
          tone === "warn" && "text-warn",
          tone === "brand" && "text-brand",
          tone === "neutral" && "text-bright",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-panel-3 px-2 py-1 text-[11px] text-bright shadow-xl group-hover:block"
      >
        {label}
      </span>
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <button aria-label="Close overlay" className="fixed inset-0 cursor-default" onClick={onClose} tabIndex={-1} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-rise relative z-10 w-full rounded-2xl border border-line bg-panel shadow-2xl",
          size === "md" ? "max-w-lg" : "max-w-3xl",
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-bright">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
            ✕
          </Button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
