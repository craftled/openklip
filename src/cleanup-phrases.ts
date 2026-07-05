// Brief- and project-level cleanup phrase lists ("Always cut" / "Never cut")
// merged into the filler candidate engine. Pure: no I/O.
import type { CleanupCandidate } from "./cleanup.ts";
import type { Project } from "./edl.ts";
import { findPhraseRuns, normalizeText } from "./phrase-match.ts";

export const DEFAULT_FILLER_PHRASES = [
  "you know",
  "sort of",
  "kind of",
  "i mean",
];

export interface CleanupPhraseConfig {
  alwaysCut: string[];
  neverCut: string[];
}

export interface CleanupPhrases {
  alwaysCut: string[];
  neverCut: string[];
}

export interface FillerPhraseOpts {
  extraPhrases: string[];
  extraTokens: string[];
  safePhrases: string[];
}

function splitPhraseList(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function dedupePhrases(phrases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const phrase of phrases) {
    const key = normalizeText(phrase);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(phrase);
  }
  return out;
}

/** Parse `Always cut:` / `Never cut:` lines from brief.md (case-insensitive). */
export function parseCleanupPhraseLists(text: string): CleanupPhrases {
  const alwaysCut: string[] = [];
  const neverCut: string[] = [];
  for (const line of text.split("\n")) {
    const alwaysMatch = line.match(/^\s*always cut:\s*(.+?)\.?\s*$/i);
    if (alwaysMatch) {
      alwaysCut.push(...splitPhraseList(alwaysMatch[1]));
      continue;
    }
    const neverMatch = line.match(/^\s*never cut:\s*(.+?)\.?\s*$/i);
    if (neverMatch) {
      neverCut.push(...splitPhraseList(neverMatch[1]));
    }
  }
  return {
    alwaysCut: dedupePhrases(alwaysCut),
    neverCut: dedupePhrases(neverCut),
  };
}

/** Merge brief lists with optional `project.cuts.cleanupPhrases` overrides. */
export function resolveCleanupPhrases(input: {
  briefText?: string;
  project: Project;
}): CleanupPhraseConfig {
  const fromBrief = input.briefText
    ? parseCleanupPhraseLists(input.briefText)
    : { alwaysCut: [], neverCut: [] };
  const fromProject = input.project.cuts?.cleanupPhrases ?? {
    alwaysCut: [],
    neverCut: [],
  };
  return {
    alwaysCut: dedupePhrases([
      ...fromBrief.alwaysCut,
      ...fromProject.alwaysCut,
    ]),
    neverCut: dedupePhrases([...fromBrief.neverCut, ...fromProject.neverCut]),
  };
}

/** Word ids covered by any never-cut phrase run (kept words only). */
export function neverCutWordIds(
  project: Project,
  neverCut: string[]
): Set<string> {
  const ids = new Set<string>();
  for (const phrase of neverCut) {
    for (const run of findPhraseRuns(project, phrase, { all: true })) {
      for (const id of run.ids) {
        ids.add(id);
      }
    }
  }
  return ids;
}

export function filterNeverCutCandidates(
  candidates: CleanupCandidate[],
  blockedIds: Set<string>
): CleanupCandidate[] {
  if (blockedIds.size === 0) {
    return candidates;
  }
  return candidates.filter(
    (c) => c.kind !== "filler" || !c.wordIds.some((id) => blockedIds.has(id))
  );
}

/** Map always-cut entries onto filler candidate scanning (safe multi-word + extra tokens). */
export function fillerPhraseOptsFromConfig(
  config: CleanupPhraseConfig
): FillerPhraseOpts {
  const extraTokens: string[] = [];
  const safePhrases: string[] = [];
  const phraseKeys = new Set(
    DEFAULT_FILLER_PHRASES.map((phrase) => normalizeText(phrase))
  );
  const extraPhrases: string[] = [];

  for (const raw of config.alwaysCut) {
    const norm = normalizeText(raw);
    if (!norm) {
      continue;
    }
    const words = norm.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      extraTokens.push(words[0]);
      continue;
    }
    safePhrases.push(raw);
    if (!phraseKeys.has(norm)) {
      extraPhrases.push(raw);
      phraseKeys.add(norm);
    }
  }

  return { extraTokens, extraPhrases, safePhrases };
}
