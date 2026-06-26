// Pure, dependency-free. Editorial TITLE cards (lower-third / centered), distinct
// from spoken-word captions in captions.ts. Emits a complete ASS file (libass) that
// matches the captions ASS conventions: V4+ Styles header, H:MM:SS.cs Dialogue times,
// brace-stripping escape, and a hex->&HBBGGRR& colour helper.

export interface TitleItem {
  id?: string;
  text: string;
  startSec: number;
  endSec: number;
  position?: "lower" | "center";
}

const WHITE = "&H00FFFFFF&";

function toAssColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "&H00F77B7C&";
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

export interface TitleAssOptions {
  width: number;
  height: number;
  accent?: string;
}

export function buildTitlesAss(items: TitleItem[], opts: TitleAssOptions): string {
  // Two style sizes: lower-thirds read smaller, centered cards are the hero.
  const lowerFont = Math.max(20, Math.round(opts.height * 0.05));
  const centerFont = Math.max(28, Math.round(opts.height * 0.07));
  const marginV = Math.round(opts.height * 0.08);
  const accent = toAssColor(opts.accent ?? "#b9b8ff");

  // BorderStyle 3 + a semi-transparent dark BackColour paints an opaque-ish box
  // behind the glyphs so titles read on any footage. Bold white text, Arial.
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
    // Lower: bottom-center (Alignment 2 / \an2), generous MarginV lifts it into the lower third.
    `Style: TitleLower,Arial,${lowerFont},${WHITE},${accent},&H00000000&,&HA0000000&,1,0,0,0,100,100,0,0,3,0,0,2,120,120,${marginV},1`,
    // Center: middle-center (Alignment 5 / \an5), no special margin.
    `Style: TitleCenter,Arial,${centerFont},${WHITE},${accent},&H00000000&,&HA0000000&,1,0,0,0,100,100,0,0,3,0,0,5,120,120,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const fadeMs = 180;
  const slidePx = Math.max(16, Math.round(opts.height * 0.04));
  // Lower titles anchor at bottom-center; the slide-up baseline is MarginV above the floor.
  const baseY = opts.height - marginV;
  const cx = Math.round(opts.width / 2);

  const events: string[] = [];
  for (const item of items) {
    const text = assEscape((item.text ?? "").trim());
    if (text.length === 0) continue; // skip empty / whitespace-only

    const start = item.startSec;
    const end = Math.max(item.endSec, start + 0.05);
    const isCenter = item.position === "center";

    let override: string;
    let style: string;
    if (isCenter) {
      // Centered hero card: fade only, no slide. \an5 = middle-center.
      style = "TitleCenter";
      override = `{\\an5\\fad(${fadeMs},${fadeMs})}`;
    } else {
      // Lower third: fade + a short upward slide into place. \an2 = bottom-center.
      // \move(fromX,fromY,toX,toY) slides from slidePx below the resting baseline up to it.
      style = "TitleLower";
      override = `{\\an2\\fad(${fadeMs},${fadeMs})\\move(${cx},${baseY + slidePx},${cx},${baseY})}`;
    }

    events.push(
      `Dialogue: 0,${assTime(start)},${assTime(end)},${style},,0,0,0,,${override}${text}`,
    );
  }

  return `${[...header, ...events].join("\n")}\n`;
}
