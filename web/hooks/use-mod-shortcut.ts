"use client";

import { useEffect, useState } from "react";
import { modShortcut, modShortcutNeutral } from "@/lib/keyboard-shortcuts";

/** Platform-accurate shortcut label; neutral on SSR/first paint, then updates after mount. */
export function useModShortcut(key: string): string {
  const [label, setLabel] = useState(() => modShortcutNeutral(key));

  useEffect(() => {
    setLabel(modShortcut(key));
  }, [key]);

  return label;
}
