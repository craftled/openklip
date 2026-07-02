import type { Range } from "@engine/edl";

// The position math for the hidden preview music element, extracted from the
// app.tsx sync effect so it is testable without a DOM. The bed's desired
// position is CONTINUOUS on the output timeline (cuts collapse; the bed never
// restarts), matching the exporter's one-window-per-placement semantics.

export interface MusicPreviewPlacement {
  mode: "trim" | "loop";
  /** Offset into the music asset where playback begins, in seconds. */
  srcInSec: number;
  /** Placement start on the source timeline, in seconds. */
  startSec: number;
}

// Cut-space position of a source-timeline second: seconds of surviving
// material before it (same mapping app.tsx uses for the playhead).
function outputPosition(ranges: readonly Range[], sec: number): number {
  let cum = 0;
  for (const r of ranges) {
    if (sec < r.startSec) {
      return cum;
    }
    if (sec <= r.endSec) {
      return cum + (sec - r.startSec);
    }
    cum += r.endSec - r.startSec;
  }
  return cum;
}

/**
 * Desired currentTime for the preview music element: srcIn offset plus the
 * output-timeline distance travelled since the placement started, wrapped
 * modulo the asset duration in loop mode. Positions before the window start
 * clamp to the srcIn offset.
 */
export function musicPreviewTime({
  assetDurationSec,
  curSec,
  placement,
  ranges,
}: {
  assetDurationSec: number;
  curSec: number;
  placement: MusicPreviewPlacement;
  ranges: readonly Range[];
}): number {
  const intoPlacement =
    outputPosition(ranges, curSec) - outputPosition(ranges, placement.startSec);
  let want = placement.srcInSec + Math.max(0, intoPlacement);
  if (placement.mode === "loop" && assetDurationSec > 0) {
    want %= assetDurationSec;
  }
  return Math.max(0, want);
}
