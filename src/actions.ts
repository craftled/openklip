// Pure edit primitives over a Project (the EDL). No file IO, no ffmpeg; every
// function here mutates the passed Project and returns it (or a small result),
// so the CLI and the GUI operate on the SAME project.json shape (parity). These
// are the operations an external coding agent drives from the terminal.
import {
  type Broll,
  type Project,
  SAMPLE_RATE,
  type Still,
  survivingRanges,
  type Title,
  type Zoom,
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
    if (project.words[i].deleted) {
      continue;
    }
    // Walk forward accumulating non-empty normalized tokens until they equal
    // the target token sequence. Tokens that normalize to "" (pure punctuation)
    // are skipped so they don't break an otherwise-contiguous phrase.
    const matchedIdx: number[] = [];
    let cursor = 0; // index into targetTokens
    let j = i;
    while (j < project.words.length && cursor < targetTokens.length) {
      if (project.words[j].deleted) {
        break;
      }
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

// Cut every contiguous run matching the phrase (kept words only). Returns how
// many runs were cut and the combined word ids.
export function cutAllByText(
  project: Project,
  phrase: string
): { matches: number; ids: string[] } {
  const ids: string[] = [];
  let matches = 0;
  while (true) {
    const result = cutByText(project, phrase);
    if (!result.matched) {
      break;
    }
    ids.push(...result.ids);
    matches++;
  }
  return { matches, ids };
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
  if ((asset.kind ?? "broll") !== "broll") {
    throw new Error(
      `asset "${assetId}" is ${asset.kind}; b-roll overlays require kind broll`
    );
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

function findBroll(project: Project, id: string): Broll {
  const item = project.broll.find((b) => b.id === id);
  if (!item) {
    throw new Error(`unknown b-roll clip "${id}"`);
  }
  return item;
}

// Patch an existing b-roll clip. Omitted fields are unchanged.
export function updateBroll(
  project: Project,
  id: string,
  patch: {
    assetId?: string;
    fromSec?: number;
    toSec?: number;
    srcInSec?: number;
  }
): Broll {
  const item = findBroll(project, id);
  const assetId = patch.assetId ?? item.assetId;
  const fromSec = patch.fromSec ?? item.startSample / SAMPLE_RATE;
  const toSec = patch.toSec ?? item.endSample / SAMPLE_RATE;
  const srcInSec = patch.srcInSec ?? item.srcInSample / SAMPLE_RATE;
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
  if ((asset.kind ?? "broll") !== "broll") {
    throw new Error(
      `asset "${assetId}" is ${asset.kind}; b-roll overlays require kind broll`
    );
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
  item.assetId = assetId;
  item.startSample = Math.round(fromSec * SAMPLE_RATE);
  item.endSample = Math.round(endSec * SAMPLE_RATE);
  item.srcInSample = Math.round(srcInSec * SAMPLE_RATE);
  return item;
}

// Add a still-image overlay with a Ken Burns push-in over a span of the source
// timeline. Requires a registered asset of kind "still".
export function addStill(
  project: Project,
  input: {
    assetId: string;
    fromSec: number;
    toSec: number;
    scale?: number;
    focusX?: number;
    focusY?: number;
  }
): Still {
  const {
    assetId,
    fromSec,
    toSec,
    scale = 1.2,
    focusX = 0.5,
    focusY = 0.5,
  } = input;
  if (![fromSec, toSec, scale, focusX, focusY].every(Number.isFinite)) {
    throw new Error("still timing/look values must be finite numbers");
  }
  if (fromSec < 0 || toSec < 0) {
    throw new Error("still timing values must be non-negative");
  }
  if (scale < 1 || scale > 3) {
    throw new Error("still scale must be between 1 and 3");
  }
  if (focusX < 0 || focusX > 1 || focusY < 0 || focusY > 1) {
    throw new Error("still focus must be between 0 and 1");
  }
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) {
    const known = project.assets.map((a) => a.id).join(", ") || "(none)";
    throw new Error(`unknown asset "${assetId}". Registered assets: ${known}`);
  }
  if (asset.kind !== "still") {
    throw new Error(
      `asset "${assetId}" is ${asset.kind}; still overlays require kind still`
    );
  }
  if (toSec <= fromSec) {
    throw new Error(
      `still span is empty: toSec (${toSec}) must be greater than fromSec (${fromSec})`
    );
  }
  const projectDurationSec = project.durationSamples / SAMPLE_RATE;
  if (fromSec >= projectDurationSec) {
    throw new Error("still span starts after the project ends");
  }
  const endSec = Math.min(toSec, projectDurationSec);
  const item: Still = {
    id: `s${Date.now()}`,
    assetId,
    startSample: Math.round(fromSec * SAMPLE_RATE),
    endSample: Math.round(endSec * SAMPLE_RATE),
    scale,
    focusX,
    focusY,
  };
  if (!project.stills) {
    project.stills = [];
  }
  project.stills.push(item);
  return item;
}

// Remove a still overlay by id. Returns whether one was removed.
export function removeStill(project: Project, id: string): boolean {
  const stills = project.stills ?? [];
  const before = stills.length;
  project.stills = stills.filter((s) => s.id !== id);
  return project.stills.length < before;
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

function findTitle(project: Project, id: string): Title {
  const item = (project.titles ?? []).find((t) => t.id === id);
  if (!item) {
    throw new Error(`unknown title "${id}"`);
  }
  return item;
}

// Patch an existing title card. Omitted fields are unchanged.
export function updateTitle(
  project: Project,
  id: string,
  patch: {
    text?: string;
    position?: Title["position"];
    fromSec?: number;
    toSec?: number;
  }
): Title {
  const item = findTitle(project, id);
  const text = patch.text === undefined ? item.text : patch.text.trim();
  if (!text) {
    throw new Error("title text must be non-empty");
  }
  const position = patch.position ?? item.position;
  const fromSec = patch.fromSec ?? item.startSample / SAMPLE_RATE;
  const toSec = patch.toSec ?? item.endSample / SAMPLE_RATE;
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
  item.text = text;
  item.position = position;
  item.startSample = Math.round(fromSec * SAMPLE_RATE);
  item.endSample = Math.round(endSec * SAMPLE_RATE);
  return item;
}

// Toggle burned captions on/off for the export.
export function setCaptions(project: Project, enabled: boolean): Project {
  project.captions = { ...project.captions, enabled };
  return project;
}

// Set how many words appear per caption line (1–12).
export function setCaptionMaxWords(
  project: Project,
  maxWords: number
): Project {
  const mw = Math.max(1, Math.min(12, Math.round(maxWords)));
  project.captions = { ...project.captions, maxWords: mw };
  return project;
}

// Set symmetric padding around kept word ranges (0–500 ms).
export function setPadMs(project: Project, padMs: number): Project {
  project.padMs = Math.max(0, Math.min(500, Math.round(padMs)));
  return project;
}

// Toggle cinematic look flags (vignette).
export function setLook(
  project: Project,
  input: { vignette?: boolean }
): Project {
  if (typeof input.vignette === "boolean") {
    project.look = { ...project.look, vignette: input.vignette };
  }
  return project;
}

// Add a push-in zoom over a span of the source timeline.
export function addZoom(
  project: Project,
  input: {
    fromSec: number;
    toSec: number;
    scale?: number;
    rampSec?: number;
  }
): Zoom {
  const { fromSec, toSec, scale = 1.15, rampSec = 0.6 } = input;
  if (![fromSec, toSec, scale, rampSec].every(Number.isFinite)) {
    throw new Error("zoom timing values must be finite numbers");
  }
  if (fromSec < 0 || toSec < 0) {
    throw new Error("zoom timing values must be non-negative");
  }
  if (scale < 1 || scale > 3) {
    throw new Error("zoom scale must be between 1 and 3");
  }
  if (rampSec < 0 || rampSec > 5) {
    throw new Error("zoom rampSec must be between 0 and 5");
  }
  if (toSec <= fromSec) {
    throw new Error(
      `zoom span is empty: toSec (${toSec}) must be greater than fromSec (${fromSec})`
    );
  }
  const projectDurationSec = project.durationSamples / SAMPLE_RATE;
  if (fromSec >= projectDurationSec) {
    throw new Error("zoom span starts after the project ends");
  }
  const endSec = Math.min(toSec, projectDurationSec);
  if (endSec <= fromSec) {
    throw new Error("zoom span is empty after clamping to project duration");
  }
  const item: Zoom = {
    id: `z${Date.now()}`,
    startSample: Math.round(fromSec * SAMPLE_RATE),
    endSample: Math.round(endSec * SAMPLE_RATE),
    scale,
    rampSec,
  };
  if (!project.zooms) {
    project.zooms = [];
  }
  project.zooms.push(item);
  return item;
}

// Remove a zoom by id. Returns whether one was removed.
export function removeZoom(project: Project, id: string): boolean {
  const zooms = project.zooms ?? [];
  const before = zooms.length;
  project.zooms = zooms.filter((z) => z.id !== id);
  return project.zooms.length < before;
}

function findZoom(project: Project, id: string): Zoom {
  const item = (project.zooms ?? []).find((z) => z.id === id);
  if (!item) {
    throw new Error(`unknown zoom "${id}"`);
  }
  return item;
}

// Patch an existing push-in zoom. Omitted fields are unchanged.
export function updateZoom(
  project: Project,
  id: string,
  patch: {
    scale?: number;
    rampSec?: number;
    fromSec?: number;
    toSec?: number;
  }
): Zoom {
  const item = findZoom(project, id);
  const scale = patch.scale ?? item.scale;
  const rampSec = patch.rampSec ?? item.rampSec;
  const fromSec = patch.fromSec ?? item.startSample / SAMPLE_RATE;
  const toSec = patch.toSec ?? item.endSample / SAMPLE_RATE;
  if (![fromSec, toSec, scale, rampSec].every(Number.isFinite)) {
    throw new Error("zoom timing values must be finite numbers");
  }
  if (fromSec < 0 || toSec < 0) {
    throw new Error("zoom timing values must be non-negative");
  }
  if (scale < 1 || scale > 3) {
    throw new Error("zoom scale must be between 1 and 3");
  }
  if (rampSec < 0 || rampSec > 5) {
    throw new Error("zoom rampSec must be between 0 and 5");
  }
  if (toSec <= fromSec) {
    throw new Error(
      `zoom span is empty: toSec (${toSec}) must be greater than fromSec (${fromSec})`
    );
  }
  const projectDurationSec = project.durationSamples / SAMPLE_RATE;
  if (fromSec >= projectDurationSec) {
    throw new Error("zoom span starts after the project ends");
  }
  const endSec = Math.min(toSec, projectDurationSec);
  if (endSec <= fromSec) {
    throw new Error("zoom span is empty after clamping to project duration");
  }
  item.scale = scale;
  item.rampSec = rampSec;
  item.startSample = Math.round(fromSec * SAMPLE_RATE);
  item.endSample = Math.round(endSec * SAMPLE_RATE);
  return item;
}

// Move an item to a new index within its track, preserving the others' order.
// Overlay paint order is array order (later items paint on top), so this is how
// a dnd-kit track — or the CLI — restacks b-roll covers, titles, or zooms.
function reorderById<T extends { id: string }>(
  list: T[],
  id: string,
  toIndex: number
): T[] {
  const from = list.findIndex((x) => x.id === id);
  if (from === -1) {
    throw new Error(`unknown id "${id}"`);
  }
  const next = list.slice();
  const [item] = next.splice(from, 1);
  const clamped = Math.max(0, Math.min(next.length, Math.trunc(toIndex)));
  next.splice(clamped, 0, item);
  return next;
}

export function reorderBroll(
  project: Project,
  id: string,
  toIndex: number
): Broll[] {
  project.broll = reorderById(project.broll, id, toIndex);
  return project.broll;
}

export function reorderTitle(
  project: Project,
  id: string,
  toIndex: number
): Title[] {
  project.titles = reorderById(project.titles ?? [], id, toIndex);
  return project.titles;
}

export function reorderZoom(
  project: Project,
  id: string,
  toIndex: number
): Zoom[] {
  project.zooms = reorderById(project.zooms ?? [], id, toIndex);
  return project.zooms;
}

export interface ProjectSummary {
  assetCount: number;
  brollCount: number;
  cuts: number;
  deleted: number;
  kept: number;
  keptDurationSec: number;
  titleCount: number;
  words: number;
  zoomCount: number;
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
    titleCount: project.titles?.length ?? 0,
    zoomCount: project.zooms?.length ?? 0,
    assetCount: project.assets.length,
    keptDurationSec,
  };
}
