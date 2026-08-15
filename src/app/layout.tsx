import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MarketAI — AI Market Scanner",
    template: "%s · MarketAI",
  },
  description:
    "AI-powered market scanner for US stocks, cryptocurrency and meme coins. Momentum scanning, early breakout detection, contract security checks, technical scoring and risk analysis.",
  keywords: ["market scanner", "US stocks", "crypto", "meme coins", "honeypot check", "technical analysis", "breakout", "AI score"],
  applicationName: "MarketAI",
  openGraph: {
    title: "MarketAI — AI Market Scanner",
    description:
      "AI-powered market scanner for US stocks, cryptocurrency and meme coins.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#04060d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
