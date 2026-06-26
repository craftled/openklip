import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { geist, inter } from "./fonts";
import "./globals.css";

const noFlash = `(function(){try{var t=localStorage.getItem("openklip-theme")||"light";document.documentElement.classList.toggle("dark",t==="dark");}catch(e){}})();`;

export const metadata: Metadata = {
  title: "OpenKlip",
  description: "Edit video by editing text.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%2310b981'/%3E%3C/svg%3E",
  },
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
