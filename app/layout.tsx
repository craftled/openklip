import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isMarketingSite } from "@/lib/site-mode";
import { cn } from "@/lib/utils";
import { THEME_NO_FLASH_SCRIPT } from "../web/lib/theme-preferences";
import { geistMono } from "./fonts";
import "./globals.css";

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-sans",
});

const marketing = isMarketingSite();

export const metadata: Metadata = {
  metadataBase: marketing ? new URL("https://openklip.com") : undefined,
  title: marketing
    ? {
        default: "OpenKlip | Agent-native video toolchain",
        template: "%s | OpenKlip",
      }
    : {
        default: "OpenKlip",
        template: "%s | OpenKlip",
      },
  description: marketing
    ? "Local-first video editing for agents and humans. CLI edit loop, browser review, plain files on disk."
    : "Agent-native video editing : CLI edit loop, browser review.",
  openGraph: marketing
    ? {
        title: "OpenKlip",
        description:
          "Local-first video editing for agents and humans. CLI edit loop, browser review, plain files on disk.",
        url: "https://openklip.com",
        siteName: "OpenKlip",
        type: "website",
      }
    : undefined,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={cn(
        "antialiased",
        geistMono.variable,
        "font-sans",
        inter.variable
      )}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <Script id="openklip-theme-no-flash" strategy="beforeInteractive">
          {THEME_NO_FLASH_SCRIPT}
        </Script>
      </head>
      <body className="flex min-h-screen flex-col">
        <RootProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </RootProvider>
      </body>
    </html>
  );
}
