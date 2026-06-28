// Editorial TITLE cards (lower-third / centered), distinct from spoken-word
// captions in captions.ts. Emits a complete ASS file (libass) that matches the
// captions ASS conventions: V4+ Styles header, H:MM:SS.cs Dialogue times,
// brace-stripping escape, and a color->&HBBGGRR& colour helper.

import { colorToHex } from "./color.ts";
import { type Motion, MotionSchema } from "./edl.ts";

// Resolve the speed-scaled entrance timing from the motion config. Pure, so the
// "make it snappier" math is unit tested. Higher speed → shorter durations.
export function resolveTitleMotion(motion: Motion): {
  fadeMs: number;
  heroFadeMs: number;
} {
  const scale = (ms: number) => Math.max(0, Math.round(ms / motion.speed));
  return {
    fadeMs: scale(motion.fadeMs),
    heroFadeMs: scale(motion.heroFadeMs),
  };
}

// The ASS override tags for a title's entrance, driven by the motion config.
// Lower thirds slide up into place over the fade-in window; hero/center fade.
export function titleMotionTags(
  kind: "center" | "hero" | "lower",
  motion: Motion,
  geom: { baseY: number; cx: number; slidePx: number }
): string {
  const { fadeMs, heroFadeMs } = resolveTitleMotion(motion);
  if (kind === "hero") {
    return `{\\an5\\fad(${heroFadeMs},${heroFadeMs})}`;
  }
  if (kind === "center") {
    return `{\\an5\\fad(${fadeMs},${fadeMs})}`;
  }
  return `{\\an2\\fad(${fadeMs},${fadeMs})\\move(${geom.cx},${geom.baseY + geom.slidePx},${geom.cx},${geom.baseY},0,${fadeMs})}`;
}

export interface TitleItem {
  endSec: number;
  id?: string;
  position?: "lower" | "center" | "hero";
  startSec: number;
  text: string;
}

export function parseHeroLines(text: string): {
  headline: string;
  subtitle: string;
} {
  const parts = text.split("\n");
  return {
    headline: parts[0]?.trim() ?? "",
    subtitle: parts.slice(1).join("\n").trim(),
  };
}

const WHITE = "&H00FFFFFF&";
const DEFAULT_TITLE_ACCENT = "oklch(0.809 0.1 284.59)";

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

export interface TitleAssOptions {
  accent?: string;
  height: number;
  motion?: Motion;
  width: number;
}

export function buildTitlesAss(
  items: TitleItem[],
  opts: TitleAssOptions
): string {
  // Two style sizes: lower-thirds read smaller, centered cards are the hero.
  const lowerFont = Math.max(20, Math.round(opts.height * 0.05));
  const centerFont = Math.max(28, Math.round(opts.height * 0.07));
  const heroHeadFont = Math.max(40, Math.round(opts.height * 0.075));
  const heroSubFont = Math.max(18, Math.round(opts.height * 0.028));
  const marginV = Math.round(opts.height * 0.08);
  const accent = toAssColor(opts.accent ?? DEFAULT_TITLE_ACCENT);

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
    // Hero: serif headline + subtitle, light shadow, no box.
    `Style: TitleHeroHead,Georgia,${heroHeadFont},${WHITE},${WHITE},&H00000000&,&H80000000&,1,0,0,0,100,100,0,0,1,0,2,5,120,120,0,1`,
    `Style: TitleHeroSub,Georgia,${heroSubFont},${WHITE},${WHITE},&H00000000&,&H80000000&,0,0,0,0,100,100,0,0,1,0,2,5,120,120,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const motion = opts.motion ?? MotionSchema.parse(undefined);
  const slidePx = Math.max(16, Math.round(opts.height * motion.slideFrac));
  // Lower titles anchor at bottom-center; the slide-up baseline is MarginV above the floor.
  const baseY = opts.height - marginV;
  const cx = Math.round(opts.width / 2);
  const geom = { baseY, cx, slidePx };

  const events: string[] = [];
  for (const item of items) {
    const text = assEscape((item.text ?? "").trim());
    if (text.length === 0) {
      continue; // skip empty / whitespace-only
    }

    const start = item.startSec;
    const end = Math.max(item.endSec, start + 0.05);
    const isHero = item.position === "hero";
    const isCenter = item.position === "center";

    let override: string;
    let style: string;
    let payload: string;
    if (isHero) {
      const { headline, subtitle } = parseHeroLines(item.text ?? "");
      if (!headline) {
        continue;
      }
      style = "TitleHeroHead";
      override = titleMotionTags("hero", motion, geom);
      payload = assEscape(headline);
      if (subtitle) {
        payload += `{\\r}\\N{\\fs${heroSubFont}}${assEscape(subtitle)}`;
      }
      events.push(
        `Dialogue: 0,${assTime(start)},${assTime(end)},${style},,0,0,0,,${override}${payload}`
      );
      continue;
    }
    payload = text;
    if (isCenter) {
      // Centered hero card: fade only, no slide. \an5 = middle-center.
      style = "TitleCenter";
      override = titleMotionTags("center", motion, geom);
    } else {
      // Lower third: fade + a short upward slide into place. \an2 = bottom-center.
      style = "TitleLower";
      override = titleMotionTags("lower", motion, geom);
    }

    events.push(
      `Dialogue: 0,${assTime(start)},${assTime(end)},${style},,0,0,0,,${override}${payload}`
    );
  }

  return `${[...header, ...events].join("\n")}\n`;
}
