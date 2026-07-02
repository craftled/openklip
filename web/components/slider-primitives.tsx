"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

// M6: shared by audio-controls.tsx and music-controls.tsx, which both hand-
// duplicated these exact helpers/components. filter-controls.tsx and
// app.tsx have their own independent copies of the same shapes (SLIDER,
// firstSliderValue) and are intentionally left alone here - they predate this
// extraction and aren't part of the audio/music config-panel family this
// module serves.

export function firstSliderValue(value: number | readonly number[]): number {
  return typeof value === "number" ? value : value[0];
}

export function clampNumber(
  raw: string,
  min: number,
  max: number
): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.max(min, Math.min(max, n));
}

export const THIN_SLIDER =
  "[&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-range]]:bg-foreground/35";

// Number input that keeps keystrokes local and persists only on blur or Enter
// (the filter-controls onValueChange/onValueCommitted split, applied to typed
// input). Persisting per keystroke would enqueue one save + history entry per
// character.
export function CommitNumberInput({
  disabled = false,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  disabled?: boolean;
  max?: number;
  min: number;
  onCommit: (n: number) => void;
  step: number;
  value: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) {
      return;
    }
    const n = clampNumber(draft, min, max ?? Number.MAX_SAFE_INTEGER);
    setDraft(null);
    if (n !== null && n !== value) {
      onCommit(n);
    }
  };
  return (
    <Input
      disabled={disabled}
      max={max}
      min={min}
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
        }
      }}
      step={step}
      type="number"
      value={draft ?? value}
    />
  );
}
