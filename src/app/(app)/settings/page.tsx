"use client";

import { useState } from "react";
import { Database, Save, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Field, QualityBadge, Segmented, Select, SkeletonCard, StatTile } from "@/components/ui/kit";
import { PageHeader } from "@/components/shell/app-shell";
import { useSettings, useSettingsMutation } from "@/lib/api-client";
import type { MarketId, Timeframe, UserSettings } from "@/types/market";
import { TIMEFRAMES } from "@/lib/utils";

export default function SettingsPage() {
  const { data, isLoading } = useSettings();
  const mutation = useSettingsMutation();
  const [edits, setEdits] = useState<Partial<UserSettings>>({});

  // Derived during render: server settings merged with local edits (no effect needed).
  const draft: UserSettings | null = data?.settings ? { ...data.settings, ...edits } : null;

  if (isLoading || !draft) return <SkeletonCard rows={6} />;

  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    setEdits((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Preferences affect scoring weights, default views and filtering only. They never guarantee an outcome."
        actions={
          <Button onClick={() => mutation.mutate(draft)} disabled={mutation.isPending}>
            <Save className="h-3.5 w-3.5" /> {mutation.isPending ? "Saving…" : "Save settings"}
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Terminal preferences" icon={<SettingsIcon className="h-4 w-4 text-brand" />} bodyClassName="space-y-3 p-4">
          <Field label="Theme" hint="Dark is the default terminal theme.">
            <Segmented
              value={draft.theme}
              onChange={(v) => set("theme", v)}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light (beta)" },
              ]}
            />
          </Field>
          <Field label="Display currency" hint="All MarketAI markets quote in USD.">
            <Segmented
              value={draft.currency}
              onChange={(v) => set("currency", v)}
              options={[
                { value: "USD", label: "USD" },
              ]}
            />
          </Field>
          <Field label="Default timeframe">
            <Select value={draft.defaultTimeframe} onChange={(e) => set("defaultTimeframe", e.target.value as Timeframe)}>
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default market">
            <Segmented
              value={draft.defaultMarket}
              onChange={(v) => set("defaultMarket", v as MarketId)}
              options={[
                { value: "US", label: "US Stocks" },
                { value: "CRYPTO", label: "Crypto" },
                { value: "MEME", label: "Meme Coins" },
              ]}
            />
          </Field>
        </Card>

        <Card title="Risk & scoring" icon={<ShieldCheck className="h-4 w-4 text-warn" />} bodyClassName="space-y-3 p-4">
          <Field
            label="Risk preference"
            hint="Conservative penalises high ATR and overbought RSI; Aggressive rewards momentum and volume expansion."
          >
            <Segmented
              value={draft.riskPreference}
              onChange={(v) => set("riskPreference", v)}
              options={[
                { value: "CONSERVATIVE", label: "Conservative" },
                { value: "BALANCED", label: "Balanced" },
                { value: "AGGRESSIVE", label: "Aggressive" },
              ]}
            />
          </Field>
          <Field label="Notifications" hint="Controls in-app alert badges.">
            <Segmented
              value={draft.notifications ? "on" : "off"}
              onChange={(v) => set("notifications", v === "on")}
              options={[
                { value: "on", label: "Enabled" },
                { value: "off", label: "Disabled" },
              ]}
            />
          </Field>
          <div className="rounded-lg border border-line bg-panel-2/50 p-3 text-[11px] text-muted">
            AI Score weights — RSI 15 · MACD 15 · EMA Trend 15 · Volume 15 · Breakout 15 · ADX 10 · Price Action 10 ·
            Sentiment 5.
          </div>
        </Card>

        <Card title="Data providers" icon={<Database className="h-4 w-4 text-info" />} bodyClassName="space-y-3 p-4">
          <Field label="Provider mode" hint="AUTO uses configured vendors and falls back to demo data when credentials are absent.">
            <Segmented
              value={draft.dataProvider}
              onChange={(v) => set("dataProvider", v)}
              options={[
                { value: "AUTO", label: "Auto" },
                { value: "MOCK", label: "Demo only" },
              ]}
            />
          </Field>
          <div className="space-y-2">
            {data?.services.map((p) => (
              <div key={p.service} className="rounded-lg border border-line bg-panel-2/50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-bright">
                      {p.label} · {p.dataSource}
                    </p>
                    <p className="truncate text-[11px] text-dim">{p.message}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge
                      tone={
                        p.state === "LIVE" || p.state === "CONNECTED"
                          ? "up"
                          : p.state === "DELAYED" || p.state === "RATE_LIMITED"
                            ? "warn"
                            : p.state === "CONFIGURED"
                              ? "info"
                              : p.state === "DEMO"
                                ? "brand"
                                : "down"
                      }
                    >
                      {p.state.replace(/_/g, " ")}
                    </Badge>
                    <QualityBadge quality={p.quality} compact />
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-dim">
                  <span className={p.hasKey ? "text-up" : "text-dim"}>{p.hasKey ? "key set" : "no key"}</span>
                  {p.hasSecret && <span className="text-up">secret set</span>}
                  {typeof p.requests === "number" && p.requests > 0 && (
                    <span>
                      {p.successes ?? 0}/{p.requests} ok
                    </span>
                  )}
                  {typeof p.lastLatencyMs === "number" && <span>{p.lastLatencyMs}ms</span>}
                  {typeof p.rateLimitHits === "number" && p.rateLimitHits > 0 && (
                    <span className="text-warn">{p.rateLimitHits}× 429</span>
                  )}
                  {p.cooldownSecondsRemaining ? (
                    <span className="text-warn">cooldown {p.cooldownSecondsRemaining}s</span>
                  ) : null}
                  {p.state === "NOT_CONFIGURED" && p.requiredEnv.length > 0 && (
                    <span className="num text-warn">needs {p.requiredEnv.join(", ")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-dim">
            News vendor:{" "}
            <Badge tone={data?.newsConfigured ? "up" : "down"}>
              {data?.newsConfigured ? "CONFIGURED" : "NOT CONFIGURED"}
            </Badge>
          </p>
          <p className="text-[11px] text-dim">
            MOCK_MODE is currently <Badge tone={data?.mockMode ? "warn" : "up"}>{data?.mockMode ? "ON" : "OFF"}</Badge>. Set{" "}
            <code className="num">MOCK_MODE=false</code> with vendor credentials to switch to live/delayed feeds.
          </p>
          {data?.warning && (
            <p className="rounded-lg border border-warn/30 bg-warn/5 p-2.5 text-[11px] text-warn">⚠ {data.warning}</p>
          )}
        </Card>

        <Card title="Session & compliance" bodyClassName="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Auth" value="Anonymous" sub="Cookie-scoped session, auth-ready" />
            <StatTile label="Broker link" value="None" sub="No order routing, ever" />
          </div>
          <p className="rounded-lg border border-warn/25 bg-warn/5 p-3 text-[11px] text-warn">
            MarketAI never asks for broker credentials, never stores broker tokens and never executes trades. All outputs
            are analytical estimates.
          </p>
        </Card>
      </div>
    </div>
  );
}
