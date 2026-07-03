import type { CutTransition, Range } from "./edl.ts";

export function findPlayingRangeIndex(
  ranges: Range[],
  timeSec: number,
  toleranceSec = 0.05
): number {
  return ranges.findIndex(
    (r) => timeSec >= r.startSec - toleranceSec && timeSec <= r.endSec
  );
}

export function shouldJumpToNextRange(
  currentTimeSec: number,
  rangeEndSec: number,
  thresholdSec = 0.02
): boolean {
  return currentTimeSec >= rangeEndSec - thresholdSec;
}

export function rangeBoundaryAudioDelaySec(
  currentTimeSec: number,
  rangeEndSec: number,
  playbackRate = 1
): number {
  const rate = Math.max(Math.abs(playbackRate), 0.001);
  return Math.max(0, (rangeEndSec - currentTimeSec) / rate);
}

export function nextRangeIndex(
  currentIdx: number,
  rangeCount: number
): number | null {
  const next = currentIdx + 1;
  return next < rangeCount ? next : null;
}

export function playbackStartIndex(ranges: Range[], timeSec: number): number {
  const inside = findPlayingRangeIndex(ranges, timeSec);
  return inside === -1 ? 0 : inside;
}

/**
 * Maps a source-timeline second to cut-space (output) seconds: the amount of
 * surviving material that plays before it. A source second inside a deleted
 * gap reports the cut-space position of the previous kept range's end, since
 * playback never actually visits the gap. Shared by every playhead-derived
 * transport display (inline preview and cinema player alike) so cut-space
 * math cannot drift between the two surfaces.
 */
export function outputPositionSec(ranges: Range[], sourceSec: number): number {
  let cum = 0;
  for (const r of ranges) {
    if (sourceSec < r.startSec) {
      return cum;
    }
    if (sourceSec <= r.endSec) {
      return cum + (sourceSec - r.startSec);
    }
    cum += r.endSec - r.startSec;
  }
  return cum;
}

/** Inverse of outputPositionSec: maps a cut-space position back to source
 * seconds. A cut-space position past the total kept duration clamps to the
 * final range's end. */
export function sourceSecForOutputPosition(
  ranges: Range[],
  outputSec: number
): number {
  let cum = 0;
  for (const r of ranges) {
    const len = r.endSec - r.startSec;
    if (outputSec <= cum + len) {
      return r.startSec + (outputSec - cum);
    }
    cum += len;
  }
  return ranges.at(-1)?.endSec ?? 0;
}

// Outro-to-sweep ratio for the preview cut-transition sweep overlay: the
// post-traversal fade should feel quick relative to the sweep itself, not a
// second act. 0.4 keeps it proportional; the floor (150ms) keeps very short
// sweeps from having an imperceptible fade-out, and the ceiling (800ms) stops
// long sweeps from dragging the outro out past what a cut boundary needs.
const SWEEP_OUTRO_RATIO = 0.4;
const SWEEP_OUTRO_FLOOR_MS = 150;
const SWEEP_OUTRO_CEILING_MS = 800;

export interface CutTransitionSweepPlan {
  /** ms for the post-traversal fade-out, derived from sweepMs (see SWEEP_OUTRO_RATIO). */
  outroMs: number;
  /** ms for the sweep band to cross the preview, from transition.durationMs verbatim. */
  sweepMs: number;
  type: "crossfade" | "dip";
}

/**
 * Plans the decorative WebGL sweep overlay played over a preview cut
 * boundary, matching project.look.transition. Returns null when no sweep
 * should play: transition.type is "none", or the caller reports reduced
 * motion is requested (the caller reads the real matchMedia result and
 * passes it in so this function stays pure and DOM-free).
 */
export function cutTransitionSweepPlan(
  transition: CutTransition,
  reducedMotion: boolean
): CutTransitionSweepPlan | null {
  if (transition.type === "none" || reducedMotion) {
    return null;
  }
  const sweepMs = transition.durationMs;
  const outroMs = Math.min(
    Math.max(sweepMs * SWEEP_OUTRO_RATIO, SWEEP_OUTRO_FLOOR_MS),
    SWEEP_OUTRO_CEILING_MS
  );
  return { type: transition.type, sweepMs, outroMs };
}
