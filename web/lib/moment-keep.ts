// Pure helpers for moment-search Keep / drag-to-restore (slice 3a).
// No engine imports: span math and drag payloads only touch word samples.

import {
  type PhraseSearchMatch,
  phraseSearchMatches,
} from "@/lib/phrase-search";

export const MOMENT_DRAG_MIME = "application/x-openklip-moment";

// Mirrors SAMPLE_RATE in src/edl.ts (not value-imported here).
const SAMPLE_RATE = 48_000;

export interface MomentSpanWord {
  deleted: boolean;
  endSample: number;
  id: string;
  startSample: number;
  text: string;
}

export interface MomentDragPayload {
  fromSec: number;
  toSec: number;
}

export interface MomentTextMatch extends PhraseSearchMatch {
  hasCutWords: boolean;
}

function wordOverlapsSpan(
  word: MomentSpanWord,
  fromSec: number,
  toSec: number
): boolean {
  const startSec = word.startSample / SAMPLE_RATE;
  const endSec = word.endSample / SAMPLE_RATE;
  return startSec < toSec && endSec > fromSec;
}

export function wordIdsInSpan(
  words: readonly MomentSpanWord[],
  fromSec: number,
  toSec: number
): string[] {
  return words
    .filter((w) => wordOverlapsSpan(w, fromSec, toSec))
    .map((w) => w.id);
}

export function deletedWordIdsInSpan(
  words: readonly MomentSpanWord[],
  fromSec: number,
  toSec: number
): string[] {
  return words
    .filter((w) => w.deleted && wordOverlapsSpan(w, fromSec, toSec))
    .map((w) => w.id);
}

function rangeKey(range: readonly [number, number]): string {
  return `${range[0]}-${range[1]}`;
}

function matchHasCutWords(
  match: PhraseSearchMatch,
  deletedIds: ReadonlySet<string>
): boolean {
  return match.ids.some((id) => deletedIds.has(id));
}

export function mergePhraseSearchMatchLists(
  kept: readonly PhraseSearchMatch[],
  cut: readonly PhraseSearchMatch[],
  words: readonly Pick<MomentSpanWord, "deleted" | "id">[],
  limit: number
): MomentTextMatch[] {
  const deletedIds = new Set(words.filter((w) => w.deleted).map((w) => w.id));
  const seen = new Set<string>();
  const merged: MomentTextMatch[] = [];

  for (const match of [...kept, ...cut]) {
    const key = rangeKey(match.range);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({
      ...match,
      hasCutWords: matchHasCutWords(match, deletedIds),
    });
  }

  merged.sort((a, b) => a.fromSec - b.fromSec || a.range[0] - b.range[0]);
  return merged.slice(0, limit);
}

export function mergeMomentTextMatches(
  project: { words: readonly MomentSpanWord[] },
  phrase: string,
  limit: number
): MomentTextMatch[] {
  const trimmed = phrase.trim();
  if (!trimmed) {
    return [];
  }
  const searchProject = { words: [...project.words] };
  const kept = phraseSearchMatches(searchProject, trimmed, { mode: "kept" });
  const cut = phraseSearchMatches(searchProject, trimmed, { mode: "cut" });
  return mergePhraseSearchMatchLists(kept, cut, project.words, limit);
}

export function encodeMomentDragPayload(payload: MomentDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeMomentDragPayload(raw: string): MomentDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("fromSec" in parsed) ||
      !("toSec" in parsed)
    ) {
      return null;
    }
    const { fromSec, toSec } = parsed as {
      fromSec: unknown;
      toSec: unknown;
    };
    if (
      typeof fromSec !== "number" ||
      typeof toSec !== "number" ||
      !Number.isFinite(fromSec) ||
      !Number.isFinite(toSec)
    ) {
      return null;
    }
    return { fromSec, toSec };
  } catch {
    return null;
  }
}

export function momentDragTypesInclude(
  types: DOMStringList | readonly string[]
): boolean {
  return Array.from(types).includes(MOMENT_DRAG_MIME);
}
