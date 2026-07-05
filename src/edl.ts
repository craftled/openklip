import { z } from "zod";
import {
  type SilenceSpan,
  snapRanges,
  subtractDeadAir,
} from "./audio-analysis-core.ts";
import { CAPTION_STYLE_IDS, DEFAULT_CAPTION_STYLE } from "./caption-styles.ts";
import { ExportLayoutSchema, SplitVerticalSchema } from "./export-layout.ts";
import { KeyframeSchema } from "./keyframes.ts";
import {
  ProductAnnouncementCatalogSchema,
  ProductAnnouncementSpecSchema,
} from "./product-announcement.ts";
import { CAPTION_INSET_PLATFORMS } from "./safe-areas.ts";

// Canonical time base: integer audio samples at 48 kHz. Preview and export both
// derive seconds from this one grid via samplesToSec() so they cannot drift.
export const SAMPLE_RATE = 48_000;

/** Optional provenance fields shared by words and overlays. */
export const AuthorshipFieldsSchema = {
  authoredBy: z.string().optional(),
  authoredAt: z.number().int().nonnegative().optional(),
  authoredRevision: z.number().int().nonnegative().optional(),
  authoredTaskId: z.string().optional(),
};

export const WordSchema = z.object({
  id: z.string(),
  text: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  deleted: z.boolean().default(false),
  /** F1: why this word was cut/kept; metadata only, never reaches ffmpeg. */
  note: z.string().optional(),
  /** Author id at last transcript mutation (human:local, ai:claude:…). */
  ...AuthorshipFieldsSchema,
  /**
   * The transcript text this word had BEFORE its first agent/CLI correction
   * (see setWordText in actions.ts). Set once and never overwritten, so the
   * original Whisper output stays recoverable even after edits. Absent for
   * words that have never been corrected.
   */
  originalText: z.string().optional(),
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

// Visual transition applied between kept-range cuts at export.
// "none" (default) is a hard cut, exactly the historical behavior.
// "crossfade" dissolves between the outgoing and incoming frames using ffmpeg
//   xfade. "dip" fades out to black then fades in, using a fade-out + fade-in
//   pair on each segment. Transitions are only applied in the segment export
//   path (voice-only, no b-roll/stills/music/rich graphics); falls back to
//   hard cut when the path is unavailable or there is only one range.
// durationMs is the total transition duration (50..2000 ms, default 500).
export const CUT_TRANSITION_TYPES = ["none", "crossfade", "dip"] as const;
export type CutTransitionType = (typeof CUT_TRANSITION_TYPES)[number];
export const CutTransitionSchema = z
  .object({
    type: z.enum(CUT_TRANSITION_TYPES).default("none"),
    durationMs: z.number().int().min(50).max(2000).default(500),
  })
  .default({ type: "none", durationMs: 500 });
export type CutTransition = z.infer<typeof CutTransitionSchema>;

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
  /** Brief-driven: agent should prefer placing this asset. */
  mustUse: z.boolean().optional(),
  /** Brief-driven: agent should not place this asset. */
  avoid: z.boolean().optional(),
});
export type Asset = z.infer<typeof AssetSchema>;

// A b-roll clip covering a span of the talking-head SOURCE timeline.
// display "cover" swaps the full frame to the b-roll while talker audio
// continues; "pip" keeps the speaker visible and insets b-roll bottom-right.
export const BrollDisplaySchema = z.enum(["cover", "pip", "split"]);
export type BrollDisplay = z.infer<typeof BrollDisplaySchema>;

// How the b-roll clip's soundtrack mixes with the voice at export.
export const BrollAudioModeSchema = z.enum([
  "silent",
  "broll",
  "mix",
  "duck-voice",
  "duck-broll",
]);
export type BrollAudioMode = z.infer<typeof BrollAudioModeSchema>;

export const BrollSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  srcInSample: z.number().int().nonnegative().default(0),
  display: BrollDisplaySchema.default("cover"),
  audioMode: BrollAudioModeSchema.default("silent"),
  note: z.string().optional(),
  anchor: PhraseAnchorSchema.optional(),
  ...AuthorshipFieldsSchema,
});
export type Broll = z.infer<typeof BrollSchema>;

// Background music under the voice: a placement of a registered music asset
// over a span of the SOURCE timeline. Unlike b-roll, export maps the span to
// ONE continuous output window, so the bed keeps playing across collapsed
// cuts instead of restarting per surviving range. All value bounds (gain 0-2,
// fades 0-10, span-vs-duration clamps) live in the actions.ts primitives.
export const MusicPlacementSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  srcInSample: z.number().int().nonnegative().default(0),
  /** Linear gain applied to the bed (1 = unity). */
  gain: z.number().default(1),
  fadeInSec: z.number().default(0),
  fadeOutSec: z.number().default(0),
  /** trim: end clamps to the asset remainder; loop: repeats to cover the span. */
  mode: z.enum(["trim", "loop"]).default("trim"),
  note: z.string().optional(),
  ...AuthorshipFieldsSchema,
});
export type MusicPlacement = z.infer<typeof MusicPlacementSchema>;

