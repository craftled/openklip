import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { type Asset, ProjectSchema, SAMPLE_RATE } from "./edl.ts";
import { FFMPEG, probe, run } from "./ffmpeg.ts";
import { assetProxyPath, projectPaths, slugify } from "./paths.ts";

// Register a b-roll clip on a project: build a 720p all-intra proxy (for fast
// preview seeks) and record it as an asset. Idempotent on asset id.
export async function registerBroll(slug: string, fileArg: string): Promise<Asset> {
  const p = projectPaths(slug);
  if (!existsSync(p.project)) throw new Error(`project not found: ${slug}`);
  const src = isAbsolute(fileArg) ? fileArg : resolve(process.cwd(), fileArg);
  if (!existsSync(src)) throw new Error(`b-roll file not found: ${src}`);

  const project = ProjectSchema.parse(JSON.parse(await Bun.file(p.project).text()));
  // Re-registering the same file overwrites that asset in place (no duplicate).
  const existingBySrc = project.assets.find((a) => a.src === src);
  let id: string;
  if (existingBySrc) {
    id = existingBySrc.id;
  } else {
    id = slugify(basename(src).replace(/\.[^.]+$/, ""));
    const taken = new Set(project.assets.map((a) => a.id));
    if (taken.has(id)) {
      let n = 2;
      while (taken.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
  }

  await mkdir(p.assets, { recursive: true });
  const meta = await probe(src);
  console.log(`[broll] ${src} (${meta.width}x${meta.height} ${meta.durationSec.toFixed(1)}s)`);
  console.log("[broll] building proxy...");
  await run(
    FFMPEG,
    [
      "-y", "-i", src,
      "-vf", "scale=-2:720",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
      "-g", "1", "-keyint_min", "1", "-sc_threshold", "0",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-ar", String(SAMPLE_RATE), "-ac", "2",
      "-movflags", "+faststart",
      assetProxyPath(slug, id),
    ],
    "ffmpeg(broll-proxy)",
  );

  const asset: Asset = {
    id,
    name: basename(src),
    src,
    proxy: `assets/${id}.mp4`,
    durationSamples: Math.round(meta.durationSec * SAMPLE_RATE),
  };
  project.assets = [...project.assets.filter((a) => a.id !== id), asset];
  await Bun.write(p.project, JSON.stringify(project, null, 2));
  console.log(`[broll] registered asset "${id}" (${asset.name})`);
  return asset;
}
