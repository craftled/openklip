"use client";

import { useEffect, useState } from "react";

/** Relative time label; empty on SSR/first paint, then updates after mount. */
export function useRelativeTime(
  ms: number,
  format: (ms: number) => string,
  refreshMs = 60_000
): string {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const update = () => setLabel(format(ms));
    update();
    const id = setInterval(update, refreshMs);
    return () => clearInterval(id);
  }, [format, ms, refreshMs]);

  return label;
}
