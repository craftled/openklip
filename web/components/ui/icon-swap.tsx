"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Contextual icon animation (better-ui principle 7): swap an icon on a state
// change with opacity + scale + blur instead of a hard toggle. The values are
// fixed by the design guideline — scale 0.25→1, opacity 0→1, blur 4px→0, and a
// spring with bounce 0 — so every icon swap across the app feels identical.
// Callers pass `activeKey` (the value that identifies the current icon) and the
// icon for that state as children; changing the key cross-fades old→new.
const HIDDEN = { filter: "blur(4px)", opacity: 0, scale: 0.25 } as const;
const SHOWN = { filter: "blur(0px)", opacity: 1, scale: 1 } as const;
const TRANSITION = { bounce: 0, duration: 0.3, type: "spring" } as const;

export function IconSwap({
  activeKey,
  children,
  className,
}: {
  activeKey: boolean | number | string | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const containerClass = cn(
    "relative inline-flex items-center justify-center",
    className
  );

  // Reduced-motion users get an instant swap: no transform, blur, or fade.
  if (reduceMotion) {
    return (
      <span className={containerClass} data-slot="icon-swap">
        {children}
      </span>
    );
  }

  return (
    <span className={containerClass} data-slot="icon-swap">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          animate={SHOWN}
          className="inline-flex items-center justify-center"
          exit={HIDDEN}
          initial={HIDDEN}
          key={String(activeKey)}
          transition={TRANSITION}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
