"use client";

import { useEffect, useState } from "react";
import { cssColorToHex } from "@/lib/color";

export function useThemeColorHex(cssVar: string, fallback = "#000000"): string {
  const [hex, setHex] = useState(fallback);

  useEffect(() => {
    const resolve = () => {
      setHex(cssColorToHex(`var(${cssVar})`, fallback));
    };
    resolve();

    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [cssVar, fallback]);

  return hex;
}
