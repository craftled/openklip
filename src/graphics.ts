// Graphics templates: native HTML/CSS overlay compositions stored on disk under
// graphics/<id>/ (composition.html + manifest.json). Distinct from src/templates.ts
// (editorial playbooks under templates/<id>/skill.md): graphics are MOTION/overlay
// assets composited at export by ffmpeg via the renderer seam (src/graphic-render.ts).
//
// Bundled templates live in repo graphics/. Projects may also drop templates under
// projects/<slug>/graphics/ (project-local overrides win on id collision).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { projectPaths } from "./paths.ts";
import { repoPath } from "./repo-paths.ts";

const GRAPHIC_ID = /^[a-z][a-z0-9-]*$/;

export function assertValidGraphicId(id: string): string {
  if (typeof id !== "string" || id.length > 64 || !GRAPHIC_ID.test(id)) {
    throw new Error(`invalid graphic id: ${JSON.stringify(id)}`);
  }
  return id;
}

const GraphicParamSchema = z.object({
  type: z.enum(["string", "number", "boolean", "color", "asset"]),
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

export function graphicsRoot(): string {
  return repoPath("graphics");
}

export function projectGraphicsRoot(slug: string): string {
  return join(projectPaths(slug).dir, "graphics");
}

export function graphicDir(id: string, opts?: { slug?: string }): string {
  if (opts?.slug) {
    const local = join(
      projectGraphicsRoot(opts.slug),
      assertValidGraphicId(id)
    );
    if (existsSync(join(local, "manifest.json"))) {
      return local;
    }
  }
  return join(graphicsRoot(), assertValidGraphicId(id));
}

export function graphicManifestPath(
  id: string,
  opts?: { slug?: string }
): string {
  return join(graphicDir(id, opts), "manifest.json");
}

export function graphicCompositionPath(
  id: string,
  opts?: { slug?: string }
): string {
  return join(graphicDir(id, opts), "composition.html");
}

export function loadGraphicManifest(
  id: string,
  opts?: { slug?: string }
): GraphicManifest {
  const path = graphicManifestPath(id, opts);
  if (!existsSync(path)) {
    throw new Error(`graphic template not found: ${id} (${path})`);
  }
  return GraphicManifestSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export type GraphicPack =
  | "motion"
  | "shader"
  | "transition"
  | "other"
  | "project";

export function graphicPack(
  id: string,
  scope?: "bundled" | "project"
): GraphicPack {
  if (scope === "project") {
    return "project";
  }
  if (id.startsWith("motion-")) {
    return "motion";
  }
  if (id.startsWith("shader-")) {
    return "shader";
  }
  if (id.startsWith("transition-")) {
    return "transition";
  }
  return "other";
}

export const REQUIRED_IMAGE_SHADER_TEMPLATE_IDS = new Set([
  "shader-fluted-glass",
  "shader-halftone-cmyk",
  "shader-halftone-dots",
  "shader-heatmap",
  "shader-image-dithering",
]);

export const OPTIONAL_IMAGE_SHADER_TEMPLATE_IDS = new Set([
  "shader-gem-smoke",
  "shader-liquid-metal",
]);

export const IMAGE_SHADER_TEMPLATE_IDS = new Set([
  ...REQUIRED_IMAGE_SHADER_TEMPLATE_IDS,
  ...OPTIONAL_IMAGE_SHADER_TEMPLATE_IDS,
]);

export function graphicRequiresImageAsset(template: string): boolean {
  return REQUIRED_IMAGE_SHADER_TEMPLATE_IDS.has(template);
}

export function graphicSupportsImageAsset(template: string): boolean {
  return IMAGE_SHADER_TEMPLATE_IDS.has(template);
}

export interface GraphicListing {
  id: string;
  kind: "text" | "rich";
  name: string;
  pack: GraphicPack;
  params: Record<string, GraphicParam>;
  requiresAsset: boolean;
  scope: "bundled" | "project";
}

function scanGraphicsDir(
  root: string,
  scope: "bundled" | "project"
): GraphicListing[] {
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
      const manifestPath = join(root, name, "manifest.json");
      const compositionPath = join(root, name, "composition.html");
      if (!(existsSync(manifestPath) && existsSync(compositionPath))) {
        return null;
      }
      try {
        const m = GraphicManifestSchema.parse(
          JSON.parse(readFileSync(manifestPath, "utf8"))
        );
        return {
          id: m.id,
          name: m.name,
          kind: m.kind,
          pack: graphicPack(m.id, scope === "project" ? "project" : undefined),
          params: m.params,
          requiresAsset: graphicRequiresImageAsset(m.id),
          scope,
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is GraphicListing => x !== null);
}

/** List bundled + optional project-local templates (project overrides bundled ids). */
export function listGraphics(opts?: { slug?: string }): GraphicListing[] {
  const bundled = scanGraphicsDir(graphicsRoot(), "bundled");
  if (!opts?.slug) {
    return bundled.sort((a, b) => a.name.localeCompare(b.name));
  }
  const local = scanGraphicsDir(projectGraphicsRoot(opts.slug), "project");
  const byId = new Map<string, GraphicListing>();
  for (const item of bundled) {
    byId.set(item.id, item);
  }
  for (const item of local) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function defaultGraphicParams(
  manifest: GraphicManifest
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, p] of Object.entries(manifest.params)) {
    out[key] = p.default;
  }
  return out;
}
