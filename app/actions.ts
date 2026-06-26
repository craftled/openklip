"use server";

import {
  type Broll,
  BrollSchema,
  type Title,
  TitleSchema,
  type Zoom,
  ZoomSchema,
} from "@engine/edl";
import { exportCut } from "@engine/exporter";
import { loadProject, saveProject } from "@engine/projectStore";

export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: (error as Error).message };
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
    if (body.words) {
      const del = new Map(body.words.map((w) => [w.id, w.deleted]));
      for (const w of project.words) {
        if (del.has(w.id)) {
          w.deleted = Boolean(del.get(w.id));
        }
      }
    }
    if (typeof body.captions?.enabled === "boolean") {
      project.captions = {
        ...project.captions,
        enabled: body.captions.enabled,
      };
    }
    if (typeof body.captions?.maxWords === "number") {
      const mw = Math.max(1, Math.min(12, Math.round(body.captions.maxWords)));
      project.captions = { ...project.captions, maxWords: mw };
    }
    if (typeof body.padMs === "number") {
      project.padMs = Math.max(0, Math.min(500, Math.round(body.padMs)));
    }
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
    if (typeof body.vignette === "boolean") {
      project.look = { ...project.look, vignette: body.vignette };
    }
    await saveProject(slug, project);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveZooms(
  slug: string,
  zooms: unknown[]
): Promise<ActionResult<{ zooms: Zoom[] }>> {
  try {
    const project = await loadProject(slug);
    const dur = project.durationSamples;
    const items: Zoom[] = [];
    for (const raw of zooms) {
      const z = ZoomSchema.parse(raw);
      const start = Math.max(0, Math.min(z.startSample, dur));
      const end = Math.max(start + 1, Math.min(z.endSample, dur));
      items.push({ ...z, startSample: start, endSample: end });
    }
    project.zooms = items;
    await saveProject(slug, project);
    return { ok: true, data: { zooms: items } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveBroll(
  slug: string,
  broll: unknown[]
): Promise<ActionResult<{ broll: Broll[] }>> {
  try {
    const project = await loadProject(slug);
    const assetIds = new Set(project.assets.map((a) => a.id));
    const dur = project.durationSamples;
    const items: Broll[] = [];
    for (const raw of broll) {
      const b = BrollSchema.parse(raw);
      if (!assetIds.has(b.assetId)) {
        continue;
      }
      const start = Math.max(0, Math.min(b.startSample, dur));
      const end = Math.max(start + 1, Math.min(b.endSample, dur));
      items.push({ ...b, startSample: start, endSample: end });
    }
    project.broll = items;
    await saveProject(slug, project);
    return { ok: true, data: { broll: items } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveTitles(
  slug: string,
  titles: unknown[]
): Promise<ActionResult<{ titles: Title[] }>> {
  try {
    const project = await loadProject(slug);
    const dur = project.durationSamples;
    const items: Title[] = [];
    for (const raw of titles) {
      const titleItem = TitleSchema.parse(raw);
      if (!titleItem.text.trim()) {
        continue;
      }
      const start = Math.max(0, Math.min(titleItem.startSample, dur));
      const end = Math.max(start + 1, Math.min(titleItem.endSample, dur));
      items.push({ ...titleItem, startSample: start, endSample: end });
    }
    project.titles = items;
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
