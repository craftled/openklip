import { z } from "zod";
import {
  MAP_MOTION_CATALOG,
  MAP_MOTION_FPS,
  MAP_MOTION_HEIGHT,
  MAP_MOTION_WIDTH,
  type MapMotionSpec,
  validateMapMotionSpec,
} from "./map-motion.ts";
import {
  PRODUCT_ANNOUNCEMENT_CATALOG,
  PRODUCT_ANNOUNCEMENT_FPS,
  PRODUCT_ANNOUNCEMENT_HEIGHT,
  PRODUCT_ANNOUNCEMENT_WIDTH,
  type ProductAnnouncementSpec,
  validateProductAnnouncementSpec,
} from "./product-announcement.ts";

export const JSON_RENDER_CATALOG_IDS = [
  PRODUCT_ANNOUNCEMENT_CATALOG,
  MAP_MOTION_CATALOG,
] as const;

export type JsonRenderCatalogId = (typeof JSON_RENDER_CATALOG_IDS)[number];

export const JsonRenderCatalogSchema = z.enum(JSON_RENDER_CATALOG_IDS);

export type JsonRenderSpec = ProductAnnouncementSpec | MapMotionSpec;

export interface JsonRenderValidation {
  issues: string[];
  spec?: JsonRenderSpec;
  success: boolean;
}

export interface JsonRenderCatalogDef {
  fps: number;
  height: number;
  id: JsonRenderCatalogId;
  name: string;
  renderExportHtml: (spec: JsonRenderSpec) => Promise<string>;
  validate: (raw: unknown) => JsonRenderValidation;
  width: number;
}

async function renderProductAnnouncementExportHtml(
  spec: JsonRenderSpec
): Promise<string> {
  const { renderProductAnnouncementHtml } = await import(
    "./product-announcement-html.tsx"
  );
  return renderProductAnnouncementHtml(spec as ProductAnnouncementSpec);
}

async function renderMapMotionExportHtml(
  spec: JsonRenderSpec
): Promise<string> {
  const { renderMapMotionHtml } = await import("./map-motion-html.tsx");
  return renderMapMotionHtml(spec as MapMotionSpec);
}

export const JSON_RENDER_CATALOGS: Record<
  JsonRenderCatalogId,
  JsonRenderCatalogDef
> = {
  [PRODUCT_ANNOUNCEMENT_CATALOG]: {
    id: PRODUCT_ANNOUNCEMENT_CATALOG,
    name: "Product announcement",
    width: PRODUCT_ANNOUNCEMENT_WIDTH,
    height: PRODUCT_ANNOUNCEMENT_HEIGHT,
    fps: PRODUCT_ANNOUNCEMENT_FPS,
    validate: validateProductAnnouncementSpec,
    renderExportHtml: renderProductAnnouncementExportHtml,
  },
  [MAP_MOTION_CATALOG]: {
    id: MAP_MOTION_CATALOG,
    name: "Map motion",
    width: MAP_MOTION_WIDTH,
    height: MAP_MOTION_HEIGHT,
    fps: MAP_MOTION_FPS,
    validate: validateMapMotionSpec,
    renderExportHtml: renderMapMotionExportHtml,
  },
};

export function jsonRenderCatalogDef(
  catalog: JsonRenderCatalogId
): JsonRenderCatalogDef {
  return JSON_RENDER_CATALOGS[catalog];
}

export function validateJsonRenderSpec(
  catalog: JsonRenderCatalogId,
  rawSpec: unknown
): JsonRenderValidation {
  return jsonRenderCatalogDef(catalog).validate(rawSpec);
}

export function assertJsonRenderSpec(
  catalog: JsonRenderCatalogId,
  rawSpec: unknown
): JsonRenderSpec {
  const result = validateJsonRenderSpec(catalog, rawSpec);
  if (result.success && result.spec) {
    return result.spec;
  }
  throw new Error(`invalid ${catalog} spec: ${result.issues.join("; ")}`);
}

export function isJsonRenderCatalogId(
  value: string
): value is JsonRenderCatalogId {
  return (JSON_RENDER_CATALOG_IDS as readonly string[]).includes(value);
}

export function jsonRenderCatalogIdsLabel(): string {
  return JSON_RENDER_CATALOG_IDS.join(", ");
}

// biome-ignore lint/performance/noBarrelFile: catalog registry re-exports keep json-render imports on one path
export { MAP_MOTION_CATALOG, MapMotionCatalogSchema } from "./map-motion.ts";
export {
  PRODUCT_ANNOUNCEMENT_CATALOG,
  ProductAnnouncementCatalogSchema,
} from "./product-announcement.ts";
