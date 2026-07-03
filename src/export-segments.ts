import type { Range } from "./edl.ts";
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

/** Per-range input seeking avoids decoding the full source for sparse short cuts. */
export function shouldUseSegmentExport(gate: SegmentExportGate): boolean {
  if (gate.ranges.length === 0) {
    return false;
  }
  if (gate.ranges.length > SEGMENT_EXPORT_MAX_RANGES) {
    return false;
  }
  if (
    gate.hasBroll ||
    gate.hasStills ||
    gate.hasRichGraphics ||
    gate.hasMusic
  ) {
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
}): string {
  const out = input.outputLabel ?? "avoice";
  const suffix = `${input.highpassSuffix ?? ""}${input.noiseSuffix ?? ""}`;
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
