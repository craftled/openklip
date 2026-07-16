#!/usr/bin/env bun
/**
 * CRAFT-6186: deterministic media acceptance gate.
 *
 * For every PRESENT fixture in the acceptance corpus (see
 * scripts/acceptance-corpus.ts): ingest -> apply a canonical, content-
 * independent deterministic edit -> export -> verify the export's STRUCTURAL
 * facts via ffprobe. Every assertion here is a deterministic fact (stream
 * codecs, container, dimensions, frame rate, duration within a tolerance
 * band, A/V presence, non-trivial file size, no ffmpeg/ingest error) -
 * NEVER a perceptual comparison (no SSIM/VMAF; see docs/acceptance-
 * corpus.md's "Deferred" section for that follow-up).
 *
 * The deterministic edit is a fixed dead-air cut chosen purely from the
 * ingested clip's DURATION (see canonicalDeadAirSpan below), never from
 * transcribed word content: the synthetic fixtures carry no real speech, so
 * Whisper's transcript is unpredictable garbage/noise/silence and this gate
 * must never assert on it. Ingest still runs the real proxy/audio/Whisper
 * pipeline (src/ingest.ts's default media deps) so the gate actually
 * exercises the ingest/transcribe path end-to-end; it just never reads the
 * transcript's contents.
 */
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDeadAir } from "../src/actions.ts";
import { rangesForExport, totalDurationSec } from "../src/edl.ts";
import { exportCut, resolveOutputFps } from "../src/exporter.ts";
import { ffprobeJson } from "../src/ffmpeg.ts";
import { ingest } from "../src/ingest.ts";
import { projectPaths, slugFromVideo } from "../src/paths.ts";
import { loadProject, mutateProject } from "../src/projectStore.ts";
import {
  type AcceptanceManifest,
  type AcceptanceManifestEntry,
  generateAcceptanceCorpus,
} from "./acceptance-corpus.ts";

const EXPECTED_VIDEO_CODEC = "h264";
const EXPECTED_AUDIO_CODEC = "aac";
const EXPECTED_PIX_FMT = "yuv420p";
const EXPECTED_FORMAT = "mp4";
const MIN_OUTPUT_BYTES = 1024;
const DURATION_TOLERANCE_SEC = 0.35;
const FPS_TOLERANCE = 0.05;
const DIMENSION_TOLERANCE_PX = 0;

// The dead-air span never depends on transcribed word content (deliberately
// -- see module docstring): a lead-in of 10% of the clip's duration, then a
// fixed-ish cut length clamped to stay comfortably inside the clip and above
// actions.ts's MIN_DEAD_AIR_SPAN_SEC (0.05s) floor.
export function canonicalDeadAirSpan(durationSec: number): {
  fromSec: number;
  toSec: number;
} {
  if (!(Number.isFinite(durationSec) && durationSec > 0)) {
    throw new Error(
      `canonicalDeadAirSpan requires a positive finite duration, got ${durationSec}`
    );
  }
  const fromSec = Math.min(durationSec * 0.1, Math.max(durationSec - 0.1, 0));
  const spanLen = Math.min(0.5, Math.max(durationSec * 0.2, 0.06));
  const toSec = Math.min(fromSec + spanLen, durationSec - 0.01);
  return { fromSec, toSec };
}

interface ProbedExportFacts {
  audioCodec?: string;
  durationSec: number;
  fps: number;
  hasAudio: boolean;
  hasVideo: boolean;
  height: number;
  pixFmt?: string;
  videoCodec?: string;
  width: number;
}

