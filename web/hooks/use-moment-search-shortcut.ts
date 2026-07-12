"use client";

import { useEffect } from "react";
import { isTypingTarget } from "@/lib/keyboard-shortcuts";

// Mod+Shift+F opens the Search (moments) sidebar panel. Requiring shiftKey
// keeps this distinct from the existing Mod+F transcript search dialog
// (web/hooks/use-transcript-search.tsx), which gates on isModKeyOnly and
// therefore explicitly requires shiftKey to be UNheld.
export function useMomentSearchShortcut(onOpenSearch: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!(mod && event.shiftKey) || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() !== "f") {
        return;
      }
      event.preventDefault();
      onOpenSearch();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenSearch]);
}
