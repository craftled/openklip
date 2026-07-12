"use server";

import { existsSync } from "node:fs";
import { assembleFromSelection, listTakes, loadTake } from "@engine/assembly";
import { loadBrief, saveBrief as saveBriefFile } from "@engine/brief";
import { logBriefSet } from "@engine/brief-log";
import { camMix } from "@engine/cam-mix";
import type { CamSwitchSettings } from "@engine/cam-plan";
import { camRemix } from "@engine/cam-remix";
import { type CamRole, listCams, setCam } from "@engine/cams";
import type {
  ColorAdjust,
  Cuts,
  CutTransitionType,
  Filter,
  Motion,
  Project,
  Take,
} from "@engine/edl";
import {
  EXPORT_PLATFORM_IDS,
  type ExportPlatformId,
  isExportPlatformId,
} from "@engine/export-platforms";
import type { CutTransitionFallbackReason } from "@engine/export-segments";
import type { ExportCompression, ExportFormat } from "@engine/exporter";
import { finalizeGraphicSpan } from "@engine/graphic-placement";
import { projectPaths } from "@engine/paths";
import {
  applyBroll,
  applyLook,
  applyMotion,
  applyProjectEdits,
  applyStills,
  applyTitles,
  applyZooms,
  type clampBrollItems,
  type clampStillItems,
  type clampTitleItems,
  type clampZoomItems,
} from "@engine/projectMutations";
import { loadProject, mutateProject } from "@engine/projectStore";
import { guiMutateMeta } from "@engine/provenance";
import { getAction, runAction } from "@engine/registry";
import { revealInFileManager } from "@engine/reveal-path";
import { type RevertTarget, revertProject } from "@engine/revert";

export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; error: string; stack?: string };

// Next sanitizes thrown server-action errors in production, so we return a
// structured failure instead. The stack is attached only outside production so
// it never leaks to end users but is there when debugging the dev server.
function fail(error: unknown): { ok: false; error: string; stack?: string } {
  const e = error as Error;
  const base = { ok: false as const, error: e?.message ?? String(error) };
  if (process.env.NODE_ENV === "production") {
    return base;
  }
  return { ...base, stack: e?.stack };
}

