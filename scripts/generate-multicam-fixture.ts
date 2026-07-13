#!/usr/bin/env bun
/**
 * Generate lavfi twin-cam (optional wide) MP4s for cam-mix dev and acceptance.
 * Each file is a separate angle with alternating sine tones so RMS speaker ID
 * can attribute activity (same pattern as tests/cam-mix.test.ts).
 */
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ingestBlank } from "../src/blank-ingest.ts";
import { camMix } from "../src/cam-mix.ts";
import { ingestCam } from "../src/cams.ts";
import { FFMPEG, probe, run } from "../src/ffmpeg.ts";

const DEFAULT_OUT = join(homedir(), "Sites", "multicam-acceptance");
const DEFAULT_DURATION_SEC = 16;
const DEFAULT_SEGMENTS = 4;

export interface GenerateMulticamFixtureOptions {
  durationSec?: number;
  outDir?: string;
  segments?: number;
  withWide?: boolean;
}

export interface GeneratedCamFiles {
  durationSec: number;
  outDir: string;
  segments: number;
  speakerA: string;
  speakerB: string;
  wide?: string;
}

/** Even-index segments active on cam A; odd on cam B. */
export function activeSegmentIndices(
  cam: "a" | "b",
  segments: number
): boolean[] {
  return Array.from({ length: segments }, (_, i) =>
    cam === "a" ? i % 2 === 0 : i % 2 === 1
  );
}

export function segmentDurationSec(
  durationSec: number,
  segments: number
): number {
  if (segments < 2 || !Number.isInteger(segments)) {
    throw new Error("segments must be an integer >= 2");
  }
  if (durationSec <= 0) {
    throw new Error("durationSec must be positive");
  }
  return durationSec / segments;
}

function buildAlternatingAudioArgs(
  segDur: number,
  segments: number,
  frequency: number,
  active: boolean[]
): { filterComplex: string; inputs: string[] } {
  const inputLabels: string[] = [];
  const concatInputs: string[] = [];
  let inputIndex = 1;

  for (let i = 0; i < segments; i++) {
    const dur = segDur.toFixed(6).replace(/\.?0+$/, "") || "0";
    if (active[i]) {
      inputLabels.push(
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=${frequency}:sample_rate=48000:duration=${dur}`
      );
    } else {
      inputLabels.push(
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=48000:cl=mono:duration=${dur}`
      );
    }
    concatInputs.push(`[${inputIndex}:a]`);
    inputIndex++;
  }

  return {
    inputs: inputLabels,
    filterComplex: `${concatInputs.join("")}concat=n=${segments}:v=0:a=1[aout]`,
  };
}

