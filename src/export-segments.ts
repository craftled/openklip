import type { CutTransitionType, Range } from "./edl.ts";
import { sec, totalDurationSec } from "./edl.ts";

/** Max kept ranges before segment mode falls back to full-source select. */
export const SEGMENT_EXPORT_MAX_RANGES = 30;

/** Short-export kept duration ceiling (seconds). */
export const SEGMENT_EXPORT_MAX_KEPT_SEC = 120;

/** Use segment mode when kept duration is below this fraction of source. */
export const SEGMENT_EXPORT_KEPT_RATIO = 0.5;

/** Range-count ceiling paired with SEGMENT_EXPORT_MAX_KEPT_SEC heuristic. */
export const SEGMENT_EXPORT_SHORT_RANGE_COUNT = 20;

export interface SegmentExportGate {
  hasBroll: boolean;
  hasMusic: boolean;
  hasRichGraphics: boolean;
  hasStills: boolean;
  ranges: Range[];
  sourceDurationSec: number;
}

/** Overlays that force full-source decode (per-range seeking cannot compose these). */
export function requiresFullSourceDecode(gate: {
  hasBroll: boolean;
  hasRichGraphics: boolean;
}): boolean {
  return gate.hasBroll || gate.hasRichGraphics;
}

/** ffmpeg `-i` count for the main source before overlay asset inputs. */
export function segmentSourceInputCount(
  segmentMode: boolean,
  rangeCount: number
): number {
  return segmentMode ? rangeCount : 1;
}

/** First `-i` index for overlay assets (b-roll, stills, rich graphics, music). */
export function overlayInputBase(
  segmentMode: boolean,
  rangeCount: number
): number {
  return segmentSourceInputCount(segmentMode, rangeCount);
}

/** Per-range input seeking avoids decoding the full source for sparse short cuts. */
export function shouldUseSegmentExport(gate: SegmentExportGate): boolean {
  if (gate.ranges.length === 0) {
    return false;
  }
  if (gate.ranges.length > SEGMENT_EXPORT_MAX_RANGES) {
    return false;
  }
  if (requiresFullSourceDecode(gate)) {
    return false;
  }
  const keptSec = totalDurationSec(gate.ranges);
  if (keptSec <= 0 || gate.sourceDurationSec <= 0) {
    return false;
  }
  if (keptSec / gate.sourceDurationSec < SEGMENT_EXPORT_KEPT_RATIO) {
    return true;
  }
  return false;
}

/** ffmpeg input args: one `-ss/-to/-i` triplet per range (input seeking). */
export function buildSegmentInputArgs(
  ranges: Range[],
  sourcePath: string
): string[] {
  const args: string[] = [];
  for (const range of ranges) {
    args.push(
      "-ss",
      sec(range.startSec),
      "-to",
      sec(range.endSec),
      "-i",
      sourcePath
    );
  }
  return args;
}

/** Concat trimmed segment video streams onto one output timeline label. */
export function buildSegmentVideoConcatFilter(input: {
  rangeCount: number;
  fpsFilter: string;
  outputLabel?: string;
}): string {
  const out = input.outputLabel ?? "vsel";
  if (input.rangeCount === 1) {
    return `[0:v]setpts=PTS-STARTPTS${input.fpsFilter}[${out}]`;
  }
  const parts: string[] = [];
  for (let i = 0; i < input.rangeCount; i++) {
    parts.push(`[${i}:v]setpts=PTS-STARTPTS${input.fpsFilter}[vseg${i}]`);
  }
  const labels = Array.from(
    { length: input.rangeCount },
    (_, i) => `[vseg${i}]`
  ).join("");
  parts.push(`${labels}concat=n=${input.rangeCount}:v=1:a=0[${out}]`);
  return parts.join(";");
}

/** Concat trimmed segment audio streams (no seam crossfade). */
export function buildSegmentAudioConcatFilter(input: {
  noiseSuffix?: string;
  outputLabel?: string;
  rangeCount: number;
  highpassSuffix?: string;
  deesserSuffix?: string;
}): string {
  const out = input.outputLabel ?? "avoice";
  const suffix = `${input.highpassSuffix ?? ""}${input.noiseSuffix ?? ""}${input.deesserSuffix ?? ""}`;
  if (input.rangeCount === 1) {
    return `[0:a]asetpts=PTS-STARTPTS${suffix}[${out}]`;
  }
  const parts: string[] = [];
  for (let i = 0; i < input.rangeCount; i++) {
    parts.push(`[${i}:a]asetpts=PTS-STARTPTS${suffix}[aseg${i}]`);
  }
  const labels = Array.from(
    { length: input.rangeCount },
    (_, i) => `[aseg${i}]`
  ).join("");
  parts.push(`${labels}concat=n=${input.rangeCount}:v=0:a=1[${out}]`);
  return parts.join(";");
}

/**
 * Whether a cut transition can be applied to the current export.
 * Transitions need the segment path (voice-only), at least two ranges,
 * and a non-"none" type.
 */
export function shouldApplyCutTransition(
  transitionType: CutTransitionType,
  gate: SegmentExportGate
): boolean {
  if (transitionType === "none") {
    return false;
  }
  if (gate.ranges.length < 2) {
    return false;
  }
  // Transitions are incompatible with b-roll and rich graphics: those paths
  // require full-source decode, so the segment transition chain is unavailable.
  if (requiresFullSourceDecode(gate)) {
    return false;
  }
  if (gate.ranges.length > SEGMENT_EXPORT_MAX_RANGES) {
    return false;
  }
  return true;
}

