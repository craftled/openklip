"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export function clampNumber(
  raw: string,
  min: number,
  max: number
): number | null {
  const normalized = raw.trim().replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.max(min, Math.min(max, n));
}

/** Always dot-decimal, independent of browser locale. */
export function formatDotDecimal(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 10,
    minimumFractionDigits: 0,
    useGrouping: false,
  });
}

// Number input that keeps keystrokes local and persists only on blur or Enter
// (the filter-controls onValueChange/onValueCommitted split, applied to typed
// input). Persisting per keystroke would enqueue one save + history entry per
// character.
export function CommitNumberInput({
  className,
  disabled = false,
  max,
  min,
  onCommit,
  step: _step,
  value,
}: {
  className?: string;
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
      className={className}
      disabled={disabled}
      inputMode="decimal"
      lang="en-US"
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
        }
      }}
      type="text"
      value={draft ?? formatDotDecimal(value)}
    />
  );
}