async function renderCamMp4(input: {
  outPath: string;
  color: string;
  durationSec: number;
  segments: number;
  frequency: number;
  active: boolean[];
  width?: number;
  height?: number;
}): Promise<void> {
  const segDur = segmentDurationSec(input.durationSec, input.segments);
  const { inputs, filterComplex } = buildAlternatingAudioArgs(
    segDur,
    input.segments,
    input.frequency,
    input.active
  );
  const width = input.width ?? 1280;
  const height = input.height ?? 720;
  const dur = input.durationSec.toFixed(6).replace(/\.?0+$/, "") || "0";

  await run(
    FFMPEG,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${input.color}:s=${width}x${height}:r=30:d=${dur}`,
      ...inputs,
      "-filter_complex",
      filterComplex,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      input.outPath,
    ],
    "ffmpeg"
  );
}

export async function generateMulticamFixture(
  opts: GenerateMulticamFixtureOptions = {}
): Promise<GeneratedCamFiles> {
  const durationSec = opts.durationSec ?? DEFAULT_DURATION_SEC;
  const segments = opts.segments ?? DEFAULT_SEGMENTS;
  const outDir = resolve(opts.outDir ?? DEFAULT_OUT);

  await mkdir(outDir, { recursive: true });

  const speakerA = join(outDir, "speaker-a.mp4");
  const speakerB = join(outDir, "speaker-b.mp4");

  await renderCamMp4({
    outPath: speakerA,
    color: "0x2563eb",
    durationSec,
    segments,
    frequency: 440,
    active: activeSegmentIndices("a", segments),
  });

  await renderCamMp4({
    outPath: speakerB,
    color: "0xdc2626",
    durationSec,
    segments,
    frequency: 880,
    active: activeSegmentIndices("b", segments),
  });

  let wide: string | undefined;
  if (opts.withWide) {
    wide = join(outDir, "wide.mp4");
    const dur = durationSec.toFixed(6).replace(/\.?0+$/, "") || "0";
    await run(
      FFMPEG,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=0x16a34a:s=1280x720:r=30:d=${dur}`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=220:sample_rate=48000:duration=${dur}`,
        "-filter_complex",
        "[1:a]volume=0.08[aout]",
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        wide,
      ],
      "ffmpeg"
    );
  }

  return { outDir, durationSec, segments, speakerA, speakerB, wide };
}

function printUsage(): void {
  console.log(`OpenKlip generate-multicam-fixture

  bun run generate-multicam-fixture [options]

Options:
  --out <dir>         Output folder (default: ~/Sites/multicam-acceptance)
  --duration <sec>    Clip length per cam (default: ${DEFAULT_DURATION_SEC})
  --segments <n>      Alternating speaker segments (default: ${DEFAULT_SEGMENTS})
  --with-wide         Also write wide.mp4 (green, low-level bed tone)
  --run               Blank ingest + cam-add + cam-mix follow on generated files
  --slug <id>         Project slug for --run (default: multicam-fixture)
  --force             Pass --force to ingest / cam ingest when using --run

Examples:
  bun run generate-multicam-fixture
  bun run generate-multicam-fixture --out ~/Sites/multicam-acceptance --with-wide
  bun run generate-multicam-fixture --run --slug multicam-fixture --force
`);
}

function parseArgs(argv: string[]): {
  durationSec: number;
  force: boolean;
  outDir?: string;
  runAcceptance: boolean;
  segments: number;
  slug: string;
  withWide: boolean;
} {
  const outIdx = argv.indexOf("--out");
  const durIdx = argv.indexOf("--duration");
  const segIdx = argv.indexOf("--segments");
  const slugIdx = argv.indexOf("--slug");

  const durationSec =
    durIdx === -1 ? DEFAULT_DURATION_SEC : Number(argv[durIdx + 1]);
  const segments = segIdx === -1 ? DEFAULT_SEGMENTS : Number(argv[segIdx + 1]);

  if (Number.isNaN(durationSec) || durationSec <= 0) {
    throw new Error("--duration requires a positive number");
  }
  if (Number.isNaN(segments) || segments < 2) {
    throw new Error("--segments requires an integer >= 2");
  }

  return {
    outDir: outIdx === -1 ? undefined : argv[outIdx + 1],
    durationSec,
    segments,
    withWide: argv.includes("--with-wide"),
    runAcceptance: argv.includes("--run"),
    slug: slugIdx === -1 ? "multicam-fixture" : (argv[slugIdx + 1] ?? ""),
    force: argv.includes("--force"),
  };
}

async function runAcceptanceSmoke(input: {
  files: GeneratedCamFiles;
  force: boolean;
  slug: string;
}): Promise<void> {
  const { slug, files, force } = input;
  await ingestBlank({
    slug,
    durationSec: 1,
    force,
  });
  await ingestCam(slug, files.speakerA, {
    id: "a",
    name: "Speaker A",
    force,
  });
  await ingestCam(slug, files.speakerB, {
    id: "b",
    name: "Speaker B",
    force,
  });
  if (files.wide) {
    await ingestCam(slug, files.wide, {
      id: "wide",
      name: "Wide",
      role: "wide",
      force,
    });
  }
  const mix = await camMix(slug, { mode: "follow" });
  const meta = await probe(mix.sourcePath);
  console.log(
    `\nAcceptance smoke OK: slug=${slug} source=${mix.sourcePath} duration=${meta.durationSec.toFixed(2)}s`
  );
}

function printNextSteps(files: GeneratedCamFiles): void {
  console.log("\nGenerated:");
  console.log(`  ${files.speakerA}`);
  console.log(`  ${files.speakerB}`);
  if (files.wide) {
    console.log(`  ${files.wide}`);
  }
  console.log(
    `\nDuration: ${files.durationSec}s per file (${files.segments} alternating tone segments)`
  );
  console.log("\nManual cam-mix:");
  console.log("  export OPENKLIP_PROJECTS_ROOT=~/Movies/OpenKlip");
  console.log(
    "  openklip ingest --blank --slug multicam-accept --duration 1 --force"
  );
  console.log(
    `  openklip cam-add multicam-accept ${files.speakerA} --id a --name "Speaker A"`
  );
  console.log(
    `  openklip cam-add multicam-accept ${files.speakerB} --id b --name "Speaker B"`
  );
  if (files.wide) {
    console.log(
      `  openklip cam-add multicam-accept ${files.wide} --id wide --role wide --name "Wide"`
    );
  }
  console.log("  openklip cam-mix multicam-accept --mode follow --json");
  console.log("  openklip serve multicam-accept");
  console.log(
    "\nNote: lavfi fixtures prove cam-mix machinery; the v0.42 spec still prefers real footage for the human release gate."
  );
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  try {
    const parsed = parseArgs(argv);
    if (parsed.runAcceptance && !parsed.slug) {
      throw new Error("--slug requires a value when using --run");
    }

    const files = await generateMulticamFixture({
      outDir: parsed.outDir,
      durationSec: parsed.durationSec,
      segments: parsed.segments,
      withWide: parsed.withWide,
    });

    printNextSteps(files);

    if (parsed.runAcceptance) {
      await runAcceptanceSmoke({
        slug: parsed.slug,
        files,
        force: parsed.force,
      });
    }
  } catch (err) {
    console.error(
      `error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    printUsage();
    process.exit(1);
  }
}
