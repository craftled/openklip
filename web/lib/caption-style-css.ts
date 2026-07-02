// Pure mapper: CaptionStyleDef -> the CSS pieces the live preview caption box
// needs. Both cinema-player call sites render captions through the shared
// CaptionLine component (web/components/caption-line.tsx), which calls this
// mapper so there is exactly one place that turns a preset into pixels.
//
// The export burn-in (src/captions.ts buildAss) maps the SAME CaptionStyleDef
// to an ASS Style line; this module owns the CSS side only.
//
// BACK-COMPAT: "boxed" is the pre-preset default and its mapped output must
// stay visually identical to the historical hardcoded classes:
//   "rounded-md bg-black/55 px-3.5 py-1.5 text-center font-medium
//    text-[clamp(15px,2.3vw,30px)] text-white leading-tight backdrop-blur"
//   with per-word "text-white" (active) / "text-white/70" (inactive).
// tests/caption-style-css.test.ts pins the exact values below.

import type { CaptionStyleDef } from "@engine/caption-styles";

export interface CaptionBoxCss {
  /** Color of the currently-spoken word. */
  activeColor: string;
  /** Container background; "transparent" when the def has no box. */
  background: string;
  fontFamily: string;
  /** CSS clamp() string: the base 15px/2.3vw/30px formula times sizeScale. */
  fontSize: string;
  /** 500 for bold defs (matches the historical font-medium), 400 otherwise. */
  fontWeight: number;
  /** Color of not-yet/no-longer spoken words. */
  inactiveColor: string;
  /** Multi-layer text-shadow outline; "none" when the def has a box instead. */
  textShadow: string;
  textTransform: "none" | "uppercase";
}

function hexToRgb(hex: string): { b: number; g: number; r: number } {
  const clean = hex.replace("#", "");
  return {
    b: Number.parseInt(clean.slice(4, 6), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    r: Number.parseInt(clean.slice(0, 2), 16),
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Strip floating-point noise (1.18 * 2.3 -> 2.7139999999999995) down to a
// short, stable string for both tests and rendered CSS.
function trimNumber(n: number): string {
  return Number(n.toFixed(3)).toString();
}

// The overlay's own base clamp formula (15px / 2.3vw / 30px), scaled by the
// preset's sizeScale. Each renderer owns its base formula per the module
// header contract in src/caption-styles.ts; this is the preview's.
function scaledClamp(sizeScale: number): string {
  const min = trimNumber(15 * sizeScale);
  const preferred = trimNumber(2.3 * sizeScale);
  const max = trimNumber(30 * sizeScale);
  return `clamp(${min}px, ${preferred}vw, ${max}px)`;
}

// Simulate an outline with four offset shadow layers. outlineWidth is an ASS
// unit (border/padding width); scale it down for a CSS pixel outline.
function outlineTextShadow(outlineWidth: number, color: string, alpha: number) {
  const w = Math.max(1, Math.round(outlineWidth * 0.6));
  const col = hexToRgba(color, alpha);
  return [
    `-${w}px -${w}px 0 ${col}`,
    `${w}px -${w}px 0 ${col}`,
    `-${w}px ${w}px 0 ${col}`,
    `${w}px ${w}px 0 ${col}`,
  ].join(", ");
}

export function captionStyleCss(def: CaptionStyleDef): CaptionBoxCss {
  const background = def.box.enabled
    ? hexToRgba(def.box.color, def.box.alpha)
    : "transparent";
  const textShadow = def.box.enabled
    ? "none"
    : outlineTextShadow(def.outlineWidth, def.box.color, def.box.alpha);
  return {
    activeColor: def.accentColor ?? def.textColor,
    background,
    fontFamily: def.fontFamily,
    fontSize: scaledClamp(def.sizeScale),
    fontWeight: def.bold ? 500 : 400,
    inactiveColor: hexToRgba(def.textColor, def.inactiveOpacity),
    textShadow,
    textTransform: def.allCaps ? "uppercase" : "none",
  };
}
