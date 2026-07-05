// The unified action registry: one named, schema-validated definition per
// project.json mutation. This is the single source of truth the CLI, the GUI
// server actions, and a future MCP/HTTP surface all route through : the same
// shape agent-native's defineAction gives (one action → UI + agent + HTTP +
// MCP). The pure mutation logic still lives in actions.ts; this layer adds the
// name, the input contract (Zod, which doubles as the agent's JSON-Schema tool
// definition), and the surface metadata, so parity is structural rather than a
// promise kept by hand across three dispatch sites.
import { z } from "zod";
import {
  addBroll,
  addDeadAir,
  addGraphic,
  addJsonGraphic,
  addMusic,
  addStill,
  addTitle,
  addZoom,
  cutAllByText,
  cutByText,
  cutWords,
  removeBroll,
  removeDeadAir,
  removeGraphic,
  removeMusic,
  removeStill,
  removeTitle,
  removeZoom,
  reorderBroll,
  reorderTitle,
  reorderZoom,
  restoreAll,
  setAssetFlags,
  setAudio,
  setCaptionInset,
  setCaptionMaxWords,
  setCaptionStyle,
  setCaptions,
  setCutSnap,
  setExportSettings,
  setLook,
  setMotion,
  setPadMs,
  setWordText,
  updateBroll,
  updateGraphic,
  updateJsonGraphic,
  updateMusic,
  updateStill,
  updateTitle,
  updateZoom,
} from "./actions.ts";
import { CAPTION_STYLE_IDS } from "./caption-styles.ts";
import { NEUTRAL_COLOR } from "./color-adjust.ts";
import {
  BrollAudioModeSchema,
  BrollDisplaySchema,
  CUT_TRANSITION_TYPES,
  FilterSchema,
  PhraseAnchorSchema,
  type Project,
} from "./edl.ts";
import { EXPORT_ASPECT_IDS } from "./export-aspect.ts";
import { addGraphicsAtCutSeams } from "./graphic-cut-transitions.ts";
import { KeyframeSchema } from "./keyframes.ts";
import {
  PRODUCT_ANNOUNCEMENT_CATALOG,
  ProductAnnouncementCatalogSchema,
  ProductAnnouncementSpecSchema,
  validateProductAnnouncementSpec,
} from "./product-announcement.ts";
import { reanchorOne, reanchorProject } from "./reanchor.ts";
import { CAPTION_INSET_PLATFORMS } from "./safe-areas.ts";

// Where an action is exposed. The CLI dispatch, the editor's server actions, and
// the agent-facing manifest each filter the registry by surface.
export type Surface = "cli" | "gui" | "mcp";

export interface ActionDef {
  name: string;
  // Input is already validated against `schema` by the time `run` is called.
  run: (project: Project, input: unknown) => unknown;
  schema: z.ZodType;
  summary: string;
  surfaces: Surface[];
}

// Define an action with input types inferred from its Zod schema. The wrapper
// keeps `run` honest (it receives the parsed type) while the stored ActionDef
// erases the generic so the registry is a homogeneous list.
function defineAction<S extends z.ZodType>(def: {
  name: string;
  summary: string;
  surfaces: Surface[];
  schema: S;
  run: (project: Project, input: z.infer<S>) => unknown;
}): ActionDef {
  return def as ActionDef;
}

// Schemas describe input *shape* only : field names, types, enums, and which
// fields are required. All value bounds (non-negative seconds, scale 1–3, focus
// 0–1, maxWords 1–12, pad 0–500, …) and project-relative invariants (span vs.
// duration, asset existence/kind) are owned by the primitives in actions.ts,
// which throw or clamp. Keeping bounds in one place : the primitive : is what
// makes this registry DRY rather than a second copy of the rules to drift.
const sec = z.number();
const position = z.enum([
  "lower",
  "center",
  "hero",
  "quote",
  "divider",
  "callout",
]);
const track = z.enum(["broll", "title", "zoom"]);
const ProductAnnouncementActionSpecSchema =
  ProductAnnouncementSpecSchema.superRefine((spec, ctx) => {
    const validation = validateProductAnnouncementSpec(spec);
    if (validation.success) {
      return;
    }
    for (const issue of validation.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `invalid product announcement spec: ${issue}`,
      });
    }
  });

