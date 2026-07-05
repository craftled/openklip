import type { Project } from "./edl.ts";
import { findPhraseRuns } from "./phrase-match.ts";

export const KINETIC_TEXT_TEMPLATES = new Set([
  "motion-highlight-pop",
  "motion-word-cascade",
  "motion-kinetic-build",
]);

const STAGGER_FRAMES_MAX = 30;
const STAGGER_FRAMES_MIN = 2;

/** Stagger delay (frames) spread across a phrase's kept words. */
export function phraseStaggerFrames(wordCount: number): number {
  if (wordCount <= 1) {
    return 0;
  }
  return Math.max(
    STAGGER_FRAMES_MIN,
    Math.min(STAGGER_FRAMES_MAX, Math.round(12 / wordCount))
  );
}

// Merge caller params with transcript-derived text for kinetic motion templates.
export function resolveGraphicPhraseParams(
  project: Project,
  template: string,
  spokenPhrase: string,
  params?: Record<string, string | number | boolean>,
  wordIds?: string[]
): Record<string, string | number | boolean> {
  const merged = { ...(params ?? {}) };
  const runs = findPhraseRuns(project, spokenPhrase, { all: false });
  if (merged.text === undefined && KINETIC_TEXT_TEMPLATES.has(template)) {
    if (runs.length > 0 && runs[0].text) {
      merged.text = runs[0].text;
    }
  }
  const count = wordIds?.length ?? runs[0]?.ids.length ?? 0;
  if (
    count > 1 &&
    merged.staggerFrames === undefined &&
    KINETIC_TEXT_TEMPLATES.has(template)
  ) {
    merged.staggerFrames = phraseStaggerFrames(count);
  }
  return merged;
}
