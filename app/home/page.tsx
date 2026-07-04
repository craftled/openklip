"use client";

import dynamic from "next/dynamic";

const SymbolsEffectPlayground = dynamic(
  () => import("@/components/symbols-effect-playground"),
  { ssr: false }
);

/** Interactive Symbols Effect playground at /home. */
export default function HomePage() {
  return <SymbolsEffectPlayground />;
}
