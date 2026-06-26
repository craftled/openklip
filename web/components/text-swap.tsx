"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  TEXT_SWAP_MS,
  type TextSwapPhase,
  textSwapClasses,
  textSwapInitialPhase,
  textSwapNeedsChange,
  textSwapPhaseAfterEnterStart,
} from "../../src/textSwap.ts";

export function TextSwap({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(text);
  const [phase, setPhase] = useState<TextSwapPhase>(textSwapInitialPhase());
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase(textSwapPhaseAfterEnterStart()));
      });
      return;
    }
    if (!textSwapNeedsChange(display, text)) {
      return;
    }
    setPhase("exit");
    const timer = window.setTimeout(() => {
      setDisplay(text);
      setPhase(textSwapInitialPhase());
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase(textSwapPhaseAfterEnterStart()));
      });
    }, TEXT_SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [display, text]);

  return (
    <span className={cn(textSwapClasses(phase).join(" "), className)}>
      {display}
    </span>
  );
}