export const actions: ActionDef[] = [
  defineAction({
    name: "cut",
    summary: "Mark words deleted (or restored) by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      ids: z.array(z.string()).min(1),
      deleted: z.boolean().default(true),
      note: z.string().optional(),
    }),
    run: (p, i) => {
      cutWords(p, i.ids, i.deleted, i.note);
      // F2: a deletion can strand an anchored overlay; re-resolve its span.
      const reanchored = reanchorProject(p);
      return { cut: i.deleted, ids: i.ids, reanchored };
    },
  }),
  defineAction({
    name: "cut-text",
    summary: "Cut the first (or every, with all) run matching a phrase.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      phrase: z.string().min(1),
      all: z.boolean().default(false),
      note: z.string().optional(),
    }),
    run: (p, i) => {
      const result = i.all
        ? cutAllByText(p, i.phrase, i.note)
        : cutByText(p, i.phrase, i.note);
      // F2: cutting a phrase can strand an anchored overlay; re-resolve spans.
      const reanchored = reanchorProject(p);
      return { ...result, reanchored };
    },
  }),
  defineAction({
    name: "restore-all",
    summary: "Restore every word (clear all cuts).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({}),
    run: (p) => {
      restoreAll(p);
      // F2: restoring words can bring a phrase back; re-resolve stale anchors.
      const reanchored = reanchorProject(p);
      return { ok: true, reanchored };
    },
  }),
  defineAction({
    name: "word-text",
    summary:
      "Correct one word's transcript text (agent/CLI parity surface; the GUI's bulk edits use its own edit-words path).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      text: z.string(),
    }),
    run: (p, i) => setWordText(p, i.id, i.text),
  }),
  defineAction({
    name: "broll-add",
    summary: "Cover a source-time span with a registered b-roll asset.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      assetId: z.string(),
      audioMode: BrollAudioModeSchema.optional(),
      display: BrollDisplaySchema.optional(),
      fromSec: sec,
      toSec: sec,
      srcInSec: sec.optional(),
      note: z.string().optional(),
      anchor: PhraseAnchorSchema.optional(),
    }),
    run: (p, i) => addBroll(p, i),
  }),
  defineAction({
    name: "broll-set",
    summary:
      "Patch a b-roll clip (asset, span, source in-point, display, audio mode).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      assetId: z.string().optional(),
      audioMode: BrollAudioModeSchema.optional(),
      display: BrollDisplaySchema.optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
      srcInSec: sec.optional(),
      note: z.string().optional(),
    }),
    run: (p, i) => updateBroll(p, i.id, i),
  }),
  defineAction({
    name: "broll-rm",
    summary: "Remove a b-roll clip by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeBroll(p, i.id) }),
  }),
  defineAction({
    name: "music-add",
    summary:
      "Place background music from a registered music asset under the voice.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      assetId: z.string(),
      fromSec: sec,
      toSec: sec,
      gain: z.number().optional(),
      fadeInSec: z.number().optional(),
      fadeOutSec: z.number().optional(),
      srcInSec: sec.optional(),
      mode: z.enum(["trim", "loop"]).optional(),
      note: z.string().optional(),
    }),
    run: (p, i) => addMusic(p, i),
  }),
  defineAction({
    name: "music-set",
    summary:
      "Patch a music placement (span, gain, fades, mode, source in-point).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      assetId: z.string().optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
      gain: z.number().optional(),
      fadeInSec: z.number().optional(),
      fadeOutSec: z.number().optional(),
      srcInSec: sec.optional(),
      mode: z.enum(["trim", "loop"]).optional(),
      note: z.string().optional(),
    }),
    run: (p, i) => updateMusic(p, i.id, i),
  }),
  defineAction({
    name: "music-rm",
    summary: "Remove a music placement by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeMusic(p, i.id) }),
  }),
  defineAction({
    name: "still-add",
    summary: "Overlay a registered still image with a Ken Burns push-in.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      assetId: z.string(),
      fromSec: sec,
      toSec: sec,
      scale: z.number().optional(),
      focusX: z.number().optional(),
      focusY: z.number().optional(),
      note: z.string().optional(),
      anchor: PhraseAnchorSchema.optional(),
    }),
    run: (p, i) => addStill(p, i),
  }),
  defineAction({
    name: "still-rm",
    summary: "Remove a still overlay by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeStill(p, i.id) }),
  }),
  defineAction({
    name: "still-set",
    summary: "Patch a still overlay (asset, span, Ken Burns look).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      assetId: z.string().optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
      scale: z.number().optional(),
      focusX: z.number().optional(),
      focusY: z.number().optional(),
      note: z.string().optional(),
    }),
    run: (p, i) => updateStill(p, i.id, i),
  }),
  defineAction({
    name: "title-add",
    summary: "Burn a title card over a source-time span.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      fromSec: sec,
      toSec: sec,
      text: z.string(),
      position: position.optional(),
      note: z.string().optional(),
      anchor: PhraseAnchorSchema.optional(),
    }),
    run: (p, i) => addTitle(p, i),
  }),
  defineAction({
    name: "title-set",
    summary: "Patch a title card (text, position, span).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      text: z.string().optional(),
      position: position.optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
      note: z.string().optional(),
    }),
    run: (p, i) => updateTitle(p, i.id, i),
  }),
  defineAction({
    name: "title-rm",
    summary: "Remove a title card by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeTitle(p, i.id) }),
  }),
  defineAction({
    name: "zoom-add",
    summary: "Add a push-in zoom over a source-time span.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      fromSec: sec,
      toSec: sec,
      scale: z.number().optional(),
      rampSec: z.number().optional(),
      note: z.string().optional(),
      anchor: PhraseAnchorSchema.optional(),
    }),
    run: (p, i) => addZoom(p, i),
  }),
  defineAction({
    name: "zoom-set",
    summary: "Patch a push-in zoom (scale, ramp, span).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      scale: z.number().optional(),
      rampSec: z.number().optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
      note: z.string().optional(),
    }),
    run: (p, i) => updateZoom(p, i.id, i),
  }),
  defineAction({
    name: "zoom-rm",
    summary: "Remove a push-in zoom by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeZoom(p, i.id) }),
  }),
  defineAction({
    name: "graphic-add",
    summary: "Overlay an HTML/CSS graphic template over a source-time span.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      template: z.string(),
      fromSec: sec,
      toSec: sec,
      params: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional(),
      track: track.optional(),
      note: z.string().optional(),
      anchor: PhraseAnchorSchema.optional(),
    }),
    run: (p, i) => addGraphic(p, i),
  }),
  defineAction({
    name: "graphic-set",
    summary: "Patch a graphic overlay (template, params, span, track).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      template: z.string().optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
      params: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional(),
      keyframes: KeyframeSchema.array().max(64).nullable().optional(),
      track: track.optional(),
      note: z.string().optional(),
    }),
    run: (p, i) => updateGraphic(p, i.id, i),
  }),
  defineAction({
    name: "json-graphic-add",
    summary:
      "Overlay a validated json-render product announcement spec over a source-time span.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      catalog: ProductAnnouncementCatalogSchema,
      fromSec: sec,
      toSec: sec,
      spec: ProductAnnouncementActionSpecSchema,
      track: track.optional(),
      note: z.string().optional(),
      anchor: PhraseAnchorSchema.optional(),
    }),
    run: (p, i) =>
      addJsonGraphic(p, {
        ...i,
        catalog: i.catalog ?? PRODUCT_ANNOUNCEMENT_CATALOG,
      }),
  }),
  defineAction({
    name: "json-graphic-set",
    summary: "Patch a json-render graphic overlay (spec, span, track).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      catalog: ProductAnnouncementCatalogSchema.optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
      spec: ProductAnnouncementActionSpecSchema.optional(),
      track: track.optional(),
      note: z.string().optional(),
    }),
    run: (p, i) => updateJsonGraphic(p, i.id, i),
  }),
  defineAction({
    name: "graphic-rm",
    summary: "Remove a graphic overlay by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeGraphic(p, i.id) }),
  }),
  defineAction({
    name: "graphic-add-cuts",
    summary:
      "Place a transition-* graphic centered on every kept-range cut seam.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      template: z.string(),
      durationSec: sec.optional(),
      params: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional(),
      track: track.optional(),
      note: z.string().optional(),
    }),
    run: (p, i) => {
      const items = addGraphicsAtCutSeams(p, i);
      return { count: items.length, ids: items.map((g) => g.id), items };
    },
  }),
  defineAction({
    name: "captions",
    summary: "Toggle burned captions for export.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ enabled: z.boolean() }),
    run: (p, i) => {
      setCaptions(p, i.enabled);
      return { enabled: i.enabled };
    },
  }),
  defineAction({
    name: "captions-max",
    summary: "Set words per caption line (1–12).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ maxWords: z.number() }),
    run: (p, i) => {
      setCaptionMaxWords(p, i.maxWords);
      return { maxWords: p.captions.maxWords };
    },
  }),
  defineAction({
    name: "captions-style",
    summary: `Set the caption look preset (${CAPTION_STYLE_IDS.join(", ")}).`,
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ style: z.enum(CAPTION_STYLE_IDS) }),
    run: (p, i) => {
      setCaptionStyle(p, i.style);
      return { style: p.captions.style };
    },
  }),
  defineAction({
    name: "captions-inset",
    summary:
      "Toggle vertical-export caption safe-area inset (generic|tiktok|reels|youtube-shorts).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      enabled: z.boolean(),
      platform: z.enum(CAPTION_INSET_PLATFORMS).optional(),
    }),
    run: (p, i) => {
      setCaptionInset(p, i);
      return {
        insetPlatform: p.captions.insetPlatform ?? null,
      };
    },
  }),
  defineAction({
    name: "pad",
    summary: "Set symmetric padding around kept ranges (0–500 ms).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ padMs: z.number() }),
    run: (p, i) => {
      setPadMs(p, i.padMs);
      return { padMs: p.padMs };
    },
  }),
  defineAction({
    name: "cuts-snap",
    summary:
      "Store cut-boundary snap settings for VAD cleanup and short crossfades.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      enabled: z.boolean().optional(),
      mode: z.enum(["off", "vad"]).optional(),
      maxShiftMs: z.number().optional(),
      crossfadeMs: z.number().optional(),
    }),
    run: (p, i) => {
      setCutSnap(p, i);
      return { snap: p.cuts.snap };
    },
  }),
  defineAction({
    name: "dead-air-add",
    summary:
      "Register dead-air spans (source time) to drop from otherwise-kept ranges.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      spans: z
        .array(z.object({ fromSec: sec, toSec: sec }))
        .min(1)
        .max(50),
    }),
    run: (p, i) => addDeadAir(p, i.spans),
  }),
  defineAction({
    name: "dead-air-rm",
    summary: "Remove a registered dead-air span by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeDeadAir(p, i.id) }),
  }),
  defineAction({
    name: "look-vignette",
    summary: "Toggle the vignette look flag.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ vignette: z.boolean() }),
    run: (p, i) => {
      setLook(p, { vignette: i.vignette });
      return { vignette: i.vignette };
    },
  }),
  defineAction({
    name: "look-filter",
    summary: "Set the built-in filter applied to the whole picture.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ filter: FilterSchema }),
    run: (p, i) => {
      setLook(p, { filter: i.filter });
      return { filter: p.look.filter };
    },
  }),
  defineAction({
    name: "look-lut",
    summary: "Set or clear a named .cube LUT (empty string clears).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ lut: z.string() }),
    run: (p, i) => {
      setLook(p, { lut: i.lut });
      return { lut: p.look.lut ?? null };
    },
  }),
  defineAction({
    name: "look-color",
    summary:
      "Adjust continuous color knobs on top of the filter (temperature, tint, brightness, contrast, saturation). Omitted knobs keep their value; reset:true returns to neutral.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      temperature: z.number().min(-1).max(1).optional(),
      tint: z.number().min(-1).max(1).optional(),
      brightness: z.number().min(-1).max(1).optional(),
      contrast: z.number().min(0).max(3).optional(),
      saturation: z.number().min(0).max(3).optional(),
      reset: z.boolean().optional(),
    }),
    run: (p, i) => {
      if (i.reset) {
        setLook(p, { color: NEUTRAL_COLOR });
      } else {
        const { reset: _reset, ...knobs } = i;
        setLook(p, { color: knobs });
      }
      return { color: p.look.color ?? null };
    },
  }),
  defineAction({
    name: "look-transition",
    summary:
      "Set the visual cut transition applied between kept-range segments at export (none, crossfade, or dip-to-black). Transitions require voice-only exports (no b-roll, stills, music, or rich graphics).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      type: z.enum(CUT_TRANSITION_TYPES).optional(),
      durationMs: z.number().int().min(50).max(2000).optional(),
    }),
    run: (p, i) => {
      setLook(p, { transition: i });
      return { transition: p.look.transition };
    },
  }),
  defineAction({
    name: "motion",
    summary: "Set the global animation feel (speed, fade, slide).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      speed: z.number().min(0.25).max(4).optional(),
      fadeMs: z.number().min(0).max(2000).optional(),
      heroFadeMs: z.number().min(0).max(2000).optional(),
      slideFrac: z.number().min(0).max(0.3).optional(),
    }),
    run: (p, i) => {
      setMotion(p, i);
      return { motion: p.motion };
    },
  }),
  defineAction({
    name: "export-set",
    summary:
      "Set export aspect ratio, manual reframe crop, and crop mode (manual or scene) for preview/export parity.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      aspect: z.enum(EXPORT_ASPECT_IDS).optional(),
      crop: z
        .object({
          focusX: z.number().optional(),
          focusY: z.number().optional(),
          scale: z.number().optional(),
        })
        .optional(),
      cropMode: z.enum(["manual", "scene", "vision"]).optional(),
      layout: z.enum(["fill", "split-vertical"]).optional(),
      splitVertical: z
        .object({
          ratio: z.number().optional(),
          speakerPosition: z.enum(["top", "bottom"]).optional(),
        })
        .optional(),
    }),
    run: (p, i) => {
      setExportSettings(p, i);
      return { export: p.export };
    },
  }),
  defineAction({
    name: "audio",
    summary:
      "Set export audio quality: sidechain ducking under music, loudness normalization, and voice highpass. Bounds are enforced in setAudio, not here (cuts-snap precedent) - schema is shape-only.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      ducking: z
        .object({
          enabled: z.boolean().optional(),
          amountDb: z.number().optional(),
          attackMs: z.number().optional(),
          releaseMs: z.number().optional(),
        })
        .optional(),
      loudness: z
        .object({
          enabled: z.boolean().optional(),
          targetLufs: z.number().optional(),
          mode: z.enum(["single", "two-pass"]).optional(),
        })
        .optional(),
      noiseReduction: z
        .object({
          enabled: z.boolean().optional(),
          nr: z.number().optional(),
        })
        .optional(),
      voiceHighpass: z
        .object({
          enabled: z.boolean().optional(),
          hz: z.number().optional(),
        })
        .optional(),
      // Unlike its siblings above, intensity is bounded here too (not just
      // shape-only): 0-1 is an unambiguous, non-domain-specific range, so
      // the MCP boundary rejects an obviously invalid value outright.
      // setAudio still re-clamps on write regardless (defense in depth for
      // the CLI and any other direct caller).
      deEsser: z
        .object({
          enabled: z.boolean().optional(),
          intensity: z.number().min(0).max(1).optional(),
        })
        .optional(),
    }),
    run: (p, i) => {
      setAudio(p, i);
      return { audio: p.audio };
    },
  }),
  defineAction({
    name: "reorder",
    summary: "Restack an overlay within its track (paint order).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      track,
      id: z.string(),
      toIndex: z.number(),
    }),
    run: (p, i) => {
      const list =
        i.track === "broll"
          ? reorderBroll(p, i.id, i.toIndex)
          : i.track === "title"
            ? reorderTitle(p, i.id, i.toIndex)
            : reorderZoom(p, i.id, i.toIndex);
      return { track: i.track, order: list.map((x) => x.id) };
    },
  }),
  defineAction({
    name: "reanchor",
    summary:
      "Re-resolve phrase-anchored overlays onto the current kept words (all, or one by id).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string().optional() }),
    run: (p, i) => (i.id ? [reanchorOne(p, i.id)] : reanchorProject(p)),
  }),
  defineAction({
    name: "asset-flags",
    summary:
      "Mark a registered asset as must-use or avoid for agent placement.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      assetId: z.string(),
      mustUse: z.boolean().optional(),
      avoid: z.boolean().optional(),
    }),
    run: (p, i) => {
      const asset = setAssetFlags(p, i.assetId, {
        mustUse: i.mustUse,
        avoid: i.avoid,
      });
      return {
        assetId: asset.id,
        ...(asset.mustUse === undefined ? {} : { mustUse: asset.mustUse }),
        ...(asset.avoid === undefined ? {} : { avoid: asset.avoid }),
      };
    },
  }),
];

