#!/usr/bin/env bun
/**
 * CRAFT-6186: deterministic media acceptance corpus.
 *
 * Generates a small set of representative fixtures via ffmpeg lavfi (same
 * reproducible-bytes pattern as scripts/generate-multicam-fixture.ts and
 * tests/exporter.test.ts's skip-gated smokes) into a GITIGNORED directory, and
 * writes a manifest.json describing each fixture's id, generator recipe, and
 * expected deterministic properties.
 *
 * The corpus covers five technical dimensions called out in CRAFT-6186:
 *   1. Standard SDR H.264 1080p + AAC (baseline talking-head stand-in)
 *   2. 4K HEVC 10-bit (libx265, yuv420p10le)
 *   3. Variable frame rate (VFR)
 *   4. Portrait 9:16 phone-style
 *   5. Long source (60s) with sparse/mostly-static content
 *
 * A sixth entry is a MANIFEST SLOT for a real, consented "talking-head with
 * speech" clip that ffmpeg cannot synthesize: it is never auto-generated, is
 * documented in docs/acceptance-corpus.md, and the gate (scripts/acceptance-
 * gate.ts) skips it gracefully whenever the file is absent from disk.
 *
 * Perceptual quality (SSIM/VMAF) is explicitly OUT of scope here: see
 * docs/acceptance-corpus.md's "Deferred" section.
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { FFMPEG, ffprobeJson, run } from "../src/ffmpeg.ts";
import { repoPath } from "../src/repo-paths.ts";

export const ACCEPTANCE_CORPUS_DIR = repoPath("fixtures", "acceptance");
export const ACCEPTANCE_MANIFEST_FILENAME = "manifest.json";

/** Deterministic generation recipe for one synthetic fixture. */
export interface AcceptanceFixtureGenerator {
  /** ffmpeg args BEFORE the trailing output path (this module appends "-y"
   * up front and the output path at the end). */
  ffmpegArgs: string[];
}

/** A fixture's nominal, generator-declared properties. Informational for
 * synthetic fixtures (self-checked at generation time below); for the
 * user-provisioned slot these are left mostly unset since the real file's
 * exact properties aren't controlled by this repo. */
export interface AcceptanceFixtureExpected {
  /** Nominal generation-time duration target (approximate for the VFR
   * fixture: concatenated lavfi segments don't always sum to an exact
   * total). The gate computes its own duration expectation at run time from
   * the ingested project + edit, so this is documentation only. */
  approxDurationSec: number;
  audioCodec: string;
  container: "mp4";
  /** null when the fixture is intentionally variable frame rate. */
  fps: number | null;
  hasAudio: boolean;
  height: number;
  pixFmt: string;
  vfr: boolean;
  videoCodec: string;
  width: number;
}

export interface AcceptanceFixtureSpec {
  description: string;
  expected: AcceptanceFixtureExpected;
  /** Absent for the user-provisioned slot. */
  generator?: AcceptanceFixtureGenerator;
  id: string;
  /** Relative to ACCEPTANCE_CORPUS_DIR. */
  relPath: string;
  /** True for the manifest slot documented in docs/acceptance-corpus.md; the
   * gate skips this fixture gracefully whenever the file is absent. */
  userProvided: boolean;
}

export interface AcceptanceManifestEntry extends AcceptanceFixtureSpec {
  /** Absolute path. */
  path: string;
  /** Whether the file currently exists on disk. */
  present: boolean;
}

export interface AcceptanceManifest {
  corpusDir: string;
  fixtures: AcceptanceManifestEntry[];
  generatedAt: string;
}

const SDR_DURATION_SEC = 4;
const HEVC_DURATION_SEC = 2;
const VFR_SEGMENT_SEC = 1;
const PORTRAIT_DURATION_SEC = 3;
const SPARSE_DURATION_SEC = 60;

