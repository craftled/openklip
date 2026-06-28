"use client";

import { useEffect, useState } from "react";
import {
  type ModShortcutParts,
  modShortcut,
  modShortcutNeutral,
  modShortcutParts,
  modShortcutPartsNeutral,
} from "@/lib/keyboard-shortcuts";

/** Platform-accurate shortcut label; neutral on SSR/first paint, then updates after mount. */
export function useModShortcut(key: string): string {
  const [label, setLabel] = useState(() => modShortcutNeutral(key));

  useEffect(() => {
    setLabel(modShortcut(key));
  }, [key]);

  return label;
}

/** Platform-accurate modifier/key parts for Kbd rendering. */
export function useModShortcutParts(key: string): ModShortcutParts {
  const [parts, setParts] = useState(() => modShortcutPartsNeutral(key));

  useEffect(() => {
    setParts(modShortcutParts(key));
  }, [key]);

  return parts;
}
