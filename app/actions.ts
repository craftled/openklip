"use server";

import { existsSync } from "node:fs";
import { assembleFromSelection, listTakes, loadTake } from "@engine/assembly";
import { loadBrief, saveBrief as saveBriefFile } from "@engine/brief";
import { logBriefSet } from "@engine/brief-log";
import type { camMix } from "@engine/cam-mix";
import type { CamSwitchSettings } from "@engine/cam-plan";
import { camMixOrRemix, camRemix } from "@engine/cam-remix";
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
// structured failure instead. The stack is attached only behind an explicit
// debug opt-in (OPENKLIP_DEBUG=1): `serve`/`dev` runs `next dev`, so
// NODE_ENV !== "production" on every normal local launch, and gating on that
// alone would leak stacks to the browser by default.
function fail(error: unknown): { ok: false; error: string; stack?: string } {
  const e = error as Error;
  const base = { ok: false as const, error: e?.message ?? String(error) };
  if (process.env.OPENKLIP_DEBUG !== "1") {
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

// CRAFT-6177: these four whole-track saves stay available for callers that
// genuinely need to replace an entire overlay track (currently: b-roll
// paint-order reorder in web/hooks/use-overlay-editors.ts), but a browser
// snapshot can go stale the moment the CLI or an MCP agent edits the same
// project. `expectedRevision`, when provided, is a compare-and-swap guard:
// the save is rejected outright (no write, no history entry, no revision
// bump) if the live project.revision has moved on since the caller's
// snapshot. Every other overlay add/update/remove goes through ID-scoped
// registry actions instead (zoom-add/-set/-rm, broll-add/-set/-rm,
// title-add/-set/-rm, still-add/-set/-rm, called via runGuiAction from
// use-overlay-editors.ts) which only ever touch the one overlay named by id
// and so need no revision guard at all - see tests/overlay-concurrency.test.ts.
function assertRevisionMatches(
  project: Project,
  expectedRevision: number | undefined
): void {
  if (expectedRevision === undefined) {
    return;
  }
  const current = project.revision ?? 0;
  if (current !== expectedRevision) {
    throw new Error(
      "stale save rejected: project revision changed since this edit was staged " +
        `(expected revision ${expectedRevision}, project is now at revision ${current}). ` +
        "Reload and retry."
    );
  }
}

export async function saveZooms(
  slug: string,
  zooms: unknown[],
  expectedRevision?: number
): Promise<
  ActionResult<{ revision: number; zooms: ReturnType<typeof clampZoomItems> }>
> {
  try {
    const { items, revision } = await mutateProject(
      slug,
      (project) => {
        assertRevisionMatches(project, expectedRevision);
        const revisionBefore = project.revision ?? 0;
        applyZooms(project, zooms);
        return { items: project.zooms, revision: revisionBefore + 1 };
      },
      { ...guiMutateMeta("zooms", zooms) }
    );
    return { ok: true, data: { zooms: items, revision } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveBroll(
  slug: string,
  broll: unknown[],
  expectedRevision?: number
): Promise<
  ActionResult<{
    broll: ReturnType<typeof clampBrollItems>;
    revision: number;
  }>
> {
  try {
    const { items, revision } = await mutateProject(
      slug,
      (project) => {
        assertRevisionMatches(project, expectedRevision);
        const revisionBefore = project.revision ?? 0;
        applyBroll(project, broll);
        return { items: project.broll, revision: revisionBefore + 1 };
      },
      { ...guiMutateMeta("broll", broll) }
    );
    return { ok: true, data: { broll: items, revision } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveTitles(
  slug: string,
  titles: unknown[],
  expectedRevision?: number
): Promise<
  ActionResult<{
    revision: number;
    titles: ReturnType<typeof clampTitleItems>;
  }>
> {
  try {
    const { items, revision } = await mutateProject(
      slug,
      (project) => {
        assertRevisionMatches(project, expectedRevision);
        const revisionBefore = project.revision ?? 0;
        applyTitles(project, titles);
        return { items: project.titles, revision: revisionBefore + 1 };
      },
      { ...guiMutateMeta("titles", titles) }
    );
    return { ok: true, data: { titles: items, revision } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveStills(
  slug: string,
  stills: unknown[],
  expectedRevision?: number
): Promise<
  ActionResult<{
    revision: number;
    stills: ReturnType<typeof clampStillItems>;
  }>
> {
  try {
    const { items, revision } = await mutateProject(
      slug,
      (project) => {
        assertRevisionMatches(project, expectedRevision);
        const revisionBefore = project.revision ?? 0;
        applyStills(project, stills);
        return { items: project.stills, revision: revisionBefore + 1 };
      },
      { ...guiMutateMeta("stills", stills) }
    );
    return { ok: true, data: { stills: items, revision } };
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

export async function camOverrideAction(
  slug: string,
  input: { fromSec: number; shot: string; toSec: number }
): Promise<
  ActionResult<{
    mix: Awaited<ReturnType<typeof camRemix>>;
    project: Project;
  }>
> {
  try {
    const mix = await camRemix(slug, {
      overrides: [
        {
          fromSec: input.fromSec,
          toSec: input.toSec,
          shot: input.shot,
        },
      ],
    });
    const project = await loadProject(slug);
    return { ok: true, data: { mix, project } };
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
    // camMixOrRemix carries locked plan spans forward when multicam
    // provenance exists; only the first mix plans entirely from scratch.
    const mix = await camMixOrRemix(slug, {
      mode: opts.mode,
      settings: opts.settings,
    });
    const project = await loadProject(slug);
    return { ok: true, data: { mix, project } };
  } catch (e) {
    return fail(e);
  }
}
