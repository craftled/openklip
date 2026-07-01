import { z } from "zod";
import {
  ProductAnnouncementCatalogSchema,
  ProductAnnouncementSpecSchema,
} from "./product-announcement.ts";

// Canonical time base: integer audio samples at 48 kHz. Preview and export both
// derive seconds from this one grid via samplesToSec() so they cannot drift.
export const SAMPLE_RATE = 48_000;

export const WordSchema = z.object({
  id: z.string(),
  text: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  deleted: z.boolean().default(false),
  /** F1: why this word was cut/kept; metadata only, never reaches ffmpeg. */
  note: z.string().optional(),
});
export type Word = z.infer<typeof WordSchema>;

// A transcript anchor remembered on an overlay so its sample span can be
// re-resolved from the CURRENT kept words after a re-cut (resolve-and-REMEMBER,
// vs the old resolve-and-forget). Metadata only: the exporter still reads
// startSample/endSample. `phrase` = spoken text placed at; `wordIds` = the kept
// run it last resolved to (provenance/hint); `stale` = true when re-resolution
// can no longer find the phrase (last good span is preserved).
export const PhraseAnchorSchema = z.object({
  phrase: z.string().min(1),
  wordIds: z.array(z.string()).default([]),
  stale: z.boolean().default(false),
});
export type PhraseAnchor = z.infer<typeof PhraseAnchorSchema>;

export const AssetKindSchema = z.enum(["broll", "music", "still"]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

// Built-in filter applied to the whole picture at export. These are
// deterministic ffmpeg filter chains, not external LUT files.
export const FilterSchema = z
  .enum(["none", "natural", "warm", "cool", "muted", "cinematic", "dramatic"])
  .default("none");
export type Filter = z.infer<typeof FilterSchema>;

// Continuous color adjustment layered on top of the base filter. Pure
// numbers that map deterministically to ffmpeg
// colorbalance (temperature/tint) then eq (contrast/brightness/saturation), in
// that order. Every default is the identity (no change), so an agent or human
// only moves the knobs they care about. Absent or all-neutral emits no filter.
// Unlike the deck, moving a knob here writes the EDL directly through the same
// action a CLI or agent calls; there is no "copy a prompt" round trip.
export const ColorAdjustSchema = z.object({
  /** Warm (+) / cool (-) shift: red up, blue down via colorbalance. */
  temperature: z.number().min(-1).max(1).default(0),
  /** Green (+) / magenta (-) shift via the green channel. */
  tint: z.number().min(-1).max(1).default(0),
  /** Flat additive brightness in eq (-1..1, 0 = unchanged). */
  brightness: z.number().min(-1).max(1).default(0),
  /** Contrast multiplier around mid-gray (1 = unchanged). */
  contrast: z.number().min(0).max(3).default(1),
  /** Saturation multiplier (1 = unchanged, 0 = grayscale). */
  saturation: z.number().min(0).max(3).default(1),
});
export type ColorAdjust = z.infer<typeof ColorAdjustSchema>;

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
  note: z.string().optional(),
  anchor: PhraseAnchorSchema.optional(),
});
export type Broll = z.infer<typeof BrollSchema>;

// A push-in over a span of the SOURCE timeline: ramp to `scale` over rampSec, then hold.
export const ZoomSchema = z.object({
  id: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  scale: z.number().min(1).max(3).default(1.15),
  rampSec: z.number().min(0).max(5).default(0.6),
  note: z.string().optional(),
  anchor: PhraseAnchorSchema.optional(),
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
  note: z.string().optional(),
  anchor: PhraseAnchorSchema.optional(),
});
export type Still = z.infer<typeof StillSchema>;

// An editorial title card (lower-third or centered) over a span of the SOURCE timeline.
export const TitleSchema = z.object({
  id: z.string(),
  text: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  position: z.enum(["lower", "center", "hero"]).default("lower"),
  note: z.string().optional(),
  anchor: PhraseAnchorSchema.optional(),
});
export type Title = z.infer<typeof TitleSchema>;

// A native HTML/CSS graphic template composited over a span of the SOURCE
// timeline. The HTML engine only emits an OVERLAY ASSET keyed to this sample
// range; ffmpeg stays the master compositor (see src/graphic-render.ts and the
// exporter hook). `template` is a graphics/<id> template id; `params` are the
// scalar inputs that template's manifest declares (text, colors, etc).
export const GraphicSchema = z
  .object({
    id: z.string(),
    type: z.enum(["template", "json-render"]).optional(),
    template: z.string(),
    catalog: ProductAnnouncementCatalogSchema.optional(),
    spec: ProductAnnouncementSpecSchema.optional(),
    params: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .default({}),
    startSample: z.number().int().nonnegative(),
    endSample: z.number().int().nonnegative(),
    track: z.enum(["broll", "title", "zoom"]).default("title"),
    note: z.string().optional(),
    anchor: PhraseAnchorSchema.optional(),
  })
  .superRefine((graphic, ctx) => {
    const hasJsonRenderFields =
      graphic.catalog !== undefined || graphic.spec !== undefined;
    if (hasJsonRenderFields && graphic.type !== "json-render") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'graphics with catalog or spec fields require type "json-render"',
        path: ["type"],
      });
      return;
    }
    if (graphic.type !== "json-render") {
      return;
    }
    if (!graphic.catalog) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "json-render graphics require a catalog",
        path: ["catalog"],
      });
    }
    if (!graphic.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "json-render graphics require a spec",
        path: ["spec"],
      });
    }
  });
