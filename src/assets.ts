import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import {
  type Asset,
  type AssetKind,
  type Project,
  ProjectSchema,
  SAMPLE_RATE,
} from "./edl.ts";
import { FFMPEG, probe, probeAudio, run } from "./ffmpeg.ts";
import { projectPaths, slugify } from "./paths.ts";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg"]);

const STILL_HOLD_SEC = 3;

export function inferAssetKind(filename: string): AssetKind {
  const ext = extname(filename).toLowerCase();
  if (IMAGE_EXT.has(ext)) {
    return "still";
  }
  if (AUDIO_EXT.has(ext)) {
    return "music";
  }
  return "broll";
}

function uniqueAssetId(project: { assets: Asset[] }, base: string): string {
  const taken = new Set(project.assets.map((a) => a.id));
  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}

async function loadProject(slug: string) {
  const p = projectPaths(slug);
  if (!existsSync(p.project)) {
    throw new Error(`project not found: ${slug}`);
  }
  return ProjectSchema.parse(JSON.parse(await Bun.file(p.project).text()));
}

async function saveProject(slug: string, project: Project): Promise<void> {
  const p = projectPaths(slug);
  await Bun.write(p.project, JSON.stringify(project, null, 2));
}

async function buildVideoProxy(
  slug: string,
  id: string,
  src: string
): Promise<{ proxy: string; durationSamples: number }> {
  const proxyRel = `assets/${id}.mp4`;
  const out = resolve(projectPaths(slug).dir, proxyRel);
  await run(
    FFMPEG,
    [
      "-y",
      "-i",
      src,
      "-vf",
      "scale=-2:720",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "26",
      "-g",
      "1",
      "-keyint_min",
      "1",
      "-sc_threshold",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      out,
    ],
    "ffmpeg(asset-video-proxy)"
  );
  const meta = await probe(out);
  return {
    proxy: proxyRel,
    durationSamples: Math.round(meta.durationSec * SAMPLE_RATE),
  };
}

async function buildMusicProxy(
  slug: string,
  id: string,
  src: string
): Promise<{ proxy: string; durationSamples: number }> {
  const proxyRel = `assets/${id}.aac`;
  const out = resolve(projectPaths(slug).dir, proxyRel);
  await run(
    FFMPEG,
    [
      "-y",
      "-i",
      src,
      "-c:a",
      "aac",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      "2",
      out,
    ],
    "ffmpeg(asset-audio-proxy)"
  );
  const meta = await probeAudio(out);
  return {
    proxy: proxyRel,
    durationSamples: Math.round(meta.durationSec * SAMPLE_RATE),
  };
}

async function buildStillProxy(
  slug: string,
  id: string,
  src: string
): Promise<{ proxy: string; durationSamples: number }> {
  const ext = extname(src).toLowerCase() || ".png";
  const proxyRel = `assets/${id}${ext}`;
  const out = resolve(projectPaths(slug).dir, proxyRel);
  await copyFile(src, out);
  return {
    proxy: proxyRel,
    durationSamples: Math.round(STILL_HOLD_SEC * SAMPLE_RATE),
  };
}

/** Register a local file into the project asset bin (idempotent on same src path). */
export async function registerAsset(
  slug: string,
  fileArg: string,
  kind?: AssetKind
): Promise<Asset> {
  const src = isAbsolute(fileArg) ? fileArg : resolve(process.cwd(), fileArg);
  if (!existsSync(src)) {
    throw new Error(`asset file not found: ${src}`);
  }
  const resolvedKind = kind ?? inferAssetKind(src);
  const project = await loadProject(slug);
  const existingBySrc = project.assets.find((a) => a.src === src);
  const baseId = slugify(basename(src).replace(/\.[^.]+$/, ""));
  const id = existingBySrc?.id ?? uniqueAssetId(project, baseId);

  const p = projectPaths(slug);
  await mkdir(p.assets, { recursive: true });

  console.log(`[asset] ${resolvedKind}: ${src}`);

  let built: { proxy: string; durationSamples: number };
  if (resolvedKind === "music") {
    console.log("[asset] building audio proxy...");
    built = await buildMusicProxy(slug, id, src);
  } else if (resolvedKind === "still") {
    console.log("[asset] copying still...");
    built = await buildStillProxy(slug, id, src);
  } else {
    console.log("[asset] building video proxy...");
    built = await buildVideoProxy(slug, id, src);
  }

  const asset: Asset = {
    id,
    kind: resolvedKind,
    name: basename(src),
    src,
    proxy: built.proxy,
    durationSamples: built.durationSamples,
  };
  project.assets = [...project.assets.filter((a) => a.id !== id), asset];
  await saveProject(slug, project);
  console.log(`[asset] registered "${id}" (${asset.name}, ${resolvedKind})`);
  return asset;
}

/** Register bytes uploaded from the browser (writes a temp file under the project). */
export async function registerAssetBytes(
  slug: string,
  filename: string,
  data: Uint8Array,
  kind?: AssetKind
): Promise<Asset> {
  const safeName =
    basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
  const p = projectPaths(slug);
  await mkdir(p.assets, { recursive: true });
  const staging = resolve(p.assets, `.upload-${Date.now()}-${safeName}`);
  await writeFile(staging, data);
  try {
    return await registerAsset(slug, staging, kind);
  } finally {
    try {
      await Bun.file(staging).delete();
    } catch {
      // staging cleanup is best-effort
    }
  }
}

export function listAssetsByKind(assets: Asset[]): Record<AssetKind, Asset[]> {
  return {
    broll: assets.filter((a) => (a.kind ?? "broll") === "broll"),
    music: assets.filter((a) => a.kind === "music"),
    still: assets.filter((a) => a.kind === "still"),
  };
}
