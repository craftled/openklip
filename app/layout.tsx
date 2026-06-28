import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_NO_FLASH_SCRIPT } from "../web/lib/theme-preferences";
import { inter } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenKlip",
  description: "Agent-native video editing : CLI edit loop, browser review.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={inter.variable} lang="en" suppressHydrationWarning>
      <head>
        <Script id="openklip-theme-no-flash" strategy="beforeInteractive">
          {THEME_NO_FLASH_SCRIPT}
        </Script>
      </head>
      <body className={inter.className}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
