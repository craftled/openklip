import type { Range } from "./edl.ts";

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
