import type { MarketId, MarketStatus } from "@/types/market";

const TZ: Record<MarketId, string> = {
  US: "America/New_York",
  CRYPTO: "UTC",
  MEME: "UTC",
};

function localParts(timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const weekday = get("weekday");
  return { hour, minute, weekday, label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

export function getMarketStatus(market: MarketId): MarketStatus {
  const timezone = TZ[market];
  const { hour, minute, weekday, label } = localParts(timezone);
  const minutes = hour * 60 + minute;
  const isWeekend = weekday === "Sat" || weekday === "Sun";

  if (market === "CRYPTO" || market === "MEME") {
    return {
      market,
      isOpen: true,
      state: "OPEN",
      localTime: `${label} UTC`,
      timezone,
      nextEvent: market === "MEME" ? "On-chain DEX markets trade 24/7" : "Crypto trades 24/7",
    };
  }

  const preOpen = 4 * 60;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  const afterClose = 20 * 60;
  let state: MarketStatus["state"] = "CLOSED";
  if (!isWeekend) {
    if (minutes >= open && minutes < close) state = "OPEN";
    else if (minutes >= preOpen && minutes < open) state = "PRE_MARKET";
    else if (minutes >= close && minutes < afterClose) state = "AFTER_HOURS";
  }
  return {
    market,
    isOpen: state === "OPEN",
    state,
    localTime: `${label} ET`,
    timezone,
    nextEvent: isWeekend
      ? "Reopens Monday 09:30 ET"
      : state === "OPEN"
        ? "Closes 16:00 ET"
        : state === "PRE_MARKET"
          ? "Regular session 09:30 ET"
          : state === "AFTER_HOURS"
            ? "After-hours until 20:00 ET"
            : "Opens 09:30 ET",
  };
}
