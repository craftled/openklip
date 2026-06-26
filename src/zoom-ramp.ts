import { sec } from "./edl.ts";

// An animated push-in over an OUTPUT-time window. Unlike the static punch, the
// zoom eases from 1.0 to `scale` over `rampSec` (smoothstep), then HOLDS at
// `scale` until `endSec`. Windows are assumed non-overlapping.
export interface ZoomWindow {
  endSec: number;
  rampSec: number;
  scale: number;
  startSec: number;
}

function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

// smoothstep easing: p in [0,1] -> p*p*(3-2*p). 0 at p=0, 1 at p=1, flat slope
// at both ends so the push-in starts and settles gently.
function smoothstep(p: number): number {
  return p * p * (3 - 2 * p);
}

// Zoom factor at output time `t`: 1 outside all windows; inside a window, ease
// from 1 to `scale` over `rampSec` then hold at `scale` through `endSec`.
export function zoomFactorAtSec(t: number, windows: ZoomWindow[]): number {
  for (const w of windows) {
    if (t < w.startSec || t > w.endSec) {
      continue;
    }
    // rampSec <= 0 means an instant punch: clamp((t-start)/0,...) would be NaN/Inf.
    const p = w.rampSec > 0 ? clamp((t - w.startSec) / w.rampSec, 0, 1) : 1;
    return 1 + (w.scale - 1) * smoothstep(p);
  }
  return 1;
}

// Build an ffmpeg zoompan `z=` expression as a function of frame index `on` and
// `fps`. Time is `on/fps`. Piecewise-additive form (windows non-overlapping):
//   1 + sum_i (scale_i - 1) * EASE_i * between(on/fps, s_i, e_i)
// where EASE_i is the smoothstep of clip((on/fps - s_i)/ramp_i, 0, 1). Outside
// every window each `between` term is 0, leaving 1. The string is a single
// valid ffmpeg expression (balanced parentheses); we never run ffmpeg here.
export function buildZoompanZExpr(windows: ZoomWindow[], fps: number): string {
  const tExpr = `(on/${sec(fps)})`;
  let expr = "1";
  for (const w of windows) {
    const s = sec(w.startSec);
    const e = sec(w.endSec);
    const amp = sec(w.scale - 1);
    // p = clip((t - start)/ramp, 0, 1); guard ramp=0 with a 1 so EASE -> 1.
    const p =
      w.rampSec > 0 ? `clip((${tExpr}-${s})/${sec(w.rampSec)},0,1)` : "1";
    // smoothstep: p*p*(3-2*p)
    const ease = `((${p})*(${p})*(3-2*(${p})))`;
    const gate = `between(${tExpr},${s},${e})`;
    expr += `+(${amp})*${ease}*${gate}`;
  }
  return expr;
}
