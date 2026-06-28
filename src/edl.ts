import { z } from "zod";

// Canonical time base: integer audio samples at 48 kHz. Preview and export both
// derive seconds from this one grid via samplesToSec() so they cannot drift.
export const SAMPLE_RATE = 48_000;

export const WordSchema = z.object({
  id: z.string(),
  text: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  deleted: z.boolean().default(false),
});
export type Word = z.infer<typeof WordSchema>;

export const AssetKindSchema = z.enum(["broll", "music", "still"]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

// Named color grade applied to the whole picture at export. The footage renders
// flat off the camera; a grade is the finishing look (the deck's "log in,
// picture out"). "none" is a no-op; the others expand to a deterministic ffmpeg
// filter chain in grade.ts. "cool_desat" is the deck's neutral_cool_desat look.
export const GradeSchema = z
  .enum(["none", "neutral", "warm", "cool", "cool_desat", "filmic", "punchy"])
  .default("none");
export type Grade = z.infer<typeof GradeSchema>;

// A subagent-produced description of an asset: what it shows and where it
// belongs, so the editing agent can place media by meaning, not by guessing
// from a filename. Written by the per-asset analyze pass; the EDL stays valid
// without it (optional), and re-analysis just overwrites the card.
export const AssetCardSchema = z.object({
  /** One concise sentence describing what the asset visually shows. */
  summary: z.string(),
  /** Short lowercase keywords for matching to spoken content. */
  tags: z.array(z.string()).default([]),
  /** Editorial uses, e.g. "intro", "b-roll cover", "transition". */
  bestFor: z.array(z.string()).default([]),
  /** Visual center of interest in [0,1] image coords (stills → Ken Burns). */
  suggestedFocus: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .optional(),
  /** ISO timestamp of the analysis run. */
  analyzedAt: z.string(),
  /** Agent label that produced the card (e.g. "Claude"). */
  agent: z.string().optional(),
});
export type AssetCard = z.infer<typeof AssetCardSchema>;

export const AssetSchema = z.object({
  id: z.string(),
  kind: AssetKindSchema.default("broll"),
  name: z.string(),
  src: z.string(),
  proxy: z.string(),
  durationSamples: z.number().int().nonnegative(),
  /** Subagent description (absent until the analyze pass runs). */
  card: AssetCardSchema.optional(),
});
export type Asset = z.infer<typeof AssetSchema>;

// A b-roll clip covering a span of the talking-head SOURCE timeline. "cover"
// swaps the video to the b-roll while the talker's audio continues.
export const BrollSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  srcInSample: z.number().int().nonnegative().default(0),
});
export type Broll = z.infer<typeof BrollSchema>;

// A push-in over a span of the SOURCE timeline: ramp to `scale` over rampSec, then hold.
export const ZoomSchema = z.object({
  id: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  scale: z.number().min(1).max(3).default(1.15),
  rampSec: z.number().min(0).max(5).default(0.6),
});
export type Zoom = z.infer<typeof ZoomSchema>;

// A still image overlaid over a span of the SOURCE timeline with a Ken Burns
// push-in: ease from 1.0 toward `scale` over the span, centered on (focusX,
// focusY) in [0,1] image coordinates. Distinct from Broll (which is video).
export const StillSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  scale: z.number().min(1).max(3).default(1.2),
  focusX: z.number().min(0).max(1).default(0.5),
  focusY: z.number().min(0).max(1).default(0.5),
});
export type Still = z.infer<typeof StillSchema>;

// An editorial title card (lower-third or centered) over a span of the SOURCE timeline.
export const TitleSchema = z.object({
  id: z.string(),
  text: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  position: z.enum(["lower", "center", "hero"]).default("lower"),
});
export type Title = z.infer<typeof TitleSchema>;

// A subagent-produced "visual scene log" of the MAIN video: what is on screen
// across spans of source time, so the editing agent knows where the footage is
// already visually interesting (speaker, slide, screen-share) versus where it
// wants b-roll cover. Built from the sample frames extracted at ingest.
export const SceneSegmentSchema = z.object({
  fromSec: z.number().nonnegative(),
  toSec: z.number().nonnegative(),
  /** One concise sentence of what is on screen in this span. */
  summary: z.string(),
  /** What dominates the frame: the talker, a slide, a screen-share, or other. */
  onScreen: z.enum(["speaker", "slide", "screen", "other"]).optional(),
  /** True when this span is visually static and a good candidate for b-roll. */
  brollOpportunity: z.boolean().optional(),
});
export type SceneSegment = z.infer<typeof SceneSegmentSchema>;