async function probeExportOutput(file: string): Promise<ProbedExportFacts> {
  const json = await ffprobeJson(
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      file,
    ],
    "ffprobe(acceptance-gate)"
  );
  const streams = json.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  const durationSec = Number(
    json.format?.duration ??
      (v?.duration as string) ??
      (a?.duration as string) ??
      0
  );
  let fps = 0;
  const rate = v?.r_frame_rate;
  if (typeof rate === "string" && rate.includes("/")) {
    const [n, d] = rate.split("/").map(Number);
    if (n && d) {
      fps = n / d;
    }
  }
  return {
    width: Number(v?.width ?? 0),
    height: Number(v?.height ?? 0),
    fps: Math.round(fps * 1000) / 1000,
    durationSec,
    videoCodec: v?.codec_name as string | undefined,
    audioCodec: a?.codec_name as string | undefined,
    pixFmt: v?.pix_fmt as string | undefined,
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
  };
}

interface GateCheck {
  actual: unknown;
  expected: unknown;
  name: string;
  ok: boolean;
}

function checkEqual(
  name: string,
  actual: unknown,
  expected: unknown
): GateCheck {
  return { name, actual, expected, ok: actual === expected };
}

function checkClose(
  name: string,
  actual: number,
  expected: number,
  tolerance: number
): GateCheck {
  return {
    name,
    actual,
    expected,
    ok: Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  };
}

export interface GateFixtureResult {
  checks: GateCheck[];
  durationMs: number;
  expected?: Record<string, unknown>;
  id: string;
  measured?: Record<string, unknown>;
  reason?: string;
  status: "fail" | "pass" | "skipped";
}

export interface AcceptanceGateReport {
  generatedAt: string;
  ok: boolean;
  results: GateFixtureResult[];
}

