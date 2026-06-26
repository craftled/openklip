"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { parseHeroLines } from "../../src/titles.ts";
import { TextSwap } from "./text-swap.tsx";

const FADE_MS = 400;

interface HeroTitle {
  id: string;
  text: string;
}

export function HeroTitleOverlay({
  title,
}: {
  title: HeroTitle | null | undefined;
}) {
  const [mounted, setMounted] = useState(Boolean(title));
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [shown, setShown] = useState<HeroTitle | null>(title ?? null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (title) {
      setMounted(true);
      setExiting(false);
      setShown(title);
      requestAnimationFrame(() => setVisible(true));
      return;
    }

    if (!mounted) {
      return;
    }

    setExiting(true);
    setVisible(false);
    timerRef.current = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
      setShown(null);
    }, FADE_MS);
  }, [mounted, title]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    },
    []
  );

  if (!(mounted && shown)) {
    return null;
  }

  const { headline, subtitle } = parseHeroLines(shown.text);
  if (!headline) {
    return null;
  }

  return (
    <>
      <div
        aria-hidden
        className={cn(
          "hero-bg-fade pointer-events-none absolute inset-0 z-[3]",
          visible && !exiting && "is-visible"
        )}
      />
      <div className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center justify-center px-[8%] text-center text-white">
        <TextSwap
          className="font-serif text-[clamp(28px,5.5vw,64px)] leading-tight tracking-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]"
          text={headline}
        />
        {subtitle ? (
          <TextSwap
            className="mt-3 max-w-[90%] font-serif text-[clamp(14px,2.2vw,26px)] text-white/90 leading-snug drop-shadow-[0_2px_16px_rgba(0,0,0,0.4)]"
            text={subtitle}
          />
        ) : null}
      </div>
    </>
  );
}