// A push-in over a span of the SOURCE timeline: ramp to `scale` over rampSec, then hold.
export const ZoomSchema = z.object({
  id: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  scale: z.number().min(1).max(3).default(1.15),
  rampSec: z.number().min(0).max(5).default(0.6),
  note: z.string().optional(),
  anchor: PhraseAnchorSchema.optional(),
  ...AuthorshipFieldsSchema,
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
  ...AuthorshipFieldsSchema,
});
export type Still = z.infer<typeof StillSchema>;

// An editorial title card (lower-third or centered) over a span of the SOURCE timeline.
export const TitleSchema = z.object({
  id: z.string(),
  text: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  position: z
    .enum(["lower", "center", "hero", "quote", "divider", "callout"])
    .default("lower"),
  note: z.string().optional(),
  anchor: PhraseAnchorSchema.optional(),
  ...AuthorshipFieldsSchema,
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
    keyframes: KeyframeSchema.array().max(64).optional(),
    note: z.string().optional(),
    anchor: PhraseAnchorSchema.optional(),
    ...AuthorshipFieldsSchema,
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
  /** Horizontal face center in the frame [0=left, 1=right] for speaker segments. */
  focusX: z.number().min(0).max(1).optional(),
  /** Vertical face center in the frame [0=top, 1=bottom] for speaker segments. */
  focusY: z.number().min(0).max(1).optional(),
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

// LLM-detected short-form clip candidates for a long edit (highlight reels).
export const HighlightClipSchema = z.object({
  id: z.string(),
  fromSec: z.number().nonnegative(),
  toSec: z.number().nonnegative(),
  /** Short label for the clip (hook or chapter title). */
  title: z.string(),
  /** Why this span works as a standalone short. */
  reason: z.string().optional(),
  /** Model confidence 0-1 when provided. */
  score: z.number().min(0).max(1).optional(),
});
export type HighlightClip = z.infer<typeof HighlightClipSchema>;

export const HighlightsSchema = z.object({
  clips: z.array(HighlightClipSchema).default([]),
  analyzedAt: z.string(),
  agent: z.string().optional(),
});
export type Highlights = z.infer<typeof HighlightsSchema>;

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

// A source-time span (48 kHz sample grid, like Word) manually or agent
// registered to drop from an otherwise-kept range: a natural pause or leftover
// dead air INSIDE a surviving stretch, as opposed to `deleted` words which
// remove the word's own span. Applied by effectiveRanges (export/preview) on
// top of survivingRanges: see subtractDeadAir in audio-analysis-core.ts.
export const DeadAirSpanSchema = z.object({
  id: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
});
export type DeadAirSpan = z.infer<typeof DeadAirSpanSchema>;

export const CleanupPhrasesSchema = z.object({
  alwaysCut: z.array(z.string()).default([]),
  neverCut: z.array(z.string()).default([]),
});

export const CutsSchema = z
  .object({
    snap: CutSnapSchema,
    /** Source-time spans removed from kept ranges; applied by effectiveRanges. */
    deadAir: z.array(DeadAirSpanSchema).default([]),
    /** Optional per-project cleanup phrase overrides (brief lists still apply). */
    cleanupPhrases: CleanupPhrasesSchema.optional(),
  })
  .default({
    snap: {
      enabled: false,
      mode: "off",
      maxShiftMs: 120,
      crossfadeMs: 24,
    },
    deadAir: [],
  });
export type Cuts = z.infer<typeof CutsSchema>;

// Export audio quality settings stored in project.json (Descript-match
// Milestone 4.2). Mirrors the MotionSchema shape: one settings object with a
// whole-object default so legacy project.json files parse unchanged. Bounds
// live here (like Motion/CutSnap) because this is the persisted, load-bearing
// document shape; the setAudio primitive re-clamps on write so callers cannot
// smuggle an out-of-range value past the schema via a partial merge.
export const AudioSchema = z
  .object({
    /** Sidechain-duck the music bed under the voice at export. */
    ducking: z
      .object({
        enabled: z.boolean().default(false),
        /** Target attenuation of the bed while the voice is present, in dB. */
        amountDb: z.number().min(1).max(30).default(12),
        attackMs: z.number().min(1).max(500).default(25),
        releaseMs: z.number().min(20).max(2000).default(250),
      })
      .default({ enabled: false, amountDb: 12, attackMs: 25, releaseMs: 250 }),
    /** Single-pass or two-pass loudnorm to a target integrated loudness. */
    loudness: z
      .object({
        enabled: z.boolean().default(false),
        targetLufs: z.number().min(-30).max(-10).default(-16),
        mode: z.enum(["single", "two-pass"]).default("single"),
      })
      .default({ enabled: false, targetLufs: -16, mode: "single" }),
    /** Light noise reduction on the voice bus (ffmpeg afftdn). */
    noiseReduction: z
      .object({
        enabled: z.boolean().default(false),
        /** afftdn nr (1-97). */
        nr: z.number().min(1).max(97).default(12),
      })
      .default({ enabled: false, nr: 12 }),
    /** Rumble-cut highpass applied to seam-crossfaded voice segments. */
    voiceHighpass: z
      .object({
        enabled: z.boolean().default(false),
        hz: z.number().min(40).max(200).default(80),
      })
      .default({ enabled: false, hz: 80 }),
    /**
     * De-essing on the voice bus (ffmpeg deesser). Only `intensity` (the
     * filter's `i` option, 0-1) is exposed, matching noiseReduction's
     * single-knob minimalism; `f` (frequency) and `s` (output mode) are
     * hardcoded to the filter's own defaults (f=0.5, s=o/output) rather than
     * surfaced as user controls.
     */
    deEsser: z
      .object({
        enabled: z.boolean().default(false),
        // ffmpeg's own default for `i` is 0 (off), but our `enabled` flag
        // already gates whether the filter runs; once a user turns it on,
        // default to the filter's `m` (max deessing) default of 0.5 as a
        // sane starting intensity.
        intensity: z.number().min(0).max(1).default(0.5),
      })
      .default({ enabled: false, intensity: 0.5 }),
  })
  .default({
    ducking: { enabled: false, amountDb: 12, attackMs: 25, releaseMs: 250 },
    loudness: { enabled: false, targetLufs: -16, mode: "single" as const },
    noiseReduction: { enabled: false, nr: 12 },
    voiceHighpass: { enabled: false, hz: 80 },
    deEsser: { enabled: false, intensity: 0.5 },
  });
export type Audio = z.infer<typeof AudioSchema>;

// Export aspect and manual reframe crop persisted on project.json so preview
// and export share one frame (Track F). `aspect` selects the output ratio;
// `crop` pans/zooms within the source before scaling to that frame.
export const ExportAspectSchema = z
  .enum(["source", "16:9", "9:16", "1:1"])
  .default("source");
export type ExportAspect = z.infer<typeof ExportAspectSchema>;

export const ExportCropSchema = z
  .object({
    focusX: z.number().min(0).max(1).default(0.5),
    focusY: z.number().min(0).max(1).default(0.5),
    scale: z.number().min(1).max(3).default(1),
  })
  .default({ focusX: 0.5, focusY: 0.5, scale: 1 });
export type ExportCrop = z.infer<typeof ExportCropSchema>;

export const CropModeSchema = z
  .enum(["manual", "scene", "vision"])
  .default("manual");
export type CropMode = z.infer<typeof CropModeSchema>;

export const ExportSettingsSchema = z
  .object({
    aspect: ExportAspectSchema,
    crop: ExportCropSchema,
    /** Whether crop focus is manual, sceneLog-derived, or Vision face detection. */
    cropMode: CropModeSchema,
    /** Output frame layout for fixed-aspect exports (9:16 split-screen). */
    layout: ExportLayoutSchema.default("fill"),
    /** Split-vertical pane settings when layout is split-vertical. */
    splitVertical: SplitVerticalSchema.optional(),
  })
  .default({
    aspect: "source",
    crop: { focusX: 0.5, focusY: 0.5, scale: 1 },
    cropMode: "manual",
    layout: "fill",
  });
export type ExportSettings = z.infer<typeof ExportSettingsSchema>;

export type { ExportLayout, SplitVertical } from "./export-layout.ts";

export const ProjectSchema = z
  .object({
    version: z.literal(1),
    slug: z.string(),
    /** Graphics-only project: no speech transcript; export uses full duration. */
    blankCanvas: z.boolean().optional(),
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
        /**
         * Caption look preset (src/caption-styles.ts is the source of
         * truth). READ-side tolerance: an unknown/invalid value (e.g. a
         * project.json written by a newer build, or a hand-edited value)
         * must not brick the whole project on load, so this falls back to
         * the default instead of throwing. The WRITER side stays strict:
         * the captions-style registry action schema (src/registry.ts) still
         * rejects invalid ids.
         */
        style: z.enum(CAPTION_STYLE_IDS).catch(DEFAULT_CAPTION_STYLE),
        /** Lift captions on vertical export using platform safe-area insets. */
        insetPlatform: z.enum(CAPTION_INSET_PLATFORMS).optional(),
      })
      .default({ enabled: true, maxWords: 6, style: DEFAULT_CAPTION_STYLE }),
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
        /** Visual transition applied between kept-range cuts at export. */
        transition: CutTransitionSchema,
      })
      .default({
        vignette: false,
        filter: "none",
        transition: { type: "none", durationMs: 500 },
      }),
    zooms: z.array(ZoomSchema).default([]),
    titles: z.array(TitleSchema).default([]),
    stills: z.array(StillSchema).default([]),
    graphics: z.array(GraphicSchema).default([]),
    /** Background music placements mixed under the voice at export. */
    music: z.array(MusicPlacementSchema).default([]),
    words: z.array(WordSchema),
    /** Cut-quality settings. Analysis caches live under working/, not here. */
    cuts: CutsSchema,
    /** Edit template id (templates/<id>/skill.md). */
    template: z.string().optional(),
    /** Subagent visual scene log of the main video (absent until analyzed). */
    sceneLog: SceneLogSchema.optional(),
    /** LLM highlight clip candidates for short-form extraction. */
    highlights: HighlightsSchema.optional(),
    /** F3: provenance of a multi-take assembly (absent for single-source projects). */
    assembly: AssemblyProvenanceSchema.optional(),
    /** Global animation feel for overlay entrances. */
    motion: MotionSchema,
    /** Export audio quality: ducking, loudness normalization, voice highpass. */
    audio: AudioSchema,
    /** Export aspect ratio and manual reframe crop (preview/export parity). */
    export: ExportSettingsSchema,
    /** Monotonic edit revision bumped by logged mutations (absent = 0). */
    revision: z.number().int().nonnegative().optional(),
  })
  // Forward-compat: keep unknown top-level keys instead of the zod default
  // (silently strip). Without this, a build that predates a new field
  // re-saving an existing project.json would silently drop that field.
  .passthrough();
