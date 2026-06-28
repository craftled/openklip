// Continuous color adjustment: the deck's "control room" grade sliders, applied
// on top of the named base grade. Each knob maps to a deterministic ffmpeg
// filter so no string drifts without a failing test. Pipeline order mirrors the
// deck exactly: temperature/tint gains (colorbalance) -> contrast (pivot at
// mid-gray) -> brightness -> saturation (eq). Pure and unit tested.
//
// (Named grade-color, not color: src/color.ts already owns the OKLCH brand
// palette math, a separate concern.)
import { type ColorAdjust, ColorAdjustSchema } from "./edl.ts";

// The identity adjust: every knob at its no-op value. Used as the default and as
// the "compare to base" target the GUI flashes back to.
export const NEUTRAL_COLOR: ColorAdjust = ColorAdjustSchema.parse({});

// Tolerance for "is this knob still at its default" checks. Slider drags land on
// values like 0.96 and -0.005, so an exact compare is fine, but a small epsilon
// guards against float noise from round-tripping through JSON.
const EPS = 1e-4;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS;
}

// Trim to 3 decimals so emitted filter strings stay stable and readable.
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// True when the adjust leaves the picture untouched (absent or all defaults).
export function isNeutralColor(color?: ColorAdjust | null): boolean {
  if (!color) {
    return true;
  }
  return (
    near(color.temperature, 0) &&
    near(color.tint, 0) &&
    near(color.brightness, 0) &&
    near(color.contrast, 1) &&
    near(color.saturation, 1)
  );
}

// The ffmpeg filter chain for a color adjust, or "" when neutral so the export
// filtergraph stays bare. Comma-joined so it can slot straight after the grade.
export function colorAdjustFilter(color?: ColorAdjust | null): string {
  if (isNeutralColor(color)) {
    return "";
  }
  const c = ColorAdjustSchema.parse(color ?? {});
  const parts: string[] = [];

  // Temperature/tint as colorbalance gains. Temperature warms by lifting red and
  // dropping blue across all three zones; tint pushes the green channel (green
  // up, magenta down). Applied to shadows/mids/highlights for a uniform shift.
  if (!(near(c.temperature, 0) && near(c.tint, 0))) {
    const t = round(c.temperature);
    const g = round(c.tint);
    const cb: string[] = [];
    if (!near(c.temperature, 0)) {
      cb.push(
        `rs=${t}`,
        `rm=${t}`,
        `rh=${t}`,
        `bs=${-t}`,
        `bm=${-t}`,
        `bh=${-t}`
      );
    }
    if (!near(c.tint, 0)) {
      cb.push(`gs=${g}`, `gm=${g}`, `gh=${g}`);
    }
    parts.push(`colorbalance=${cb.join(":")}`);
  }

  // Contrast (pivots at mid-gray in eq), then additive brightness, then
  // saturation. eq applies these in that internal order, matching the deck.
  const eq: string[] = [];
  if (!near(c.contrast, 1)) {
    eq.push(`contrast=${round(c.contrast)}`);
  }
  if (!near(c.brightness, 0)) {
    eq.push(`brightness=${round(c.brightness)}`);
  }
  if (!near(c.saturation, 1)) {
    eq.push(`saturation=${round(c.saturation)}`);
  }
  if (eq.length > 0) {
    parts.push(`eq=${eq.join(":")}`);
  }

  return parts.join(",");
}

// One-line human summary of the non-neutral knobs, for CLI status and the GUI
// caption. "neutral" when nothing is moved.
export function colorAdjustSummary(color?: ColorAdjust | null): string {
  if (isNeutralColor(color)) {
    return "neutral";
  }
  const c = ColorAdjustSchema.parse(color ?? {});
  const bits: string[] = [];
  const signed = (n: number) => `${n > 0 ? "+" : ""}${round(n)}`;
  if (!near(c.temperature, 0)) {
    bits.push(`temp ${signed(c.temperature)}`);
  }
  if (!near(c.tint, 0)) {
    bits.push(`tint ${signed(c.tint)}`);
  }
  if (!near(c.brightness, 0)) {
    bits.push(`bright ${signed(c.brightness)}`);
  }
  if (!near(c.contrast, 1)) {
    bits.push(`contrast x${round(c.contrast)}`);
  }
  if (!near(c.saturation, 1)) {
    bits.push(`sat x${round(c.saturation)}`);
  }
  return bits.join(", ");
}
