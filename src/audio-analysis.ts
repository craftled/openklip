// Node IO for the audio-analysis engine: reads the ingest-time raw PCM
// (working/audio16k.f32, written by src/ingest.ts extractAudio) and maintains
// the derived-cache file working/audio-analysis.json, the same lifecycle as
// transcript.json (regenerates only when the source audio changes, i.e. on
// re-ingest). Pure math (analyzeSilences, snapBoundary, snapRanges,
// subtractDeadAir, and the shared types) lives in audio-analysis-core.ts;
// import it directly there for browser-safe/pure use. analyzeSilences is
// re-declared here as a thin delegate (rather than `export ... from`, which
// the barrel-file lint rule rejects) so callers of this IO module don't need
// a second import just to run the same analysis this module's cache uses.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  type AnalyzeSilencesOpts,
  type AudioAnalysis,
  analyzeSilences as analyzeSilencesPure,
  DEFAULT_MIN_SILENCE_MS,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_THRESHOLD_DB,
  DEFAULT_WINDOW_MS,
  type SilenceSpan,
} from "./audio-analysis-core.ts";
import { projectPaths } from "./paths.ts";

export type {
  AnalyzeSilencesOpts,
  AudioAnalysis,
  SilenceSpan,
} from "./audio-analysis-core.ts";

export function analyzeSilences(
  pcm: Float32Array,
  opts?: AnalyzeSilencesOpts
): SilenceSpan[] {
  return analyzeSilencesPure(pcm, opts);
}

// Validates the on-disk cache shape before trusting it (F13): a malformed but
// still-parseable JSON.parse result (e.g. truncated write, hand edit, schema
// drift from an older version) must not flow into snapRanges/deadAirCandidates
// and throw at request time. Mirrors the AudioAnalysis interface in
// audio-analysis-core.ts.
const AudioAnalysisSchema = z.object({
  version: z.literal(1),
  sampleRate: z.number(),
  windowMs: z.number(),
  thresholdDb: z.number(),
  minSilenceMs: z.number(),
  sourceMtimeMs: z.number(),
  silences: z.array(
    z.object({
      startSec: z.number().nonnegative(),
      endSec: z.number().nonnegative(),
    })
  ),
});

function audioAnalysisPath(slug: string): string {
  return join(projectPaths(slug).working, "audio-analysis.json");
}

// Deliberately path-free: this message reaches unauthenticated API responses
// (the peaks/silences routes), so it must never embed the project's absolute
// filesystem location. Exported so those routes can reuse the exact same
// copy instead of hand-rolling their own (and leaking the path) in their
// explicit "missing" checks.
export function missingAudioRawError(): Error {
  return new Error(
    "missing audio16k.f32: this project needs re-ingest (audio16k.f32 is written at ingest time by extractAudio)"
  );
}

// Read the ingest-time 16 kHz mono f32le PCM as a Float32Array view over the
// file bytes. Throws an actionable error if the project has not been
// (re-)ingested since audio16k.f32 was introduced.
export async function readPcm(slug: string): Promise<Float32Array> {
  const audioRaw = projectPaths(slug).audioRaw;
  if (!existsSync(audioRaw)) {
    throw missingAudioRawError();
  }
  const buf = await readFile(audioRaw);
  return new Float32Array(
    buf.buffer,
    buf.byteOffset,
    Math.floor(buf.byteLength / 4)
  );
}

// Read a time slice of the ingest-time mono f32le PCM without loading the
// whole file. Clamps fromSec/toSec to the available audio span the same way
// computePeakBuckets does before bucketing.
export async function readPcmRange(
  slug: string,
  fromSec: number,
  toSec: number,
  sampleRate = DEFAULT_SAMPLE_RATE
): Promise<Float32Array> {
  const audioRaw = projectPaths(slug).audioRaw;
  if (!existsSync(audioRaw)) {
    throw missingAudioRawError();
  }

  const fileStat = await stat(audioRaw);
  const totalSamples = Math.floor(fileStat.size / 4);
  const totalSec = totalSamples / sampleRate;
  const clampedFrom = Math.max(0, Math.min(fromSec, totalSec));
  const clampedTo = Math.max(clampedFrom, Math.min(toSec, totalSec));

  const startSample = Math.floor(clampedFrom * sampleRate);
  const endSample = Math.floor(clampedTo * sampleRate);
  const byteOffset = startSample * 4;
  const byteLength = (endSample - startSample) * 4;
  if (byteLength <= 0) {
    return new Float32Array(0);
  }

  const fh = await open(audioRaw, "r");
  try {
    const buf = Buffer.alloc(byteLength);
    const { bytesRead } = await fh.read(buf, 0, byteLength, byteOffset);
    return new Float32Array(
      buf.buffer,
      buf.byteOffset,
      Math.floor(bytesRead / 4)
    );
  } finally {
    await fh.close();
  }
}