const byName = new Map(actions.map((a) => [a.name, a]));

export function getAction(name: string): ActionDef | undefined {
  return byName.get(name);
}

// Validate `rawInput` against the action's schema, then run the mutation against
// `project`. Throws on unknown name or invalid input : the one dispatch path
// every surface shares.
export function runAction(
  name: string,
  project: Project,
  rawInput: unknown
): unknown {
  const action = getAction(name);
  if (!action) {
    const known = actions.map((a) => a.name).join(", ");
    throw new Error(`unknown action "${name}". Known actions: ${known}`);
  }
  let input: unknown;
  try {
    input = action.schema.parse(rawInput);
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Flatten the issue list into one readable line instead of letting the
      // raw ZodError JSON reach the CLI/agent. e.g. `track: Invalid option …`.
      const detail = err.issues
        .map((i) => {
          const path = i.path.join(".");
          return path ? `${path}: ${i.message}` : i.message;
        })
        .join("; ");
      throw new Error(`invalid input for "${name}": ${detail}`);
    }
    throw err;
  }
  return action.run(project, input);
}

export interface ActionManifestEntry {
  // Zod rendered to JSON Schema : this is exactly the MCP tool inputSchema.
  // biome-ignore lint/suspicious/noExplicitAny: JSON Schema is an open shape.
  inputSchema: any;
  name: string;
  summary: string;
  surfaces: Surface[];
}

// A machine-readable capability manifest an external agent can read whole : the
// "agents read the action list from one place" idea, no per-tool wiring. Filter
// by surface to get, e.g., just the MCP-exposed actions.
export function actionManifest(surface?: Surface): ActionManifestEntry[] {
  return actions
    .filter((a) => !surface || a.surfaces.includes(surface))
    .map((a) => ({
      name: a.name,
      summary: a.summary,
      surfaces: a.surfaces,
      inputSchema: z.toJSONSchema(a.schema),
    }));
}

// Render the registry as a Markdown table : the generatable replacement for the
// hand-maintained capability map in AGENTS.md.
export function actionTable(surface?: Surface): string {
  const rows = actions
    .filter((a) => !surface || a.surfaces.includes(surface))
    .map((a) => `| \`${a.name}\` | ${a.summary} | ${a.surfaces.join(", ")} |`);
  return [
    "| Action | What it does | Surfaces |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}