export type Project = z.infer<typeof ProjectSchema>;

export interface Range {
  endSec: number;
  startSec: number;
}

/** Clip kept ranges to a source-time window (export-only; no project mutation). */
export function intersectRangesWithSpan(
  ranges: Range[],
  fromSec: number,
  toSec: number
): Range[] {
  if (toSec <= fromSec) {
    return [];
  }
  const out: Range[] = [];
  for (const r of ranges) {
    const startSec = Math.max(r.startSec, fromSec);
    const endSec = Math.min(r.endSec, toSec);
    if (endSec > startSec) {
      out.push({ startSec, endSec });
    }
  }
  return out;
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

/** Export ranges: blank-canvas projects use the full timeline when there are no kept words. */
export function rangesForExport(
  project: Project,
  silences?: SilenceSpan[]
): Range[] {
  const ranges = effectiveRanges(project, silences);
  if (ranges.length > 0) {
    return ranges;
  }
  if (project.blankCanvas) {
    const durSec = project.durationSamples / project.sampleRate;
    if (durSec > 0.01) {
      return [{ startSec: 0, endSec: durSec }];
    }
  }
  return ranges;
}

// The single shared range pipeline every consumer (exporter, query/CLI,
// compiledTimeline, and the web client) should read from. Layers on top of
// survivingRanges() in a fixed order:
//   1. dead-air subtraction (cuts.deadAir): ALWAYS applied when non-empty,
//      regardless of the snap setting, since a dead-air span is an explicit
//      "remove this" edit, not a VAD suggestion.
//   2. VAD snap (cuts.snap): only applied when snap.enabled, snap.mode is
//      "vad", AND the caller supplied `silences`. Dead-air runs first so
//      snap candidates are matched against the post-subtraction boundaries
//      (e.g. a boundary created by splitting a range around dead air can
//      itself snap onto a nearby silence).
// Callers that have no silence data (sync call sites, or surfaces that
// haven't loaded working/audio-analysis.json) simply omit `silences`; snap
// becomes a no-op and dead-air subtraction still applies, so CLI/GUI/export
// truth never diverges on dead-air, only on how tightly boundaries snap.
export function effectiveRanges(
  project: Project,
  silences?: SilenceSpan[]
): Range[] {
  let ranges = survivingRanges(project);
  const deadAir = project.cuts?.deadAir ?? [];
  if (deadAir.length > 0) {
    ranges = subtractDeadAir(ranges, deadAir, project.sampleRate);
  }
  const snap = project.cuts?.snap;
  if (snap?.enabled && snap.mode === "vad" && silences && silences.length > 0) {
    ranges = snapRanges(ranges, silences, snap.maxShiftMs / 1000);
  }
  return ranges;
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
