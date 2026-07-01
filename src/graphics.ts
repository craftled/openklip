// Graphics templates: native HTML/CSS overlay compositions stored on disk under
// graphics/<id>/ (composition.html + manifest.json). Distinct from src/templates.ts
// (editorial playbooks under templates/<id>/skill.md): graphics are MOTION/overlay
// assets composited at export by ffmpeg via the renderer seam (src/graphic-render.ts).
//
// This loader stays pure fs + Zod (mirroring src/templates.ts list/get idioms). It
// never imports the renderer or hyperframes, so typecheck/build/tests pass with the
// optional rich backend absent.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { repoPath } from "./repo-paths.ts";

const GRAPHIC_ID = /^[a-z][a-z0-9-]*$/;

export function assertValidGraphicId(id: string): string {
  if (typeof id !== "string" || id.length > 64 || !GRAPHIC_ID.test(id)) {
    throw new Error(`invalid graphic id: ${JSON.stringify(id)}`);
  }
  return id;
}

// One scalar param the template accepts, with a default and an optional label.
const GraphicParamSchema = z.object({
  type: z.enum(["string", "number", "boolean", "color"]),
  default: z.union([z.string(), z.number(), z.boolean()]),
  label: z.string().optional(),
});
export type GraphicParam = z.infer<typeof GraphicParamSchema>;

export const GraphicManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["text", "rich"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive().default(30),
  params: z.record(z.string(), GraphicParamSchema).default({}),
});
export type GraphicManifest = z.infer<typeof GraphicManifestSchema>;

// graphics/ lives at the repo root next to templates/ and brands/.
export function graphicsRoot(): string {
  return repoPath("graphics");
}

export function graphicDir(id: string): string {
  return join(graphicsRoot(), assertValidGraphicId(id));
}

export function graphicManifestPath(id: string): string {
  return join(graphicDir(id), "manifest.json");
}

export function graphicCompositionPath(id: string): string {
  return join(graphicDir(id), "composition.html");
}

// Parse + validate one template's manifest (throws if missing/invalid).
export function loadGraphicManifest(id: string): GraphicManifest {
  const path = graphicManifestPath(id);
  if (!existsSync(path)) {
    throw new Error(`graphic template not found: ${id} (${path})`);
  }
  return GraphicManifestSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export interface GraphicListing {
  id: string;
  kind: "text" | "rich";
  name: string;
}

// List valid templates (each needs manifest.json + composition.html), sorted by name.
export function listGraphics(): GraphicListing[] {
  const root = graphicsRoot();
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .map((name) => {
      try {
        assertValidGraphicId(name);
      } catch {
        return null;
      }
      if (!existsSync(graphicManifestPath(name))) {
        return null;
      }
      if (!existsSync(graphicCompositionPath(name))) {
        return null;
      }
      try {
        const m = loadGraphicManifest(name);
        return { id: m.id, name: m.name, kind: m.kind };
      } catch {
        return null;
      }
    })
    .filter((x): x is GraphicListing => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Build a fully-populated params record from a manifest's declared defaults.
export function defaultGraphicParams(
  manifest: GraphicManifest
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, p] of Object.entries(manifest.params)) {
    out[key] = p.default;
  }
  return out;
}
