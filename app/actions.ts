"use server";

import { existsSync } from "node:fs";
import { exportCut } from "@engine/exporter";
import { projectPaths } from "@engine/paths";
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
import { mutateProject } from "@engine/projectStore";
import { revealInFileManager } from "@engine/reveal-path";

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
    template?: string | null;
  }
): Promise<ActionResult> {
  try {
    await mutateProject(slug, (project) => applyProjectEdits(project, body));
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
    await mutateProject(slug, (project) => applyLook(project, body));
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
    const items = await mutateProject(slug, (project) => {
      applyZooms(project, zooms);
      return project.zooms;
    });
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
    const items = await mutateProject(slug, (project) => {
      applyBroll(project, broll);
      return project.broll;
    });
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
    const items = await mutateProject(slug, (project) => {
      applyTitles(project, titles);
      return project.titles;
    });
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
