import { existsSync } from "node:fs";
import { copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import type { Actor } from "./action-log.ts";
import { removeAsset } from "./actions.ts";
import { inferAssetKind, isRecognizedAssetFile } from "./asset-filenames.ts";
import {
  type Asset,
  type AssetKind,
  type Project,
  ProjectSchema,
  SAMPLE_RATE,
} from "./edl.ts";
import { FFMPEG, probe, probeAudio, run } from "./ffmpeg.ts";
import { assetProxyRelative, projectPaths, slugify } from "./paths.ts";
import { mutateProject } from "./projectStore.ts";
import { cwdPath } from "./repo-paths.ts";

export { inferAssetKind, isRecognizedAssetFile } from "./asset-filenames.ts";

const STILL_HOLD_SEC = 3;

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

async function buildVideoProxy(
  slug: string,
  id: string,
  src: string
): Promise<{ proxy: string; durationSamples: number }> {
  const proxyRel = assetProxyRelative(`${id}.mp4`);
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
  const proxyRel = assetProxyRelative(`${id}.aac`);
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
  _id: string,
  src: string
): Promise<{ proxy: string; durationSamples: number }> {
  const p = projectPaths(slug);
  const durationSamples = Math.round(STILL_HOLD_SEC * SAMPLE_RATE);
  const relToAssets = relative(p.assets, src).replace(/\\/g, "/");
  // Source already lives in the user assets/ drop folder: reference it in place.
  if (
    relToAssets &&
    !relToAssets.startsWith("..") &&
    !isAbsolute(relToAssets)
  ) {
    return {
      proxy: relative(p.dir, src).replace(/\\/g, "/"),
      durationSamples,
    };
  }
  // Source is outside assets/ (e.g. a CLI path like ~/Pictures/x.png). Copy it
  // in so project.json stays portable: a "../../…" proxy would break the
  // moment the project dir moves and would leak absolute structure.
  const safeName = basename(src).replace(/[^a-zA-Z0-9._-]/g, "_") || "still";
  let dest = resolve(p.assets, safeName);
  if (existsSync(dest)) {
    const ext = extname(safeName);
    const stem = basename(safeName, ext) || "still";
    let n = 2;
    while (existsSync(dest)) {
      dest = resolve(p.assets, `${stem}-${n}${ext}`);
      n += 1;
    }
  }
  await copyFile(src, dest);
  return {
    proxy: relative(p.dir, dest).replace(/\\/g, "/"),
    durationSamples,
  };
}

/** Register a local file into the project asset bin (idempotent on same src path). */
export async function registerAsset(
  slug: string,
  fileArg: string,
  kind?: AssetKind,
  actor?: Actor
): Promise<Asset> {
  const src = isAbsolute(fileArg) ? fileArg : cwdPath(fileArg);
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
  await mkdir(p.assetProxies, { recursive: true });

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
  // The write goes through mutateProject (locked, logged): it reloads the
  // project fresh inside the per-slug lock, so a registration racing another
  // mutation can't lose an update, and the registration itself is a logged,
  // revision-bumping action-history entry.
  await mutateProject(
    slug,
    (p) => {
      p.assets = [...p.assets.filter((a) => a.id !== id), asset];
    },
    {
      action: "asset-add",
      actor,
      input: { id: asset.id, name: asset.name, kind: asset.kind },
    }
  );
  console.log(`[asset] registered "${id}" (${asset.name}, ${resolvedKind})`);
  return asset;
}

/** Register bytes uploaded from the browser (persists source under assets/). */
export async function registerAssetBytes(
  slug: string,
  filename: string,
  data: Uint8Array,
  kind?: AssetKind,
  actor?: Actor
): Promise<Asset> {
  const safeName =
    basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
  const p = projectPaths(slug);
  await mkdir(p.assets, { recursive: true });
  await mkdir(p.assetProxies, { recursive: true });

  let stored = resolve(p.assets, safeName);
  if (existsSync(stored)) {
    const ext = extname(safeName);
    const stem = basename(safeName, ext) || "upload";
    let n = 2;
    while (existsSync(stored)) {
      stored = resolve(p.assets, `${stem}-${n}${ext}`);
      n += 1;
    }
  }

  await writeFile(stored, data);
  return await registerAsset(slug, stored, kind, actor);
}

export function listAssetsByKind(assets: Asset[]): Record<AssetKind, Asset[]> {
  return {
    broll: assets.filter((a) => (a.kind ?? "broll") === "broll"),
    music: assets.filter((a) => a.kind === "music"),
    still: assets.filter((a) => a.kind === "still"),
  };
}

function pathUnderDir(dir: string, target: string): boolean {
  const resolved = resolve(target);
  const root = resolve(dir);
  return resolved === root || resolved.startsWith(`${root}${sep}`);
}

async function safeUnlinkInProject(
  slug: string,
  relOrAbs: string
): Promise<void> {
  const p = projectPaths(slug);
  const abs = isAbsolute(relOrAbs) ? relOrAbs : resolve(p.dir, relOrAbs);
  if (!pathUnderDir(p.dir, abs)) {
    return;
  }
  try {
    await unlink(abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      throw e;
    }
  }
}

/** Remove an asset from the bin, prune overlays, and delete project-local files. */
export async function deleteAsset(
  slug: string,
  assetId: string,
  actor?: Actor
): Promise<Project> {
  const existing = await loadProject(slug);
  const asset = existing.assets.find((a) => a.id === assetId);
  if (!asset) {
    throw new Error(`unknown asset "${assetId}"`);
  }
  // Routed through mutateProject (locked, logged): it reloads the project
  // fresh inside the per-slug lock (so a concurrent edit can't lose an
  // update) and gives asset removal a logged, revision-bumping
  // action-history entry, like asset-add already has.
  let mutated: Project | undefined;
  await mutateProject(
    slug,
    (p) => {
      mutated = p;
      if (!removeAsset(p, assetId)) {
        throw new Error(`unknown asset "${assetId}"`);
      }
    },
    { action: "asset-rm", actor, input: { id: asset.id, name: asset.name } }
  );
  const project = mutated as Project;
  await safeUnlinkInProject(slug, asset.proxy);
  if (asset.src) {
    await safeUnlinkInProject(slug, asset.src);
  }
  return project;
}
