// Pure edit primitives over a Project (the EDL). No file IO, no ffmpeg; every
// function here mutates the passed Project and returns it (or a small result),
// so the CLI and the GUI operate on the SAME project.json shape (parity). These
// are the operations an external coding agent drives from the terminal.

import { randomUUID } from "node:crypto";
import { suggestCropFromSceneLog } from "./auto-crop.ts";
import { CAPTION_STYLE_IDS, isCaptionStyleId } from "./caption-styles.ts";
import { isNeutralColor } from "./color-adjust.ts";
import {
  type Asset,
  type Audio,
  AudioSchema,
  type Broll,
  type ColorAdjust,
  ColorAdjustSchema,
  type CropMode,
  type CutSnap,
  CutSnapSchema,
  type CutTransition,
  CutTransitionSchema,
  type DeadAirSpan,
  type ExportAspect,
  type ExportCrop,
  type ExportLayout,
  ExportSettingsSchema,
  type Filter,
  type Graphic,
  type Motion,
  type MusicPlacement,
  type PhraseAnchor,
  type Project,
  SAMPLE_RATE,
  type SplitVertical,
  type Still,
  type Title,
  type Zoom,
} from "./edl.ts";
import { EXPORT_ASPECT_IDS } from "./export-aspect.ts";
import { normalizeSplitVertical } from "./export-layout.ts";
import {
  defaultGraphicParams,
  listGraphics,
  loadGraphicManifest,
} from "./graphics.ts";
import { findPhraseRuns } from "./phrase-match.ts";
import {
  assertProductAnnouncementSpec,
  PRODUCT_ANNOUNCEMENT_CATALOG,
  ProductAnnouncementCatalogSchema,
} from "./product-announcement.ts";
import { CAPTION_INSET_PLATFORMS } from "./safe-areas.ts";

// Apply an optional `note` patch to an overlay item: a non-empty string sets the
// rationale, an empty string CLEARS it (delete-on-empty, mirroring look-lut), and
// an omitted patch leaves any existing note untouched. Metadata only, no ffmpeg.
function patchNote(item: { note?: string }, note: string | undefined): void {
  if (note === undefined) {
    return;
  }
  if (note === "") {
    Reflect.deleteProperty(item, "note");
  } else {
    item.note = note;
  }
}

function graphicId(project: Project): string {
  const used = new Set((project.graphics ?? []).map((g) => g.id));
  let id = "";
  do {
    id = `g-${randomUUID()}`;
  } while (used.has(id));
  return id;
}

// Mark words (by id) deleted (or, with deleted=false, restored). An optional
// `note` records the human rationale for the cut on each affected word; passing
// an empty string CLEARS the note (delete-on-empty, mirroring look-lut), and an
// omitted note leaves any existing note untouched. Metadata only, never ffmpeg.
export function cutWords(
  project: Project,
  ids: string[],
  deleted = true,
  note?: string
): Project {
  const set = new Set(ids);
  for (const w of project.words) {
    if (set.has(w.id)) {
      w.deleted = deleted;
      patchNote(w, note);
    }
  }
  return project;
}

const WORD_TEXT_MAX_LENGTH = 200;

// C2: collapse embedded whitespace controls (\r, \n, \t and any run of
// whitespace) to single spaces and trim. Transcript words are single-line by
// construction, and an embedded newline would otherwise survive into
// project.json and then break the ONE-LINE ASS Dialogue entries the caption
// burn writes (assEscape does not strip newlines). Shared by setWordText
// below (agent/CLI word-text) and the GUI bulk edit path in
// src/projectMutations.ts so neither surface can smuggle a control char in.
export function normalizeWordText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Correct one word's transcript text (the agent/CLI parity surface for the
// GUI's bulk "edit-words" path, see app/actions.ts). Normalizes embedded
// whitespace (see normalizeWordText), rejects empty or overlong (>200 char)
// text, and throws if the word id doesn't exist. Records the PRE-correction
// text once in originalText the first time a word's text actually changes;
// later corrections update `text` but never touch an already-set
// originalText, so the original Whisper output stays recoverable through any
// number of edits.
export function setWordText(
  project: Project,
  id: string,
  text: string
): { id: string; originalText?: string; text: string } {
  const trimmed = normalizeWordText(text);
  if (trimmed.length === 0) {
    throw new Error("word text cannot be empty");
  }
  if (trimmed.length > WORD_TEXT_MAX_LENGTH) {
    throw new Error(
      `word text is too long (${trimmed.length} chars, max ${WORD_TEXT_MAX_LENGTH})`
    );
  }
  const word = project.words.find((w) => w.id === id);
  if (!word) {
    throw new Error(`unknown word id "${id}"`);
  }
  if (trimmed !== word.text && word.originalText === undefined) {
    word.originalText = word.text;
  }
  word.text = trimmed;
  return { id: word.id, text: word.text, originalText: word.originalText };
}

// Find the first contiguous run of words whose concatenated normalized text
// matches the normalized phrase, and mark that run deleted. Returns whether a
// match was found and which word ids were cut.
export function cutByText(
  project: Project,
  phrase: string,
  note?: string
): { matched: boolean; ids: string[] } {
  const runs = findPhraseRuns(project, phrase, { all: false });
  if (runs.length === 0) {
    return { matched: false, ids: [] };
  }
  const ids = runs[0].ids;
  cutWords(project, ids, true, note);
  return { matched: true, ids };
}