export interface AudioAnalysisProgress {
  message: string;
  phase: "analyzing" | "reading" | "writing";
  step: number;
  total: number;
}

function resolveAnalysisOpts(opts: AnalyzeSilencesOpts = {}) {
  return {
    sampleRate: opts.sampleRate ?? DEFAULT_SAMPLE_RATE,
    windowMs: opts.windowMs ?? DEFAULT_WINDOW_MS,
    thresholdDb: opts.thresholdDb ?? DEFAULT_THRESHOLD_DB,
    minSilenceMs: opts.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS,
  };
}

// Return a fresh cached analysis when the on-disk cache is valid for the
// current audio source and requested options; null when a cold compute is
// needed. Throws missingAudioRawError when audio16k.f32 is absent.
export async function tryLoadCachedAudioAnalysis(
  slug: string,
  opts: AnalyzeSilencesOpts = {}
): Promise<AudioAnalysis | null> {
  const paths = projectPaths(slug);
  if (!existsSync(paths.audioRaw)) {
    throw missingAudioRawError();
  }
  const sourceMtimeMs = (await stat(paths.audioRaw)).mtimeMs;
  const cachePath = audioAnalysisPath(slug);
  const resolved = resolveAnalysisOpts(opts);

  if (!existsSync(cachePath)) {
    return null;
  }

  const cached = await tryReadCache(cachePath);
  if (
    cached &&
    cached.sourceMtimeMs === sourceMtimeMs &&
    cached.sampleRate === resolved.sampleRate &&
    cached.windowMs === resolved.windowMs &&
    cached.thresholdDb === resolved.thresholdDb &&
    cached.minSilenceMs === resolved.minSilenceMs
  ) {
    return cached;
  }
  return null;
}

// Cold path: read the full PCM, detect silences, and write the cache.
export async function computeAudioAnalysis(
  slug: string,
  opts: AnalyzeSilencesOpts = {},
  onProgress?: (p: AudioAnalysisProgress) => void
): Promise<AudioAnalysis> {
  const paths = projectPaths(slug);
  if (!existsSync(paths.audioRaw)) {
    throw missingAudioRawError();
  }
  const sourceMtimeMs = (await stat(paths.audioRaw)).mtimeMs;
  const cachePath = audioAnalysisPath(slug);
  const resolved = resolveAnalysisOpts(opts);

  onProgress?.({
    phase: "reading",
    message: "Reading audio PCM",
    step: 1,
    total: 3,
  });
  const pcm = await readPcm(slug);

  onProgress?.({
    phase: "analyzing",
    message: "Detecting silences",
    step: 2,
    total: 3,
  });
  const silences = analyzeSilences(pcm, resolved);

  const analysis: AudioAnalysis = {
    version: 1,
    ...resolved,
    sourceMtimeMs,
    silences,
  };

  onProgress?.({
    phase: "writing",
    message: "Writing cache",
    step: 3,
    total: 3,
  });
  await writeCache(paths.working, cachePath, analysis);
  return analysis;
}

// Load the cached silence analysis, recomputing when the cache is missing,
// corrupt, stale (its recorded sourceMtimeMs no longer matches audioRaw's
// current mtime), or was computed with different analysis options than this
// call requested (T4/F13: a cache written by a default-opts caller must not
// be silently handed back to a caller that asked for e.g. a different
// thresholdDb). Atomic tmp+rename write, matching src/chats.ts.
export async function loadAudioAnalysis(
  slug: string,
  opts: AnalyzeSilencesOpts = {}
): Promise<AudioAnalysis> {
  const cached = await tryLoadCachedAudioAnalysis(slug, opts);
  if (cached) {
    return cached;
  }
  return computeAudioAnalysis(slug, opts);
}

async function tryReadCache(cachePath: string): Promise<AudioAnalysis | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    // Corrupt or unreadable cache: caller falls through and recomputes.
    return null;
  }
  const result = AudioAnalysisSchema.safeParse(parsed);
  // A parseable-but-malformed cache (truncated write, hand edit, schema
  // drift) must recompute rather than flow bad shape into snapRanges /
  // deadAirCandidates and throw later at request time.
  return result.success ? (result.data as AudioAnalysis) : null;
}

async function writeCache(
  workingDir: string,
  cachePath: string,
  analysis: AudioAnalysis
): Promise<void> {
  await mkdir(workingDir, { recursive: true });
  // Atomic write: a crash mid-write leaves the previous cache (or none)
  // intact rather than a truncated file the next load would fail to parse.
  // randomUUID (not just pid): two concurrent loads for the same project
  // (e.g. an agent query racing the GUI's page load) share a pid and would
  // otherwise collide on the same tmp path.
  const tmp = `${cachePath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(tmp, JSON.stringify(analysis, null, 2));
  await rename(tmp, cachePath);
}
