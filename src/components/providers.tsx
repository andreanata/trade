"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { MarketId, Timeframe } from "@/types/market";
import { ApiRequestError } from "@/lib/api-client";

interface TerminalPrefs {
  market: MarketId | "ALL";
  timeframe: Timeframe;
  setMarket: (market: MarketId | "ALL") => void;
  setTimeframe: (timeframe: Timeframe) => void;
}

const TerminalContext = createContext<TerminalPrefs | null>(null);

export function useTerminal(): TerminalPrefs {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error("useTerminal must be used inside <Providers>");
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Keep fetched timeframes in memory so switching back is instant
            // and costs no provider request.
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            // Never re-request on mount if the cached value is still fresh —
            // this is what stops every component mount hitting the provider.
            refetchOnMount: false,
            refetchOnReconnect: false,
            // A 429 must not be retried on the client; the server already
            // applies backoff + cooldown.
            retry: (count, error) =>
              error instanceof ApiRequestError && (error.status === 429 || error.status === 503)
                ? false
                : count < 1,
          },
        },
      }),
  );
  const [market, setMarket] = useState<MarketId | "ALL">("ALL");
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");

  const value = useMemo(() => ({ market, timeframe, setMarket, setTimeframe }), [market, timeframe]);

  return (
    <QueryClientProvider client={client}>
      <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>
    </QueryClientProvider>
  );
}
