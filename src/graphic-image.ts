import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Asset, Project } from "./edl.ts";
import {
  graphicRequiresImageAsset,
  graphicSupportsImageAsset,
} from "./graphics.ts";
import { assetStoragePath } from "./paths.ts";

export function resolveGraphicImageFileUrl(
  slug: string,
  project: Project,
  template: string,
  params: Record<string, string | number | boolean>
): string | undefined {
  if (!graphicSupportsImageAsset(template)) {
    return;
  }
  const assetId = params.assetId;
  if (typeof assetId !== "string" || !assetId.trim()) {
    if (graphicRequiresImageAsset(template)) {
      throw new Error(
        `graphic template "${template}" requires --param assetId=<still-or-image-asset>`
      );
    }
    return;
  }
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) {
    throw new Error(`unknown asset "${assetId}" for image shader`);
  }
  validateImageAsset(asset);
  const abs = assetStoragePath(slug, asset.src);
  if (!existsSync(abs)) {
    throw new Error(`missing image asset file: ${asset.src}`);
  }
  return pathToFileURL(abs).href;
}

function validateImageAsset(asset: Asset): void {
  const kind = asset.kind ?? "broll";
  if (kind !== "still" && kind !== "broll") {
    throw new Error(
      `asset "${asset.id}" is ${kind}; image shaders require a still or image b-roll asset`
    );
  }
}

export function enrichGraphicParamsWithImage(
  slug: string,
  project: Project,
  template: string,
  params: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  const imageSrc = resolveGraphicImageFileUrl(slug, project, template, params);
  if (!imageSrc) {
    return params;
  }
  return { ...params, _imageSrc: imageSrc };
}
