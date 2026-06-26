import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Set the theme class before first paint (no flash). shadcn convention: the
// `dark` class on <html>. Defaults to dark unless the user saved "light".
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static no-flash theme script */}
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
