// Brand presets: reusable defaults for the look knobs (captions, vignette, cut
// padding). Applied at ingest (`--brand X`) or later (`openklip brand <slug> X`).
//
// Constraint: brands set DEFAULTS only. They never split the edit into a separate
// manifest : applying a brand mutates the relevant fields of project.json, which
// remains the single source of truth. Words and overlays are never touched.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { FilterSchema, type Project } from "./edl.ts";

// brands/ lives at the repo root next to projects/.
export function brandsRoot(): string {
  return resolve(process.cwd(), "brands");
}

const BRAND_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const BrandSchema = z
  .object({
    name: z.string().optional(),
    captions: z
      .object({
        enabled: z.boolean().optional(),
        maxWords: z.number().int().min(1).max(12).optional(),
      })
      .optional(),
    look: z
      .object({
        vignette: z.boolean().optional(),
        filter: FilterSchema.optional(),
        lut: z.string().optional(),
      })
      .optional(),
    motion: z
      .object({
        speed: z.number().min(0.25).max(4).optional(),
        fadeMs: z.number().min(0).max(2000).optional(),
        heroFadeMs: z.number().min(0).max(2000).optional(),
        slideFrac: z.number().min(0).max(0.3).optional(),
      })
      .optional(),
    padMs: z.number().min(0).max(500).optional(),
  })
  .strict();
export type Brand = z.infer<typeof BrandSchema>;

// Validate the brand name before joining it into a path (same traversal guard as
// project slugs) and resolve brands/<name>.json.
export function brandPath(name: string): string {
  if (typeof name !== "string" || name.length > 64 || !BRAND_NAME.test(name)) {
    throw new Error(`invalid brand name: ${JSON.stringify(name)}`);
  }
  return join(brandsRoot(), `${name}.json`);
}

export async function loadBrand(name: string): Promise<Brand> {
  const path = brandPath(name);
  if (!existsSync(path)) {
    throw new Error(`brand not found: ${name} (${path})`);
  }
  return BrandSchema.parse(JSON.parse(await Bun.file(path).text()));
}

// Apply a brand's defaults onto a project. Only fields the brand specifies are
// changed; everything else (words, overlays, source, dimensions) is left intact.
export function applyBrand(project: Project, brand: Brand): Project {
  if (brand.captions) {
    project.captions = {
      ...project.captions,
      ...(brand.captions.enabled === undefined
        ? {}
        : { enabled: brand.captions.enabled }),
      ...(brand.captions.maxWords === undefined
        ? {}
        : { maxWords: brand.captions.maxWords }),
    };
  }
  if (brand.look?.vignette !== undefined) {
    project.look = { ...project.look, vignette: brand.look.vignette };
  }
  if (brand.look?.filter !== undefined) {
    project.look = { ...project.look, filter: brand.look.filter };
  }
  if (brand.look?.lut !== undefined) {
    project.look = { ...project.look, lut: brand.look.lut };
  }
  if (brand.motion) {
    project.motion = { ...project.motion, ...brand.motion };
  }
  if (brand.padMs !== undefined) {
    project.padMs = brand.padMs;
  }
  return project;
}
