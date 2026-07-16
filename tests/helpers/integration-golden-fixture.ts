import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Word } from "../../src/edl.ts";
import { SAMPLE_RATE } from "../../src/edl.ts";
import { FFMPEG, run } from "../../src/ffmpeg.ts";
import { projectPaths } from "../../src/paths.ts";
import { makeProject, writeFixtureProject } from "./projectFixture.ts";

export const GOLDEN_PATH_FFMPEG_OK =
  typeof FFMPEG === "string" && existsSync(FFMPEG);

export interface IntegrationGoldenFixture {
  cleanup: () => void;
  projectsRoot: string;
  root: string;
  slug: string;
  sourceDurationSec: number;
  words: Word[];
}

const SOURCE_DURATION_SEC = 4.5;
const SOURCE_WIDTH = 640;
const SOURCE_HEIGHT = 360;
const SOURCE_FPS = 30;

function sec(n: number): number {
  return Math.round(n * SAMPLE_RATE);
}

// Deterministic lavfi clip: same bytes on every run (mirrors the pattern in
// tests/exporter.test.ts ~1254-1332). A stub text file would not probe or
// export; the golden path exercises the real ffmpeg render, so it needs a
// real, short, low-res source.
async function generateLavfiClip(outPath: string): Promise<void> {
  await run(
    FFMPEG,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=duration=${SOURCE_DURATION_SEC}:size=${SOURCE_WIDTH}x${SOURCE_HEIGHT}:rate=${SOURCE_FPS}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${SOURCE_DURATION_SEC}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      outPath,
    ],
    "ffmpeg(golden-path-clip)"
  );
}

/**
 * Builds a temp project with a REAL, deterministic lavfi-generated proxy +
 * source clip and a small transcript whose word spans all fall inside the
 * clip duration, so the golden-path browser test can cut/restore/export
 * against genuine media instead of a stub file ffmpeg cannot probe.
 */
export async function prepareIntegrationGoldenFixture(): Promise<IntegrationGoldenFixture> {
  const root = mkdtempSync(join(tmpdir(), "openklip-golden-"));
  const projectsRoot = join(root, "projects");
  const slug = "golden-path";
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_PROJECTS_ROOT = projectsRoot;

  const words: Word[] = [
    {
      id: "w0",
      text: "The",
      startSample: sec(0.2),
      endSample: sec(0.6),
      deleted: false,
    },
    {
      id: "w1",
      text: "quick",
      startSample: sec(0.6),
      endSample: sec(1),
      deleted: false,
    },
    {
      id: "w2",
      text: "brown",
      startSample: sec(1),
      endSample: sec(1.4),
      deleted: false,
    },
    {
      id: "w3",
      text: "fox",
      startSample: sec(1.4),
      endSample: sec(1.8),
      deleted: false,
    },
    {
      id: "w4",
      text: "jumps",
      startSample: sec(1.8),
      endSample: sec(2.2),
      deleted: false,
    },
  ];

  const paths = projectPaths(slug);

  writeFixtureProject(
    slug,
    makeProject({
      slug,
      revision: 0,
      source: join(paths.dir, "source.mp4"),
      proxy: "working/proxy.mp4",
      fps: SOURCE_FPS,
      width: SOURCE_WIDTH,
      height: SOURCE_HEIGHT,
      durationSamples: sec(SOURCE_DURATION_SEC),
      assets: [],
      words,
    })
  );

  // writeFixtureProject already created working/proxy.mp4 with stub bytes and
  // the directory tree (working/assets/output). Overwrite proxy.mp4 and add
  // source.mp4 with the real lavfi clip so both probe and export succeed.
  await generateLavfiClip(paths.proxy);
  await generateLavfiClip(join(paths.dir, "source.mp4"));

  return {
    slug,
    projectsRoot,
    root,
    sourceDurationSec: SOURCE_DURATION_SEC,
    words,
    cleanup: () => {
      if (prevRoot === undefined) {
        delete process.env.OPENKLIP_PROJECTS_ROOT;
      } else {
        process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
      }
      if (existsSync(root) && statSync(root).isDirectory()) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}
