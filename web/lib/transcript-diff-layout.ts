export type TranscriptDiffLayout = "inline" | "classic";

export const TRANSCRIPT_DIFF_LAYOUT_LABELS: Record<
  TranscriptDiffLayout,
  string
> = {
  inline: "Inline",
  classic: "Classic",
};

export const TRANSCRIPT_DIFF_LAYOUT_STORAGE_KEY =
  "openklip-transcript-diff-layout";

export function isTranscriptDiffLayout(
  value: string | null | undefined
): value is TranscriptDiffLayout {
  return value === "inline" || value === "classic";
}

export function readStoredTranscriptDiffLayout(): TranscriptDiffLayout {
  if (typeof window === "undefined") {
    return "inline";
  }
  try {
    const stored = localStorage.getItem(TRANSCRIPT_DIFF_LAYOUT_STORAGE_KEY);
    return isTranscriptDiffLayout(stored) ? stored : "inline";
  } catch {
    return "inline";
  }
}

export function storeTranscriptDiffLayout(layout: TranscriptDiffLayout): void {
  try {
    localStorage.setItem(TRANSCRIPT_DIFF_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // ignore quota / private mode
  }
}

/** Persist layout preference when the view manages its own layout state. */
export function commitTranscriptDiffLayoutChange(
  next: TranscriptDiffLayout,
  options: {
    controlledLayout?: TranscriptDiffLayout;
    onLayoutChange?: (layout: TranscriptDiffLayout) => void;
    setUncontrolledLayout: (layout: TranscriptDiffLayout) => void;
  }
): void {
  if (options.controlledLayout === undefined) {
    options.setUncontrolledLayout(next);
    storeTranscriptDiffLayout(next);
  }
  options.onLayoutChange?.(next);
}

/** Pierre Diffs options tuned for transcript review, not code review. */
export function transcriptDiffFileOptions(layout: TranscriptDiffLayout) {
  const shared = {
    disableFileHeader: true,
    lineDiffType: "word-alt" as const,
    overflow: "wrap" as const,
    theme: { dark: "pierre-dark", light: "pierre-light" } as const,
    themeType: "system" as const,
  };

  if (layout === "inline") {
    return {
      ...shared,
      diffIndicators: "none" as const,
      diffStyle: "unified" as const,
      disableBackground: false,
      disableLineNumbers: true,
      hunkSeparators: "simple" as const,
    };
  }

  return {
    ...shared,
    diffIndicators: "bars" as const,
    diffStyle: "unified" as const,
    disableBackground: false,
    disableLineNumbers: false,
    hunkSeparators: "line-info" as const,
  };
}

const TRANSCRIPT_DIFF_THEME_CSS = `
:host {
  --diffs-bg: var(--card);
  --diffs-light: var(--foreground);
  --diffs-dark: var(--foreground);
  --diffs-token-light: var(--foreground);
  --diffs-token-dark: var(--foreground);
  --diffs-deletion-color-override: var(--destructive);
  --diffs-addition-color-override: var(--primary);
  --diffs-bg-context: color-mix(in oklab, var(--card) 92%, var(--foreground));
  --diffs-bg-separator: color-mix(in oklab, var(--card) 88%, var(--foreground));
  --diffs-bg-deletion-emphasis-override: color-mix(in oklab, var(--destructive) 18%, transparent);
  --diffs-bg-addition-emphasis-override: color-mix(in oklab, var(--primary) 14%, transparent);
}
`;

const TRANSCRIPT_DIFF_FONT_WEIGHT_CSS = `
[data-column-content],
[data-column-number],
[data-separator-content],
[data-expand-button] {
  font-weight: 500;
}
`;

const TRANSCRIPT_DIFF_INLINE_CSS = `
[data-line-type="change-deletion"] [data-column-content] {
  color: var(--muted-foreground);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}
[data-line-type="change-addition"] [data-column-content] {
  color: var(--foreground);
}
[data-diff-span] {
  border-radius: 0.2rem;
  padding-inline: 0.1em;
}
[data-code] {
  padding-top: 0;
  padding-bottom: 0;
}
`;

export function transcriptDiffUnsafeCss(layout: TranscriptDiffLayout): string {
  const chunks = [TRANSCRIPT_DIFF_THEME_CSS, TRANSCRIPT_DIFF_FONT_WEIGHT_CSS];
  if (layout === "inline") {
    chunks.push(TRANSCRIPT_DIFF_INLINE_CSS);
  }
  return chunks.join("\n");
}