export const ACCEPTANCE_FIXTURE_SPECS: AcceptanceFixtureSpec[] = [
  {
    id: "sdr-h264-1080p",
    description:
      "Standard SDR H.264 1080p + AAC audio (baseline talking-head stand-in)",
    relPath: "sdr-h264-1080p.mp4",
    userProvided: false,
    generator: {
      ffmpegArgs: [
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=1920x1080:rate=30:duration=${SDR_DURATION_SEC}`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=440:sample_rate=48000:duration=${SDR_DURATION_SEC}`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
      ],
    },
    expected: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      pixFmt: "yuv420p",
      width: 1920,
      height: 1080,
      approxDurationSec: SDR_DURATION_SEC,
      fps: 30,
      vfr: false,
      hasAudio: true,
    },
  },
  {
    id: "hevc-4k-10bit",
    description: "4K HEVC 10-bit (Main10, libx265) + AAC audio",
    relPath: "hevc-4k-10bit.mp4",
    userProvided: false,
    generator: {
      ffmpegArgs: [
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=3840x2160:rate=24:duration=${HEVC_DURATION_SEC}`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=523.25:sample_rate=48000:duration=${HEVC_DURATION_SEC}`,
        "-c:v",
        "libx265",
        "-preset",
        "ultrafast",
        "-x265-params",
        "log-level=error",
        "-pix_fmt",
        "yuv420p10le",
        "-c:a",
        "aac",
        "-shortest",
      ],
    },
    expected: {
      container: "mp4",
      videoCodec: "hevc",
      audioCodec: "aac",
      pixFmt: "yuv420p10le",
      width: 3840,
      height: 2160,
      approxDurationSec: HEVC_DURATION_SEC,
      fps: 24,
      vfr: false,
      hasAudio: true,
    },
  },
  {
    id: "vfr-1280x720",
    description:
      "Variable frame rate: an 8fps segment concatenated with a 30fps segment",
    relPath: "vfr-1280x720.mp4",
    userProvided: false,
    generator: {
      ffmpegArgs: [
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=1280x720:rate=8:duration=${VFR_SEGMENT_SEC}`,
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=1280x720:rate=30:duration=${VFR_SEGMENT_SEC}`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=659.25:sample_rate=48000:duration=${VFR_SEGMENT_SEC * 2}`,
        "-filter_complex",
        "[0:v][1:v]concat=n=2:v=1:a=0[vout]",
        "-map",
        "[vout]",
        "-map",
        "2:a",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-fps_mode",
        "vfr",
        "-c:a",
        "aac",
        "-shortest",
      ],
    },
    expected: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      pixFmt: "yuv420p",
      width: 1280,
      height: 720,
      approxDurationSec: VFR_SEGMENT_SEC * 2,
      fps: null,
      vfr: true,
      hasAudio: true,
    },
  },
  {
    id: "portrait-9x16",
    description: "Portrait 9:16 phone-style SDR H.264 + AAC audio",
    relPath: "portrait-9x16.mp4",
    userProvided: false,
    generator: {
      ffmpegArgs: [
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=1080x1920:rate=30:duration=${PORTRAIT_DURATION_SEC}`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=349.23:sample_rate=48000:duration=${PORTRAIT_DURATION_SEC}`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
      ],
    },
    expected: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      pixFmt: "yuv420p",
      width: 1080,
      height: 1920,
      approxDurationSec: PORTRAIT_DURATION_SEC,
      fps: 30,
      vfr: false,
      hasAudio: true,
    },
  },
  {
    id: "long-sparse-60s",
    description:
      "Long source (60s) with sparse, mostly-static content and near-silent audio",
    relPath: "long-sparse-60s.mp4",
    userProvided: false,
    generator: {
      ffmpegArgs: [
        "-f",
        "lavfi",
        "-i",
        `color=c=0x222222:s=640x360:r=15:d=${SPARSE_DURATION_SEC}`,
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=48000:cl=mono:d=${SPARSE_DURATION_SEC}`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
      ],
    },
    expected: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      pixFmt: "yuv420p",
      width: 640,
      height: 360,
      approxDurationSec: SPARSE_DURATION_SEC,
      fps: 15,
      vfr: false,
      hasAudio: true,
    },
  },
  {
    id: "talking-head-real",
    description:
      "User-provisioned slot: a real, consented talking-head clip with speech. " +
      "ffmpeg lavfi cannot synthesize genuine speech, so this fixture is never " +
      "auto-generated. Drop a local file at " +
      "fixtures/acceptance/user-provided/talking-head.mp4 (documented in " +
      "docs/acceptance-corpus.md) to include it in the gate; the gate skips " +
      "this fixture gracefully whenever the file is absent and never fails CI " +
      "because of that absence.",
    relPath: join("user-provided", "talking-head.mp4"),
    userProvided: true,
    expected: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      pixFmt: "yuv420p",
      width: 0,
      height: 0,
      approxDurationSec: 0,
      fps: null,
      vfr: false,
      hasAudio: true,
    },
  },
];

interface GeneratedFixtureFacts {
  fps: number | null;
  hasAudio: boolean;
  height: number;
  pixFmt?: string;
  videoCodec?: string;
  width: number;
}

async function probeGeneratedFixture(
  file: string
): Promise<GeneratedFixtureFacts> {
  const json = await ffprobeJson(
    ["-v", "quiet", "-print_format", "json", "-show_streams", file],
    "ffprobe(acceptance-corpus)"
  );
  const streams = json.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  let fps: number | null = null;
  const rate = v?.r_frame_rate;
  if (typeof rate === "string" && rate.includes("/")) {
    const [n, d] = rate.split("/").map(Number);
    if (n && d) {
      fps = Math.round((n / d) * 1000) / 1000;
    }
  }
  return {
    width: Number(v?.width ?? 0),
    height: Number(v?.height ?? 0),
    videoCodec: v?.codec_name as string | undefined,
    pixFmt: v?.pix_fmt as string | undefined,
    fps,
    hasAudio: Boolean(a),
  };
}