export const SceneLogSchema = z.object({
  segments: z.array(SceneSegmentSchema).default([]),
  /** ISO timestamp of the analysis run. */
  analyzedAt: z.string(),
  /** Agent label that produced the log (e.g. "Claude"). */
  agent: z.string().optional(),
});
export type SceneLog = z.infer<typeof SceneLogSchema>;

// Global animation "feel": the deck's anim.tsx applied to OpenKlip. A handful of
// knobs drive every overlay entrance, so "make it snappier" is a one-number
// change. `speed` scales all durations (higher = shorter = snappier).
export const MotionSchema = z
  .object({
    /** Fade in/out for lower-third and centered titles (ms). */
    fadeMs: z.number().min(0).max(2000).default(180),
    /** Fade in/out for hero cards (ms). */
    heroFadeMs: z.number().min(0).max(2000).default(320),
    /** Lower-third slide-in distance, as a fraction of frame height. */
    slideFrac: z.number().min(0).max(0.3).default(0.04),
    /** Global speed multiplier: durations are divided by this. */
    speed: z.number().min(0.25).max(4).default(1),
  })
  .default({ fadeMs: 180, heroFadeMs: 320, slideFrac: 0.04, speed: 1 });
export type Motion = z.infer<typeof MotionSchema>;

export const ProjectSchema = z.object({
  version: z.literal(1),
  slug: z.string(),
  source: z.string(),
  proxy: z.string(),
  sampleRate: z.literal(SAMPLE_RATE),
  fps: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSamples: z.number().int().nonnegative(),
  padMs: z.number().nonnegative().default(50),
  captions: z
    .object({
      enabled: z.boolean().default(true),
      maxWords: z.number().int().positive().default(6),
    })
    .default({ enabled: true, maxWords: 6 }),
  assets: z.array(AssetSchema).default([]),
  broll: z.array(BrollSchema).default([]),
  look: z
    .object({
      vignette: z.boolean().default(false),
      grade: GradeSchema,
      /** Named .cube LUT in luts/ applied before the grade (absent = none). */
      lut: z.string().optional(),
    })
    .default({ vignette: false, grade: "none" }),
  zooms: z.array(ZoomSchema).default([]),
  titles: z.array(TitleSchema).default([]),
  stills: z.array(StillSchema).default([]),
  words: z.array(WordSchema),
  /** Edit template id (templates/<id>/skill.md). */
  template: z.string().optional(),
  /** Subagent visual scene log of the main video (absent until analyzed). */
  sceneLog: SceneLogSchema.optional(),
  /** Global animation feel for overlay entrances. */
  motion: MotionSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export interface Range {
  endSec: number;
  startSec: number;
}

export function samplesToSec(samples: number): number {
  return Math.round(samples) / SAMPLE_RATE;
}

// Group maximal runs of kept words into ranges, apply symmetric pad, clamp, merge overlaps.
export function survivingRanges(project: Project): Range[] {
  const pad = (project.padMs ?? 50) / 1000;
  const durSec = project.durationSamples / project.sampleRate;
  const raw: Array<{ start: number; end: number }> = [];
  let cur: { start: number; end: number } | null = null;
  for (const w of project.words) {
    if (w.deleted) {
      if (cur) {
        raw.push(cur);
        cur = null;
      }
      continue;
    }
    const s = samplesToSec(w.startSample);
    const e = samplesToSec(w.endSample);
    if (cur) {
      cur.end = Math.max(cur.end, e);
    } else {
      cur = { start: s, end: e };
    }
  }
  if (cur) {
    raw.push(cur);
  }

  const padded: Range[] = raw.map((r) => ({
    startSec: Math.max(0, r.start - pad),
    endSec: Math.min(durSec || r.end + pad, r.end + pad),
  }));

  const merged: Range[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.startSec <= last.endSec) {
      last.endSec = Math.max(last.endSec, r.endSec);
    } else {
      merged.push({ ...r });
    }
  }
  return merged.filter((r) => r.endSec - r.startSec > 0.01);
}

export function totalDurationSec(ranges: Range[]): number {
  return ranges.reduce((a, r) => a + (r.endSec - r.startSec), 0);
}

// Map a source-time second into the cut (output) timeline. Monotonic; clamps a
// time that falls inside a deleted gap to the nearest kept boundary. Used to
// place b-roll overlays and burned captions in output time.
export function sourceToOutputSec(sourceSec: number, ranges: Range[]): number {
  let cum = 0;
  for (const r of ranges) {
    if (sourceSec < r.startSec) {
      return cum;
    }
    if (sourceSec <= r.endSec) {
      return cum + (sourceSec - r.startSec);
    }
    cum += r.endSec - r.startSec;
  }
  return cum;
}

export function sec(n: number): string {
  return n.toFixed(6);
}
