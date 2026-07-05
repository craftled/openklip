import { createHash } from "node:crypto";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Keyframe } from "./keyframes.ts";

export function graphicRenderCacheDir(workingDir: string): string {
  return join(workingDir, "graphics-cache");
}

export function graphicRenderCacheKey(input: {
  template: string;
  params: Record<string, string | number | boolean>;
  keyframes?: Keyframe[];
  durFrames: number;
  width: number;
  height: number;
  fps: number;
  compositionHtml?: string;
}): string {
  const sortedParams = Object.keys(input.params)
    .sort()
    .reduce<Record<string, string | number | boolean>>((acc, key) => {
      acc[key] = input.params[key];
      return acc;
    }, {});
  const payload = JSON.stringify({
    template: input.template,
    params: sortedParams,
    keyframes: input.keyframes ?? [],
    durFrames: input.durFrames,
    width: input.width,
    height: input.height,
    fps: input.fps,
    compositionHtml: input.compositionHtml ?? null,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export function graphicRenderCachePath(
  workingDir: string,
  cacheKey: string
): string {
  return join(graphicRenderCacheDir(workingDir), `${cacheKey}.mov`);
}

/** Copy a cached MOV to the per-overlay export path when content matches. */
export async function copyGraphicFromCache(input: {
  workingDir: string;
  cacheKey: string;
  outPath: string;
}): Promise<boolean> {
  const cachePath = graphicRenderCachePath(input.workingDir, input.cacheKey);
  try {
    await stat(cachePath);
  } catch {
    return false;
  }
  await copyFile(cachePath, input.outPath);
  return true;
}

/** Persist a freshly rendered MOV into the shared cache (best-effort). */
export async function saveGraphicToCache(input: {
  workingDir: string;
  cacheKey: string;
  renderedPath: string;
}): Promise<void> {
  const cacheDir = graphicRenderCacheDir(input.workingDir);
  await mkdir(cacheDir, { recursive: true });
  const cachePath = graphicRenderCachePath(input.workingDir, input.cacheKey);
  try {
    await copyFile(input.renderedPath, cachePath);
  } catch {
    // Cache is optional; export still succeeded.
  }
}
