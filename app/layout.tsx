import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { THEME_NO_FLASH_SCRIPT } from "../web/lib/theme-preferences";
import { inter } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenKlip",
  description: "Edit video by editing text.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={inter.variable} lang="en" suppressHydrationWarning>
      <head>
        <Script id="openklip-theme-no-flash" strategy="beforeInteractive">
          {THEME_NO_FLASH_SCRIPT}
        </Script>
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