/**
 * Generation-time sanity check: catches a broken ffmpeg recipe immediately
 * (wrong codec/dimensions/missing audio) rather than deep inside the gate.
 * Duration/fps are intentionally NOT hard-asserted here: the VFR fixture's
 * concatenated segments don't sum to an exact nominal duration, and the gate
 * (scripts/acceptance-gate.ts) computes its own duration/fps expectations
 * dynamically from the ingested project, which is the authoritative check.
 */
function assertGeneratedFixtureMatches(
  spec: AcceptanceFixtureSpec,
  facts: GeneratedFixtureFacts
): void {
  const issues: string[] = [];
  if (facts.width !== spec.expected.width) {
    issues.push(`width ${facts.width} != expected ${spec.expected.width}`);
  }
  if (facts.height !== spec.expected.height) {
    issues.push(`height ${facts.height} != expected ${spec.expected.height}`);
  }
  if (facts.videoCodec !== spec.expected.videoCodec) {
    issues.push(
      `videoCodec ${facts.videoCodec} != expected ${spec.expected.videoCodec}`
    );
  }
  if (facts.pixFmt !== spec.expected.pixFmt) {
    issues.push(`pixFmt ${facts.pixFmt} != expected ${spec.expected.pixFmt}`);
  }
  if (facts.hasAudio !== spec.expected.hasAudio) {
    issues.push(
      `hasAudio ${facts.hasAudio} != expected ${spec.expected.hasAudio}`
    );
  }
  if (issues.length > 0) {
    throw new Error(
      `acceptance-corpus: generated fixture "${spec.id}" does not match its declared recipe: ${issues.join("; ")}`
    );
  }
}

async function generateOneFixture(
  spec: AcceptanceFixtureSpec,
  outPath: string
): Promise<void> {
  if (!spec.generator) {
    return;
  }
  await run(
    FFMPEG,
    ["-y", ...spec.generator.ffmpegArgs, outPath],
    `ffmpeg(acceptance-corpus:${spec.id})`
  );
  const facts = await probeGeneratedFixture(outPath);
  assertGeneratedFixtureMatches(spec, facts);
}

export interface GenerateAcceptanceCorpusOptions {
  /** Defaults to ACCEPTANCE_CORPUS_DIR. */
  outDir?: string;
}

/**
 * Regenerates every synthetic fixture (reproducible lavfi recipe, so this is
 * safe to call on every gate run) and writes manifest.json. The user-
 * provisioned slot is never generated; its `present` flag simply reflects
 * whatever is already on disk.
 */
export async function generateAcceptanceCorpus(
  opts: GenerateAcceptanceCorpusOptions = {}
): Promise<AcceptanceManifest> {
  const outDir = opts.outDir ?? ACCEPTANCE_CORPUS_DIR;
  await mkdir(outDir, { recursive: true });
  await mkdir(join(outDir, "user-provided"), { recursive: true });

  const fixtures: AcceptanceManifestEntry[] = [];
  for (const spec of ACCEPTANCE_FIXTURE_SPECS) {
    const path = join(outDir, spec.relPath);
    if (spec.generator) {
      await generateOneFixture(spec, path);
    }
    fixtures.push({ ...spec, path, present: existsSync(path) });
  }

  const manifest: AcceptanceManifest = {
    corpusDir: outDir,
    generatedAt: new Date().toISOString(),
    fixtures,
  };
  await Bun.write(
    join(outDir, ACCEPTANCE_MANIFEST_FILENAME),
    JSON.stringify(manifest, null, 2)
  );
  return manifest;
}

function printUsage(): void {
  console.log(`OpenKlip acceptance-corpus

  bun run acceptance-corpus [options]

Generates the CRAFT-6186 deterministic media acceptance corpus (gitignored,
regenerated on every run) into fixtures/acceptance/, plus manifest.json.

Options:
  --out <dir>   Output folder (default: ${ACCEPTANCE_CORPUS_DIR})
`);
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }
  const outIdx = argv.indexOf("--out");
  const outDir = outIdx === -1 ? undefined : argv[outIdx + 1];

  try {
    const manifest = await generateAcceptanceCorpus({ outDir });
    console.log(`\nAcceptance corpus -> ${manifest.corpusDir}`);
    for (const f of manifest.fixtures) {
      const tag = f.userProvided
        ? f.present
          ? "user-provided (present)"
          : "user-provided (absent, will be skipped by the gate)"
        : "generated";
      console.log(`  ${f.id}: ${tag}`);
    }
  } catch (err) {
    console.error(
      `error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    printUsage();
    process.exit(1);
  }
}
