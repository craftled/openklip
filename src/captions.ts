// Shared by the live preview overlay (web) and the export burn-in (server).
// Grouping is coordinate-free (text + order only) so the preview (source-time)
// and export (output-time) produce identical lines.

import {
  type CaptionStyleDef,
  captionStyle,
  DEFAULT_CAPTION_STYLE,
} from "./caption-styles.ts";
import { colorToHex } from "./color.ts";
// Type-only import: erased at compile time, so this module stays a pure,
// browser-safe leaf (compiledTimeline.ts depends on that).
import type { Project, Range } from "./edl.ts";

export interface CaptionWord {
  endSec: number;
  startSec: number;
  text: string;
}

// Map every kept word into OUTPUT time against the effective ranges. R1: a
// word is emitted when its span OVERLAPS a kept range, not merely when its
// START lies inside one - VAD snap can move a range start forward past a soft
// word onset, and a dead-air span can cover a kept word's start, and in both
// cases most of the word's audio still plays, so the caption must too. Start
// and end are clamped to the range before mapping into output time; a word
// straddling multiple ranges is emitted once, in the first range it overlaps.
// The single shared implementation for the export burn-in (src/exporter.ts)
// and the derived UI timeline (src/compiledTimeline.ts), which previously
// carried identical (and identically buggy) copies.
export function keptWordsInOutputTime(
  project: Pick<Project, "sampleRate" | "words">,
  ranges: Range[]
): CaptionWord[] {
  const sr = project.sampleRate;
  const out: CaptionWord[] = [];
  for (const w of project.words) {
    if (w.deleted) {
      continue;
    }
    const ws = w.startSample / sr;
    const we = w.endSample / sr;
    let cum = 0;
    for (const r of ranges) {
      if (we > r.startSec && ws < r.endSec) {
        const s = cum + Math.max(0, ws - r.startSec);
        const e = cum + Math.max(0, Math.min(we, r.endSec) - r.startSec);
        out.push({ text: w.text, startSec: s, endSec: Math.max(e, s + 0.05) });
        break;
      }
      cum += r.endSec - r.startSec;
    }
  }
  return out;
}

export interface CaptionGroup {
  endSec: number;
  startSec: number;
  words: CaptionWord[];
}

const SENTENCE_END = /[.!?]["')\]]?$/;

export function groupCaptions(
  words: CaptionWord[],
  maxWords = 6
): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  let cur: CaptionWord[] = [];
  const flush = () => {
    if (cur.length === 0) {
      return;
    }
    groups.push({
      startSec: cur[0].startSec,
      endSec: cur[cur.length - 1].endSec,
      words: cur,
    });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (cur.length >= maxWords || SENTENCE_END.test(w.text.trim())) {
      flush();
    }
  }
  flush();
  return groups;
}

// ---- ASS subtitle generation (export burn-in via libass) ----

const DEFAULT_CAPTION_ACCENT = "oklch(0.825 0.093 246.663)";
// Legacy shadow byte for BackColour. Shadow=0 on every style line we emit, so
// libass never actually draws this color, it exists only for the historical
// byte-compat pin; box.alpha does not round-trip to it (0.55 does not map to
// 0x64 under any linear alpha formula), so we keep it fixed instead.
const BACK_SHADOW_LEGACY = "&H64000000&";

// Accepts any CSS color culori can parse (hex, oklch, ...); alphaByte is the
// ASS transparency byte (0 = opaque, 255 = fully transparent), defaulting to
// opaque so existing callers (PrimaryColour/SecondaryColour/accent) keep
// their historical output unchanged.
function toAssColor(color: string, alphaByte = 0): string {
  const hex = colorToHex(color);
  const aa = Math.max(0, Math.min(255, Math.round(alphaByte)))
    .toString(16)
    .padStart(2, "0");
  if (!hex) {
    return `&H${aa}F77B7C&`.toUpperCase();
  }
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) {
    return `&H${aa}F77B7C&`.toUpperCase();
  }
  const r = m[1].slice(0, 2);
  const g = m[1].slice(2, 4);
  const b = m[1].slice(4, 6);
  return `&H${aa}${b}${g}${r}&`.toUpperCase();
}

