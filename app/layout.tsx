import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { geist, inter } from "./fonts";
import "./globals.css";

const noFlash = `(function(){try{var t=localStorage.getItem("openklip-theme")||"light";document.documentElement.classList.toggle("dark",t==="dark");}catch(e){}})();`;

export const metadata: Metadata = {
  title: "OpenKlip",
  description: "Edit video by editing text.",
  // Favicon is supplied by the app/icon.svg file convention (theme-adaptive,
  // black/white via an embedded prefers-color-scheme media query).
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`${inter.variable} ${geist.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <Script id="openklip-theme-no-flash" strategy="beforeInteractive">
          {noFlash}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