export async function runGuiAction(
  slug: string,
  actionName: string,
  input: unknown
): Promise<ActionResult<{ result: unknown }>> {
  try {
    const action = getAction(actionName);
    if (!action) {
      throw new Error(`unknown GUI action: ${actionName}`);
    }
    if (!action.surfaces.includes("gui")) {
      throw new Error(`action is not available in the GUI: ${actionName}`);
    }
    let actionInput = input;
    if (
      actionName === "graphic-add" &&
      input &&
      typeof input === "object" &&
      ("beats" in input || "bpm" in input || "musicAssetId" in input)
    ) {
      const raw = input as {
        template: string;
        fromSec: number;
        toSec: number;
        params?: Record<string, string | number | boolean>;
        track?: string;
        note?: string;
        anchor?: unknown;
        beats?: number;
        bpm?: number;
        musicAssetId?: string;
      };
      const project = await loadProject(slug);
      const span = await finalizeGraphicSpan({
        slug,
        project,
        template: raw.template,
        fromSec: raw.fromSec,
        toSec: raw.toSec,
        params: raw.params ?? {},
        beats: raw.beats,
        bpm: raw.bpm,
        musicAssetId: raw.musicAssetId,
      });
      actionInput = {
        template: raw.template,
        fromSec: span.fromSec,
        toSec: span.toSec,
        params: raw.params,
        track: raw.track,
        note: raw.note,
        anchor: raw.anchor,
      };
    }
    const result = await mutateProject(
      slug,
      (project) => runAction(actionName, project, actionInput),
      { ...guiMutateMeta(actionName, input) }
    );
    return { ok: true, data: { result } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveProjectEdits(
  slug: string,
  body: {
    words?: Array<{ id: string; deleted: boolean; text?: string }>;
    captions?: { enabled?: boolean; maxWords?: number };
    cuts?: { snap?: Partial<Cuts["snap"]> };
    padMs?: number;
    template?: string | null;
  }
): Promise<ActionResult> {
  try {
    await mutateProject(slug, (project) => applyProjectEdits(project, body), {
      ...guiMutateMeta("edit-words", body),
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveLook(
  slug: string,
  body: {
    vignette?: boolean;
    filter?: Filter;
    lut?: string | null;
    color?: Partial<ColorAdjust>;
  }
): Promise<ActionResult> {
  try {
    await mutateProject(slug, (project) => applyLook(project, body), {
      ...guiMutateMeta("look", body),
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveMotion(
  slug: string,
  body: Partial<Motion>
): Promise<ActionResult> {
  try {
    await mutateProject(slug, (project) => applyMotion(project, body), {
      ...guiMutateMeta("motion", body),
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Project brief (brief.md): free-form context text, not a project.json field,
// so this bypasses mutateProject and writes the file directly (src/brief.ts).
// The write is still logged (best-effort, via the shared brief-log helper)
// so it shows up in the History panel like every other GUI edit.
export async function saveBrief(
  slug: string,
  text: string
): Promise<ActionResult> {
  try {
    await saveBriefFile(slug, text);
    await logBriefSet(slug, "human", text);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function loadBriefAction(
  slug: string
): Promise<ActionResult<{ brief: string | null }>> {
  try {
    const brief = await loadBrief(slug);
    return { ok: true, data: { brief: brief ?? null } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveZooms(
  slug: string,
  zooms: unknown[]
): Promise<ActionResult<{ zooms: ReturnType<typeof clampZoomItems> }>> {
  try {
    const items = await mutateProject(
      slug,
      (project) => {
        applyZooms(project, zooms);
        return project.zooms;
      },
      { ...guiMutateMeta("zooms", zooms) }
    );
    return { ok: true, data: { zooms: items } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveBroll(
  slug: string,
  broll: unknown[]
): Promise<ActionResult<{ broll: ReturnType<typeof clampBrollItems> }>> {
  try {
    const items = await mutateProject(
      slug,
      (project) => {
        applyBroll(project, broll);
        return project.broll;
      },
      { ...guiMutateMeta("broll", broll) }
    );
    return { ok: true, data: { broll: items } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveTitles(
  slug: string,
  titles: unknown[]
): Promise<ActionResult<{ titles: ReturnType<typeof clampTitleItems> }>> {
  try {
    const items = await mutateProject(
      slug,
      (project) => {
        applyTitles(project, titles);
        return project.titles;
      },
      { ...guiMutateMeta("titles", titles) }
    );
    return { ok: true, data: { titles: items } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveStills(
  slug: string,
  stills: unknown[]
): Promise<ActionResult<{ stills: ReturnType<typeof clampStillItems> }>> {
  try {
    const items = await mutateProject(
      slug,
      (project) => {
        applyStills(project, stills);
        return project.stills;
      },
      { ...guiMutateMeta("stills", stills) }
    );
    return { ok: true, data: { stills: items } };
  } catch (e) {
    return fail(e);
  }
}

export async function exportProject(
  slug: string,
  options?: {
    aspect?: "source" | "16:9" | "9:16" | "1:1";
    compression?: ExportCompression;
    crop?: { focusX?: number; focusY?: number; scale?: number };
    format?: ExportFormat;
    fps?: number;
    gifMaxWidth?: number;
    loudnessTargetLufs?: number;
    maxHeight?: number;
    platform?: ExportPlatformId;
  }
): Promise<
  ActionResult<{
    ranges: number;
    width: number;
    height: number;
    aspect: "source" | "16:9" | "9:16" | "1:1";
    fps: number;
    compression: ExportCompression;
    format: ExportFormat;
    durationSec: number;
    out: string;
    transition: {
      applied: boolean;
      reason?: CutTransitionFallbackReason;
      type: CutTransitionType;
    };
    sourceMediaWarn?: string;
  }>
> {
  try {
    const {
      EXPORT_COMPRESSIONS,
      EXPORT_FORMATS,
      exportCut,
      GIF_MAX_WIDTH_OVERRIDE_CEILING_PX,
    } = await import("@engine/exporter");
    // Server actions are network-reachable: enforce the same bounds the HTTP
    // route and MCP tool do before any export work, instead of trusting the
    // caller (an unchecked fps would land verbatim in the filtergraph).
    const {
      aspect,
      compression,
      crop,
      format,
      fps,
      gifMaxWidth,
      loudnessTargetLufs,
      maxHeight,
      platform,
    } = options ?? {};
    if (
      aspect !== undefined &&
      !["source", "16:9", "9:16", "1:1"].includes(aspect)
    ) {
      throw new Error(
        `unknown export aspect "${aspect}" (expected one of: source, 16:9, 9:16, 1:1)`
      );
    }
    if (
      fps !== undefined &&
      !(Number.isInteger(fps) && fps >= 1 && fps <= 120)
    ) {
      throw new Error("fps must be an integer between 1 and 120");
    }
    if (
      compression !== undefined &&
      !EXPORT_COMPRESSIONS.includes(compression)
    ) {
      throw new Error(
        `unknown compression preset "${compression}" (expected one of: ${EXPORT_COMPRESSIONS.join(", ")})`
      );
    }
    if (format !== undefined && !EXPORT_FORMATS.includes(format)) {
      throw new Error(
        `unknown export format "${format}" (expected one of: ${EXPORT_FORMATS.join(", ")})`
      );
    }
    if (
      maxHeight !== undefined &&
      !(Number.isInteger(maxHeight) && maxHeight >= 1 && maxHeight <= 4320)
    ) {
      throw new Error("maxHeight must be an integer between 1 and 4320");
    }
    if (
      gifMaxWidth !== undefined &&
      !(
        Number.isInteger(gifMaxWidth) &&
        gifMaxWidth >= 1 &&
        gifMaxWidth <= GIF_MAX_WIDTH_OVERRIDE_CEILING_PX
      )
    ) {
      throw new Error(
        `gifMaxWidth must be an integer between 1 and ${GIF_MAX_WIDTH_OVERRIDE_CEILING_PX}`
      );
    }
    if (platform !== undefined && !isExportPlatformId(platform)) {
      throw new Error(
        `unknown export platform "${platform}" (expected one of: ${EXPORT_PLATFORM_IDS.join(", ")})`
      );
    }
    if (
      loudnessTargetLufs !== undefined &&
      !(
        Number.isFinite(loudnessTargetLufs) &&
        loudnessTargetLufs >= -30 &&
        loudnessTargetLufs <= -10
      )
    ) {
      throw new Error("loudnessTargetLufs must be between -30 and -10");
    }
    const result = await exportCut(slug, {
      aspect,
      compression,
      crop,
      format,
      fps,
      gifMaxWidth,
      loudnessTargetLufs,
      maxHeight,
      platform,
    });
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

// GUI entry point for src/revert.ts: reverts through mutateProject like
// every other server action here, always as actor "human" (the History
// panel is the only GUI surface that offers revert). Target shape mirrors
// the CLI's --to/--task/--last flags and the "revert" MCP tool 1:1.
//
// The success payload includes the restored project (loaded fresh, after
// revertProject's own write) alongside {revision, restoredTo}: web/app.tsx's
// `project` state is a plain useState<Project> with no effect that re-syncs
// it from a fresh server render, so router.refresh() alone leaves the open
// editor showing pre-revert transcript/preview state, and the next GUI edit
// (toggleWord -> saveProjectEdits, or any of saveLook/saveZooms/saveTitles/
// saveBroll) would serialize that stale client state wholesale right back
// over the just-restored project.json. See HistoryPanel's onReverted prop
// and App's reseed handler, which is the other half of this fix.
export async function revertProjectAction(
  slug: string,
  target: RevertTarget
): Promise<
  ActionResult<{ project: Project; revision: number; restoredTo: number }>
> {
  try {
    const data = await revertProject(slug, target, { actor: "human" });
    const project = await loadProject(slug);
    return { ok: true, data: { ...data, project } };
  } catch (e) {
    return fail(e);
  }
}

export async function revealProjectFolder(slug: string): Promise<ActionResult> {
  try {
    const paths = projectPaths(slug);
    if (!existsSync(paths.project)) {
      throw new Error(`project not found: ${slug}`);
    }
    await revealInFileManager(paths.dir);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function runVisionFocus(
  slug: string
): Promise<ActionResult<{ project: Project; segmentsUpdated: number }>> {
  try {
    const { enrichSceneLogWithVisionFocus, visionFocusAvailable } =
      await import("@engine/vision-focus");
    if (!visionFocusAvailable()) {
      throw new Error(
        "Vision focus requires macOS with tools/vision-focus.swift"
      );
    }
    const segmentsUpdated = await mutateProject(
      slug,
      async (project) => enrichSceneLogWithVisionFocus(slug, project),
      { ...guiMutateMeta("vision-focus") }
    );
    const project = await loadProject(slug);
    return { ok: true, data: { project, segmentsUpdated } };
  } catch (e) {
    return fail(e);
  }
}

export async function runHighlightsDetect(
  slug: string,
  opts?: { maxClips?: number; targetClipSec?: number }
): Promise<
  ActionResult<{
    project: Project;
    highlights: NonNullable<Project["highlights"]>;
  }>
> {
  try {
    const project = await loadProject(slug);
    const { detectHighlights } = await import("@engine/highlights");
    const highlights = await detectHighlights(project, {
      agent: "claude-opus-4-8",
      maxClips: opts?.maxClips ?? 5,
      targetClipSec: opts?.targetClipSec ?? 45,
    });
    if (!highlights) {
      throw new Error("highlight detection failed (no valid clips returned)");
    }
    await mutateProject(
      slug,
      (p) => {
        p.highlights = highlights;
      },
      { ...guiMutateMeta("highlights-detect") }
    );
    const updated = await loadProject(slug);
    return { ok: true, data: { project: updated, highlights } };
  } catch (e) {
    return fail(e);
  }
}

// ── Multi-take assembly GUI browser ─────────────────────────────────────────
// Read and select-and-splice actions live here as server actions. Ingesting a
// NEW take from the browser (web/components/takes-panel.tsx's "Add take"
// control) does NOT go through a server action: it needs the same
// upload-then-poll-a-background-job shape as the whole-project upload
// (web/lib/project-create.ts), so it POSTs to
// app/api/projects/[slug]/takes/route.ts and polls the shared
// /api/projects/ingest/[jobId] route via web/lib/take-create.ts instead.
// `openklip take-add` and the MCP tool surface still wrap src/assembly.ts's
// ingestTake the same way list_takes/take_transcript/assemble wrap the
// functions below.

export async function listTakesAction(
  slug: string
): Promise<ActionResult<{ takes: Take[] }>> {
  try {
    const takes = await listTakes(slug);
    return { ok: true, data: { takes } };
  } catch (e) {
    return fail(e);
  }
}

export async function loadTakeAction(
  slug: string,
  takeId: string
): Promise<ActionResult<{ take: Take }>> {
  try {
    const take = await loadTake(slug, takeId);
    return { ok: true, data: { take } };
  } catch (e) {
    return fail(e);
  }
}

export async function assembleFromSelectionAction(
  slug: string,
  selection: {
    segments: Array<{
      takeId: string;
      startWordId: string;
      endWordId: string;
      note?: string;
    }>;
    padMs?: number;
  },
  opts?: { force?: boolean }
): Promise<
  ActionResult<{
    durationSec: number;
    project: Project;
    segments: number;
    words: number;
  }>
> {
  try {
    const result = await assembleFromSelection(slug, selection, {
      force: opts?.force,
      actor: "human",
    });
    const project = await loadProject(slug);
    return { ok: true, data: { ...result, project } };
  } catch (e) {
    return fail(e);
  }
}

// ── Multicam cam switch GUI ─────────────────────────────────────────────────

export async function listCamsAction(
  slug: string
): Promise<ActionResult<{ cams: Awaited<ReturnType<typeof listCams>> }>> {
  try {
    const cams = await listCams(slug);
    return { ok: true, data: { cams } };
  } catch (e) {
    return fail(e);
  }
}

export async function camSetAction(
  slug: string,
  camId: string,
  patch: { name?: string; role?: CamRole; offsetMs?: number }
): Promise<ActionResult<{ cam: Awaited<ReturnType<typeof setCam>> }>> {
  try {
    const cam = await setCam(slug, camId, patch);
    return { ok: true, data: { cam } };
  } catch (e) {
    return fail(e);
  }
}

export async function camMixAction(
  slug: string,
  opts: { mode: "follow" | "auto"; settings?: Partial<CamSwitchSettings> }
): Promise<
  ActionResult<{
    mix: Awaited<ReturnType<typeof camMix>>;
    project: Project;
  }>
> {
  try {
    // A re-mix of an existing multicam project must carry locked plan spans
    // forward (camRemix); only the first mix plans entirely from scratch.
    const existing = await loadProject(slug).catch(() => null);
    const hasProvenance = Boolean(
      (existing as (Project & { multicam?: unknown }) | null)?.multicam
    );
    const mix = hasProvenance
      ? await camRemix(slug, { mode: opts.mode, settings: opts.settings })
      : await camMix(slug, {
          mode: opts.mode,
          settings: opts.settings,
        });
    const project = await loadProject(slug);
    return { ok: true, data: { mix, project } };
  } catch (e) {
    return fail(e);
  }
}
