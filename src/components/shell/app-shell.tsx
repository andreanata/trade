"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Briefcase,
  Flame,
  Gauge,
  LayoutDashboard,
  LineChart,
  Menu,
  Newspaper,
  Radar,
  Search,
  Settings as SettingsIcon,
  Star,
  UserCircle2,
  X,
} from "lucide-react";
import { Badge, Button, Input, Modal, QualityBadge } from "@/components/ui/kit";
import { useAlerts, useProviders, useSearch } from "@/lib/api-client";
import { cn, formatPercent, formatPrice, marketFlag } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { href: "/market/us", label: "US Stocks", icon: LineChart, group: "Markets" },
  { href: "/market/crypto", label: "Crypto", icon: Activity, group: "Markets" },
  { href: "/market/meme", label: "Meme Coins", icon: BarChart3, group: "Markets" },
  { href: "/scanner", label: "Scanner", icon: Radar, group: "Analysis" },
  { href: "/breakout", label: "Early Breakout", icon: Flame, group: "Analysis" },
  { href: "/ai-analyst", label: "AI Analyst", icon: Bot, group: "Analysis" },
  { href: "/backtest", label: "Backtest", icon: Gauge, group: "Analysis" },
  { href: "/watchlist", label: "Watchlist", icon: Star, group: "Portfolio" },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase, group: "Portfolio" },
  { href: "/alerts", label: "Alerts", icon: Bell, group: "Portfolio" },
  { href: "/news", label: "News", icon: Newspaper, group: "Portfolio" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, group: "System" },
];