// Cut every contiguous run matching the phrase (kept words only). Returns how
// many runs were cut and the combined word ids.
export function cutAllByText(
  project: Project,
  phrase: string,
  note?: string
): { matches: number; ids: string[] } {
  const ids: string[] = [];
  let matches = 0;
  while (true) {
    const result = cutByText(project, phrase, note);
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
  input: {
    assetId: string;
    audioMode?: Broll["audioMode"];
    display?: Broll["display"];
    fromSec: number;
    toSec: number;
    srcInSec?: number;
    note?: string;
    anchor?: PhraseAnchor;
  }
): Broll {
  const {
    assetId,
    audioMode,
    display,
    fromSec,
    toSec,
    srcInSec = 0,
    note,
    anchor,
  } = input;
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
    display: display ?? "cover",
    audioMode: audioMode ?? "silent",
    ...(note === undefined ? {} : { note }),
    ...(anchor === undefined ? {} : { anchor }),
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

// Remove a registered asset and any overlays that reference it.
export function removeAsset(project: Project, assetId: string): boolean {
  const before = project.assets.length;
  project.assets = project.assets.filter((a) => a.id !== assetId);
  if (project.assets.length === before) {
    return false;
  }
  project.broll = project.broll.filter((b) => b.assetId !== assetId);
  project.stills = (project.stills ?? []).filter((s) => s.assetId !== assetId);
  project.music = (project.music ?? []).filter((m) => m.assetId !== assetId);
  return true;
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
    audioMode?: Broll["audioMode"];
    display?: Broll["display"];
    fromSec?: number;
    toSec?: number;
    srcInSec?: number;
    note?: string;
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
  if (patch.display !== undefined) {
    item.display = patch.display;
  }
  if (patch.audioMode !== undefined) {
    item.audioMode = patch.audioMode;
  }
  patchNote(item, patch.note);
  return item;
}

// Shared validation + clamping for music placements (add and patch use the
// same rules, mirroring the addBroll/updateBroll pair). Bounds live HERE, not
// in the registry Zod schemas: gain 0-2, fades 0-10 s, span clamped to the
// project end always, and in trim mode also to the audio remaining after the
// source in-point (loop mode repeats the asset to cover the whole span).
function resolveMusicSpan(
  project: Project,
  input: {
    assetId: string;
    fadeInSec: number;
    fadeOutSec: number;
    fromSec: number;
    gain: number;
    mode: MusicPlacement["mode"];
    srcInSec: number;
    toSec: number;
  }
): { endSample: number; srcInSample: number; startSample: number } {
  const { assetId, fromSec, toSec, srcInSec, gain, fadeInSec, fadeOutSec } =
    input;
  if (
    ![fromSec, toSec, srcInSec, gain, fadeInSec, fadeOutSec].every(
      Number.isFinite
    )
  ) {
    throw new Error("music timing/gain values must be finite numbers");
  }
  if (fromSec < 0 || toSec < 0 || srcInSec < 0) {
    throw new Error("music timing values must be non-negative");
  }
  if (gain < 0 || gain > 2) {
    throw new Error("music gain must be between 0 and 2");
  }
  if (fadeInSec < 0 || fadeInSec > 10 || fadeOutSec < 0 || fadeOutSec > 10) {
    throw new Error("music fades must be between 0 and 10 seconds");
  }
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) {
    const known = project.assets.map((a) => a.id).join(", ") || "(none)";
    throw new Error(`unknown asset "${assetId}". Registered assets: ${known}`);
  }
  if (asset.kind !== "music") {
    throw new Error(
      `asset "${assetId}" is ${asset.kind}; music placements require kind music`
    );
  }
  if (toSec <= fromSec) {
    throw new Error(
      `music span is empty: toSec (${toSec}) must be greater than fromSec (${fromSec})`
    );
  }
  const projectDurationSec = project.durationSamples / SAMPLE_RATE;
  const assetDurationSec = asset.durationSamples / SAMPLE_RATE;
  if (fromSec >= projectDurationSec) {
    throw new Error("music span starts after the project ends");
  }
  if (input.mode === "trim" && srcInSec >= assetDurationSec) {
    throw new Error("music source in-point starts after the asset ends");
  }
  const endSec = Math.min(
    toSec,
    projectDurationSec,
    input.mode === "trim"
      ? fromSec + (assetDurationSec - srcInSec)
      : Number.POSITIVE_INFINITY
  );
  if (endSec <= fromSec) {
    throw new Error("music span is empty after clamping to media duration");
  }
  return {
    startSample: Math.round(fromSec * SAMPLE_RATE),
    endSample: Math.round(endSec * SAMPLE_RATE),
    srcInSample: Math.round(srcInSec * SAMPLE_RATE),
  };
}

// Place background music from a registered music asset under the voice over a
// span of the source timeline. Converts seconds to samples on the 48 kHz grid.
export function addMusic(
  project: Project,
  input: {
    assetId: string;
    fromSec: number;
    toSec: number;
    gain?: number;
    fadeInSec?: number;
    fadeOutSec?: number;
    srcInSec?: number;
    mode?: MusicPlacement["mode"];
    note?: string;
  }
): MusicPlacement {
  const {
    assetId,
    fromSec,
    toSec,
    gain = 1,
    fadeInSec = 0,
    fadeOutSec = 0,
    srcInSec = 0,
    mode = "trim",
    note,
  } = input;
  const span = resolveMusicSpan(project, {
    assetId,
    fromSec,
    toSec,
    srcInSec,
    gain,
    fadeInSec,
    fadeOutSec,
    mode,
  });
  const item: MusicPlacement = {
    id: `m${Date.now()}`,
    assetId,
    startSample: span.startSample,
    endSample: span.endSample,
    srcInSample: span.srcInSample,
    gain,
    fadeInSec,
    fadeOutSec,
    mode,
    ...(note === undefined ? {} : { note }),
  };
  if (!project.music) {
    project.music = [];
  }
  project.music.push(item);
  return item;
}

// Remove a music placement by id. Returns whether one was removed.
export function removeMusic(project: Project, id: string): boolean {
  const music = project.music ?? [];
  const before = music.length;
  project.music = music.filter((m) => m.id !== id);
  return project.music.length < before;
}

function findMusic(project: Project, id: string): MusicPlacement {
  const item = (project.music ?? []).find((m) => m.id === id);
  if (!item) {
    throw new Error(`unknown music placement "${id}"`);
  }
  return item;
}

// Patch an existing music placement. Omitted fields are unchanged; the merged
// result is revalidated against the same bounds addMusic enforces.
export function updateMusic(
  project: Project,
  id: string,
  patch: {
    assetId?: string;
    fromSec?: number;
    toSec?: number;
    gain?: number;
    fadeInSec?: number;
    fadeOutSec?: number;
    srcInSec?: number;
    mode?: MusicPlacement["mode"];
    note?: string;
  }
): MusicPlacement {
  const item = findMusic(project, id);
  const assetId = patch.assetId ?? item.assetId;
  const fromSec = patch.fromSec ?? item.startSample / SAMPLE_RATE;
  const toSec = patch.toSec ?? item.endSample / SAMPLE_RATE;
  const srcInSec = patch.srcInSec ?? item.srcInSample / SAMPLE_RATE;
  const gain = patch.gain ?? item.gain;
  const fadeInSec = patch.fadeInSec ?? item.fadeInSec;
  const fadeOutSec = patch.fadeOutSec ?? item.fadeOutSec;
  const mode = patch.mode ?? item.mode;
  const span = resolveMusicSpan(project, {
    assetId,
    fromSec,
    toSec,
    srcInSec,
    gain,
    fadeInSec,
    fadeOutSec,
    mode,
  });
  item.assetId = assetId;
  item.startSample = span.startSample;
  item.endSample = span.endSample;
  item.srcInSample = span.srcInSample;
  item.gain = gain;
  item.fadeInSec = fadeInSec;
  item.fadeOutSec = fadeOutSec;
  item.mode = mode;
  patchNote(item, patch.note);
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
    note?: string;
    anchor?: PhraseAnchor;
  }
): Still {
  const {
    assetId,
    fromSec,
    toSec,
    scale = 1.2,
    focusX = 0.5,
    focusY = 0.5,
    note,
    anchor,
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
    ...(note === undefined ? {} : { note }),
    ...(anchor === undefined ? {} : { anchor }),
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

function findStill(project: Project, id: string): Still {
  const item = (project.stills ?? []).find((s) => s.id === id);
  if (!item) {
    throw new Error(`unknown still "${id}"`);
  }
  return item;
}

// Patch an existing still overlay. Omitted fields are unchanged.
export function updateStill(
  project: Project,
  id: string,
  patch: {
    assetId?: string;
    fromSec?: number;
    toSec?: number;
    scale?: number;
    focusX?: number;
    focusY?: number;
    note?: string;
  }
): Still {
  const item = findStill(project, id);
  const assetId = patch.assetId ?? item.assetId;
  const fromSec = patch.fromSec ?? item.startSample / SAMPLE_RATE;
  const toSec = patch.toSec ?? item.endSample / SAMPLE_RATE;
  const scale = patch.scale ?? item.scale;
  const focusX = patch.focusX ?? item.focusX;
  const focusY = patch.focusY ?? item.focusY;
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
  if (endSec <= fromSec) {
    throw new Error("still span is empty after clamping to project duration");
  }
  item.assetId = assetId;
  item.scale = scale;
  item.focusX = focusX;
  item.focusY = focusY;
  item.startSample = Math.round(fromSec * SAMPLE_RATE);
  item.endSample = Math.round(endSec * SAMPLE_RATE);
  patchNote(item, patch.note);
  return item;
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
    note?: string;
    anchor?: PhraseAnchor;
  }
): Title {
  const { fromSec, toSec, text, position = "lower", note, anchor } = input;
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
    ...(note === undefined ? {} : { note }),
    ...(anchor === undefined ? {} : { anchor }),
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
    note?: string;
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
  patchNote(item, patch.note);
  return item;
}

// Resolve and validate a graphic template id against the on-disk catalog,
// throwing an actionable list (mirrors how addStill validates the asset id).
function resolveGraphicTemplate(template: string, slug: string): void {
  const known = listGraphics({ slug });
  if (!known.some((g) => g.id === template)) {
    const list = known.map((g) => g.id).join(", ") || "(none)";
    throw new Error(
      `unknown graphic template "${template}". Available: ${list}`
    );
  }
}

const STAGGER_FRAMES_MAX = 30;
const IN_DUR_FRAMES_MIN = 1;
const IN_DUR_FRAMES_MAX = 120;

export function clampGraphicTimingParams(
  params: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  const out = { ...params };
  if (typeof out.staggerFrames === "number") {
    if (!Number.isFinite(out.staggerFrames)) {
      throw new Error("staggerFrames must be a finite number");
    }
    out.staggerFrames = Math.max(
      0,
      Math.min(STAGGER_FRAMES_MAX, Math.round(out.staggerFrames))
    );
  }
  if (typeof out.inDurFrames === "number") {
    if (!Number.isFinite(out.inDurFrames)) {
      throw new Error("inDurFrames must be a finite number");
    }
    out.inDurFrames = Math.max(
      IN_DUR_FRAMES_MIN,
      Math.min(IN_DUR_FRAMES_MAX, Math.round(out.inDurFrames))
    );
  }
  return out;
}

function mergeGraphicParams(
  template: string,
  params?: Record<string, string | number | boolean>,
  slug?: string
): Record<string, string | number | boolean> {
  return clampGraphicTimingParams({
    ...defaultGraphicParams(loadGraphicManifest(template, { slug })),
    ...(params ?? {}),
  });
}

// Add an HTML/CSS graphic overlay over a span of the source timeline. Validates
// the template exists; fills any unset params from the template manifest's
// declared defaults (caller params win). Converts seconds to samples on the
// canonical 48 kHz grid; clamps end to project duration.
export function addGraphic(
  project: Project,
  input: {
    template: string;
    fromSec: number;
    toSec: number;
    params?: Record<string, string | number | boolean>;
    track?: Graphic["track"];
    note?: string;
    anchor?: PhraseAnchor;
  }
): Graphic {
  const {
    template,
    fromSec,
    toSec,
    params,
    track = "title",
    note,
    anchor,
  } = input;
  if (![fromSec, toSec].every(Number.isFinite)) {
    throw new Error("graphic timing values must be finite numbers");
  }
  if (fromSec < 0 || toSec < 0) {
    throw new Error("graphic timing values must be non-negative");
  }
  resolveGraphicTemplate(template, project.slug);
  if (toSec <= fromSec) {
    throw new Error(
      `graphic span is empty: toSec (${toSec}) must be greater than fromSec (${fromSec})`
    );
  }
  const projectDurationSec = project.durationSamples / SAMPLE_RATE;
  if (fromSec >= projectDurationSec) {
    throw new Error("graphic span starts after the project ends");
  }
  const endSec = Math.min(toSec, projectDurationSec);
  if (endSec <= fromSec) {
    throw new Error("graphic span is empty after clamping to project duration");
  }
  const merged = mergeGraphicParams(template, params, project.slug);
  const item: Graphic = {
    id: graphicId(project),
    template,
    params: merged,
    startSample: Math.round(fromSec * SAMPLE_RATE),
    endSample: Math.round(endSec * SAMPLE_RATE),
    track,
    ...(note === undefined ? {} : { note }),
    ...(anchor === undefined ? {} : { anchor }),
  };
  if (!project.graphics) {
    project.graphics = [];
  }
  project.graphics.push(item);
  return item;
}

// Add a json-render powered product announcement graphic over a source-time
// span. The spec is validated before it is written into project.json, so agents
// can be creative inside the catalog without storing arbitrary UI/code.
function resolveJsonGraphicSpan(
  project: Project,
  fromSec: number,
  toSec: number
): { endSec: number; fromSec: number } {
  if (![fromSec, toSec].every(Number.isFinite)) {
    throw new Error("json graphic timing values must be finite numbers");
  }
  if (fromSec < 0 || toSec < 0) {
    throw new Error("json graphic timing values must be non-negative");
  }
  if (toSec <= fromSec) {
    throw new Error(
      `json graphic span is empty: toSec (${toSec}) must be greater than fromSec (${fromSec})`
    );
  }
  const projectDurationSec = project.durationSamples / SAMPLE_RATE;
  if (fromSec >= projectDurationSec) {
    throw new Error("json graphic span starts after the project ends");
  }
  const endSec = Math.min(toSec, projectDurationSec);
  if (endSec <= fromSec) {
    throw new Error(
      "json graphic span is empty after clamping to project duration"
    );
  }
  return { endSec, fromSec };
}

export function addJsonGraphic(
  project: Project,
  input: {
    catalog: typeof PRODUCT_ANNOUNCEMENT_CATALOG;
    fromSec: number;
    toSec: number;
    spec: unknown;
    track?: Graphic["track"];
    note?: string;
    anchor?: PhraseAnchor;
  }
): Graphic {
  const {
    catalog,
    fromSec,
    toSec,
    spec: rawSpec,
    track = "title",
    note,
    anchor,
  } = input;
  ProductAnnouncementCatalogSchema.parse(catalog);
  const span = resolveJsonGraphicSpan(project, fromSec, toSec);
  const spec = assertProductAnnouncementSpec(rawSpec);
  const item: Graphic = {
    id: graphicId(project),
    type: "json-render",
    template: PRODUCT_ANNOUNCEMENT_CATALOG,
    catalog,
    spec,
    params: {},
    startSample: Math.round(span.fromSec * SAMPLE_RATE),
    endSample: Math.round(span.endSec * SAMPLE_RATE),
    track,
    ...(note === undefined ? {} : { note }),
    ...(anchor === undefined ? {} : { anchor }),
  };
  if (!project.graphics) {
    project.graphics = [];
  }
  project.graphics.push(item);
  return item;
}

// Remove a graphic overlay by id. Returns whether one was removed.
export function removeGraphic(project: Project, id: string): boolean {
  const graphics = project.graphics ?? [];
  const before = graphics.length;
  project.graphics = graphics.filter((g) => g.id !== id);
  return project.graphics.length < before;
}

function findGraphic(project: Project, id: string): Graphic {
  const item = (project.graphics ?? []).find((g) => g.id === id);
  if (!item) {
    throw new Error(`unknown graphic "${id}"`);
  }
  return item;
}

// Patch an existing graphic overlay. Omitted fields are unchanged; supplied
// params are MERGED over the existing params (mirrors look-color's knob merge),
// so callers can tweak one field without resending the whole record.
export function updateGraphic(
  project: Project,
  id: string,
  patch: {
    template?: string;
    fromSec?: number;
    toSec?: number;
    params?: Record<string, string | number | boolean>;
    keyframes?: Graphic["keyframes"] | null;
    track?: Graphic["track"];
    note?: string;
  }
): Graphic {
  const item = findGraphic(project, id);
  const template = patch.template ?? item.template;
  const fromSec = patch.fromSec ?? item.startSample / SAMPLE_RATE;
  const toSec = patch.toSec ?? item.endSample / SAMPLE_RATE;
  const track = patch.track ?? item.track;
  if (![fromSec, toSec].every(Number.isFinite)) {
    throw new Error("graphic timing values must be finite numbers");
  }
  if (fromSec < 0 || toSec < 0) {
    throw new Error("graphic timing values must be non-negative");
  }
  resolveGraphicTemplate(template, project.slug);
  if (toSec <= fromSec) {
    throw new Error(
      `graphic span is empty: toSec (${toSec}) must be greater than fromSec (${fromSec})`
    );
  }
  const projectDurationSec = project.durationSamples / SAMPLE_RATE;
  if (fromSec >= projectDurationSec) {
    throw new Error("graphic span starts after the project ends");
  }
  const endSec = Math.min(toSec, projectDurationSec);
  if (endSec <= fromSec) {
    throw new Error("graphic span is empty after clamping to project duration");
  }
  // When the template changes, re-seed defaults so the new template's params are
  // populated; keep prior params that still apply, then merge the caller's patch.
  const base =
    template === item.template
      ? item.params
      : {
          ...defaultGraphicParams(
            loadGraphicManifest(template, { slug: project.slug })
          ),
          ...item.params,
        };
  item.template = template;
  item.params = clampGraphicTimingParams({
    ...base,
    ...(patch.params ?? {}),
  });
  if (patch.keyframes !== undefined) {
    if (patch.keyframes === null || patch.keyframes.length === 0) {
      item.keyframes = undefined;
    } else {
      item.keyframes = patch.keyframes;
    }
  }
  item.track = track;
  item.startSample = Math.round(fromSec * SAMPLE_RATE);
  item.endSample = Math.round(endSec * SAMPLE_RATE);
  patchNote(item, patch.note);
  return item;
}

export function updateJsonGraphic(
  project: Project,
  id: string,
  patch: {
    catalog?: typeof PRODUCT_ANNOUNCEMENT_CATALOG;
    fromSec?: number;
    toSec?: number;
    spec?: unknown;
    track?: Graphic["track"];
    note?: string;
  }
): Graphic {
  const item = findGraphic(project, id);
  if (item.type !== "json-render") {
    throw new Error(`graphic "${id}" is not a json-render graphic`);
  }
  const catalog = patch.catalog ?? item.catalog;
  ProductAnnouncementCatalogSchema.parse(catalog);
  const fromSec = patch.fromSec ?? item.startSample / SAMPLE_RATE;
  const toSec = patch.toSec ?? item.endSample / SAMPLE_RATE;
  const track = patch.track ?? item.track;
  const span = resolveJsonGraphicSpan(project, fromSec, toSec);
  item.catalog = catalog;
  item.spec = assertProductAnnouncementSpec(patch.spec ?? item.spec);
  item.template = PRODUCT_ANNOUNCEMENT_CATALOG;
  item.params = {};
  item.track = track;
  item.startSample = Math.round(span.fromSec * SAMPLE_RATE);
  item.endSample = Math.round(span.endSec * SAMPLE_RATE);
  patchNote(item, patch.note);
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

// Set the caption look preset (src/caption-styles.ts owns the id list).
export function setCaptionStyle(project: Project, style: string): Project {
  if (!isCaptionStyleId(style)) {
    throw new Error(
      `unknown caption style "${style}". Valid styles: ${CAPTION_STYLE_IDS.join(", ")}`
    );
  }
  project.captions = { ...project.captions, style };
  return project;
}

export function setCaptionInset(
  project: Project,
  input: { enabled: boolean; platform?: string }
): Project {
  if (!input.enabled) {
    const next = { ...project.captions };
    delete next.insetPlatform;
    project.captions = next;
    return project;
  }
  const platform = input.platform ?? "generic";
  if (!(CAPTION_INSET_PLATFORMS as readonly string[]).includes(platform)) {
    throw new Error(
      `unknown caption inset platform "${platform}". Valid: ${CAPTION_INSET_PLATFORMS.join(", ")}`
    );
  }
  project.captions = {
    ...project.captions,
    insetPlatform: platform as (typeof CAPTION_INSET_PLATFORMS)[number],
  };
  return project;
}

// Set symmetric padding around kept word ranges (0–500 ms).
export function setPadMs(project: Project, padMs: number): Project {
  project.padMs = Math.max(0, Math.min(500, Math.round(padMs)));
  return project;
}

function clampMs(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

// Store cut-boundary snap behavior in the EDL. Raw VAD measurements are derived
// media and belong in working/; this setting is the edit contract every surface
// reads before preview/export apply cleaner boundaries.
export function setCutSnap(project: Project, input: Partial<CutSnap>): Project {
  const current = CutSnapSchema.parse(project.cuts?.snap ?? {});
  const mode =
    input.mode ??
    (input.enabled === true && current.mode === "off" ? "vad" : current.mode);
  const enabled =
    mode === "off"
      ? false
      : input.enabled === undefined
        ? mode === "vad"
        : input.enabled;
  project.cuts = {
    ...project.cuts,
    snap: {
      enabled,
      mode: enabled ? mode : "off",
      maxShiftMs: clampMs(input.maxShiftMs ?? current.maxShiftMs, 500),
      crossfadeMs: clampMs(input.crossfadeMs ?? current.crossfadeMs, 100),
    },
  };
  return project;
}

// Sliver floor for an INCOMING dead-air span before it is ever registered.
// Distinct from MIN_DEAD_AIR_SLIVER_SEC in audio-analysis-core.ts, which
// floors a REMAINDER kept after subtracting dead air from a range; the two
// thresholds happen to share a value today but govern different ends of the
// same pipeline, so they are not merged into one constant.
const MIN_DEAD_AIR_SPAN_SEC = 0.05;
// F4: two spans within this of each other coalesce into one entry (addDeadAir
// below) instead of being registered as separate, possibly-overlapping spans.
const DEAD_AIR_ADJACENT_SEC = 0.01;
// F4: silently drop overflow beyond this many registered spans, keeping the
// earliest (by source time) - a runaway "apply all safe" (or an agent loop)
// must not grow cuts.deadAir without bound.
const MAX_DEAD_AIR_SPANS = 200;

// Register dead-air spans (source time) to drop from otherwise-kept ranges :
// see CutsSchema.deadAir and subtractDeadAir in audio-analysis-core.ts, which
// applies them on top of survivingRanges at preview/export. Each span is
// validated (finite, toSec > fromSec), clamped to [0, project duration], and
// dropped as a sliver under 0.05s after clamping; spans that end up touching
// or overlapping (within THIS call) are merged before ids are assigned.
export function addDeadAir(
  project: Project,
  spans: { fromSec: number; toSec: number }[]
): DeadAirSpan[] {
  if (!Array.isArray(spans) || spans.length === 0) {
    throw new Error("dead-air spans must be a non-empty array");
  }
  const durationSec = project.durationSamples / SAMPLE_RATE;
  const normalized: { startSample: number; endSample: number }[] = [];
  for (const { fromSec, toSec } of spans) {
    if (!(Number.isFinite(fromSec) && Number.isFinite(toSec))) {
      throw new Error("dead-air span timing values must be finite numbers");
    }
    if (toSec <= fromSec) {
      throw new Error(
        `dead-air span is empty: toSec (${toSec}) must be greater than fromSec (${fromSec})`
      );
    }
    const clampedFrom = Math.min(Math.max(fromSec, 0), durationSec);
    const clampedTo = Math.min(Math.max(toSec, 0), durationSec);
    if (clampedTo - clampedFrom < MIN_DEAD_AIR_SPAN_SEC) {
      continue;
    }
    normalized.push({
      startSample: Math.round(clampedFrom * SAMPLE_RATE),
      endSample: Math.round(clampedTo * SAMPLE_RATE),
    });
  }

  normalized.sort((a, b) => a.startSample - b.startSample);
  const merged: { startSample: number; endSample: number }[] = [];
  for (const span of normalized) {
    const last = merged.at(-1);
    if (last && span.startSample <= last.endSample) {
      last.endSample = Math.max(last.endSample, span.endSample);
    } else {
      merged.push({ ...span });
    }
  }

  // F4(b) idempotency: coalesce each incoming span into an EXISTING
  // (already-applied) span it overlaps or sits within DEAD_AIR_ADJACENT_SEC
  // of, extending that entry's bounds, instead of blindly appending a new,
  // possibly-overlapping entry. Re-running "apply all safe" with the same or
  // adjacent candidates then grows nothing.
  const existing = project.cuts?.deadAir ?? [];
  const existingIds = new Set(existing.map((d) => d.id));
  const adjacentSamples = Math.round(DEAD_AIR_ADJACENT_SEC * SAMPLE_RATE);
  const nextSpans: DeadAirSpan[] = existing.map((d) => ({ ...d }));
  const touched: DeadAirSpan[] = [];
  let seq = 0;

  for (const span of merged) {
    const hit = nextSpans.find(
      (c) =>
        span.startSample <= c.endSample + adjacentSamples &&
        c.startSample <= span.endSample + adjacentSamples
    );
    if (hit) {
      hit.startSample = Math.min(hit.startSample, span.startSample);
      hit.endSample = Math.max(hit.endSample, span.endSample);
      touched.push(hit);
      continue;
    }
    let id: string;
    do {
      seq += 1;
      id = `da${Date.now()}${seq}`;
    } while (existingIds.has(id));
    existingIds.add(id);
    const item: DeadAirSpan = { id, ...span };
    nextSpans.push(item);
    touched.push(item);
  }

  // 200-span cap: keep the earliest (by source time), silently drop overflow.
  nextSpans.sort((a, b) => a.startSample - b.startSample);
  const capped = nextSpans.slice(0, MAX_DEAD_AIR_SPANS);
  const cappedIds = new Set(capped.map((d) => d.id));

  project.cuts = { ...project.cuts, deadAir: capped };
  // Dedupe: a single incoming span can coalesce into the same existing entry
  // as an earlier span in this call (both `touched`); a caller reconciling
  // optimistic ids only needs each affected span once.
  const seenIds = new Set<string>();
  return touched.filter((t) => {
    if (!cappedIds.has(t.id) || seenIds.has(t.id)) {
      return false;
    }
    seenIds.add(t.id);
    return true;
  });
}

// Remove a registered dead-air span by id. Returns whether one was removed.
export function removeDeadAir(project: Project, id: string): boolean {
  const existing = project.cuts?.deadAir ?? [];
  const next = existing.filter((d) => d.id !== id);
  project.cuts = { ...project.cuts, deadAir: next };
  return next.length < existing.length;
}

// Apply picture look flags and filters.
export function setLook(
  project: Project,
  input: {
    vignette?: boolean;
    filter?: Filter;
    lut?: string | null;
    color?: Partial<ColorAdjust>;
    transition?: Partial<CutTransition>;
  }
): Project {
  if (typeof input.vignette === "boolean") {
    project.look = { ...project.look, vignette: input.vignette };
  }
  if (input.filter !== undefined) {
    project.look = { ...project.look, filter: input.filter };
  }
  if (input.lut !== undefined) {
    if (input.lut === null || input.lut === "") {
      const { lut: _omit, ...rest } = project.look;
      project.look = rest;
    } else {
      project.look = { ...project.look, lut: input.lut };
    }
  }
  if (input.color !== undefined) {
    project.look = mergeColor(project.look, input.color);
  }
  if (input.transition !== undefined) {
    const base = CutTransitionSchema.parse(project.look.transition ?? {});
    project.look = {
      ...project.look,
      transition: { ...base, ...input.transition },
    };
  }
  return project;
}

// Merge color knobs onto the current adjust (only the passed knobs change), then
// drop the field entirely when the result is neutral so the EDL stays clean :
// the same omit-when-default behaviour the LUT field uses.
function mergeColor<T extends { color?: ColorAdjust }>(
  look: T | undefined,
  patch: Partial<ColorAdjust>
): T {
  const base = (look ?? {}) as T;
  const merged = { ...ColorAdjustSchema.parse(base.color ?? {}), ...patch };
  if (isNeutralColor(merged)) {
    const { color: _omit, ...rest } = base;
    return rest as T;
  }
  return { ...base, color: merged };
}

// Patch the global animation feel. Only the provided knobs change.
export function setMotion(project: Project, input: Partial<Motion>): Project {
  project.motion = { ...project.motion, ...input };
  return project;
}

function clampNum(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Patch export aspect and manual reframe crop. Bounds are enforced here on
// write (crop focus 0-1, scale 1-3); the registry schema stays shape-only.
export function setExportSettings(
  project: Project,
  input: {
    aspect?: ExportAspect;
    crop?: Partial<ExportCrop>;
    cropMode?: CropMode;
    layout?: ExportLayout;
    splitVertical?: Partial<SplitVertical>;
  }
): Project {
  const current = ExportSettingsSchema.parse(project.export ?? {});
  const aspect = input.aspect ?? current.aspect;
  if (!EXPORT_ASPECT_IDS.includes(aspect)) {
    throw new Error(
      `invalid export aspect "${aspect}" (expected one of: ${EXPORT_ASPECT_IDS.join(", ")})`
    );
  }
  const cropMode = input.cropMode ?? current.cropMode;

  // Scene mode derives focus from sceneLog; vision mode uses caller-supplied crop
  // (from suggestCropFromVision / vision-focus CLI) when present.
  let crop: ExportCrop;
  if (
    cropMode === "vision" &&
    aspect !== "source" &&
    input.crop?.focusX !== undefined &&
    input.crop?.focusY !== undefined
  ) {
    crop = {
      focusX: clampNum(input.crop.focusX, 0, 1),
      focusY: clampNum(input.crop.focusY, 0, 1),
      scale: clampNum(input.crop.scale ?? current.crop.scale, 1, 3),
    };
  } else if (cropMode === "scene" && aspect !== "source") {
    const suggestion = suggestCropFromSceneLog(project, aspect);
    crop = suggestion
      ? {
          focusX: suggestion.focusX,
          focusY: suggestion.focusY,
          scale: current.crop.scale,
        }
      : current.crop;
  } else if (input.crop) {
    crop = {
      focusX: clampNum(input.crop.focusX ?? current.crop.focusX, 0, 1),
      focusY: clampNum(input.crop.focusY ?? current.crop.focusY, 0, 1),
      scale: clampNum(input.crop.scale ?? current.crop.scale, 1, 3),
    };
  } else {
    crop = current.crop;
  }

  const layout = input.layout ?? current.layout ?? "fill";
  let splitVertical = current.splitVertical;
  if (input.splitVertical) {
    splitVertical = normalizeSplitVertical({
      ...splitVertical,
      ...input.splitVertical,
    });
  } else if (layout === "split-vertical" && !splitVertical) {
    splitVertical = normalizeSplitVertical(undefined);
  }

  project.export = {
    aspect,
    crop,
    cropMode,
    layout,
    ...(splitVertical === undefined ? {} : { splitVertical }),
  };
  return project;
}

// Patch export audio quality settings: ducking, loudness normalization, and
// voice highpass. Merges ONE LEVEL DEEP like setMotion (only the provided
// subobject keys change; an omitted subobject is left entirely untouched),
// but unlike setMotion every numeric field is clamped to its AudioSchema
// bound here on write, so a caller cannot smuggle an out-of-range value past
// the shape-only registry schema (the stricter convention setCutSnap
// established: bounds live in the primitive, not the registry schema).
export function setAudio(
  project: Project,
  input: {
    ducking?: Partial<Audio["ducking"]>;
    loudness?: Partial<Audio["loudness"]>;
    noiseReduction?: Partial<Audio["noiseReduction"]>;
    voiceHighpass?: Partial<Audio["voiceHighpass"]>;
    deEsser?: Partial<Audio["deEsser"]>;
  }
): Project {
  const current = AudioSchema.parse(project.audio ?? {});
  const ducking = input.ducking
    ? {
        enabled: input.ducking.enabled ?? current.ducking.enabled,
        amountDb: clampNum(
          input.ducking.amountDb ?? current.ducking.amountDb,
          1,
          30
        ),
        attackMs: clampNum(
          input.ducking.attackMs ?? current.ducking.attackMs,
          1,
          500
        ),
        releaseMs: clampNum(
          input.ducking.releaseMs ?? current.ducking.releaseMs,
          20,
          2000
        ),
      }
    : current.ducking;
  const loudness = input.loudness
    ? {
        enabled: input.loudness.enabled ?? current.loudness.enabled,
        targetLufs: clampNum(
          input.loudness.targetLufs ?? current.loudness.targetLufs,
          -30,
          -10
        ),
        mode: input.loudness.mode ?? current.loudness.mode,
      }
    : current.loudness;
  const noiseReduction = input.noiseReduction
    ? {
        enabled: input.noiseReduction.enabled ?? current.noiseReduction.enabled,
        nr: clampNum(
          input.noiseReduction.nr ?? current.noiseReduction.nr,
          1,
          97
        ),
      }
    : current.noiseReduction;
  const voiceHighpass = input.voiceHighpass
    ? {
        enabled: input.voiceHighpass.enabled ?? current.voiceHighpass.enabled,
        hz: clampNum(
          input.voiceHighpass.hz ?? current.voiceHighpass.hz,
          40,
          200
        ),
      }
    : current.voiceHighpass;
  const deEsser = input.deEsser
    ? {
        enabled: input.deEsser.enabled ?? current.deEsser.enabled,
        intensity: clampNum(
          input.deEsser.intensity ?? current.deEsser.intensity,
          0,
          1
        ),
      }
    : current.deEsser;
  project.audio = {
    ducking,
    loudness,
    noiseReduction,
    voiceHighpass,
    deEsser,
  };
  return project;
}

// Mark an asset as must-use or avoid for agent placement. Setting one flag
// clears the other; when both are true in one call, avoid wins.
export function setAssetFlags(
  project: Project,
  assetId: string,
  input: { mustUse?: boolean; avoid?: boolean }
): Asset {
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) {
    throw new Error(`unknown asset id "${assetId}"`);
  }

  const { mustUse, avoid } = input;

  if (mustUse === true && avoid === true) {
    asset.mustUse = undefined;
    asset.avoid = true;
    return asset;
  }

  if (mustUse === true) {
    asset.mustUse = true;
    asset.avoid = undefined;
  } else if (mustUse === false) {
    asset.mustUse = undefined;
  }

  if (avoid === true) {
    asset.avoid = true;
    asset.mustUse = undefined;
  } else if (avoid === false) {
    asset.avoid = undefined;
  }

  return asset;
}

// Add a push-in zoom over a span of the source timeline.
export function addZoom(
  project: Project,
  input: {
    fromSec: number;
    toSec: number;
    scale?: number;
    rampSec?: number;
    note?: string;
    anchor?: PhraseAnchor;
  }
): Zoom {
  const { fromSec, toSec, scale = 1.15, rampSec = 0.6, note, anchor } = input;
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
    ...(note === undefined ? {} : { note }),
    ...(anchor === undefined ? {} : { anchor }),
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
    note?: string;
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
  patchNote(item, patch.note);
  return item;
}

// Move an item to a new index within its track, preserving the others' order.
// Overlay paint order is array order (later items paint on top), so this is how
// a dnd-kit track : or the CLI : restacks b-roll covers, titles, or zooms.
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

// `summarize` and its `ProjectSummary` type now live in the client-safe leaf
// summary.ts (the GUI imports them on the client; keeping them here would drag
// this module's server-only graphics catalog into the browser bundle). Re-export
// so every server caller that imports them from actions.ts keeps working.
// biome-ignore lint/performance/noBarrelFile: intentional back-compat re-export of the summarize/ProjectSummary leaf so existing server callers don't all have to repoint to ./summary.ts
export { type ProjectSummary, summarize } from "./summary.ts";