function assTime(t: number): string {
  const totalCentiseconds = Math.max(0, Math.round(t * 100));
  const h = Math.floor(totalCentiseconds / 360_000);
  const remAfterHours = totalCentiseconds % 360_000;
  const m = Math.floor(remAfterHours / 6000);
  const remAfterMinutes = remAfterHours % 6000;
  const s = Math.floor(remAfterMinutes / 100);
  const c = remAfterMinutes % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function assEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/[{}]/g, "");
}

export interface AssOptions {
  accent?: string;
  height: number;
  placement?:
    | CaptionPlacement
    | ((
        group: CaptionGroup,
        span: { endSec: number; startSec: number }
      ) => CaptionPlacement);
  /** Caption look preset; defaults to captionStyle(undefined) ("boxed"). */
  style?: CaptionStyleDef;
  width: number;
}

export type CaptionPlacement = "bottom" | "raised" | "hidden";

export interface TitleSpan {
  endSec: number;
  position: "callout" | "center" | "divider" | "hero" | "lower" | "quote";
  startSec: number;
}

function spansOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** Matches preview: hero titles hide captions; lower-third titles raise them. */
export function captionPlacementForSpan(
  startSec: number,
  endSec: number,
  titles: TitleSpan[]
): CaptionPlacement {
  const overlapping = titles.filter((t) =>
    spansOverlap(startSec, endSec, t.startSec, t.endSec)
  );
  if (overlapping.some((t) => t.position === "hero")) {
    return "hidden";
  }
  if (overlapping.some((t) => t.position === "lower")) {
    return "raised";
  }
  return "bottom";
}

export function captionPlacementForGroup(
  group: CaptionGroup,
  titles: TitleSpan[]
): CaptionPlacement {
  return captionPlacementForSpan(group.startSec, group.endSec, titles);
}

function marginForPlacement(
  height: number,
  placement: CaptionPlacement
): number {
  const marginRatio = placement === "raised" ? 0.24 : 0.07;
  return Math.round(height * marginRatio);
}

// Fields: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour,
// OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX,
// ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL,
// MarginR, MarginV, Encoding.
function styleLine(
  name: string,
  fontSize: number,
  marginV: number,
  def: CaptionStyleDef
): string {
  const primary = toAssColor(def.textColor);
  const bold = def.bold ? 1 : 0;
  const borderStyle = def.box.enabled ? 3 : 1;
  // With BorderStyle 3 libass draws the box from OutlineColour; with
  // BorderStyle 1 it's the true-outline stroke. Either way def.box.alpha
  // must reach it, or the box/outline renders fully opaque regardless of
  // the preset's configured translucency. The legacy "boxed" default keeps
  // its exact historical opaque OutlineColour (byte-compat pin).
  const outlineColour =
    def.id === DEFAULT_CAPTION_STYLE
      ? toAssColor(def.box.color)
      : toAssColor(def.box.color, Math.round((1 - def.box.alpha) * 255));
  // BackColour only shades the Shadow, and Shadow is always 0 on every style
  // line we emit, so libass never actually draws this color: any alpha we
  // put on it would be visually inert. Keep it legacy-fixed everywhere
  // instead of pretending it carries meaningful alpha.
  const backColour = BACK_SHADOW_LEGACY;
  return `Style: ${name},${def.fontFamily},${fontSize},${primary},${primary},${outlineColour},${backColour},${bold},0,0,0,100,100,0,0,${borderStyle},${def.outlineWidth},0,2,90,90,${marginV},1`;
}

