// Pure, dependency-free. Shared by the live preview overlay (web) and the
// export burn-in (server). Grouping is coordinate-free (text + order only) so
// the preview (source-time) and export (output-time) produce identical lines.

export interface CaptionWord {
  endSec: number;
  startSec: number;
  text: string;
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

function toAssColor(hex: string): string {
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
  const tt = Math.max(0, t);
  const h = Math.floor(tt / 3600);
  const m = Math.floor((tt % 3600) / 60);
  const s = Math.floor(tt % 60);
  const c = Math.round((tt - Math.floor(tt)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function assEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/[{}]/g, "");
}

export interface AssOptions {
  accent?: string;
  height: number;
  width: number;
}

export function buildAss(groups: CaptionGroup[], opts: AssOptions): string {
  const fontSize = Math.max(18, Math.round(opts.height * 0.055));
  const marginV = Math.round(opts.height * 0.07);
  const accent = toAssColor(opts.accent ?? "#94ccff");
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
    `Style: Cap,Arial,${fontSize},${WHITE},${WHITE},&H00000000&,&H64000000&,1,0,0,0,100,100,0,0,3,6,0,2,90,90,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events: string[] = [];
  for (const g of groups) {
    g.words.forEach((w, i) => {
      const start = w.startSec;
      const end = i < g.words.length - 1 ? g.words[i + 1].startSec : g.endSec;
      const line = g.words
        .map((ww, j) =>
          j === i
            ? `{\\c${accent}}${assEscape(ww.text)}{\\c${WHITE}}`
            : assEscape(ww.text)
        )
        .join(" ");
      events.push(
        `Dialogue: 0,${assTime(start)},${assTime(Math.max(end, start + 0.05))},Cap,,0,0,0,,${line}`
      );
    });
  }
  return `${[...header, ...events].join("\n")}\n`;
}
