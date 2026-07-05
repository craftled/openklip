import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { type Project, ProjectSchema, SAMPLE_RATE } from "./edl.ts";
import { FFMPEG, run } from "./ffmpeg.ts";
import { assertProjectCanBeIngested } from "./ingest-guard.ts";
import { buildProxy } from "./ingest.ts";
import { projectPaths, slugify } from "./paths.ts";
import { defaultTemplateId } from "./templates.ts";

export type BlankAspect = "16:9" | "9:16" | "1:1";

export interface IngestBlankOptions {
  slug?: string;
  durationSec?: number;
  aspect?: BlankAspect;
  fps?: number;
  color?: string;
  force?: boolean;
}

const ASPECT_DIMS: Record<BlankAspect, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

function normalizeColor(raw: string): string {
  const color = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }
  throw new Error(`color must be a hex value like #000000 (got ${JSON.stringify(raw)})`);
}

async function buildBlankSource(input: {
  outPath: string;
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  color: string;
}): Promise<void> {
  await run(
    FFMPEG,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${input.color.replace("#", "0x")}:s=${input.width}x${input.height}:r=${input.fps}:d=${input.durationSec}`,
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=${SAMPLE_RATE}:cl=stereo:d=${input.durationSec}`,
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      input.outPath,
    ],
    "ffmpeg(blank-source)"
  );
}

/** Create a graphics-first project with no speech transcript. */
export async function ingestBlank(opts?: IngestBlankOptions): Promise<string> {
  const durationSec = opts?.durationSec ?? 30;
  if (!(Number.isFinite(durationSec) && durationSec >= 1 && durationSec <= 3600)) {
    throw new Error("duration must be between 1 and 3600 seconds");
  }
  const aspect = opts?.aspect ?? "16:9";
  const fps = opts?.fps ?? 30;
  if (!(Number.isFinite(fps) && fps >= 1 && fps <= 120)) {
    throw new Error("fps must be between 1 and 120");
  }
  const color = normalizeColor(opts?.color ?? "#000000");
  const slug =
    opts?.slug?.trim() ||
    slugify(`blank-${aspect}-${Math.round(durationSec)}s-${Date.now()}`);
  const dims = ASPECT_DIMS[aspect];

  assertProjectCanBeIngested(slug, opts?.force);
  const p = projectPaths(slug);
  await rm(p.dir, { recursive: true, force: true });
  await mkdir(p.working, { recursive: true });
  await mkdir(p.assets, { recursive: true });
  await mkdir(p.output, { recursive: true });
  await mkdir(join(p.dir, "graphics"), { recursive: true });

  const blankSourceAbs = join(p.working, "blank-source.mp4");
  console.log(
    `[ingest-blank] ${slug} ${dims.width}x${dims.height} ${fps}fps ${durationSec}s`
  );
  await buildBlankSource({
    outPath: blankSourceAbs,
    width: dims.width,
    height: dims.height,
    durationSec,
    fps,
    color,
  });
  await buildProxy(blankSourceAbs, p.proxy);

  const project: Project = ProjectSchema.parse({
    version: 1,
    slug,
    blankCanvas: true,
    source: "working/blank-source.mp4",
    proxy: "working/proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps,
    width: dims.width,
    height: dims.height,
    durationSamples: Math.round(durationSec * SAMPLE_RATE),
    padMs: 0,
    template: defaultTemplateId(),
    captions: { enabled: false, maxWords: 6 },
    words: [],
    cuts: {
      deadAir: [],
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 0 },
    },
  });

  await Bun.write(p.project, JSON.stringify(project, null, 2));
  await Bun.write(p.transcript, JSON.stringify({ words: [] }, null, 2));

  console.log(`[ingest-blank] done: ${slug}`);
  console.log(`[ingest-blank] project -> ${p.dir}`);
  console.log(`\nNext:  bun run serve ${slug}`);
  return slug;
}

export function isBlankCanvasProject(project: Project): boolean {
  return project.blankCanvas === true;
}
