"use server";

import { existsSync } from "node:fs";
import { loadBrief, saveBrief as saveBriefFile } from "@engine/brief";
import { logBriefSet } from "@engine/brief-log";
import type { ColorAdjust, Cuts, Filter, Motion, Project } from "@engine/edl";
import {
  EXPORT_PLATFORM_IDS,
  type ExportPlatformId,
  isExportPlatformId,
} from "@engine/export-platforms";
import type { ExportCompression } from "@engine/exporter";
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
    const result = await mutateProject(
      slug,
      (project) => runAction(actionName, project, input),
      { action: actionName, actor: "human", input }
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
      action: "edit-words",
      actor: "human",
      input: body,
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
      action: "look",
      actor: "human",
      input: body,
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
      action: "motion",
      actor: "human",
      input: body,
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
      { action: "zooms", actor: "human", input: zooms }
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
      { action: "broll", actor: "human", input: broll }
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
      { action: "titles", actor: "human", input: titles }
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
      { action: "stills", actor: "human", input: stills }
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
    fps?: number;
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
    durationSec: number;
    out: string;
  }>
> {
  try {
    const { EXPORT_COMPRESSIONS, exportCut } = await import("@engine/exporter");
    // Server actions are network-reachable: enforce the same bounds the HTTP
    // route and MCP tool do before any export work, instead of trusting the
    // caller (an unchecked fps would land verbatim in the filtergraph).
    const {
      aspect,
      compression,
      crop,
      fps,
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
    if (
      maxHeight !== undefined &&
      !(Number.isInteger(maxHeight) && maxHeight >= 1 && maxHeight <= 4320)
    ) {
      throw new Error("maxHeight must be an integer between 1 and 4320");
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
      fps,
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
): Promise<
  ActionResult<{ project: Project; segmentsUpdated: number }>
> {
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
      { action: "vision-focus", actor: "human" }
    );
    const project = await loadProject(slug);
    return { ok: true, data: { project, segmentsUpdated } };
  } catch (e) {
    return fail(e);
  }
}