export type Graphic = z.infer<typeof GraphicSchema>;

// ── FEATURE 3: multi-take assembly ──────────────────────────────────────────
// A take is one of several recordings of the same script, parked in takes/<id>/
// with its own transcript. Takes never ship in project.json (they live on disk);
// only the optional `assembly` provenance block below references them.
export const TakeWordSchema = WordSchema; // identical {id,text,startSample,endSample,deleted}
export const TakeSchema = z.object({
  id: z.string(),
  label: z.string().default(""),
  source: z.string(), // abs path to the take's original video
  proxy: z.string(), // relative-to-take-dir 720p proxy ("proxy.mp4")
  sampleRate: z.literal(SAMPLE_RATE),
  fps: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSamples: z.number().int().nonnegative(),
  words: z.array(TakeWordSchema),
  ingestedAt: z.string(), // ISO
});
export type Take = z.infer<typeof TakeSchema>;

// One contiguous run of words chosen from a single take, inclusive on both ends.
export const AssemblySegmentSchema = z.object({
  takeId: z.string(),
  startWordId: z.string(), // inclusive, ids into THAT take's words[]
  endWordId: z.string(), // inclusive
  note: z.string().optional(), // F1 synergy: why this take/line (provenance)
});
// The agent-supplied recipe: a list of segments laid end-to-end, with a seam pad.
export const AssemblySelectionSchema = z.object({
  segments: z.array(AssemblySegmentSchema).min(1),
  padMs: z.number().nonnegative().max(500).default(50),
});
export type AssemblySegment = z.infer<typeof AssemblySegmentSchema>;
export type AssemblySelection = z.infer<typeof AssemblySelectionSchema>;

// Provenance written into the assembled project.json: where every output span
// came from in source-take samples. The engine itself reads one source/proxy;
// this block only records the assembly so the agent can reason about it.
export const AssemblyProvenanceSchema = z.object({
  assembledAt: z.string(),
  segments: z.array(
    z.object({
      takeId: z.string(),
      startWordId: z.string(),
      endWordId: z.string(),
      srcStartSample: z.number().int().nonnegative(),
      srcEndSample: z.number().int().nonnegative(),
      outStartSample: z.number().int().nonnegative(),
      outEndSample: z.number().int().nonnegative(),
      note: z.string().optional(),
    })
  ),
});
export type AssemblyProvenance = z.infer<typeof AssemblyProvenanceSchema>;

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

// Cut-quality settings stored in project.json. The full VAD analysis stays in
// working/ as derived cache; this block records the edit behavior that preview,
// export, GUI, CLI, and agents must agree on.
export const CutSnapSchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.enum(["off", "vad"]).default("off"),
    maxShiftMs: z.number().min(0).max(500).default(120),
    crossfadeMs: z.number().min(0).max(100).default(24),
  })
  .default({
    enabled: false,
    mode: "off",
    maxShiftMs: 120,
    crossfadeMs: 24,
  });
export type CutSnap = z.infer<typeof CutSnapSchema>;

export const CutsSchema = z
  .object({
    snap: CutSnapSchema,
  })
  .default({
    snap: {
      enabled: false,
      mode: "off",
      maxShiftMs: 120,
      crossfadeMs: 24,
    },
  });
export type Cuts = z.infer<typeof CutsSchema>;

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
      /** Built-in filter applied to the whole picture. */
      filter: FilterSchema,
      /** Named .cube LUT in luts/ applied before the filter (absent = none). */
      lut: z.string().optional(),
      /** Continuous color knobs on top of the filter (absent = neutral). */
      color: ColorAdjustSchema.optional(),
    })
    .default({ vignette: false, filter: "none" }),
  zooms: z.array(ZoomSchema).default([]),
  titles: z.array(TitleSchema).default([]),
  stills: z.array(StillSchema).default([]),
  graphics: z.array(GraphicSchema).default([]),
  words: z.array(WordSchema),
  /** Cut-quality settings. Analysis caches live under working/, not here. */
  cuts: CutsSchema,
  /** Edit template id (templates/<id>/skill.md). */
  template: z.string().optional(),
  /** Subagent visual scene log of the main video (absent until analyzed). */
  sceneLog: SceneLogSchema.optional(),
  /** F3: provenance of a multi-take assembly (absent for single-source projects). */
  assembly: AssemblyProvenanceSchema.optional(),
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

  const padded: Range[] = raw.map((r, index) => ({
    startSec: Math.max(index === 0 ? 0 : r.start, r.start - pad),
    endSec: Math.min(
      index === raw.length - 1 ? durSec || r.end + pad : r.end,
      r.end + pad
    ),
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
