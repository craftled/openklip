// Pure edit primitives over a Project (the EDL). No file IO, no ffmpeg; every
// function here mutates the passed Project and returns it (or a small result),
// so the CLI and the GUI operate on the SAME project.json shape (parity). These
// are the operations an external coding agent drives from the terminal.

import { randomUUID } from "node:crypto";
import { isNeutralColor } from "./color-adjust.ts";
import {
  type Broll,
  type ColorAdjust,
  ColorAdjustSchema,
  type CutSnap,
  CutSnapSchema,
  type Filter,
  type Graphic,
  type Motion,
  type PhraseAnchor,
  type Project,
  SAMPLE_RATE,
  type Still,
  type Title,
  type Zoom,
} from "./edl.ts";
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
    fromSec: number;
    toSec: number;
    srcInSec?: number;
    note?: string;
    anchor?: PhraseAnchor;
  }
): Broll {
  const { assetId, fromSec, toSec, srcInSec = 0, note, anchor } = input;
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
function resolveGraphicTemplate(template: string): void {
  const known = listGraphics();
  if (!known.some((g) => g.id === template)) {
    const list = known.map((g) => g.id).join(", ") || "(none)";
    throw new Error(
      `unknown graphic template "${template}". Available: ${list}`
    );
  }
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
  resolveGraphicTemplate(template);
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
  const merged = {
    ...defaultGraphicParams(loadGraphicManifest(template)),
    ...(params ?? {}),
  };
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
  resolveGraphicTemplate(template);
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
          ...defaultGraphicParams(loadGraphicManifest(template)),
          ...item.params,
        };
  item.template = template;
  item.params = { ...base, ...(patch.params ?? {}) };
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

// Apply picture look flags and filters.
export function setLook(
  project: Project,
  input: {
    vignette?: boolean;
    filter?: Filter;
    lut?: string | null;
    color?: Partial<ColorAdjust>;
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
