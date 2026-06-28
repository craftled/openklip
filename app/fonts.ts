import { Inter, JetBrains_Mono } from "next/font/google";

/** Inter Variable: smooth 400-900 weights (Linear / oklch.fyi pattern). */
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  adjustFontFallback: true,
  fallback: [
    "SF Pro Display",
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "sans-serif",
  ],
});

/** Mono for timestamps, paths, and CLI snippets (Linear uses Berkeley Mono). */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-src",
  display: "swap",
  fallback: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
});
