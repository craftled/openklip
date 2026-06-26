// Pure layout math for the preview canvas. Kept out of the React component so it
// is unit-testable. Covers the orientation toggle (16:9 / 9:16 / 1:1) and the
// in/out work-area (loop region) clamping.

export type Orientation = "landscape" | "portrait" | "square";

export const ORIENTATION_RATIO: Record<Orientation, number> = {
  landscape: 16 / 9,
  portrait: 9 / 16,
  square: 1,
};

export const ORIENTATION_LABEL: Record<Orientation, string> = {
  landscape: "16:9",
  portrait: "9:16",
  square: "1:1",
};

// Largest box of the requested aspect ratio that fits within maxW x maxH.
export function orientationDims(
  orientation: Orientation,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  const ratio = ORIENTATION_RATIO[orientation];
  // Try width-bound first; if it overflows height, switch to height-bound.
  let width = maxW;
  let height = Math.round(width / ratio);
  if (height > maxH) {
    height = maxH;
    width = Math.round(height * ratio);
  }
  return { width, height };
}

const MIN_LOOP_SPAN = 0.05;

// Normalize an in/out work-area selection: order the points, clamp to the
// timeline, and reject anything shorter than MIN_LOOP_SPAN.
export function clampLoopRegion(
  inSec: number,
  outSec: number,
  durationSec: number
): { inSec: number; outSec: number } | null {
  let lo = Math.min(inSec, outSec);
  let hi = Math.max(inSec, outSec);
  lo = Math.max(0, Math.min(lo, durationSec));
  hi = Math.max(0, Math.min(hi, durationSec));
  if (hi - lo < MIN_LOOP_SPAN) {
    return null;
  }
  return { inSec: lo, outSec: hi };
}
