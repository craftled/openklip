import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { THEME_NO_FLASH_SCRIPT } from "../web/lib/theme-preferences";
import { geistMono } from "./fonts";
import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "OpenKlip",
  description: "Agent-native video editing : CLI edit loop, browser review.",
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
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
