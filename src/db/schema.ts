import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * All rows are scoped by an anonymous browser session key (`user_key`).
 * The schema is auth-ready: swapping `user_key` for a real user id from an auth
 * provider is the only change required.
 */

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: serial("id").primaryKey(),
    userKey: text("user_key").notNull(),
    symbol: text("symbol").notNull(),
    market: text("market").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("watchlist_user_idx").on(table.userKey)],
);

export const portfolioPositions = pgTable(
  "portfolio_positions",
  {
    id: serial("id").primaryKey(),
    userKey: text("user_key").notNull(),
    symbol: text("symbol").notNull(),
    market: text("market").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    buyPrice: doublePrecision("buy_price").notNull(),
    buyDate: text("buy_date").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("portfolio_user_idx").on(table.userKey)],
);

export const alertRules = pgTable(
  "alert_rules",
  {
    id: serial("id").primaryKey(),
    userKey: text("user_key").notNull(),
    symbol: text("symbol").notNull(),
    market: text("market").notNull(),
    metric: text("metric").notNull(),
    threshold: doublePrecision("threshold").notNull().default(0),
    timeframe: text("timeframe").notNull().default("1D"),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("alerts_user_idx").on(table.userKey)],
);

export const userSettings = pgTable("user_settings", {
  userKey: text("user_key").primaryKey(),
  theme: text("theme").notNull().default("dark"),
  currency: text("currency").notNull().default("USD"),
  defaultTimeframe: text("default_timeframe").notNull().default("1D"),
  defaultMarket: text("default_market").notNull().default("US"),
  riskPreference: text("risk_preference").notNull().default("BALANCED"),
  notifications: boolean("notifications").notNull().default(true),
  dataProvider: text("data_provider").notNull().default("AUTO"),
  demoMode: boolean("demo_mode").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backtestRuns = pgTable(
  "backtest_runs",
  {
    id: serial("id").primaryKey(),
    userKey: text("user_key").notNull(),
    symbol: text("symbol").notNull(),
    market: text("market").notNull(),
    timeframe: text("timeframe").notNull(),
    strategy: text("strategy").notNull(),
    summary: jsonb("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("backtest_user_idx").on(table.userKey)],
);
