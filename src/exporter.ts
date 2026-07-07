import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { mapWithConcurrency } from "./async-pool.ts";
import { loadAudioAnalysis } from "./audio-analysis.ts";
import {
  type BrollAudioFilterGraph,
  buildBrollAudioFilterGraph,
  buildBrollAudioMixParts,
  hasBrollAudio,
} from "./broll-audio.ts";
import { buildBrollOverlayFilters } from "./broll-display.ts";
import { captionStyle } from "./caption-styles.ts";
import {
  buildAss,
  captionPlacementForSpan,
  groupCaptions,
  keptWordsInOutputTime,
  type TitleSpan,
} from "./captions.ts";
import { colorAdjustFilter } from "./color-adjust.ts";
import { buildTransitionGateFromProject } from "./cut-transition-gate.ts";
import {
  type Asset,
  type Audio,
  type Broll,
  type BrollDisplay,
  type CutSnap,
  type CutTransitionType,
  type ExportAspect,
  type ExportCrop,
  ExportSettingsSchema,
  intersectRangesWithSpan,
  type MusicPlacement,
  type Project,
  ProjectSchema,
  type Range,
  rangesForExport,
  SAMPLE_RATE,
  sec,
  sourceToOutputSec,
  type Title,
  totalDurationSec,
} from "./edl.ts";
import {
  buildReframeFilter,
  normalizeExportCrop,
  resolveExportDimensions,
} from "./export-aspect.ts";
import {
  buildVerticalSplitFilter,
  normalizeSplitVertical,
} from "./export-layout.ts";
import {
  type ExportPlatformId,
  resolvePlatformOptions,
} from "./export-platforms.ts";
import {
  buildSegmentAudioConcatFilter,
  buildSegmentInputArgs,
  buildSegmentVideoConcatFilter,
  buildSegmentVideoTransitionFilter,
  type CutTransitionFallbackReason,
  cutTransitionFallbackReason,
  overlayInputBase,
  shouldApplyCutTransition,
  shouldUseSegmentExport,
} from "./export-segments.ts";
import { FFMPEG, probe, run } from "./ffmpeg.ts";
import { filterChain } from "./filter.ts";
import { clampGifDimensions, GIF_MAX_DURATION_SEC } from "./gif-export.ts";
import { enrichGraphicParamsWithImage } from "./graphic-image.ts";
import { renderGraphicOverlay } from "./graphic-render.ts";
import {
  defaultGraphicParams,
  type GraphicManifest,
  loadGraphicManifest,
} from "./graphics.ts";
import {
  jsonRenderCatalogDef,
  validateJsonRenderSpec,
} from "./json-render-catalogs.ts";
import { buildStillZoompan } from "./ken-burns.ts";
import {
  analyzeLoudnormPass,
  buildTwoPassLoudnormFilter,
  type LoudnormMeasured,
} from "./loudnorm-two-pass.ts";
import { lut3dExpr, lutPath } from "./lut.ts";
import { projectPaths } from "./paths.ts";
import type { SourceMediaKind } from "./source-media.ts";
import { resolveSourceMediaStatus } from "./source-media.ts";
import { buildTitlesAss, type TitleItem } from "./titles.ts";
import { buildZoompanZExpr, type ZoomWindow } from "./zoom-ramp.ts";

// Canonical export-settings vocabulary. The GUI dialog, CLI flags, HTTP route,
// and MCP tool all consume these so every surface stays in lockstep with the
// encoder. "social" pins the pre-settings encoder defaults, so an export with
// no compression choice renders with exactly the historical args.
export const EXPORT_COMPRESSIONS = [
  "studio",
  "social",
  "web",
  "web-low",
] as const;

export type ExportCompression = (typeof EXPORT_COMPRESSIONS)[number];

