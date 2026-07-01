"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export const CHAT_WIDTH_MIN = 340;
export const CHAT_WIDTH_MAX = 760;
export const CHAT_WIDTH_DEFAULT = 480;
const STORAGE_KEY = "openklip_chat_width";
const KEYBOARD_STEP = 16;

const clampWidth = (px: number): number =>
  Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, Math.round(px)));

/** Width persisted from a prior session, or the default. SSR-safe (returns the
 *  default on the server; read it in an effect after mount to avoid a mismatch). */
export function readStoredChatWidth(): number {
  if (typeof window === "undefined") {
    return CHAT_WIDTH_DEFAULT;
  }
  const raw = Number(window.localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(raw) && raw >= CHAT_WIDTH_MIN && raw <= CHAT_WIDTH_MAX
    ? raw
    : CHAT_WIDTH_DEFAULT;
}

function persist(px: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clampWidth(px)));
  } catch {
    // private mode / quota : width just won't persist
  }
}

/**
 * Drag handle on the left edge of the right chat sidebar. Sits inside the
 * Sidebar panel (so it slides away with it on collapse) and reports the new
 * width as the user drags. Width = viewport minus pointer X, since the panel is
 * pinned to the right. rAF-throttled to one update per frame.
 */
export function ChatResizeHandle({
  rightOffset = 0,
  width,
  onResize,
}: {
  onResize: (px: number) => void;
  rightOffset?: number;
  width: number;
}) {
  const lastRef = useRef(width);
  const rafRef = useRef(0);

  useEffect(() => {
    lastRef.current = width;
  }, [width]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const move = (ev: PointerEvent) => {
        lastRef.current = clampWidth(
          window.innerWidth - rightOffset - ev.clientX
        );
        if (rafRef.current) {
          return;
        }
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          onResize(lastRef.current);
        });
      };
      const up = () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        onResize(lastRef.current);
        persist(lastRef.current);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [onResize, rightOffset]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
        return;
      }
      e.preventDefault();
      // ArrowLeft widens (panel grows toward the center), ArrowRight narrows.
      const next = clampWidth(
        width + (e.key === "ArrowLeft" ? KEYBOARD_STEP : -KEYBOARD_STEP)
      );
      onResize(next);
      persist(next);
    },
    [width, onResize]
  );

  return (
    <button
      aria-label={`Resize chat panel (${Math.round(width)}px)`}
      className={cn(
        "absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize touch-none",
        "bg-transparent transition-colors hover:bg-foreground/15 active:bg-foreground/25"
      )}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      type="button"
    />
  );
}
