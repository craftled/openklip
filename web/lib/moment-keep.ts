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

// Independent web-side reimplementation of the same kept+cut merge as
// src/cli-query.ts's grepMomentTextMatches (engine-side, unbounded, CLI/MCP
// only) - see that function's header for exactly what's allowed to differ
// (this one truncates to `limit` and has a range[0] tie-break the engine
// side doesn't need) versus what must stay in sync (which matches survive,
// dedupe/kept-vs-cut semantics). Not shared code because the engine side
// must not import web code, and this side must not import node:fs.
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

// No real drag in this app can ever produce a span wider than a single
// project's duration (every producer - onMomentCardDragStart, the Keep
// button - sources fromSec/toSec from a real clusterMoments/search result).
// This is a generous, project-duration-agnostic sanity ceiling on a pure
// decoder that has no access to the actual project: a malformed or
// adversarially-crafted payload with a huge span would otherwise overlap
// (and restore) essentially every word in the project instead of one
// moment. 24h comfortably exceeds any real project this app edits.
const MAX_MOMENT_DRAG_SPAN_SEC = 24 * 60 * 60;

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
      !Number.isFinite(toSec) ||
      fromSec < 0 ||
      toSec <= fromSec ||
      toSec - fromSec > MAX_MOMENT_DRAG_SPAN_SEC
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
