import { loadGraphicManifest } from "./graphics.ts";
import { MIN_PHRASE_OVERLAY_SEC } from "./reanchor.ts";

const DEFAULT_GRAPHIC_FPS = 30;
const MIN_BPM = 60;
const MAX_BPM = 240;

export function validateBpm(bpm: number): number {
  if (!(Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM)) {
    throw new Error(`bpm must be between ${MIN_BPM} and ${MAX_BPM}`);
  }
  return Math.round(bpm * 10) / 10;
}

/** Minimum overlay duration (seconds) to fit entrance animation params. */
export function minGraphicSpanSec(
  template: string,
  params: Record<string, string | number | boolean>,
  fps = DEFAULT_GRAPHIC_FPS
): number {
  const manifest = loadGraphicManifest(template);
  const fpsUsed = manifest.fps ?? fps;
  const defaults = manifest.params;
  const inDur =
    typeof params.inDurFrames === "number"
      ? params.inDurFrames
      : typeof defaults.inDurFrames?.default === "number"
        ? defaults.inDurFrames.default
        : 8;
  const stagger =
    typeof params.staggerFrames === "number"
      ? params.staggerFrames
      : typeof defaults.staggerFrames?.default === "number"
        ? defaults.staggerFrames.default
        : 0;
  let words = 1;
  if (
    typeof params.phraseWordCount === "number" &&
    Number.isFinite(params.phraseWordCount) &&
    params.phraseWordCount >= 1
  ) {
    words = Math.round(params.phraseWordCount);
  } else {
    const text =
      params.text === undefined
        ? params.title === undefined
          ? ""
          : String(params.title)
        : String(params.text);
    if (text.trim()) {
      words = Math.max(1, text.trim().split(/\s+/).length);
    }
  }
  const animFrames = inDur + stagger * Math.max(0, words - 1);
  return animFrames / fpsUsed + 0.05;
}

/** Extend toSec when the phrase span is shorter than the entrance animation. */
export function extendGraphicSpanForEntrance(input: {
  template: string;
  params: Record<string, string | number | boolean>;
  fromSec: number;
  toSec: number;
  projectDurationSec: number;
}): number {
  const minSec = Math.max(
    MIN_PHRASE_OVERLAY_SEC,
    minGraphicSpanSec(input.template, input.params)
  );
  const dur = input.toSec - input.fromSec;
  if (dur >= minSec) {
    return input.toSec;
  }
  return Math.min(input.projectDurationSec, input.fromSec + minSec);
}

/** Snap a span to N beats at the given BPM (fromSec fixed, toSec grows). */
export function spanForBeats(
  fromSec: number,
  beats: number,
  bpm: number,
  projectDurationSec: number
): number {
  if (!(Number.isFinite(beats) && beats > 0)) {
    throw new Error("beats must be a positive number");
  }
  if (!(Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM)) {
    throw new Error(`bpm must be between ${MIN_BPM} and ${MAX_BPM}`);
  }
  const beatSec = 60 / bpm;
  const toSec = fromSec + beats * beatSec;
  if (toSec <= fromSec) {
    throw new Error("beat span is empty");
  }
  return Math.min(projectDurationSec, toSec);
}
