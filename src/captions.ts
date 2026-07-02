// Shared by the live preview overlay (web) and the export burn-in (server).
// Grouping is coordinate-free (text + order only) so the preview (source-time)
// and export (output-time) produce identical lines.

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

const WHITE = "&H00FFFFFF&";
const DEFAULT_CAPTION_ACCENT = "oklch(0.825 0.093 246.663)";

function toAssColor(color: string): string {
  const hex = colorToHex(color);
  if (!hex) {
    return "&H00F77B7C&";
  }
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) {
    return "&H00F77B7C&";
  }
  const r = m[1].slice(0, 2);
  const g = m[1].slice(2, 4);
  const b = m[1].slice(4, 6);
  return `&H00${b}${g}${r}&`.toUpperCase();
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
  width: number;
}

export type CaptionPlacement = "bottom" | "raised" | "hidden";

export interface TitleSpan {
  endSec: number;
  position: "center" | "hero" | "lower";
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

function styleLine(name: string, fontSize: number, marginV: number): string {
  return `Style: ${name},Arial,${fontSize},${WHITE},${WHITE},&H00000000&,&H64000000&,1,0,0,0,100,100,0,0,3,6,0,2,90,90,${marginV},1`;
}

export function buildAss(groups: CaptionGroup[], opts: AssOptions): string {
  const fontSize = Math.max(18, Math.round(opts.height * 0.055));
  const placement = opts.placement ?? "bottom";
  const accent = toAssColor(opts.accent ?? DEFAULT_CAPTION_ACCENT);
  const styles =
    typeof placement === "function"
      ? [
          styleLine(
            "CapBottom",
            fontSize,
            marginForPlacement(opts.height, "bottom")
          ),
          styleLine(
            "CapRaised",
            fontSize,
            marginForPlacement(opts.height, "raised")
          ),
        ]
      : [
          styleLine(
            "Cap",
            fontSize,
            marginForPlacement(opts.height, placement)
          ),
        ];
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 2",
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
        .map((ww, j) =>
          j === i
            ? `{\\c${accent}}${assEscape(ww.text)}{\\c${WHITE}}`
            : assEscape(ww.text)
        )
        .join(" ");
      events.push(
        `Dialogue: 0,${assTime(start)},${assTime(Math.max(end, start + 0.05))},${style},,0,0,0,,${line}`
      );
    });
  }
  return `${[...header, ...events].join("\n")}\n`;
}
