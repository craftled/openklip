// Ken Burns push-in for a still image. A still is a looped single-frame input;
// ffmpeg `zoompan` evaluates `z` per output frame (`on` = frame index), so the
// scale can ramp across the held duration. We center the crop on a focus point
// in [0,1] image coordinates. Pure string/number builders — ffmpeg is never run
// here, so this is unit-testable.
import { sec } from "./edl.ts";

export interface KenBurns {
  durationSec: number;
  focusX: number;
  focusY: number;
  scale: number;
}

function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

// Scale at progress p in [0,1] through the still: linear ease 1 -> scale.
export function kenBurnsScaleAt(p: number, scale: number): number {
  return 1 + (scale - 1) * clamp(p, 0, 1);
}

// Full ffmpeg zoompan filter for a still input. `z` ramps linearly from 1 to
// scale across the frame count; x/y keep the focus point fixed as it zooms.
export function buildStillZoompan(
  kb: KenBurns,
  opts: { width: number; height: number; fps: number }
): string {
  const frames = Math.max(1, Math.round(kb.durationSec * opts.fps));
  const amp = sec(kb.scale - 1);
  // z = 1 + amp * (on/frames), capped at scale so the last frame doesn't overshoot.
  const z = `min(1+(${amp})*(on/${frames}),${sec(kb.scale)})`;
  const x = `(iw-iw/zoom)*${sec(clamp(kb.focusX, 0, 1))}`;
  const y = `(ih-ih/zoom)*${sec(clamp(kb.focusY, 0, 1))}`;
  return `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${opts.width}x${opts.height}:fps=${opts.fps}`;
}
