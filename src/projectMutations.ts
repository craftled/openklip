import {
  type Broll,
  BrollSchema,
  type ColorAdjust,
  ColorAdjustSchema,
  type Grade,
  type Graphic,
  GraphicSchema,
  type Motion,
  type Project,
  type Still,
  StillSchema,
  type Title,
  TitleSchema,
  type Zoom,
  ZoomSchema,
} from "./edl.ts";
import { isNeutralColor } from "./grade-color.ts";
import { listGraphics } from "./graphics.ts";
import { applyProjectTemplate } from "./templates.ts";

export function applyProjectEdits(
  project: Project,
  body: {
    words?: Array<{ id: string; deleted: boolean }>;
    captions?: { enabled?: boolean; maxWords?: number };
    padMs?: number;
    template?: string | null;
  }
): Project {
  if (body.words) {
    const del = new Map(body.words.map((w) => [w.id, w.deleted]));
    for (const w of project.words) {
      if (del.has(w.id)) {
        w.deleted = Boolean(del.get(w.id));
      }
    }
  }
  if (typeof body.captions?.enabled === "boolean") {
    project.captions = { ...project.captions, enabled: body.captions.enabled };
  }
  if (typeof body.captions?.maxWords === "number") {
    const mw = Math.max(1, Math.min(12, Math.round(body.captions.maxWords)));
    project.captions = { ...project.captions, maxWords: mw };
  }
  if (typeof body.padMs === "number") {
    project.padMs = Math.max(0, Math.min(500, Math.round(body.padMs)));
  }
  if (body.template !== undefined) {
    applyProjectTemplate(project, body.template);
  }
  return project;
}

export function applyLook(
  project: Project,
  body: {
    vignette?: boolean;
    grade?: Grade;
    lut?: string | null;
    color?: Partial<ColorAdjust>;
  }
): Project {
  if (typeof body.vignette === "boolean") {
    project.look = { ...project.look, vignette: body.vignette };
  }
  if (body.grade !== undefined) {
    project.look = { ...project.look, grade: body.grade };
  }
  if (body.lut !== undefined) {
    if (body.lut === null || body.lut === "") {
      const { lut: _omit, ...rest } = project.look;
      project.look = rest;
    } else {
      project.look = { ...project.look, lut: body.lut };
    }
  }
  if (body.color !== undefined) {
    const merged = {
      ...ColorAdjustSchema.parse(project.look.color ?? {}),
      ...body.color,
    };
    if (isNeutralColor(merged)) {
      const { color: _omit, ...rest } = project.look;
      project.look = rest;
    } else {
      project.look = { ...project.look, color: merged };
    }
  }
  return project;
}

export function applyMotion(project: Project, body: Partial<Motion>): Project {
  project.motion = { ...project.motion, ...body };
  return project;
}

export function clampZoomItems(project: Project, zooms: unknown[]): Zoom[] {
  const dur = project.durationSamples;
  const items: Zoom[] = [];
  for (const raw of zooms) {
    const z = ZoomSchema.parse(raw);
    const start = Math.max(0, Math.min(z.startSample, dur));
    const end = Math.max(start + 1, Math.min(z.endSample, dur));
    items.push({ ...z, startSample: start, endSample: end });
  }
  return items;
}

export function applyZooms(project: Project, zooms: unknown[]): Project {
  project.zooms = clampZoomItems(project, zooms);
  return project;
}

export function clampBrollItems(project: Project, broll: unknown[]): Broll[] {
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
  return items;
}

export function applyBroll(project: Project, broll: unknown[]): Project {
  project.broll = clampBrollItems(project, broll);
  return project;
}

export function clampTitleItems(project: Project, titles: unknown[]): Title[] {
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
  return items;
}

export function applyTitles(project: Project, titles: unknown[]): Project {
  project.titles = clampTitleItems(project, titles);
  return project;
}

export function clampStillItems(project: Project, stills: unknown[]): Still[] {
  const assetIds = new Set(
    project.assets.filter((a) => a.kind === "still").map((a) => a.id)
  );
  const dur = project.durationSamples;
  const items: Still[] = [];
  for (const raw of stills) {
    const still = StillSchema.parse(raw);
    if (!assetIds.has(still.assetId)) {
      continue;
    }
    const start = Math.max(0, Math.min(still.startSample, dur));
    const end = Math.max(start + 1, Math.min(still.endSample, dur));
    items.push({ ...still, startSample: start, endSample: end });
  }
  return items;
}

export function applyStills(project: Project, stills: unknown[]): Project {
  project.stills = clampStillItems(project, stills);
  return project;
}

export function clampGraphicItems(
  project: Project,
  graphics: unknown[]
): Graphic[] {
  const templateIds = new Set(listGraphics().map((g) => g.id));
  const dur = project.durationSamples;
  const items: Graphic[] = [];
  for (const raw of graphics) {
    const graphic = GraphicSchema.parse(raw);
    if (!templateIds.has(graphic.template)) {
      continue;
    }
    const start = Math.max(0, Math.min(graphic.startSample, dur));
    const end = Math.max(start + 1, Math.min(graphic.endSample, dur));
    items.push({ ...graphic, startSample: start, endSample: end });
  }
  return items;
}

export function applyGraphics(project: Project, graphics: unknown[]): Project {
  project.graphics = clampGraphicItems(project, graphics);
  return project;
}