const MOBILE_NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/scanner", label: "Scanner", icon: Radar },
  { href: "/breakout", label: "Breakout", icon: Flame },
  { href: "/watchlist", label: "Watch", icon: Star },
  { href: "/ai-analyst", label: "AI", icon: Bot },
];

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 260);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isFetching } = useSearch(debounced);

  return (
    <Modal open={open} onClose={onClose} title="Search assets" size="lg">
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search NVDA, BTC, meme token or contract address…"
        aria-label="Search assets"
      />
      <div className="mt-3 space-y-1">
        {isFetching && <p className="px-2 py-4 text-xs text-muted">Scanning universe…</p>}
        {!isFetching && debounced && !data?.results.length && (
          <p className="px-2 py-4 text-xs text-muted">Asset not found.</p>
        )}
        {data?.results.map((r) => (
          <button
            key={`${r.market}-${r.symbol}`}
            onClick={() => {
              onClose();
              router.push(`/asset/${r.symbol}?market=${r.market}`);
            }}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-panel-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span>{marketFlag(r.market)}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-bright">{r.symbol}</span>
                <span className="block truncate text-[11px] text-dim">
                  {r.name} · {r.market}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-3 text-right">
              <span className="num text-xs text-muted">{r.price === null ? "N/A" : formatPrice(r.price, r.currency)}</span>
              <span
                className={cn(
                  "num text-xs font-semibold",
                  (r.changePercent ?? 0) > 0 ? "text-up" : (r.changePercent ?? 0) < 0 ? "text-down" : "text-muted",
                )}
              >
                {r.changePercent === null ? "—" : formatPercent(r.changePercent)}
              </span>
              <Badge tone={(r.aiScore ?? 0) >= 70 ? "up" : (r.aiScore ?? 0) >= 50 ? "brand" : "neutral"}>
                {r.aiScore === null ? "N/A" : r.aiScore.toFixed(0)}
              </Badge>
            </span>
          </button>
        ))}
        {!debounced && (
          <p className="px-2 py-4 text-xs text-dim">
            Try NVDA, TSLA, AAPL, BTC, ETH, SOL, or a meme ticker / contract address — search runs across every configured provider.
          </p>
        )}
      </div>
    </Modal>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: alertData } = useAlerts();
  const { data: providerData } = useProviders();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Sidebar closes from the nav link handlers rather than a pathname effect.

  const demoMode = providerData?.mockMode ?? true;
  const triggered = alertData?.triggeredCount ?? 0;
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  const providers = providerData?.providers ?? [];
  const lastUpdate = providerData?.checkedAt
    ? new Date(providerData.checkedAt).toLocaleTimeString("en-GB", { hour12: false })
    : "—";

  return (
    <div className="min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[90] w-60 transform border-r border-line bg-bg-soft/95 backdrop-blur transition-transform duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-2 text-xs font-black text-white">
              M
            </span>
            <span className="text-sm font-black tracking-widest text-bright">MARKETAI</span>
          </Link>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
            <X className="h-4 w-4 text-muted" />
          </button>
        </div>
        <nav className="h-[calc(100vh-3.5rem)] space-y-4 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-dim">{group}</p>
              <ul className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
                          active
                            ? "bg-gradient-to-r from-brand/20 to-transparent text-bright shadow-[inset_2px_0_0_0_var(--color-brand)]"
                            : "text-muted hover:bg-panel-2 hover:text-bright",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active && "text-brand")} />
                        {item.label}
                        {item.href === "/alerts" && triggered > 0 && (
                          <span className="ml-auto rounded-full bg-down px-1.5 text-[10px] font-bold text-white">{triggered}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="rounded-xl border border-line bg-panel-2/60 p-3">
            <p className="text-[11px] font-semibold text-bright">Data providers</p>
            <div className="mt-2 space-y-1.5">
              {providers.map((p) => (
                <div key={p.market} className="space-y-0.5" title={p.message}>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
                    <span className="font-semibold">{p.market}</span>
                    <QualityBadge quality={p.quality} compact />
                  </div>
                  <p className="truncate text-[10px] text-dim">{p.dataSource}</p>
                </div>
              ))}
              {!providers.length && <p className="text-[10px] text-dim">Checking providers…</p>}
            </div>
          </div>
        </nav>
      </aside>

      {sidebarOpen && (
        <button
          className="fixed inset-0 z-[80] bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-[70] flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-3 backdrop-blur-xl sm:px-5">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5 text-muted" />
          </button>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-panel-2/60 px-3 py-1.5 text-left text-xs text-dim transition hover:border-brand/50 sm:max-w-sm"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">Search assets…</span>
            <kbd className="hidden rounded border border-line px-1 text-[10px] sm:block">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1.5 lg:flex">
              {providers.map((p) => (
                <span
                  key={p.market}
                  title={`${p.market} · ${p.dataSource} · ${p.quality} · ${p.message}`}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-panel-2/60 px-2 py-1 text-[10px] font-semibold text-muted"
                >
                  <span aria-hidden>
                    {p.quality === "LIVE"
                      ? "🟢"
                      : p.quality === "DELAYED"
                        ? "🟡"
                        : p.quality === "HISTORICAL"
                          ? "🔵"
                          : p.quality === "DEMO"
                            ? "🟣"
                            : "🔴"}
                  </span>
                  {p.market}
                </span>
              ))}
            </div>
            <Badge
              tone={demoMode ? "brand" : "up"}
              className="hidden sm:inline-flex"
              title={
                demoMode
                  ? "MOCK_MODE=true — synthetic dataset, not live market data"
                  : `Real vendor data · updated ${lastUpdate}`
              }
            >
              {demoMode ? "DEMO MODE" : "REAL DATA"}
            </Badge>
            <Link href="/alerts" className="relative rounded-lg p-2 transition hover:bg-panel-2" aria-label="Alerts">
              <Bell className="h-4 w-4 text-muted" />
              {triggered > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-down animate-live-dot" aria-hidden />
              )}
            </Link>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2/60 px-2 py-1.5">
              <UserCircle2 className="h-4 w-4 text-muted" />
              <span className="hidden text-[11px] text-muted sm:block">Anonymous session</span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 sm:px-5 lg:pb-10">{children}</main>

        <footer className="border-t border-line px-4 py-6 text-center text-[11px] leading-relaxed text-dim lg:px-8">
          <p className="mx-auto max-w-4xl">
            MarketAI is an analytical tool. Market data may be delayed or incomplete. Scores and signals are estimates
            based on technical and market data and are not financial advice or guarantees of future performance.
            MarketAI does not connect to broker accounts and never executes trades.
          </p>
        </footer>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-[85] flex items-center justify-around border-t border-line bg-bg/95 px-2 py-1.5 backdrop-blur-xl lg:hidden">
        {MOBILE_NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition",
                active ? "text-brand" : "text-dim",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-bright sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-xs text-muted sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export { Button };