// Output container/format. "mp4" (default) is the historical, unchanged
// render path. "gif" renders the identical mp4 first, then converts that mp4
// into a sibling .gif via a second ffmpeg pass (palettegen/paletteuse), and
// deletes the intermediate mp4 so exactly one deliverable remains.
export const EXPORT_FORMATS = ["mp4", "gif"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// biome-ignore lint/performance/noBarrelFile: re-export gif caps for CLI/MCP/export route parity without widening the exporter import graph
export {
  clampGifDimensions,
  GIF_MAX_DURATION_SEC,
  GIF_MAX_FPS,
  GIF_MAX_WIDTH_OVERRIDE_CEILING_PX,
  GIF_MAX_WIDTH_PX,
} from "./gif-export.ts";

export const DEFAULT_GRAPHIC_RENDER_CONCURRENCY = 1;
export const MAX_GRAPHIC_RENDER_CONCURRENCY = 8;

export function resolveGraphicRenderConcurrency(
  raw = process.env.OPENKLIP_GRAPHIC_RENDER_CONCURRENCY
): number {
  if (raw === undefined) {
    return DEFAULT_GRAPHIC_RENDER_CONCURRENCY;
  }
  const value = raw.trim();
  const n = Number(value);
  if (
    value.length === 0 ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > MAX_GRAPHIC_RENDER_CONCURRENCY
  ) {
    throw new Error(
      `OPENKLIP_GRAPHIC_RENDER_CONCURRENCY must be an integer between 1 and ${MAX_GRAPHIC_RENDER_CONCURRENCY}`
    );
  }
  return n;
}

export interface ExportOptions {
  /** Output aspect for this export; defaults to project.export then platform. */
  aspect?: ExportAspect;
  compression?: ExportCompression; // libx264 preset/CRF bundle; default "social"
  /** Manual reframe crop for this export; merges over project.export.crop. */
  crop?: Partial<ExportCrop>;
  /** Output container; default "mp4". "gif" has no audio track. */
  format?: ExportFormat;
  fps?: number; // output frame rate; default = rounded source rate
  /**
   * Overrides GIF_MAX_WIDTH_PX (960) for this export's GIF-specific second
   * pass only; ignored for format "mp4". Clamped to
   * GIF_MAX_WIDTH_OVERRIDE_CEILING_PX (1920) regardless of the value
   * requested; omitted, the export uses the GIF_MAX_WIDTH_PX default.
   * Bounds are enforced by each surface (CLI/route/action/MCP) before this,
   * matching how fps/maxHeight bounds are enforced today.
   */
  gifMaxWidth?: number;
  /**
   * When false, skip loudness normalization for this export even when a
   * platform preset or project.audio.loudness would otherwise apply.
   */
  loudnessNormalize?: boolean;
  /**
   * Export-invocation-only loudness normalization target (LUFS, -30..-10).
   * Applies loudnorm at this target for THIS export regardless of the
   * project's saved audio.loudness setting; never mutates the project.
   * Bounds are enforced by each surface (CLI/route/action/MCP), matching
   * how fps/maxHeight bounds are enforced today.
   */
  loudnessTargetLufs?: number;
  maxHeight?: number; // e.g. 1080 -> downscale output (and speed up filtering/encode)
  /** Final output path; defaults to output/out.mp4. */
  outPath?: string;
  /**
   * Destination preset (see export-platforms.ts) that fills any of the
   * fields above left unset by the caller. Explicit fields always win over
   * the platform's defaults; resolved once at the top of exportCut.
   */
  platform?: ExportPlatformId;
  /** Source-time window for a partial export (e.g. one highlight clip). */
  sourceSpan?: { fromSec: number; toSec: number };
}

// libx264 args per compression preset. Pure so tests pin the mapping; CRF must
// stay strictly ordered studio < social < web < web-low.
export function encoderArgsFor(compression?: ExportCompression): string[] {
  switch (compression) {
    case "studio":
      return ["-preset", "slow", "-crf", "16"];
    case "web":
      return ["-preset", "medium", "-crf", "23"];
    case "web-low":
      return ["-preset", "fast", "-crf", "28"];
    default:
      return ["-preset", "medium", "-crf", "18"];
  }
}

// The ONE resolved output rate: an explicit request (>= 1) wins, otherwise the
// rounded source rate. Every fps consumer in exportCut (stills, rich graphics,
// zoompan, retime filter) must use this value.
export function resolveOutputFps(
  sourceFps: number,
  requested?: number
): number {
  if (requested !== undefined && requested >= 1) {
    return Math.round(requested);
  }
  return Math.max(1, Math.round(sourceFps));
}

// The ",fps=N" retime for the base [0:v] chain, inserted immediately after
// setpts (before scale/overlays) so overlay enable windows stay in output
// seconds. The output rate is ALWAYS pinned explicitly, source passthrough
// included: setpts=N/FRAME_RATE/TB depends on frame-rate metadata surviving
// the select filter, and that propagation is ffmpeg-build-dependent (the
// Linux ffmpeg-static build drops it and falls back to 25 fps, silently
// exporting a 30 fps source at 25; caught by CI probing the smoke export).
// Pinning also makes an explicit request on a fractional source a true
// retime: requesting 30 on a 29.97 source yields exactly 30.
export function fpsFilterFor(sourceFps: number, requested?: number): string {
  return `,fps=${resolveOutputFps(sourceFps, requested)}`;
}

// Parse the CLI `--fps` flag value with the same bounds the HTTP route and MCP
// tool enforce (integer 1-120, documented in AGENTS.md). Lives here rather
// than cli.ts because cli.ts runs its command switch at module scope and
// cannot be imported by tests.
export function parseExportFpsFlag(raw: string): number {
  const fps = Number(raw);
  if (!(Number.isInteger(fps) && fps >= 1 && fps <= 120)) {
    throw new Error("--fps must be an integer between 1 and 120");
  }
  return fps;
}

// Parse the CLI `--loudness` flag value against the same -30..-10 LUFS bounds
// enforced by setAudio (actions.ts's clampNum(-30, -10)) and the AudioSchema
// (edl.ts's z.number().min(-30).max(-10)). Lives here rather than cli.ts for
// the same reason as parseExportFpsFlag: cli.ts runs its command switch at
// module scope and cannot be imported by tests.
export function parseExportLoudnessFlag(raw: string): number | "off" {
  if (raw === "off") {
    return "off";
  }
  const lufs = Number(raw);
  if (!(Number.isFinite(lufs) && lufs >= -30 && lufs <= -10)) {
    throw new Error('--loudness must be "off" or a number between -30 and -10');
  }
  return lufs;
}

export interface InputChoice {
  kind: "original" | "proxy";
  path: string;
}

function projectRelativePath(projectDir: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(projectDir, filePath);
}

export function chooseSourceInput(input: {
  dir: string;
  proxy: string;
  source: string;
}): InputChoice {
  const status = resolveSourceMediaStatus(input);
  if (status.kind === "missing") {
    throw new Error(status.warn ?? `missing source video: ${input.source}`);
  }
  return { kind: status.kind, path: status.path };
}

/** Fail export before ffmpeg when any json-render overlay has an invalid spec. */
export function assertJsonRenderGraphicsExportable(project: Project): void {
  for (const g of project.graphics ?? []) {
    if ((g.type ?? "template") !== "json-render") {
      continue;
    }
    if (!g.catalog) {
      throw new Error(
        `cannot export: json-render graphic "${g.id}" is missing a catalog`
      );
    }
    const validation = validateJsonRenderSpec(g.catalog, g.spec);
    if (validation.success && validation.spec) {
      continue;
    }
    const issue = validation.issues[0] ?? "validation failed";
    throw new Error(
      `cannot export: json-render graphic "${g.id}" has an invalid spec (${issue})`
    );
  }
}

export function chooseAssetInput(
  projectDir: string,
  asset: Asset
): InputChoice {
  if (existsSync(asset.src)) {
    return { kind: "original", path: asset.src };
  }
  const proxy = projectRelativePath(projectDir, asset.proxy);
  if (existsSync(proxy)) {
    return { kind: "proxy", path: proxy };
  }
  // Name the asset's kind: this resolver serves b-roll, music, and stills.
  throw new Error(
    `missing ${asset.kind ?? "broll"} asset "${asset.id}": ${asset.src}. Also could not find proxy fallback: ${proxy}`
  );
}

// keptWordsInOutputTime now lives in src/captions.ts (R1): one shared
// implementation with src/compiledTimeline.ts, matching words to ranges by
// OVERLAP so snap/dead-air boundary shifts cannot drop a playing word's
// caption.

function escapeAssPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export interface BrollPlan {
  audioMode: Broll["audioMode"];
  display: BrollDisplay;
  inputIndex: number;
  outEnd: number;
  outStart: number;
  srcInSec: number;
  srcPath: string;
}

export function planBrollForRanges(input: {
  broll: Broll;
  firstInputIndex: number;
  ranges: Range[];
  sampleRate: number;
  srcPath: string;
}): BrollPlan[] {
  const startSec = input.broll.startSample / input.sampleRate;
  const endSec = input.broll.endSample / input.sampleRate;
  const baseSrcInSec = input.broll.srcInSample / input.sampleRate;
  const plans: BrollPlan[] = [];

  for (const range of input.ranges) {
    const segmentStart = Math.max(startSec, range.startSec);
    const segmentEnd = Math.min(endSec, range.endSec);
    if (segmentEnd - segmentStart < 0.05) {
      continue;
    }
    plans.push({
      audioMode: input.broll.audioMode ?? "silent",
      display: input.broll.display ?? "cover",
      inputIndex: input.firstInputIndex + plans.length,
      outStart: sourceToOutputSec(segmentStart, input.ranges),
      outEnd: sourceToOutputSec(segmentEnd, input.ranges),
      srcInSec: baseSrcInSec + (segmentStart - startSec),
      srcPath: input.srcPath,
    });
  }

  return plans;
}

export interface GraphicWindow {
  outEnd: number;
  outStart: number;
}

// Map a graphic overlay's SOURCE-time sample span onto the OUTPUT timeline using
// the SAME sourceToOutputSec machinery as stills/titles. Returns null when the
// surviving window collapses to <= 0.05s (mirrors the still/title guard). Pure
// so the exporter filter-graph test can assert on it without spawning ffmpeg
// (same pattern as planBrollForRanges).
export function planGraphicWindow(input: {
  startSample: number;
  endSample: number;
  sampleRate: number;
  ranges: Range[];
}): GraphicWindow | null {
  const outStart = sourceToOutputSec(
    input.startSample / input.sampleRate,
    input.ranges
  );
  const outEnd = sourceToOutputSec(
    input.endSample / input.sampleRate,
    input.ranges
  );
  if (outEnd - outStart <= 0.05) {
    return null;
  }
  return { outStart, outEnd };
}

export function graphicWindowDurationSamples(
  win: GraphicWindow,
  sampleRate: number
): number {
  return Math.max(1, Math.round((win.outEnd - win.outStart) * sampleRate));
}

// ── Music placement (pure planning seams, no ffmpeg) ────────────────────────

export interface MusicWindow {
  assetDurationSamples: number;
  assetId: string;
  fadeInSec: number;
  fadeOutSec: number;
  gain: number;
  mode: MusicPlacement["mode"];
  outEnd: number;
  outStart: number;
  srcInSec: number;
}

// Map each music placement to ONE CONTINUOUS window on the OUTPUT timeline:
// outStart/outEnd are the output positions of the placement's source span, so
// the bed keeps playing across collapsed cuts instead of restarting per
// surviving range (deliberately unlike planBrollForRanges). Windows shorter
// than 0.05s are dropped; placements whose asset is missing or not kind
// "music" are skipped (mirrors the b-roll/still guards in exportCut).
export function planMusicWindows(input: {
  assets: Asset[];
  music: MusicPlacement[];
  ranges: Range[];
  sampleRate: number;
}): MusicWindow[] {
  const assetById = new Map(input.assets.map((a) => [a.id, a]));
  const windows: MusicWindow[] = [];
  for (const m of input.music) {
    const asset = assetById.get(m.assetId);
    if (asset?.kind !== "music") {
      continue;
    }
    const outStart = sourceToOutputSec(
      m.startSample / input.sampleRate,
      input.ranges
    );
    const outEnd = sourceToOutputSec(
      m.endSample / input.sampleRate,
      input.ranges
    );
    if (outEnd - outStart < 0.05) {
      continue;
    }
    windows.push({
      assetDurationSamples: asset.durationSamples,
      assetId: m.assetId,
      fadeInSec: m.fadeInSec,
      fadeOutSec: m.fadeOutSec,
      gain: m.gain,
      mode: m.mode,
      outEnd,
      outStart,
      srcInSec: (m.srcInSample ?? 0) / input.sampleRate,
    });
  }
  return windows;
}

export interface MusicFilterGraph {
  filterParts: string[];
  inputArgs: string[];
  mixInputLabels: string[];
}

// Render each music window into one ffmpeg audio chain on its own `-i` input:
// aresample to the 48 kHz project grid -> (aloop for loop mode) -> atrim ->
// asetpts -> volume -> optional fades -> adelay to its output start, labelled
// [mN] for the final amix. Pure string building so tests pin the chains
// without spawning ffmpeg.
export function buildMusicFilterParts(
  windows: Array<MusicWindow & { srcPath: string }>,
  opts: { firstInputIndex: number }
): MusicFilterGraph {
  const filterParts: string[] = [];
  const inputArgs: string[] = [];
  const mixInputLabels: string[] = [];
  windows.forEach((w, i) => {
    const inputIndex = opts.firstInputIndex + i;
    const dur = w.outEnd - w.outStart;
    const chain: string[] = [];
    // Resample FIRST: assetDurationSamples sits on the 48 kHz project grid,
    // but chooseAssetInput prefers the original file (44.1 kHz mp3, 96 kHz
    // wav, ...), and aloop's size counts samples at the input's native rate.
    // Without this, loop mode loops the wrong span for non-48k sources.
    chain.push(`aresample=${SAMPLE_RATE}`);
    if (w.mode === "loop") {
      chain.push(`aloop=loop=-1:size=${w.assetDurationSamples}`);
    }
    chain.push(`atrim=start=${sec(w.srcInSec)}:duration=${sec(dur)}`);
    chain.push("asetpts=PTS-STARTPTS");
    chain.push(`volume=${w.gain.toFixed(6)}`);
    if (w.fadeInSec > 0) {
      chain.push(`afade=t=in:st=0:d=${sec(w.fadeInSec)}`);
    }
    if (w.fadeOutSec > 0) {
      chain.push(
        `afade=t=out:st=${sec(Math.max(0, dur - w.fadeOutSec))}:d=${sec(w.fadeOutSec)}`
      );
    }
    // all=1 delays every channel; the pipe form (ms|ms) covers only the first
    // two, so a >2-channel source would start channels 3+ at t=0.
    const delayMs = Math.max(0, Math.round(w.outStart * 1000));
    chain.push(`adelay=${delayMs}:all=1`);
    inputArgs.push("-i", w.srcPath);
    filterParts.push(`[${inputIndex}:a]${chain.join(",")}[m${i}]`);
    mixInputLabels.push(`m${i}`);
  });
  return { filterParts, inputArgs, mixInputLabels };
}

// ── Seam declick / crossfade (Milestone 4.2 D2) ─────────────────────────────

export function voiceAffixes(audio?: Audio): {
  highpassSuffix: string;
  noiseSuffix: string;
  deesserSuffix: string;
} {
  const highpassHz = audio?.voiceHighpass?.enabled
    ? audio.voiceHighpass.hz
    : undefined;
  const highpassSuffix =
    highpassHz && highpassHz > 0 ? `,highpass=f=${highpassHz}` : "";
  const noiseSuffix = audio?.noiseReduction?.enabled
    ? `,afftdn=nr=${audio.noiseReduction.nr}`
    : "";
  // De-essing runs last: highpass removes rumble, afftdn cleans broadband
  // noise, and only then does the deesser work on the already-cleaned
  // signal. `f` (frequency) and `s` (output mode) are hardcoded to the
  // filter's own defaults (0.5, o) rather than exposed as user knobs.
  const deesserIntensity = audio?.deEsser?.enabled
    ? audio.deEsser.intensity
    : undefined;
  const deesserSuffix =
    deesserIntensity && deesserIntensity > 0
      ? `,deesser=i=${deesserIntensity}`
      : "";
  return { highpassSuffix, noiseSuffix, deesserSuffix };
}

export interface SeamedVoiceOpts {
  /** cuts.snap.crossfadeMs (0-100ms schema range). */
  crossfadeMs: number;
  /** audio.deEsser.intensity when de-essing is enabled. */
  deesserIntensity?: number;
  /** audio.voiceHighpass.hz, present only when the highpass is enabled. */
  highpassHz?: number;
  /** audio.noiseReduction.nr when noise reduction is enabled. */
  noiseNr?: number;
}

export interface SeamedVoiceResult {
  filterParts: string[];
  /** The label the LAST filter part writes to; callers rename/consume it. */
  outLabel: string;
}

// Declick the seams a plain `aselect` butt-joins hard: each surviving range
// becomes its own `atrim` segment off [0:a], chained pairwise through
// `acrossfade`. Every INTERNAL edge (not the very first start or very last
// end) borrows crossfadeMs/2 of already-deleted source material on each side,
// so the crossfade "spends" material that would otherwise be discarded rather
// than eating into a kept range.
//
// Duration invariant (MUST hold, smoke-tested within 20ms in exporter.test.ts):
// acrossfade always shortens its two inputs' combined duration by exactly its
// `d`. Each seam's total extension (half borrowed by the trailing segment +
// half borrowed by the leading segment) is built to equal that seam's `d`
// exactly, so every acrossfade's shortening is offset by the extension that
// fed it and the chained total duration equals the plain aselect duration to
// the sample, regardless of how many seams clamp short.
//
// Clamping: a seam's available "gap" is the deleted span between the two
// ranges it joins, and its `d` must also fit inside BOTH adjacent segments.
// `d = min(crossfadeMs/1000, gap, leftRangeLen, rightRangeLen)`, split
// evenly, so the borrowed material never crosses into the ranges either side
// of the gap (acrossfade `d` varies per seam as a result - this is expected).
// R3 (ffmpeg-verified): the range-length clamps matter because acrossfade
// with an INPUT shorter than `d` exits 0 but produces EMPTY or truncated
// audio (a silent voice track or dropped audio + A/V desync), and snapRanges
// can legitimately shrink an edge range below crossfadeMs/2. Raw range length
// is a safe lower bound for both inputs: a segment's duration is its range
// length plus borrowed extensions (>= range length), and the accumulated left
// chain never gets shorter than its most recent segment (each crossfade
// yields a + b - d >= max(a, b) when d <= min(a, b)).
//
// Zero-gap / sub-4ms fallback: when two ranges are effectively adjacent
// (gap ~ 0), or the clamped `d` would fall under 4ms (too short for a useful
// crossfade), there is no material worth borrowing, so extending either side
// would eat into a kept range for no audible benefit. Falls back to a
// duration-preserving butt join instead: an 8ms qsin fade-out on the trailing
// segment's own tail, an 8ms qsin fade-in on the leading segment's own head
// (fades only reshape existing samples, they never add or remove any), then a
// hard `concat`. No material is borrowed, so duration is preserved by
// construction.
const MIN_CROSSFADE_SEC = 0.004;

export function buildSeamedVoiceParts(
  ranges: Range[],
  opts: SeamedVoiceOpts
): SeamedVoiceResult {
  const hp = opts.highpassHz;
  const noiseNr = opts.noiseNr;
  const deesserIntensity = opts.deesserIntensity;
  const affixParts: string[] = [];
  if (hp && hp > 0) {
    affixParts.push(`highpass=f=${hp}`);
  }
  if (noiseNr && noiseNr > 0) {
    affixParts.push(`afftdn=nr=${noiseNr}`);
  }
  // Same order as voiceAffixes: highpass, then noise reduction, then
  // de-essing last so it works on the already-cleaned signal.
  if (deesserIntensity && deesserIntensity > 0) {
    affixParts.push(`deesser=i=${deesserIntensity}`);
  }
  const prefix = affixParts.length > 0 ? `${affixParts.join(",")},` : "";
  const BUTT_FADE_SEC = 0.008;

  if (ranges.length === 0) {
    return { filterParts: [], outLabel: "" };
  }

  const seamCount = ranges.length - 1;
  const seams = Array.from({ length: seamCount }, (_, i) => {
    const gap = Math.max(0, ranges[i + 1].startSec - ranges[i].endSec);
    const leftLen = ranges[i].endSec - ranges[i].startSec;
    const rightLen = ranges[i + 1].endSec - ranges[i + 1].startSec;
    const clamped = Math.min(
      Math.max(0, opts.crossfadeMs) / 1000,
      gap,
      leftLen,
      rightLen
    );
    // Under 4ms: route this seam through the butt-join branch (d === 0)
    // rather than an acrossfade too short to declick anything.
    const d = clamped < MIN_CROSSFADE_SEC ? 0 : clamped;
    return { d, ext: d / 2 };
  });

  const filterParts: string[] = [];
  const segLabels: string[] = [];
  const segDurations: number[] = [];
  ranges.forEach((r, i) => {
    const extBefore = i === 0 ? 0 : seams[i - 1].ext;
    const extAfter = i === seamCount ? 0 : seams[i].ext;
    const start = r.startSec - extBefore;
    const end = r.endSec + extAfter;
    const label = `av${i}`;
    filterParts.push(
      `[0:a]${prefix}atrim=start=${sec(start)}:end=${sec(end)},asetpts=PTS-STARTPTS[${label}]`
    );
    segLabels.push(label);
    segDurations.push(end - start);
  });

  let accLabel = segLabels[0];
  let accDuration = segDurations[0];
  for (let i = 0; i < seamCount; i++) {
    const seam = seams[i];
    const nextLabel = segLabels[i + 1];
    const nextDuration = segDurations[i + 1];
    const outLabel = `avseam${i}`;
    if (seam.d > 0) {
      filterParts.push(
        `[${accLabel}][${nextLabel}]acrossfade=d=${sec(seam.d)}:c1=qsin:c2=qsin[${outLabel}]`
      );
      accDuration = accDuration + nextDuration - seam.d;
    } else {
      const leftFadeDur = Math.min(BUTT_FADE_SEC, accDuration);
      const rightFadeDur = Math.min(BUTT_FADE_SEC, nextDuration);
      const leftFaded = `${accLabel}fo`;
      const rightFaded = `${nextLabel}fi`;
      filterParts.push(
        `[${accLabel}]afade=t=out:st=${sec(Math.max(0, accDuration - leftFadeDur))}:d=${sec(leftFadeDur)}:curve=qsin[${leftFaded}]`
      );
      filterParts.push(
        `[${nextLabel}]afade=t=in:st=0.000000:d=${sec(rightFadeDur)}:curve=qsin[${rightFaded}]`
      );
      filterParts.push(
        `[${leftFaded}][${rightFaded}]concat=n=2:v=0:a=1[${outLabel}]`
      );
      accDuration += nextDuration;
    }
    accLabel = outLabel;
  }

  return { filterParts, outLabel: accLabel };
}

// Whether buildAudioParts should route the voice through buildSeamedVoiceParts
// instead of the plain aselect line. A single surviving range has no seam to
// declick, and a zero crossfade is an explicit opt-out.
export function shouldUseSeamedVoice(
  ranges: Range[],
  snap: CutSnap | undefined
): boolean {
  return Boolean(snap?.enabled && snap.crossfadeMs > 0 && ranges.length > 1);
}

// amountDb (1-30, AudioSchema bound) -> sidechaincompress ratio. Determinism
// over psychoacoustic precision: three bands roughly bracket light/medium/
// heavy ducking so the mapping is a fixed, pinned lookup rather than a
// continuous formula that would drift if the constants ever moved. threshold
// is held constant (a fixed low level so the compressor engages on ordinary
// voice, not just loud peaks); amountDb only steers ratio.
const DUCK_THRESHOLD = "0.02";
function duckRatioFor(amountDb: number): number {
  if (amountDb <= 6) {
    return 4;
  }
  if (amountDb <= 12) {
    return 8;
  }
  return 20;
}

export interface AudioFilterOpts {
  /** project.audio; ducking/loudness/highpass all default to off/absent. */
  audio?: Audio;
  /** B-roll audio chains keyed to the same `-i` indices as the video overlays. */
  brollAudio?: BrollAudioFilterGraph;
  /**
   * Export-invocation-only loudness override (explicit option or a platform
   * preset's targetLufs). When set, loudnorm runs at this target for this
   * export regardless of audio?.loudness?.enabled, and never mutates the
   * project. Undefined leaves audio?.loudness exactly as before.
   */
  loudnessTargetLufs?: number;
  /** Pass-2 measured values when loudness.mode is two-pass. */
  loudnormMeasured?: LoudnormMeasured;
  /** Surviving ranges; required to consider the seam-declick path. */
  ranges?: Range[];
  /** Per-range input seeking (voice-only exports). */
  segmentMode?: boolean;
  segmentRangeCount?: number;
  /** project.cuts.snap; the seam path only engages when this is enabled. */
  snap?: CutSnap;
}

// The audio side of the filtergraph. CRITICAL invariant: with zero music AND
// every audio setting at its default (disabled), the returned lines are
// byte-identical to the historical voice-only / voice+amix chains (tests pin
// this), so an export with no audio-quality opt-in renders exactly as before.
//
// Stage order: voice (aselect or seamed-crossfade) -> optional music mix
// (plain amix, or sidechain ducking then amix when ducking is enabled and
// music is present) -> optional loudnorm as the FINAL stage before [aout].
export function buildAudioParts(
  selectExpr: string,
  music: MusicFilterGraph,
  opts: AudioFilterOpts = {}
): string[] {
  const ranges = opts.ranges ?? [];
  const snap = opts.snap;
  const audio = opts.audio;
  const brollAudio = opts.brollAudio ?? {
    duckBroll: false,
    duckVoice: false,
    filterParts: [],
    mixInputLabels: [],
    replaceWindows: [],
  };
  const hasBrollAudioMix = hasBrollAudio(brollAudio);
  const hasMusic = music.mixInputLabels.length > 0;
  const ducking = Boolean(audio?.ducking?.enabled) && hasMusic;
  const loudnessOverride = opts.loudnessTargetLufs;
  const loudness =
    loudnessOverride !== undefined || Boolean(audio?.loudness?.enabled);
  const useSeams = shouldUseSeamedVoice(ranges, snap);
  const affixes = voiceAffixes(audio);

  const parts: string[] = [];
  // isTerminalVoice: nothing downstream of the voice stage runs, so it can
  // write directly to [aout] and stay byte-identical to the historical
  // zero-music, zero-settings line (both the zero-music and with-music pins
  // depend on this exact label choice; see the byte-parity tests).
  const isTerminalVoice = !(hasMusic || loudness || hasBrollAudioMix);
  const voiceLabel = isTerminalVoice ? "aout" : "avoice";

  if (opts.segmentMode && opts.segmentRangeCount) {
    parts.push(
      buildSegmentAudioConcatFilter({
        rangeCount: opts.segmentRangeCount,
        highpassSuffix: affixes.highpassSuffix,
        noiseSuffix: affixes.noiseSuffix,
        deesserSuffix: affixes.deesserSuffix,
        outputLabel: voiceLabel,
      })
    );
  } else if (useSeams) {
    // Seam highpass/noise/deesser are threaded through buildSeamedVoiceParts's
    // own options (applied before each atrim, ahead of the crossfades).
    const seam = buildSeamedVoiceParts(ranges, {
      crossfadeMs: (snap as CutSnap).crossfadeMs,
      highpassHz: audio?.voiceHighpass?.enabled
        ? audio.voiceHighpass.hz
        : undefined,
      noiseNr: audio?.noiseReduction?.enabled
        ? audio.noiseReduction.nr
        : undefined,
      deesserIntensity: audio?.deEsser?.enabled
        ? audio.deEsser.intensity
        : undefined,
    });
    parts.push(...seam.filterParts, `[${seam.outLabel}]anull[${voiceLabel}]`);
  } else {
    parts.push(
      `[0:a]aselect='${selectExpr}',asetpts=N/SR/TB${affixes.highpassSuffix}${affixes.noiseSuffix}${affixes.deesserSuffix}[${voiceLabel}]`
    );
  }

  parts.push(...brollAudio.filterParts);

  let mixedLabel = voiceLabel;
  if (hasBrollAudioMix) {
    const brollOutLabel = hasMusic || loudness || ducking ? "abmix" : "aout";
    parts.push(
      ...buildBrollAudioMixParts(voiceLabel, brollAudio, brollOutLabel)
    );
    mixedLabel = brollOutLabel;
  }

  if (hasMusic) {
    parts.push(...music.filterParts);
  }

  const musicMixLabel = mixedLabel;
  if (hasMusic && ducking) {
    const mmixLabel =
      music.mixInputLabels.length === 1 ? music.mixInputLabels[0] : "mmix";
    if (music.mixInputLabels.length > 1) {
      parts.push(
        `${music.mixInputLabels.map((l) => `[${l}]`).join("")}amix=inputs=${music.mixInputLabels.length}:duration=first:normalize=0[mmix]`
      );
    }
    parts.push(`[${musicMixLabel}]asplit=2[avmain][avsc]`);
    const duck = (audio as Audio).ducking;
    const ratio = duckRatioFor(duck.amountDb);
    parts.push(
      `[${mmixLabel}][avsc]sidechaincompress=threshold=${DUCK_THRESHOLD}:ratio=${ratio}:attack=${duck.attackMs}:release=${duck.releaseMs}:makeup=1[mduck]`
    );
    const finalLabel = loudness ? "apreln" : "aout";
    parts.push(
      `[avmain][mduck]amix=inputs=2:duration=first:normalize=0[${finalLabel}]`
    );
    mixedLabel = finalLabel;
  } else if (hasMusic) {
    const finalLabel = loudness ? "apreln" : "aout";
    parts.push(
      `[${musicMixLabel}]${music.mixInputLabels.map((l) => `[${l}]`).join("")}amix=inputs=${1 + music.mixInputLabels.length}:duration=first:normalize=0[${finalLabel}]`
    );
    mixedLabel = finalLabel;
  }

  if (loudness) {
    const targetLufs = loudnessOverride ?? (audio as Audio).loudness.targetLufs;
    const mode = (audio as Audio).loudness.mode ?? "single";
    if (mode === "two-pass") {
      if (opts.loudnormMeasured) {
        parts.push(
          buildTwoPassLoudnormFilter({
            inputLabel: mixedLabel,
            measured: opts.loudnormMeasured,
            outputLabel: "aout",
            sampleRate: SAMPLE_RATE,
            targetLufs,
          })
        );
      } else {
        parts.push(`[${mixedLabel}]anull[apreln]`);
      }
    } else {
      parts.push(
        `[${mixedLabel}]loudnorm=I=${targetLufs}:TP=-1.5:LRA=11,aformat=sample_rates=${SAMPLE_RATE}[aout]`
      );
    }
  }

  return parts;
}

export async function exportCut(
  slug: string,
  opts: ExportOptions = {}
): Promise<{
  out: string;
  durationSec: number;
  ranges: number;
  captions: boolean;
  broll: number;
  stills: number;
  zooms: number;
  titles: number;
  graphics: number;
  music: number;
  vignette: boolean;
  width: number;
  height: number;
  aspect: ExportAspect;
  fps: number;
  compression: ExportCompression;
  /** Output container actually produced; "mp4" when format was left unset. */
  format: ExportFormat;
  /** Present only when format is "gif": the width/height/fps actually used
   * for the GIF-specific second pass (see GIF_MAX_WIDTH_PX/GIF_MAX_FPS).
   * `capped` is true when these differ from the mp4's width/height/fps
   * above because the export's chosen resolution/rate exceeded the GIF
   * ceiling and was clamped down for this deliverable only. */
  gif?: { capped: boolean; fps: number; height: number; width: number };
  /** Present only when a platform preset was used to resolve this export. */
  platform?: ExportPlatformId;
  /** The effective loudness target when normalization applied this export
   * (project.audio.loudness.enabled, an explicit loudnessTargetLufs, or a
   * platform preset's targetLufs); undefined when no normalization ran. */
  loudnessTargetLufs?: number;
  /** Present when the caller explicitly disabled loudness normalization. */
  loudnessNormalize?: false;
  audio: {
    seams: boolean;
    ducking: boolean;
    loudness: boolean;
    /** Whether VAD-snapped ranges (cuts.snap) actually shaped this export. */
    snapped: boolean;
  };
  /** True when per-range input seeking was used instead of full-source select. */
  segmentMode: boolean;
  /** What happened to project.look.transition for this export. "none" means
   * no transition was requested (the default, no applied/reason noise);
   * otherwise applied reports whether it actually rendered, and reason (only
   * present when applied is false) explains the hard-cut fallback. */
  transition: {
    applied: boolean;
    reason?: CutTransitionFallbackReason;
    type: CutTransitionType;
  };
  /** Which ingest video file was read (original source vs 720p proxy fallback). */
  sourceMedia: SourceMediaKind;
  /** Present when export used proxy because the original source file is missing. */
  sourceMediaWarn?: string;
}> {
  // ONE resolution point: a platform preset only fills gaps left unset by
  // the caller, so every surface (CLI/route/action/MCP) gets platform
  // support just by passing opts.platform through to exportCut.
  const resolved = resolvePlatformOptions(opts.platform, opts);
  const p = projectPaths(slug);
  await mkdir(p.working, { recursive: true });
  await mkdir(p.output, { recursive: true });
  const project = ProjectSchema.parse(
    JSON.parse(await Bun.file(p.project).text())
  );
  const wantsSnap =
    project.cuts?.snap?.enabled && project.cuts.snap.mode === "vad";
  // A failed/missing analysis must never fail the export: fall back to
  // undefined (effectiveRanges treats that as "snap is a no-op") and report
  // the honest outcome via `snapped` below.
  const silences = wantsSnap
    ? await loadAudioAnalysis(slug)
        .then((a) => a.silences)
        .catch(() => undefined)
    : undefined;
  let ranges = rangesForExport(project, silences);
  if (opts.sourceSpan) {
    ranges = intersectRangesWithSpan(
      ranges,
      opts.sourceSpan.fromSec,
      opts.sourceSpan.toSec
    );
  }
  // F10: matches effectiveRanges' own snap gate (project.cuts.snap.enabled &&
  // mode "vad" && silences && silences.length > 0), so `snapped` cannot
  // report true for an analysis that loaded but found nothing to snap onto
  // (an empty silences array is honest "snap did not shape this export").
  const snapped = Boolean(
    wantsSnap && silences !== undefined && silences.length > 0
  );
  if (ranges.length === 0) {
    throw new Error("nothing to export (all words deleted)");
  }
  assertJsonRenderGraphicsExportable(project);
  // GIF-only hard duration ceiling, checked before any ffmpeg pass runs (the
  // mp4 pipeline below is unaffected: this only rejects when format is
  // "gif"). See GIF_MAX_DURATION_SEC above for the reasoning.
  if ((resolved.format ?? "mp4") === "gif") {
    const keptDurationSec = totalDurationSec(ranges);
    if (keptDurationSec > GIF_MAX_DURATION_SEC) {
      throw new Error(
        `gif export is capped at ${GIF_MAX_DURATION_SEC}s of kept duration (this cut keeps ${keptDurationSec.toFixed(1)}s); trim the cut or export as mp4 instead`
      );
    }
  }
  const sr = project.sampleRate;
  const sourceMediaStatus = resolveSourceMediaStatus({
    dir: p.dir,
    proxy: project.proxy,
    source: project.source,
  });
  const sourceInput = chooseSourceInput({
    dir: p.dir,
    proxy: project.proxy,
    source: project.source,
  });
  const sourceMeta =
    sourceInput.kind === "proxy"
      ? await probe(sourceInput.path)
      : { fps: project.fps, height: project.height, width: project.width };

  const projectExport = ExportSettingsSchema.parse(project.export ?? {});
  const aspect = resolved.aspect ?? projectExport.aspect;
  const crop = normalizeExportCrop(
    opts.crop ? { ...projectExport.crop, ...opts.crop } : projectExport.crop
  );
  const exportLayout = projectExport.layout ?? "fill";
  const splitVertical = normalizeSplitVertical(projectExport.splitVertical);
  const { outH, outW } = resolveExportDimensions({
    aspect,
    maxHeight: resolved.maxHeight,
    sourceHeight: sourceMeta.height,
    sourceWidth: sourceMeta.width,
  });

  const selectExpr = ranges
    .map((r) => `between(t,${sec(r.startSec)},${sec(r.endSec)})`)
    .join("+");

  const cutTransition = project.look?.transition ?? {
    type: "none" as const,
    durationMs: 500,
  };
  const transitionGate = buildTransitionGateFromProject(project, ranges);
  const applyTransition = shouldApplyCutTransition(
    cutTransition.type,
    transitionGate
  );
  const segmentMode =
    applyTransition ||
    (shouldUseSegmentExport(transitionGate) &&
      !shouldUseSeamedVoice(ranges, project.cuts.snap));
  const overlayBase = overlayInputBase(segmentMode, ranges.length);

  // b-roll -> output windows
  const assetById = new Map(project.assets.map((a) => [a.id, a]));
  const plans: BrollPlan[] = [];
  for (const b of project.broll ?? []) {
    const asset = assetById.get(b.assetId);
    if (!asset) {
      continue;
    }
    plans.push(
      ...planBrollForRanges({
        broll: b,
        firstInputIndex: overlayBase + plans.length,
        ranges,
        sampleRate: sr,
        srcPath: chooseAssetInput(p.dir, asset).path,
      })
    );
  }

  // stills -> output windows (Ken Burns push-in over a held image). Each still
  // becomes one extra looped-image input after the b-roll inputs.
  // outFps is the ONE resolved output rate; stills, rich graphics, zoompan, and
  // the base-chain retime below must all read it.
  const outFps = resolveOutputFps(sourceMeta.fps, resolved.fps);
  const stillPlans = (project.stills ?? [])
    .map((s) => {
      const asset = assetById.get(s.assetId);
      if (asset?.kind !== "still") {
        return null;
      }
      const outStart = sourceToOutputSec(s.startSample / sr, ranges);
      const outEnd = sourceToOutputSec(s.endSample / sr, ranges);
      if (outEnd - outStart <= 0.05) {
        return null;
      }
      return {
        outStart,
        outEnd,
        still: s,
        srcPath: chooseAssetInput(p.dir, asset).path,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Still inputs follow the source (0) and all b-roll plan inputs.
    .map((sp, i) => ({ ...sp, inputIndex: overlayBase + plans.length + i }));

  // graphics -> output windows. Each Graphic overlay is rendered through the
  // renderer seam (src/graphic-render.ts) into an overlay asset keyed to its
  // sample range; ffmpeg stays the master compositor.
  //   - kind 'text' -> an ASS burn (combined into one graphics.ass below, exactly
  //     like titles; the seam's per-overlay text path is the unit-testable
  //     surface but the exporter builds the combined file directly for parity
  //     with titles. Keep this duplication, do NOT route text graphics back
  //     through the per-overlay seam or the local/output timebase will mismatch).
  //   - kind 'rich' -> a transparent ProRes MOV composited as one extra input.
  // One planning pass: map each Graphic to its output window + manifest + merged
  // params. NO renderer-seam call here: text graphics are burned directly into
  // the combined graphics.ass below (parity with titles), so only rich graphics
  // pay for a headless render and no wasted per-overlay .ass file is written.
  const graphicsPlanned = (
    await Promise.all(
      (project.graphics ?? []).map(async (g) => {
        const win = planGraphicWindow({
          startSample: g.startSample,
          endSample: g.endSample,
          sampleRate: sr,
          ranges,
        });
        if (!win) {
          return null;
        }
        if (g.type === "json-render") {
          if (!g.catalog) {
            throw new Error(
              `cannot export: json-render graphic "${g.id}" is missing a catalog`
            );
          }
          const catalogDef = jsonRenderCatalogDef(g.catalog);
          const validation = validateJsonRenderSpec(g.catalog, g.spec);
          if (!(validation.success && validation.spec)) {
            const issue = validation.issues[0] ?? "validation failed";
            throw new Error(
              `cannot export: json-render graphic "${g.id}" has an invalid spec (${issue})`
            );
          }
          const manifest: GraphicManifest = {
            id: catalogDef.id,
            name: catalogDef.name,
            kind: "rich",
            width: catalogDef.width,
            height: catalogDef.height,
            fps: catalogDef.fps,
            params: {},
          };
          const emptyParams = {} as Record<string, string | number | boolean>;
          return {
            graphic: g,
            outStart: win.outStart,
            outEnd: win.outEnd,
            durationSamples: graphicWindowDurationSamples(win, sr),
            manifest,
            params: emptyParams,
            compositionHtml: await catalogDef.renderExportHtml(validation.spec),
          };
        }
        const manifest: GraphicManifest = loadGraphicManifest(g.template, {
          slug: project.slug,
        });
        const params = enrichGraphicParamsWithImage(slug, project, g.template, {
          ...defaultGraphicParams(manifest),
          ...g.params,
        });
        return {
          graphic: g,
          outStart: win.outStart,
          outEnd: win.outEnd,
          durationSamples: graphicWindowDurationSamples(win, sr),
          manifest,
          params,
          compositionHtml: undefined,
        };
      })
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  // Text graphics burn as a single combined ASS at OUTPUT time (mirrors titles).
  // A representative accent (first text graphic that sets one) is threaded so the
  // common single-accent case matches the preview's --accent; buildTitlesAss is
  // single-accent per file, so mixed per-item accents would need grouped burns.
  let graphicsAssPath: string | null = null;
  const textGraphics = graphicsPlanned.filter(
    (x) => x.manifest.kind === "text"
  );
  const textGraphicItems: TitleItem[] = textGraphics
    .map((x): TitleItem => {
      const pos = x.params.position;
      const position: Title["position"] =
        pos === "center" ||
        pos === "hero" ||
        pos === "quote" ||
        pos === "divider" ||
        pos === "callout"
          ? pos
          : "lower";
      return {
        text: String(x.params.text ?? x.params.title ?? ""),
        startSec: x.outStart,
        endSec: x.outEnd,
        position,
      };
    })
    .filter((t) => t.text.trim().length > 0 && t.endSec - t.startSec > 0.05);
  if (textGraphicItems.length > 0) {
    const graphicAccent = textGraphics
      .map((x) => x.params.accent)
      .find((a): a is string => typeof a === "string" && a.length > 0);
    graphicsAssPath = `${p.working}/graphics.ass`;
    await Bun.write(
      graphicsAssPath,
      buildTitlesAss(textGraphicItems, {
        width: outW,
        height: outH,
        motion: project.motion,
        accent: graphicAccent,
      })
    );
  }

  // Rich graphics each pay for a headless alpha-MOV render through the seam,
  // keyed by the overlay's UNIQUE id (g.id) so two overlays sharing a template
  // never collide on one file. Input-index invariant: physical -i order is
  // source(0), b-roll plans, stills, THEN rich graphics. The
  // `1 + plans.length + stillPlans.length + j` math MUST match the flatMap append
  // order in the inputs array. This is the single most likely off-by-one bug, so the
  // index math and the append order live together.
  const richRendered = await mapWithConcurrency(
    graphicsPlanned.filter((x) => x.manifest.kind === "rich"),
    resolveGraphicRenderConcurrency(),
    async (x) => {
      const asset = await renderGraphicOverlay({
        manifest: x.manifest,
        id: x.graphic.id,
        template: x.graphic.template,
        slug: project.slug,
        compositionHtml: x.compositionHtml,
        params: x.params,
        keyframes: x.graphic.keyframes,
        durationSamples: x.durationSamples,
        fps: outFps,
        width: outW,
        height: outH,
        outDir: p.working,
      });
      return { ...x, asset };
    }
  );
  const richGraphics = richRendered.map((x, j) => ({
    ...x,
    inputIndex: overlayBase + plans.length + stillPlans.length + j,
  }));

  // music -> ONE continuous output window per placement (the bed keeps playing
  // across collapsed cuts; see planMusicWindows). Music `-i` inputs are
  // appended strictly AFTER the rich-graphic inputs, so their index math never
  // disturbs any video input index above.
  const musicWindows = planMusicWindows({
    assets: project.assets,
    music: project.music ?? [],
    ranges,
    sampleRate: sr,
  });
  const musicGraph = buildMusicFilterParts(
    musicWindows.map((w) => ({
      ...w,
      srcPath: chooseAssetInput(p.dir, assetById.get(w.assetId) as Asset).path,
    })),
    {
      firstInputIndex:
        overlayBase + plans.length + stillPlans.length + richGraphics.length,
    }
  );

  // zooms -> output windows
  const zoomWins = (project.zooms ?? [])
    .map((z) => ({
      os: sourceToOutputSec(z.startSample / sr, ranges),
      oe: sourceToOutputSec(z.endSample / sr, ranges),
      scale: z.scale,
      ramp: Math.max(0.05, z.rampSec),
    }))
    .filter((z) => z.oe - z.os > 0.05);

  // titles -> output time
  let titlesAssPath: string | null = null;
  const titleItems: TitleItem[] = (project.titles ?? [])
    .map((t) => ({
      text: t.text,
      startSec: sourceToOutputSec(t.startSample / sr, ranges),
      endSec: sourceToOutputSec(t.endSample / sr, ranges),
      position: t.position ?? "lower",
    }))
    .filter((t) => t.text.trim().length > 0 && t.endSec - t.startSec > 0.05);
  const titleSpans: TitleSpan[] = titleItems.map(
    ({ startSec, endSec, position }) => ({
      startSec,
      endSec,
      position: position ?? "lower",
    })
  );
  if (titleItems.length > 0) {
    titlesAssPath = `${p.working}/titles.ass`;
    await Bun.write(
      titlesAssPath,
      buildTitlesAss(titleItems, {
        width: outW,
        height: outH,
        motion: project.motion,
      })
    );
  }

  // captions
  let assPath: string | null = null;
  const captionsOn = project.captions?.enabled !== false;
  if (captionsOn) {
    const groups = groupCaptions(
      keptWordsInOutputTime(project, ranges),
      project.captions?.maxWords ?? 6
    );
    if (groups.length > 0) {
      assPath = `${p.working}/captions.ass`;
      await Bun.write(
        assPath,
        buildAss(groups, {
          height: outH,
          insetPlatform:
            outH > outW ? project.captions?.insetPlatform : undefined,
          placement: (_group, span) =>
            captionPlacementForSpan(span.startSec, span.endSec, titleSpans),
          style: captionStyle(project.captions?.style),
          width: outW,
        })
      );
    }
  }

  // ---- filtergraph ----
  const parts: string[] = [];
  const fpsRetime = fpsFilterFor(sourceMeta.fps, resolved.fps);
  if (segmentMode) {
    if (applyTransition) {
      parts.push(
        buildSegmentVideoTransitionFilter({
          durationSec: (cutTransition.durationMs ?? 500) / 1000,
          fpsFilter: fpsRetime,
          ranges,
          transitionType: cutTransition.type,
        })
      );
    } else {
      parts.push(
        buildSegmentVideoConcatFilter({
          rangeCount: ranges.length,
          fpsFilter: fpsRetime,
        })
      );
    }
  } else {
    const base = `[0:v]select='${selectExpr}',setpts=N/FRAME_RATE/TB${fpsRetime}`;
    parts.push(`${base}[vsel]`);
  }
  parts.push(
    buildReframeFilter({
      aspect,
      crop,
      inputLabel: "vsel",
      outputLabel: exportLayout === "split-vertical" ? "v0ref" : "v0",
      outH,
      outW,
      sourceH: sourceMeta.height,
      sourceW: sourceMeta.width,
    })
  );
  if (exportLayout === "split-vertical") {
    parts.push(
      buildVerticalSplitFilter({
        inputLabel: "v0ref",
        outputLabel: "v0",
        outH,
        outW,
        ratio: splitVertical.ratio,
        speakerPosition: splitVertical.speakerPosition,
      })
    );
  }
  let last = "v0";

  if (zoomWins.length > 0) {
    // Animated push-in via zoompan (z is evaluated per output frame, so it can ramp).
    const wins: ZoomWindow[] = zoomWins.map((z) => ({
      startSec: z.os,
      endSec: z.oe,
      scale: z.scale,
      rampSec: z.ramp,
    }));
    const zexpr = buildZoompanZExpr(wins, outFps);
    parts.push(
      `[${last}]zoompan=z='${zexpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${outW}x${outH}:fps=${outFps}[vz]`
    );
    last = "vz";
  }

  for (const pl of plans) {
    parts.push(
      ...buildBrollOverlayFilters({
        display: pl.display,
        inputIndex: pl.inputIndex,
        lastLabel: last,
        outEnd: pl.outEnd,
        outH,
        outStart: pl.outStart,
        outW,
        srcInSec: pl.srcInSec,
      })
    );
    last = `ov${pl.inputIndex}`;
  }

  for (const sp of stillPlans) {
    const dur = sp.outEnd - sp.outStart;
    const zp = buildStillZoompan(
      {
        durationSec: dur,
        scale: sp.still.scale,
        focusX: sp.still.focusX,
        focusY: sp.still.focusY,
      },
      { width: outW, height: outH, fps: outFps }
    );
    parts.push(
      `[${sp.inputIndex}:v]${zp},setpts=PTS-STARTPTS+${sec(sp.outStart)}/TB[sv${sp.inputIndex}]`
    );
    parts.push(
      `[${last}][sv${sp.inputIndex}]overlay=eof_action=pass:enable='between(t,${sec(sp.outStart)},${sec(sp.outEnd)})'[sov${sp.inputIndex}]`
    );
    last = `sov${sp.inputIndex}`;
  }

  // Technical LUT first (e.g. log → Rec.709), then the creative filter on top.
  const lutName = project.look?.lut;
  if (lutName) {
    const lutAbs = lutPath(lutName);
    if (!existsSync(lutAbs)) {
      throw new Error(`LUT not found: ${lutName} (${lutAbs})`);
    }
    parts.push(`[${last}]${lut3dExpr(lutAbs)}[lut]`);
    last = "lut";
  }

  // Built-in filter on the composited picture, just before the vignette
  // so edge darkening sits on top of the look.
  const builtInFilterChain = filterChain(project.look?.filter ?? "none");
  if (builtInFilterChain) {
    parts.push(`[${last}]${builtInFilterChain}[flt]`);
    last = "flt";
  }

  // Continuous color knobs on top of the filter, in the same slot so the look
  // composites filter then fine adjustment.
  const colorChain = colorAdjustFilter(project.look?.color);
  if (colorChain) {
    parts.push(`[${last}]${colorChain}[clr]`);
    last = "clr";
  }

  const vignette = Boolean(project.look?.vignette);
  if (vignette) {
    parts.push(`[${last}]vignette[vig]`);
    last = "vig";
  }

  // Rich graphics sit on top of the filter/vignette, just below the subtitle
  // burns (captions/titles/text-graphics), the same editorial layer as titles. The
  // alpha MOV carries its own duration + transparency, so just PTS-offset to its
  // output start, scale to the frame, and overlay within its enable window
  // (mirrors the still overlay loop above; eof_action=pass like b-roll/stills).
  for (const rg of richGraphics) {
    parts.push(
      `[${rg.inputIndex}:v]setpts=PTS-STARTPTS+${sec(rg.outStart)}/TB,scale=${outW}:${outH}[gv${rg.inputIndex}]`
    );
    parts.push(
      `[${last}][gv${rg.inputIndex}]overlay=eof_action=pass:enable='between(t,${sec(rg.outStart)},${sec(rg.outEnd)})'[gov${rg.inputIndex}]`
    );
    last = `gov${rg.inputIndex}`;
  }

  let vlabel = last;
  if (assPath) {
    parts.push(`[${vlabel}]subtitles='${escapeAssPath(assPath)}'[vcap]`);
    vlabel = "vcap";
  }
  if (titlesAssPath) {
    parts.push(`[${vlabel}]subtitles='${escapeAssPath(titlesAssPath)}'[vtit]`);
    vlabel = "vtit";
  }
  if (graphicsAssPath) {
    parts.push(
      `[${vlabel}]subtitles='${escapeAssPath(graphicsAssPath)}'[vgfx]`
    );
    vlabel = "vgfx";
  }
  parts.push(`[${vlabel}]null[vout]`);
  // Zero music AND every audio setting at its default emits the historical
  // voice-only [aout] line byte-identically; otherwise the voice may route
  // through seam-declick, ducking, and/or loudnorm before landing on [aout].
  const audioSeams = shouldUseSeamedVoice(ranges, project.cuts.snap);
  const audioDucking =
    Boolean(project.audio.ducking.enabled) && musicWindows.length > 0;
  // The effective target for THIS export: an explicit/platform override
  // wins over the project's saved audio.loudness, which never gets touched.
  const effectiveLoudnessTarget =
    resolved.loudnessNormalize === false
      ? undefined
      : (resolved.loudnessTargetLufs ??
        (project.audio.loudness.enabled
          ? project.audio.loudness.targetLufs
          : undefined));
  const audioLoudness = effectiveLoudnessTarget !== undefined;
  const brollAudioGraph = buildBrollAudioFilterGraph(
    plans.map((pl) => ({
      audioMode: pl.audioMode,
      inputIndex: pl.inputIndex,
      outEnd: pl.outEnd,
      outStart: pl.outStart,
      srcInSec: pl.srcInSec,
    }))
  );
  const audioFilterBase = {
    ranges,
    snap: project.cuts.snap,
    audio: project.audio,
    brollAudio: brollAudioGraph,
    loudnessTargetLufs: resolved.loudnessTargetLufs,
    segmentMode,
    segmentRangeCount: segmentMode ? ranges.length : undefined,
  };
  const buildAudioFilterParts = (loudnormMeasured?: LoudnormMeasured) =>
    buildAudioParts(selectExpr, musicGraph, {
      ...audioFilterBase,
      loudnormMeasured,
    });

  const transitionResult: {
    applied: boolean;
    reason?: CutTransitionFallbackReason;
    type: CutTransitionType;
  } =
    cutTransition.type === "none"
      ? { applied: false, type: "none" }
      : {
          applied: applyTransition,
          type: cutTransition.type,
          ...(applyTransition
            ? {}
            : { reason: cutTransitionFallbackReason(transitionGate) }),
        };

  const overlayInputArgs = [
    ...plans.flatMap((pl) => ["-i", pl.srcPath]),
    ...stillPlans.flatMap((sp) => [
      "-loop",
      "1",
      "-t",
      sec(sp.outEnd - sp.outStart),
      "-i",
      sp.srcPath,
    ]),
    ...richGraphics.flatMap((rg) => ["-i", rg.asset.assetPath]),
    ...musicGraph.inputArgs,
  ];

  const useTwoPassLoudnorm =
    audioLoudness &&
    project.audio.loudness.enabled &&
    project.audio.loudness.mode === "two-pass";

  let loudnormMeasured: LoudnormMeasured | undefined;
  if (useTwoPassLoudnorm && effectiveLoudnessTarget !== undefined) {
    const probeWav = join(p.working, `.loudnorm-probe-${process.pid}.wav`);
    const probeParts = [...parts, ...buildAudioFilterParts()];
    const probeInputs = segmentMode
      ? [
          ...buildSegmentInputArgs(ranges, sourceInput.path),
          ...overlayInputArgs,
        ]
      : ["-i", sourceInput.path, ...overlayInputArgs];
    await run(
      FFMPEG,
      [
        "-y",
        ...probeInputs,
        "-filter_complex",
        probeParts.join(";"),
        "-map",
        "[apreln]",
        probeWav,
      ],
      "ffmpeg(loudnorm-probe)"
    );
    loudnormMeasured = await analyzeLoudnormPass(
      probeWav,
      effectiveLoudnessTarget
    );
    try {
      await unlink(probeWav);
    } catch {
      // Best-effort cleanup.
    }
  }

  parts.push(...buildAudioFilterParts(loudnormMeasured));

  const inputs = segmentMode
    ? [...buildSegmentInputArgs(ranges, sourceInput.path), ...overlayInputArgs]
    : ["-i", sourceInput.path, ...overlayInputArgs];
  // Render to unique tmp siblings, then rename only the final deliverable into
  // place on success. ffmpeg writing the public output path in place means a
  // GUI export racing an agent export can corrupt that file. GIF export also
  // needs the intermediate mp4 to stay private until the second pass succeeds.
  const destOut = opts.outPath ?? p.out;
  const destDir = dirname(destOut);
  await mkdir(destDir, { recursive: true });
  const tmpBase = join(
    destDir,
    `.out-tmp-${process.pid}-${Date.now()}-${randomUUID()}`
  );
  const tmpOut = `${tmpBase}.mp4`;
  const tmpGifOut = `${tmpBase}.gif`;
  const effectiveFormat: ExportFormat = resolved.format ?? "mp4";
  const gifOut =
    effectiveFormat === "gif"
      ? destOut.toLowerCase().endsWith(".mp4")
        ? `${destOut.slice(0, -4)}.gif`
        : `${destOut}.gif`
      : undefined;
  const gifDims =
    effectiveFormat === "gif"
      ? clampGifDimensions({
          fps: outFps,
          height: outH,
          maxWidth: resolved.gifMaxWidth,
          width: outW,
        })
      : undefined;
  let finalOut = destOut;
  try {
    await run(
      FFMPEG,
      [
        "-y",
        ...inputs,
        "-filter_complex",
        parts.join(";"),
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        ...encoderArgsFor(resolved.compression),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        tmpOut,
      ],
      "ffmpeg(export)"
    );

    // GIF is a second, independent pass over the just-rendered private mp4:
    // the filter_complex/encode pipeline above never changes for format:
    // "gif", so an mp4 export (the default) is byte-for-byte unaffected by
    // this branch. Reuses the proven palettegen(stats_mode=diff)/paletteuse
    // (dither=bayer) pattern from scripts/record-demo-gif.sh, but clamps its
    // own width/height/fps down to GIF_MAX_WIDTH_PX/GIF_MAX_FPS regardless of
    // what the mp4 above rendered at (outW/outH/outFps are untouched here).
    // GIFs have no audio track; the -vf output here has no audio map, so
    // conversion naturally drops it.
    if (effectiveFormat === "gif" && gifDims) {
      await run(
        FFMPEG,
        [
          "-y",
          "-i",
          tmpOut,
          "-vf",
          `fps=${gifDims.fps},scale=${gifDims.width}:${gifDims.height}:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`,
          "-loop",
          "0",
          tmpGifOut,
        ],
        "ffmpeg(export-gif)"
      );
      await rename(tmpGifOut, gifOut as string);
      try {
        await unlink(tmpOut);
      } catch {
        // Best-effort: the mp4 is only an intermediate once the gif exists.
      }
      finalOut = gifOut as string;
    } else {
      await rename(tmpOut, destOut);
    }
  } catch (e) {
    await Promise.all([
      unlink(tmpOut).catch(() => undefined),
      unlink(tmpGifOut).catch(() => undefined),
    ]);
    throw e;
  }

  return {
    out: finalOut,
    durationSec: totalDurationSec(ranges),
    ranges: ranges.length,
    captions: captionsOn && assPath !== null,
    broll: plans.length,
    stills: stillPlans.length,
    zooms: zoomWins.length,
    titles: titleItems.length,
    graphics: graphicsPlanned.length,
    music: musicWindows.length,
    vignette,
    width: outW,
    height: outH,
    aspect,
    fps: outFps,
    compression: resolved.compression ?? "social",
    format: effectiveFormat,
    gif: gifDims
      ? {
          capped: gifDims.width !== outW || gifDims.fps !== outFps,
          fps: gifDims.fps,
          height: gifDims.height,
          width: gifDims.width,
        }
      : undefined,
    platform: resolved.platform,
    loudnessTargetLufs: effectiveLoudnessTarget,
    ...(resolved.loudnessNormalize === false
      ? { loudnessNormalize: false as const }
      : {}),
    audio: {
      seams: audioSeams,
      ducking: audioDucking,
      loudness: audioLoudness,
      snapped,
    },
    segmentMode,
    transition: transitionResult,
    sourceMedia: sourceMediaStatus.kind,
    ...(sourceMediaStatus.warn === undefined
      ? {}
      : { sourceMediaWarn: sourceMediaStatus.warn }),
  };
}
