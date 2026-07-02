// Pure, DOM-free transcript phrase search for the editor UI. Wraps the SAME
// engine matcher the CLI phrase tools use (findPhraseRuns via grepTranscript /
// phraseSpan), so UI spans are identical to CLI spans by construction. The only
// addition is the word-index range the transcript panel needs for highlighting
// and select-as-span.

import type { Project } from "@engine/edl";
import { findPhraseRuns } from "@engine/phrase-match";

export type PhraseSearchMode = "cut" | "kept";

export interface PhraseSearchMatch {
  fromSec: number;
  ids: string[];
  range: readonly [number, number];
  text: string;
  toSec: number;
}

// Find every run matching the phrase. "kept" mode searches kept words only
// (the engine default); "cut" mode searches across deletions and keeps only
// runs that touch at least one deleted word, which is how cuts are found again
// for restore-by-search.
export function phraseSearchMatches(
  project: Pick<Project, "words">,
  phrase: string,
  options: { mode: PhraseSearchMode }
): PhraseSearchMatch[] {
  const cutMode = options.mode === "cut";
  const runs = findPhraseRuns(project as Project, phrase, {
    all: true,
    includeDeleted: cutMode,
  });
  const deletedIds = new Set(
    project.words.filter((w) => w.deleted).map((w) => w.id)
  );
  const indexById = new Map(project.words.map((w, i) => [w.id, i]));
  const matches: PhraseSearchMatch[] = [];
  for (const run of runs) {
    if (cutMode && !run.ids.some((id) => deletedIds.has(id))) {
      continue;
    }
    const indices = run.ids
      .map((id) => indexById.get(id))
      .filter((i): i is number => i !== undefined);
    if (indices.length === 0) {
      continue;
    }
    matches.push({
      fromSec: run.fromSec,
      ids: run.ids,
      range: [Math.min(...indices), Math.max(...indices)],
      text: run.text,
      toSec: run.toSec,
    });
  }
  return matches;
}
