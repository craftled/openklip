import { existsSync } from "node:fs";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type BpmDetection, detectBpm } from "./bpm-core.ts";
import type { Asset, Project } from "./edl.ts";
import { validateBpm } from "./graphic-span.ts";
import { assetStoragePath, projectPaths } from "./paths.ts";

const BPM_SAMPLE_RATE = 22_050;

const BpmCacheEntrySchema = z.object({
  assetId: z.string(),
  src: z.string(),
  sourceMtimeMs: z.number(),
  bpm: z.number(),
  confidence: z.number(),
  analyzedAt: z.string(),
});

export type MusicBpmResult = BpmDetection & {
  assetId: string;
  cached: boolean;
};

function bpmCachePath(slug: string): string {
  return join(projectPaths(slug).working, "music-bpm.json");
}

async function readBpmCache(
  slug: string
): Promise<Record<string, z.infer<typeof BpmCacheEntrySchema>>> {
  const path = bpmCachePath(slug);
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return {};
    }
    const out: Record<string, z.infer<typeof BpmCacheEntrySchema>> = {};
    for (const [key, value] of Object.entries(raw)) {
      const parsed = BpmCacheEntrySchema.safeParse(value);
      if (parsed.success) {
        out[key] = parsed.data;
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function writeBpmCacheEntry(
  slug: string,
  entry: z.infer<typeof BpmCacheEntrySchema>
): Promise<void> {
  const cache = await readBpmCache(slug);
  cache[entry.assetId] = entry;
  await writeFile(bpmCachePath(slug), `${JSON.stringify(cache, null, 2)}\n`);
}

function resolveMusicAsset(project: Project, assetId: string): Asset {
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) {
    throw new Error(`unknown asset "${assetId}"`);
  }
  if (asset.kind !== "music") {
    throw new Error(
      `asset "${assetId}" is ${asset.kind ?? "broll"}; BPM detection requires kind music`
    );
  }
  return asset;
}

async function pcmFromAsset(slug: string, asset: Asset): Promise<Float32Array> {
  const srcPath = assetStoragePath(slug, asset.src);
  if (!existsSync(srcPath)) {
    throw new Error(`missing music source file: ${asset.src}`);
  }
  const tmpPcm = join(
    projectPaths(slug).working,
    `.bpm-probe-${asset.id}-${process.pid}.f32`
  );
  await extractAudioAtRate(srcPath, tmpPcm, BPM_SAMPLE_RATE);
  const buf = await readFile(tmpPcm);
  try {
    await unlink(tmpPcm);
  } catch {
    // best-effort cleanup
  }
  return new Float32Array(
    buf.buffer,
    buf.byteOffset,
    Math.floor(buf.byteLength / 4)
  );
}

async function extractAudioAtRate(
  source: string,
  outAudio: string,
  sampleRate: number
): Promise<void> {
  const { FFMPEG, run } = await import("./ffmpeg.ts");
  await run(
    FFMPEG,
    [
      "-y",
      "-i",
      source,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(sampleRate),
      "-f",
      "f32le",
      outAudio,
    ],
    "ffmpeg(bpm-audio)"
  );
}

/** Detect BPM for a registered music asset; caches by asset id + source mtime. */
export async function measureMusicBpm(
  slug: string,
  assetId: string,
  opts?: { force?: boolean }
): Promise<MusicBpmResult> {
  const { loadProject } = await import("./projectStore.ts");
  const project = await loadProject(slug);
  const asset = resolveMusicAsset(project, assetId);
  const srcPath = assetStoragePath(slug, asset.src);
  const sourceMtimeMs = (await stat(srcPath)).mtimeMs;
  const cache = await readBpmCache(slug);
  const hit = cache[assetId];
  if (
    !opts?.force &&
    hit &&
    hit.src === asset.src &&
    hit.sourceMtimeMs === sourceMtimeMs
  ) {
    return {
      assetId,
      bpm: hit.bpm,
      confidence: hit.confidence,
      cached: true,
    };
  }
  const pcm = await pcmFromAsset(slug, asset);
  const detected = detectBpm(pcm, BPM_SAMPLE_RATE);
  const bpm = validateBpm(detected.bpm);
  await writeBpmCacheEntry(slug, {
    assetId,
    src: asset.src,
    sourceMtimeMs,
    bpm,
    confidence: detected.confidence,
    analyzedAt: new Date().toISOString(),
  });
  return { assetId, bpm, confidence: detected.confidence, cached: false };
}

/** Read cached BPM for an asset without re-analyzing. */
export async function readCachedMusicBpm(
  slug: string,
  assetId: string
): Promise<MusicBpmResult | null> {
  const { loadProject } = await import("./projectStore.ts");
  const project = await loadProject(slug);
  const asset = resolveMusicAsset(project, assetId);
  const srcPath = assetStoragePath(slug, asset.src);
  let sourceMtimeMs: number;
  try {
    sourceMtimeMs = (await stat(srcPath)).mtimeMs;
  } catch {
    return null;
  }
  const cache = await readBpmCache(slug);
  const hit = cache[assetId];
  if (!hit || hit.src !== asset.src || hit.sourceMtimeMs !== sourceMtimeMs) {
    return null;
  }
  return {
    assetId,
    bpm: hit.bpm,
    confidence: hit.confidence,
    cached: true,
  };
}
