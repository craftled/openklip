// B-roll display modes: how a placed b-roll clip composites over the
// talking-head source at preview and export. "cover" replaces the full frame
// (historical default); "pip" keeps the speaker visible and insets the b-roll
// in the bottom-right corner.

import type { BrollDisplay } from "./edl.ts";
import { sec } from "./edl.ts";

export const BROLL_DISPLAY_IDS = [
  "cover",
  "pip",
] as const satisfies readonly BrollDisplay[];

/** PiP width as a fraction of the output frame width. */
export const BROLL_PIP_WIDTH_FRAC = 0.28;
/** PiP margin as a fraction of the output frame width. */
export const BROLL_PIP_MARGIN_FRAC = 0.02;

export function normalizeBrollDisplay(
  value: BrollDisplay | undefined
): BrollDisplay {
  return value ?? "cover";
}

export function brollPipBox(
  outW: number,
  _outH: number
): { margin: number; pipH: number; pipW: number } {
  const margin = Math.max(8, Math.round(outW * BROLL_PIP_MARGIN_FRAC));
  const pipW = Math.max(64, Math.round((outW * BROLL_PIP_WIDTH_FRAC) / 2) * 2);
  const pipH = Math.max(36, Math.round((pipW * 9) / 16 / 2) * 2);
  return { margin, pipW, pipH };
}

export function brollScaleFilter(input: {
  display: BrollDisplay;
  durationSec: number;
  inputIndex: number;
  label: string;
  outH: number;
  outStart: number;
  outW: number;
  srcInSec: number;
}): string {
  const trim = `[${input.inputIndex}:v]trim=start=${sec(input.srcInSec)}:duration=${sec(input.durationSec)}`;
  const pts = `setpts=PTS-STARTPTS+${sec(input.outStart)}/TB`;
  if (input.display === "pip") {
    const { pipW, pipH } = brollPipBox(input.outW, input.outH);
    return `${trim},${pts},scale=${pipW}:${pipH}:force_original_aspect_ratio=decrease,pad=${pipW}:${pipH}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1[${input.label}]`;
  }
  return `${trim},${pts},scale=${input.outW}:${input.outH}:force_original_aspect_ratio=increase,crop=${input.outW}:${input.outH},setsar=1[${input.label}]`;
}

/** ffmpeg overlay position expression; empty string means default full-frame. */
export function brollOverlayPosition(
  display: BrollDisplay,
  outW: number,
  outH: number
): string {
  if (display !== "pip") {
    return "";
  }
  const { margin } = brollPipBox(outW, outH);
  return `W-w-${margin}:H-h-${margin}`;
}

/** Scale + composite filter pair for one b-roll plan window. */
export function buildBrollOverlayFilters(input: {
  display: BrollDisplay;
  inputIndex: number;
  lastLabel: string;
  outEnd: number;
  outH: number;
  outStart: number;
  outW: number;
  srcInSec: number;
}): [string, string] {
  const label = `bv${input.inputIndex}`;
  const outLabel = `ov${input.inputIndex}`;
  const scale = brollScaleFilter({
    display: input.display,
    durationSec: input.outEnd - input.outStart,
    inputIndex: input.inputIndex,
    label,
    outH: input.outH,
    outStart: input.outStart,
    outW: input.outW,
    srcInSec: input.srcInSec,
  });
  const position = brollOverlayPosition(input.display, input.outW, input.outH);
  const overlayCoords = position ? `${position}:` : "";
  const overlay = `[${input.lastLabel}][${label}]overlay=${overlayCoords}eof_action=pass:enable='between(t,${sec(input.outStart)},${sec(input.outEnd)})'[${outLabel}]`;
  return [scale, overlay];
}
