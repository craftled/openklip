"use server";

import { exportCut } from "@engine/exporter";
import {
  applyBroll,
  applyLook,
  applyProjectEdits,
  applyTitles,
  applyZooms,
  type clampBrollItems,
  type clampTitleItems,
  type clampZoomItems,
} from "@engine/projectMutations";
import { loadProject, saveProject } from "@engine/projectStore";

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

export async function saveProjectEdits(
  slug: string,
  body: {
    words?: Array<{ id: string; deleted: boolean }>;
    captions?: { enabled?: boolean; maxWords?: number };
    padMs?: number;
  }
): Promise<ActionResult> {
  try {
    const project = await loadProject(slug);
    applyProjectEdits(project, body);
    await saveProject(slug, project);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveLook(
  slug: string,
  body: { vignette?: boolean }
): Promise<ActionResult> {
  try {
    const project = await loadProject(slug);
    applyLook(project, body);
    await saveProject(slug, project);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveZooms(
  slug: string,
  zooms: unknown[]
): Promise<ActionResult<{ zooms: ReturnType<typeof clampZoomItems> }>> {
  try {
    const project = await loadProject(slug);
    applyZooms(project, zooms);
    const items = project.zooms;
    await saveProject(slug, project);
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
    const project = await loadProject(slug);
    applyBroll(project, broll);
    const items = project.broll;
    await saveProject(slug, project);
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
    const project = await loadProject(slug);
    applyTitles(project, titles);
    const items = project.titles;
    await saveProject(slug, project);
    return { ok: true, data: { titles: items } };
  } catch (e) {
    return fail(e);
  }
}

export async function exportProject(
  slug: string,
  maxHeight?: number
): Promise<
  ActionResult<{
    ranges: number;
    height: number;
    durationSec: number;
    out: string;
  }>
> {
  try {
    const result = await exportCut(slug, { maxHeight });
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}
