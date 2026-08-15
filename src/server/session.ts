import { cookies } from "next/headers";
import type { MarketId, Timeframe, UserSettings } from "@/types/market";
import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured } from "@/db";
import { userSettings } from "@/db/schema";

export const SESSION_COOKIE = "marketai_session";

/**
 * Anonymous, cookie-scoped session key.
 * This is deliberately NOT an authentication system — it is the seam where a real
 * auth provider (NextAuth, Supabase Auth, Clerk, ...) plugs in later.
 */
export async function getUserKey(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing) return existing;
  const generated = `anon_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  try {
    store.set(SESSION_COOKIE, generated, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    // Read-only context (RSC render): fall back to a shared local key.
    return "local-demo";
  }
  return generated;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "dark",
  currency: "USD",
  defaultTimeframe: "1D",
  defaultMarket: "US",
  riskPreference: "BALANCED",
  notifications: true,
  dataProvider: "AUTO",
  demoMode: true,
};

export async function loadSettings(userKey: string): Promise<UserSettings> {
  // Without a database the terminal still runs on default preferences.
  if (!isDatabaseConfigured()) return DEFAULT_SETTINGS;
  try {
    const rows = await db.select().from(userSettings).where(eq(userSettings.userKey, userKey)).limit(1);
    const row = rows[0];
    if (!row) return DEFAULT_SETTINGS;
    return {
      theme: (row.theme as UserSettings["theme"]) ?? "dark",
      currency: (row.currency as UserSettings["currency"]) ?? "USD",
      defaultTimeframe: (row.defaultTimeframe as Timeframe) ?? "1D",
      defaultMarket: (row.defaultMarket as MarketId) ?? "US",
      riskPreference: (row.riskPreference as UserSettings["riskPreference"]) ?? "BALANCED",
      notifications: row.notifications,
      dataProvider: (row.dataProvider as UserSettings["dataProvider"]) ?? "AUTO",
      demoMode: row.demoMode,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(userKey: string, patch: Partial<UserSettings>): Promise<UserSettings> {
  const current = await loadSettings(userKey);
  const next: UserSettings = { ...current, ...patch };
  // Nothing to persist to; return the merged view so the UI stays responsive.
  if (!isDatabaseConfigured()) return next;
  await db
    .insert(userSettings)
    .values({
      userKey,
      theme: next.theme,
      currency: next.currency,
      defaultTimeframe: next.defaultTimeframe,
      defaultMarket: next.defaultMarket,
      riskPreference: next.riskPreference,
      notifications: next.notifications,
      dataProvider: next.dataProvider,
      demoMode: next.demoMode,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSettings.userKey,
      set: {
        theme: next.theme,
        currency: next.currency,
        defaultTimeframe: next.defaultTimeframe,
        defaultMarket: next.defaultMarket,
        riskPreference: next.riskPreference,
        notifications: next.notifications,
        dataProvider: next.dataProvider,
        demoMode: next.demoMode,
        updatedAt: new Date(),
      },
    });
  return next;
}
