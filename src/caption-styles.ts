// Shared caption style presets consumed by BOTH renderers: the cinema
// preview (web/components/preview-overlays.tsx maps a def to CSS) and the
// export burn-in (src/captions.ts buildAss maps the same def to an ASS
// Style line). This module is the single source of truth so the two paths
// cannot drift per-preset; each renderer still owns its base size formula
// and applies `sizeScale` on top.
//
// v1 keeps every preset on Arial: libass resolves fonts from the system
// and Arial is the one family the exporter already depends on. Presets
// differentiate on weight, size, casing, colors, and box vs outline.

export const CAPTION_STYLE_IDS = [
  "boxed",
  "clean",
  "karaoke",
  "bold-caps",
  "minimal",
] as const;

export type CaptionStyleId = (typeof CAPTION_STYLE_IDS)[number];

export const DEFAULT_CAPTION_STYLE: CaptionStyleId = "boxed";

export interface CaptionStyleDef {
  /**
   * Active-word emphasis color, hex RGB. Undefined means emphasize by
   * opacity only (inactive words dim to `inactiveOpacity`, active word is
   * full-strength `textColor`).
   */
  accentColor?: string;
  /** Render caption text in capitals. */
  allCaps: boolean;
  /** Bold text (ASS Bold field / CSS font-weight >= 600). */
  bold: boolean;
  /**
   * Opaque padded box behind the caption line. When enabled the export
   * uses ASS BorderStyle 3 (outlineWidth doubles as box padding) and the
   * preview draws a rounded backdrop. When disabled the export uses
   * BorderStyle 1 (true outline) and the preview uses text shadow.
   */
  box: {
    enabled: boolean;
    /** Box fill (hex RGB) when enabled, else outline color. */
    color: string;
    /** Box fill alpha 0..1 (preview backdrop / ASS alpha byte). */
    alpha: number;
  };
  /** Font family for both CSS and the ASS Fontname field. */
  fontFamily: string;
  id: CaptionStyleId;
  /** Opacity (0..1) of non-active words in the group. */
  inactiveOpacity: number;
  /** Human label for pickers. */
  label: string;
  /** Outline/box-padding width in ASS units; preview derives shadow px. */
  outlineWidth: number;
  /** Multiplier both renderers apply to their own base size formula. */
  sizeScale: number;
  /** One-line description for pickers and CLI help. */
  summary: string;
  /** Main text color, hex RGB like "#ffffff". */
  textColor: string;
}

// "boxed" is the pre-preset look and MUST stay byte-compatible with the
// historical output: buildAss's Style line for it must equal the previous
// hardcoded line, and the preview classes must match the previous
// bg-black/55 white-text treatment. Tests pin both.
const STYLES: readonly CaptionStyleDef[] = [
  {
    id: "boxed",
    label: "Boxed",
    summary: "White text on a soft dark box (the classic default).",
    fontFamily: "Arial",
    bold: true,
    sizeScale: 1,
    allCaps: false,
    textColor: "#ffffff",
    accentColor: undefined,
    inactiveOpacity: 0.7,
    box: { enabled: true, color: "#000000", alpha: 0.55 },
    outlineWidth: 6,
  },
  {
    id: "clean",
    label: "Clean",
    summary: "No box; white text with a strong dark outline.",
    fontFamily: "Arial",
    bold: true,
    sizeScale: 1,
    allCaps: false,
    textColor: "#ffffff",
    accentColor: undefined,
    inactiveOpacity: 0.75,
    box: { enabled: false, color: "#000000", alpha: 0.9 },
    outlineWidth: 3,
  },
  {
    id: "karaoke",
    label: "Karaoke",
    summary: "Outlined text; the spoken word pops in the accent color.",
    fontFamily: "Arial",
    bold: true,
    sizeScale: 1.05,
    allCaps: false,
    textColor: "#ffffff",
    accentColor: "#7dc4ff",
    inactiveOpacity: 0.85,
    box: { enabled: false, color: "#000000", alpha: 0.9 },
    outlineWidth: 3,
  },
  {
    id: "bold-caps",
    label: "Bold caps",
    summary: "Big capitals on a tight box, social-clip style.",
    fontFamily: "Arial",
    bold: true,
    sizeScale: 1.18,
    allCaps: true,
    textColor: "#ffffff",
    accentColor: undefined,
    inactiveOpacity: 0.65,
    box: { enabled: true, color: "#000000", alpha: 0.7 },
    outlineWidth: 5,
  },
  {
    id: "minimal",
    label: "Minimal",
    summary: "Smaller, subtle text with a thin shadow and no box.",
    fontFamily: "Arial",
    bold: false,
    sizeScale: 0.85,
    allCaps: false,
    textColor: "#ffffff",
    accentColor: undefined,
    inactiveOpacity: 0.6,
    box: { enabled: false, color: "#000000", alpha: 0.7 },
    outlineWidth: 2,
  },
];

const byId = new Map(STYLES.map((s) => [s.id, s]));

export function listCaptionStyles(): readonly CaptionStyleDef[] {
  return STYLES;
}

/** Resolve a style id (absent/unknown falls back to the default). */
export function captionStyle(id: string | undefined): CaptionStyleDef {
  const def = byId.get((id ?? DEFAULT_CAPTION_STYLE) as CaptionStyleId);
  const fallback = byId.get(DEFAULT_CAPTION_STYLE);
  if (!fallback) {
    throw new Error("caption style registry is missing the default style");
  }
  return def ?? fallback;
}

export function isCaptionStyleId(id: string): id is CaptionStyleId {
  return byId.has(id as CaptionStyleId);
}