/**
 * Why a requested (non-"none") transition would fall back to a hard cut,
 * for a gate where shouldApplyCutTransition(type, gate) is false. Mirrors
 * that function's checks in the same order so the reported reason always
 * matches the real cause; undefined means the gate would allow it (only
 * meaningful to call this when the caller already knows type !== "none").
 */
export type CutTransitionFallbackReason =
  | "too-few-ranges"
  | "overlays-present"
  | "too-many-ranges";

export function cutTransitionFallbackReason(
  gate: SegmentExportGate
): CutTransitionFallbackReason | undefined {
  if (gate.ranges.length < 2) {
    return "too-few-ranges";
  }
  if (requiresFullSourceDecode(gate)) {
    return "overlays-present";
  }
  if (gate.ranges.length > SEGMENT_EXPORT_MAX_RANGES) {
    return "too-many-ranges";
  }
  return;
}

/** Human-readable explanation, shared by the CLI export summary and the GUI
 * export toast so the wording stays in one place. */
export function cutTransitionFallbackReasonLabel(
  reason: CutTransitionFallbackReason
): string {
  switch (reason) {
    case "too-few-ranges":
      return "fewer than two kept ranges";
    case "overlays-present":
      return "b-roll or rich graphics present";
    case "too-many-ranges":
      return "too many kept ranges";
    default:
      return "not supported for this export";
  }
}

/**
 * Build a video filter chain that applies a crossfade (xfade) transition
 * between all segment inputs. Each segment must already be prepared as
 * `[vseg0]`, `[vseg1]`, ... by the caller.
 *
 * xfade offset is the time (output seconds) at which the transition starts.
 * For N segments with crossfade duration D:
 *   offset_0 = dur(seg0) - D
 *   offset_k = offset_{k-1} + dur(seg_k) - D
 *
 * (Each xfade "consumes" D seconds from the tail of the left segment and
 * the head of the right segment, so each subsequent xfade offset steps by
 * (dur_k - D) rather than dur_k.)
 */
export function buildSegmentVideoCrossfadeFilter(input: {
  durationSec: number;
  fpsFilter: string;
  outputLabel?: string;
  ranges: Range[];
}): string {
  const { durationSec, fpsFilter, ranges } = input;
  const out = input.outputLabel ?? "vsel";
  const n = ranges.length;
  if (n === 1) {
    return `[0:v]setpts=PTS-STARTPTS${fpsFilter}[${out}]`;
  }
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(`[${i}:v]setpts=PTS-STARTPTS${fpsFilter}[vseg${i}]`);
  }
  // Build pairwise xfade chain
  let left = "vseg0";
  let runningOffset = 0;
  for (let i = 1; i < n; i++) {
    const segDur = ranges[i - 1].endSec - ranges[i - 1].startSec;
    runningOffset += Math.max(0, segDur - durationSec);
    const xOffset = sec(runningOffset);
    const isLast = i === n - 1;
    const outLabel = isLast ? out : `xf${i}`;
    parts.push(
      `[${left}][vseg${i}]xfade=transition=fade:duration=${sec(durationSec)}:offset=${xOffset}[${outLabel}]`
    );
    left = outLabel;
  }
  return parts.join(";");
}

/**
 * Build a video filter chain that applies a dip-to-black transition between
 * all segment inputs. Each segment fades out at the end and the next fades
 * in at the start; segments are then hard-concatenated.
 *
 * Half the transition duration is consumed from the end of each outgoing
 * segment and the start of each incoming segment (except the very first
 * start and very last end, which stay at full brightness).
 */
export function buildSegmentVideoDipFilter(input: {
  durationSec: number;
  fpsFilter: string;
  outputLabel?: string;
  ranges: Range[];
}): string {
  const { durationSec, fpsFilter, ranges } = input;
  const out = input.outputLabel ?? "vsel";
  const n = ranges.length;
  if (n === 1) {
    return `[0:v]setpts=PTS-STARTPTS${fpsFilter}[${out}]`;
  }
  const half = durationSec / 2;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const dur = ranges[i].endSec - ranges[i].startSec;
    const fadeOutStart = Math.max(0, dur - half);
    const needFadeOut = i < n - 1;
    const needFadeIn = i > 0;
    let chain = `[${i}:v]setpts=PTS-STARTPTS${fpsFilter}`;
    if (needFadeOut) {
      chain += `,fade=t=out:st=${sec(fadeOutStart)}:d=${sec(half)}`;
    }
    if (needFadeIn) {
      chain += `,fade=t=in:st=0:d=${sec(half)}`;
    }
    parts.push(`${chain}[vseg${i}]`);
  }
  const labels = Array.from({ length: n }, (_, i) => `[vseg${i}]`).join("");
  parts.push(`${labels}concat=n=${n}:v=1:a=0[${out}]`);
  return parts.join(";");
}

/**
 * Unified dispatcher: build the video filter chain for a given transition
 * type. Falls back to plain concat for "none" or single-range exports.
 */
export function buildSegmentVideoTransitionFilter(input: {
  durationSec: number;
  fpsFilter: string;
  outputLabel?: string;
  ranges: Range[];
  transitionType: CutTransitionType;
}): string {
  const { transitionType, ...rest } = input;
  if (transitionType === "crossfade") {
    return buildSegmentVideoCrossfadeFilter(rest);
  }
  if (transitionType === "dip") {
    return buildSegmentVideoDipFilter(rest);
  }
  return buildSegmentVideoConcatFilter({
    fpsFilter: rest.fpsFilter,
    outputLabel: rest.outputLabel,
    rangeCount: rest.ranges.length,
  });
}