async function runFixtureGate(
  fixture: AcceptanceManifestEntry
): Promise<GateFixtureResult> {
  const startedAt = Date.now();
  if (!fixture.present) {
    return {
      id: fixture.id,
      status: "skipped",
      reason: fixture.userProvided
        ? "user-provisioned fixture not present on disk (see docs/acceptance-corpus.md)"
        : "fixture file not present",
      checks: [],
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    const slug = slugFromVideo(fixture.path);
    await ingest(fixture.path, { force: true });

    const preEdit = await loadProject(slug);
    const durationSec = preEdit.durationSamples / preEdit.sampleRate;
    const span = canonicalDeadAirSpan(durationSec);
    await mutateProject(slug, (p) => addDeadAir(p, [span]), {
      action: "acceptance-gate-cut",
      actor: "system",
    });

    const edited = await loadProject(slug);
    const ranges = rangesForExport(edited);
    const expectedDurationSec = totalDurationSec(ranges);
    const expectedFps = resolveOutputFps(edited.fps, undefined);
    const expectedWidth = edited.width;
    const expectedHeight = edited.height;

    const result = await exportCut(slug, {});
    const outPath = projectPaths(slug).out;

    if (!existsSync(outPath)) {
      throw new Error(`export output missing: ${outPath}`);
    }
    const sizeBytes = statSync(outPath).size;
    const probed = await probeExportOutput(outPath);

    const checks: GateCheck[] = [
      checkEqual("format", result.format, EXPECTED_FORMAT),
      checkEqual("outputExists", true, true),
      {
        name: "sizeBytes",
        actual: sizeBytes,
        expected: `>= ${MIN_OUTPUT_BYTES}`,
        ok: sizeBytes >= MIN_OUTPUT_BYTES,
      },
      checkEqual("videoCodec", probed.videoCodec, EXPECTED_VIDEO_CODEC),
      checkEqual("audioCodec", probed.audioCodec, EXPECTED_AUDIO_CODEC),
      checkEqual("pixFmt", probed.pixFmt, EXPECTED_PIX_FMT),
      checkEqual("hasVideoStream", probed.hasVideo, true),
      checkEqual("hasAudioStream", probed.hasAudio, true),
      checkClose(
        "resultWidth",
        result.width,
        expectedWidth,
        DIMENSION_TOLERANCE_PX
      ),
      checkClose(
        "probedWidth",
        probed.width,
        expectedWidth,
        DIMENSION_TOLERANCE_PX
      ),
      checkClose(
        "resultHeight",
        result.height,
        expectedHeight,
        DIMENSION_TOLERANCE_PX
      ),
      checkClose(
        "probedHeight",
        probed.height,
        expectedHeight,
        DIMENSION_TOLERANCE_PX
      ),
      checkClose("resultFps", result.fps, expectedFps, FPS_TOLERANCE),
      checkClose("probedFps", probed.fps, expectedFps, FPS_TOLERANCE),
      checkClose(
        "resultDurationSec",
        result.durationSec,
        expectedDurationSec,
        DURATION_TOLERANCE_SEC
      ),
      checkClose(
        "probedDurationSec",
        probed.durationSec,
        expectedDurationSec,
        DURATION_TOLERANCE_SEC
      ),
    ];

    const failed = checks.filter((c) => !c.ok);
    return {
      id: fixture.id,
      status: failed.length === 0 ? "pass" : "fail",
      reason:
        failed.length === 0
          ? undefined
          : failed
              .map(
                (c) =>
                  `${c.name}: got ${JSON.stringify(c.actual)}, expected ${JSON.stringify(c.expected)}`
              )
              .join("; "),
      checks,
      expected: {
        width: expectedWidth,
        height: expectedHeight,
        fps: expectedFps,
        durationSec: expectedDurationSec,
        videoCodec: EXPECTED_VIDEO_CODEC,
        audioCodec: EXPECTED_AUDIO_CODEC,
        pixFmt: EXPECTED_PIX_FMT,
        format: EXPECTED_FORMAT,
      },
      measured: {
        ...probed,
        sizeBytes,
        exportResult: {
          width: result.width,
          height: result.height,
          fps: result.fps,
          durationSec: result.durationSec,
          format: result.format,
        },
      },
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      id: fixture.id,
      status: "fail",
      reason: err instanceof Error ? err.message : String(err),
      checks: [],
      durationMs: Date.now() - startedAt,
    };
  }
}

export interface RunAcceptanceGateOptions {
  /** Pre-generated manifest, mainly for tests; defaults to regenerating the
   * corpus fresh (cheap: a few seconds, reproducible lavfi recipes). */
  manifest?: AcceptanceManifest;
  /** Defaults to a fresh temp dir (cleaned up after the run). */
  projectsRoot?: string;
}

export async function runAcceptanceGate(
  opts: RunAcceptanceGateOptions = {}
): Promise<AcceptanceGateReport> {
  const manifest = opts.manifest ?? (await generateAcceptanceCorpus());

  const ownsRoot = !opts.projectsRoot;
  const root =
    opts.projectsRoot ?? mkdtempSync(join(tmpdir(), "openklip-acceptance-"));
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_PROJECTS_ROOT = root;
  try {
    const results: GateFixtureResult[] = [];
    for (const fixture of manifest.fixtures) {
      // Sequential on purpose: bounded, predictable resource usage (each
      // fixture already spins up ffmpeg + Whisper) beats parallel fan-out
      // for a CI gate.
      const result = await runFixtureGate(fixture);
      results.push(result);
    }
    const ok = results.every((r) => r.status !== "fail");
    return { generatedAt: new Date().toISOString(), ok, results };
  } finally {
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    if (ownsRoot) {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

function printReport(report: AcceptanceGateReport): void {
  console.log("\nAcceptance gate report");
  for (const r of report.results) {
    const tag =
      r.status === "pass" ? "ok" : r.status === "skipped" ? "skip" : "FAIL";
    const detail = r.reason ? `: ${r.reason}` : "";
    console.log(`[${tag}] ${r.id} (${r.durationMs}ms)${detail}`);
  }
  console.log(
    report.ok ? "\nacceptance-gate: passed" : "\nacceptance-gate: FAILED"
  );
}

if (import.meta.main) {
  const asJson = process.argv.includes("--json");
  try {
    const report = await runAcceptanceGate();
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (err) {
    console.error(
      `error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
}
