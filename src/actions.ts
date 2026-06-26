// Pure edit primitives over a Project (the EDL). No file IO, no ffmpeg; every
// function here mutates the passed Project and returns it (or a small result),
// so the CLI and the GUI operate on the SAME project.json shape (parity). These
// are the operations an external coding agent drives from the terminal.
import {
  type Broll,
  type Project,
  SAMPLE_RATE,
  survivingRanges,
  type Title,
} from "./edl.ts";

// Normalize text for phrase matching: lowercase, strip anything that isn't a
// letter/number/space, collapse whitespace. Used by cutByText so "Hello, world!"
// matches the words ["Hello", "world"].
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Mark words (by id) deleted (or, with deleted=false, restored).
export function cutWords(
  project: Project,
  ids: string[],
  deleted = true
): Project {
  const set = new Set(ids);
  for (const w of project.words) {
    if (set.has(w.id)) {
      w.deleted = deleted;
    }
  }
  return project;
}

// Find the first contiguous run of words whose concatenated normalized text
// matches the normalized phrase, and mark that run deleted. Returns whether a
// match was found and which word ids were cut.
export function cutByText(
  project: Project,
  phrase: string
): { matched: boolean; ids: string[] } {
  const target = normalizeText(phrase);
  if (!target) {
    return { matched: false, ids: [] };
  }

  const tokens = project.words.map((w) => normalizeText(w.text));
  const targetTokens = target.split(" ");

  for (let i = 0; i < project.words.length; i++) {
    // Walk forward accumulating non-empty normalized tokens until they equal
    // the target token sequence. Tokens that normalize to "" (pure punctuation)
    // are skipped so they don't break an otherwise-contiguous phrase.
    const matchedIdx: number[] = [];
    let cursor = 0; // index into targetTokens
    let j = i;
    while (j < project.words.length && cursor < targetTokens.length) {
      const tok = tokens[j];
      if (tok === "") {
        matchedIdx.push(j);
        j++;
        continue;
      }
      if (tok !== targetTokens[cursor]) {
        break;
      }
      matchedIdx.push(j);
      cursor++;
      j++;
    }
    if (cursor === targetTokens.length) {
      // Trim trailing empty-token words from the run (they belong to the gap).
      while (
        matchedIdx.length > 0 &&
        tokens[matchedIdx[matchedIdx.length - 1]] === ""
      ) {
        matchedIdx.pop();
      }
      const ids = matchedIdx.map((k) => project.words[k].id);
      cutWords(project, ids, true);
      return { matched: true, ids };
    }
  }
  return { matched: false, ids: [] };
}

// Restore every word (clear all cuts).
export function restoreAll(project: Project): Project {
  for (const w of project.words) {
    w.deleted = false;
  }
  return project;
}

// Add a b-roll cover clip over a span of the source timeline. Validates the
// asset exists; converts seconds to samples on the canonical 48 kHz grid.
export function addBroll(
  project: Project,
  input: { assetId: string; fromSec: number; toSec: number; srcInSec?: number }
): Broll {
  const { assetId, fromSec, toSec, srcInSec = 0 } = input;
  if (![fromSec, toSec, srcInSec].every(Number.isFinite)) {
    throw new Error("b-roll timing values must be finite numbers");
  }
  if (fromSec < 0 || toSec < 0 || srcInSec < 0) {
    throw new Error("b-roll timing values must be non-negative");
  }
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) {
    const known = project.assets.map((a) => a.id).join(", ") || "(none)";
    throw new Error(`unknown asset "${assetId}". Registered assets: ${known}`);
  }
  if (toSec <= fromSec) {
    throw new Error(
      `b-roll span is empty: toSec (${toSec}) must be greater than fromSec (${fromSec})`
    );
  }
  const projectDurationSec = project.durationSamples / SAMPLE_RATE;
  const assetDurationSec = asset.durationSamples / SAMPLE_RATE;
  if (fromSec >= projectDurationSec) {
    throw new Error("b-roll span starts after the project ends");
  }
  if (srcInSec >= assetDurationSec) {
    throw new Error("b-roll source in-point starts after the asset ends");
  }
  const endSec = Math.min(
    toSec,
    projectDurationSec,
    fromSec + (assetDurationSec - srcInSec)
  );
  if (endSec <= fromSec) {
    throw new Error("b-roll span is empty after clamping to media duration");
  }
  const item: Broll = {
    id: `br${Date.now()}`,
    assetId,
    startSample: Math.round(fromSec * SAMPLE_RATE),
    endSample: Math.round(endSec * SAMPLE_RATE),
    srcInSample: Math.round(srcInSec * SAMPLE_RATE),
  };
  project.broll.push(item);
  return item;
}

// Remove a b-roll clip by id. Returns whether one was removed.
export function removeBroll(project: Project, id: string): boolean {
  const before = project.broll.length;
  project.broll = project.broll.filter((b) => b.id !== id);
  return project.broll.length < before;
}

// Add a title card over a span of the source timeline. Converts seconds to
// samples on the canonical 48 kHz grid; clamps end to project duration.
export function addTitle(
  project: Project,
  input: {
    fromSec: number;
    toSec: number;
    text: string;
    position?: Title["position"];
  }
): Title {
  const { fromSec, toSec, text, position = "lower" } = input;
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("title text must be non-empty");
  }
  if (![fromSec, toSec].every(Number.isFinite)) {
    throw new Error("title timing values must be finite numbers");
  }
  if (fromSec < 0 || toSec < 0) {
    throw new Error("title timing values must be non-negative");
  }
  if (toSec <= fromSec) {
    throw new Error(
      `title span is empty: toSec (${toSec}) must be greater than fromSec (${fromSec})`
    );
  }
  const projectDurationSec = project.durationSamples / SAMPLE_RATE;
  if (fromSec >= projectDurationSec) {
    throw new Error("title span starts after the project ends");
  }
  const endSec = Math.min(toSec, projectDurationSec);
  if (endSec <= fromSec) {
    throw new Error("title span is empty after clamping to project duration");
  }
  const item: Title = {
    id: `t${Date.now()}`,
    text: trimmed,
    startSample: Math.round(fromSec * SAMPLE_RATE),
    endSample: Math.round(endSec * SAMPLE_RATE),
    position,
  };
  if (!project.titles) {
    project.titles = [];
  }
  project.titles.push(item);
  return item;
}

// Remove a title card by id. Returns whether one was removed.
export function removeTitle(project: Project, id: string): boolean {
  const titles = project.titles ?? [];
  const before = titles.length;
  project.titles = titles.filter((t) => t.id !== id);
  return project.titles.length < before;
}

// Toggle burned captions on/off for the export.
export function setCaptions(project: Project, enabled: boolean): Project {
  project.captions = { ...project.captions, enabled };
  return project;
}

export interface ProjectSummary {
  brollCount: number;
  cuts: number;
  deleted: number;
  kept: number;
  keptDurationSec: number;
  words: number;
}

// A quick health read of the edit: word counts, number of surviving ranges, and
// the kept duration in seconds (what the exported cut will run to).
export function summarize(project: Project): ProjectSummary {
  const deleted = project.words.filter((w) => w.deleted).length;
  const ranges = survivingRanges(project);
  const keptDurationSec = ranges.reduce(
    (a, r) => a + (r.endSec - r.startSec),
    0
  );
  return {
    words: project.words.length,
    deleted,
    kept: project.words.length - deleted,
    cuts: ranges.length,
    brollCount: project.broll.length,
    keptDurationSec,
  };
}
