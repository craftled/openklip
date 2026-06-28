"use client";

import { useEffect } from "react";
import { isModKeyOnly, isTypingTarget } from "@/lib/keyboard-shortcuts";

export function useEditorSidebarShortcuts({
  onToggleAgent,
  onToggleInspector,
}: {
  onToggleAgent: () => void;
  onToggleInspector: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || !isModKeyOnly(event)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        onToggleAgent();
        return;
      }
      if (key === "i") {
        event.preventDefault();
        onToggleInspector();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onToggleAgent, onToggleInspector]);
}