export function buildAss(groups: CaptionGroup[], opts: AssOptions): string {
  const styleDef = opts.style ?? captionStyle(undefined);
  const isDefaultStyle = styleDef.id === DEFAULT_CAPTION_STYLE;
  // The historical floor applies to the BASE size; sizeScale multiplies the
  // already-floored base, so byte-compat holds for "boxed" (sizeScale 1).
  const base = Math.max(18, Math.round(opts.height * 0.055));
  const fontSize = Math.round(base * styleDef.sizeScale);
  const placement = opts.placement ?? "bottom";
  // Legacy default keeps its exact historical fallback chain (byte-compat
  // pin). Non-default presets never fall back to the hardcoded blue: per
  // the CaptionStyleDef contract (src/caption-styles.ts ~26-29), an
  // undefined accentColor means "emphasize by opacity only", so the active
  // word just uses textColor and relies on the alpha dim below on the
  // OTHER words to read as emphasized.
  const accent = toAssColor(
    isDefaultStyle
      ? (opts.accent ?? styleDef.accentColor ?? DEFAULT_CAPTION_ACCENT)
      : (opts.accent ?? styleDef.accentColor ?? styleDef.textColor)
  );
  const primary = toAssColor(styleDef.textColor);
  // Non-default presets emphasize the active word by dimming every OTHER
  // word instead (or in addition to a real accentColor): an ASS \alpha
  // override tag derived from inactiveOpacity, same alphaByte inversion as
  // box.alpha (Finding 2). The active word gets an explicit \alpha&H00&
  // reset so it is never dimmed.
  const inactiveAlphaByte = Math.max(
    0,
    Math.min(255, Math.round((1 - styleDef.inactiveOpacity) * 255))
  );
  const inactiveAlphaTag = `&H${inactiveAlphaByte.toString(16).padStart(2, "0").toUpperCase()}&`;
  const applyCaps = (text: string) =>
    styleDef.allCaps ? text.toUpperCase() : text;
  const styles =
    typeof placement === "function"
      ? [
          styleLine(
            "CapBottom",
            fontSize,
            marginForPlacement(opts.height, "bottom"),
            styleDef
          ),
          styleLine(
            "CapRaised",
            fontSize,
            marginForPlacement(opts.height, "raised"),
            styleDef
          ),
        ]
      : [
          styleLine(
            "Cap",
            fontSize,
            marginForPlacement(opts.height, placement),
            styleDef
          ),
        ];
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    // WrapStyle 0 (libass smart/balanced wrapping) unconditionally for every
    // preset. This is a deliberate format change, not a regression: WrapStyle
    // 2 (no wrap) let a long bold-caps group run off-frame in portrait
    // exports, and the pre-existing "boxed" clipping was the same bug.
    "WrapStyle: 0",
    `PlayResX: ${opts.width}`,
    `PlayResY: ${opts.height}`,
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styles,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events: string[] = [];
  for (const g of groups) {
    g.words.forEach((w, i) => {
      const start = w.startSec;
      const end = i < g.words.length - 1 ? g.words[i + 1].startSec : g.endSec;
      const span = { startSec: start, endSec: Math.max(end, start + 0.05) };
      const resolvedPlacement =
        typeof placement === "function" ? placement(g, span) : placement;
      if (resolvedPlacement === "hidden") {
        return;
      }
      const style =
        typeof placement === "function"
          ? resolvedPlacement === "raised"
            ? "CapRaised"
            : "CapBottom"
          : "Cap";
      const line = g.words
        .map((ww, j) => {
          const text = assEscape(applyCaps(ww.text));
          if (isDefaultStyle) {
            // Legacy two-tag composition (byte-compat pin): wrap only the
            // active word, plain text everywhere else.
            return j === i ? `{\\c${accent}}${text}{\\c${primary}}` : text;
          }
          // Non-default: every word carries its own explicit color+alpha
          // override, so the dim applies regardless of position relative
          // to the active word.
          return j === i
            ? `{\\c${accent}\\alpha&H00&}${text}`
            : `{\\c${primary}\\alpha${inactiveAlphaTag}}${text}`;
        })
        .join(" ");
      events.push(
        `Dialogue: 0,${assTime(start)},${assTime(Math.max(end, start + 0.05))},${style},,0,0,0,,${line}`
      );
    });
  }
  return `${[...header, ...events].join("\n")}\n`;
}
