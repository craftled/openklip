import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  DEFAULT_SAMPLE_RATE,
  DEFAULT_THRESHOLD_DB,
  DEFAULT_WINDOW_MS,
  windowDb,
} from "./audio-analysis-core.ts";
import { SAMPLE_RATE } from "./edl.ts";
import { FFMPEG, run } from "./ffmpeg.ts";
import { projectPaths } from "./paths.ts";

export interface ActivityCam {
  id: string;
  role: "speaker" | "wide";
  offsetMs: number;
  audioPath: string;
}

export interface CamActivity {
  camId: string;
  windowMs: number;
  db: number[];
}

export interface SpeakingSpan {
  camId: string;
  fromSample: number;
  toSample: number;
}

export interface SpeakerAttribution {
  wordId: string;
  camId: string | null;
}

const SILENCE_FLOOR_DB = -100;

const CamActivityCacheSchema = z.object({
  version: z.literal(1),
  camId: z.string(),
  windowMs: z.number(),
  sampleRate: z.number(),
  sourceMtimeMs: z.number(),
  db: z.array(z.number()),
});

type CamActivityCache = z.infer<typeof CamActivityCacheSchema>;

export function computeActivityFromPcm(
  pcm: Float32Array,
  opts?: { windowMs?: number }
): number[] {
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS;
  const windowSamples = Math.max(
    1,
    Math.round((DEFAULT_SAMPLE_RATE * windowMs) / 1000)
  );
  const totalWindows = Math.ceil(pcm.length / windowSamples);
  const db: number[] = [];
  for (let w = 0; w < totalWindows; w++) {
    const start = w * windowSamples;
    const end = Math.min(start + windowSamples, pcm.length);
    db.push(windowDb(pcm, start, end));
  }
  return db;
}

function activityCachePath(audioPath: string): string {
  return join(dirname(audioPath), "activity.json");
}

function resolveAudioPath(slug: string, audioPath: string): string {
  return audioPath.startsWith("/") ? audioPath : join(projectPaths(slug).dir, audioPath);
}

async function readPcmFile(audioPath: string): Promise<Float32Array> {
  if (!existsSync(audioPath)) {
    throw new Error(`missing cam PCM: ${audioPath}`);
  }
  const buf = await readFile(audioPath);
  return new Float32Array(
    buf.buffer,
    buf.byteOffset,
    Math.floor(buf.byteLength / 4)
  );
}

async function writeActivityCache(
  cachePath: string,
  cache: CamActivityCache
): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  const tmp = `${cachePath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(tmp, JSON.stringify(cache, null, 2));
  await rename(tmp, cachePath);
}

async function tryReadActivityCache(
  cachePath: string
): Promise<CamActivityCache | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    return null;
  }
  const result = CamActivityCacheSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export async function loadCamActivity(
  slug: string,
  cam: ActivityCam
): Promise<CamActivity> {
  const audioPath = resolveAudioPath(slug, cam.audioPath);
  const sourceMtimeMs = (await stat(audioPath)).mtimeMs;
  const windowMs = DEFAULT_WINDOW_MS;
  const cachePath = activityCachePath(audioPath);

  if (existsSync(cachePath)) {
    const cached = await tryReadActivityCache(cachePath);
    if (
      cached &&
      cached.camId === cam.id &&
      cached.sourceMtimeMs === sourceMtimeMs &&
      cached.windowMs === windowMs &&
      cached.sampleRate === DEFAULT_SAMPLE_RATE
    ) {
      return {
        camId: cached.camId,
        windowMs: cached.windowMs,
        db: cached.db,
      };
    }
  }

  const pcm = await readPcmFile(audioPath);
  const db = computeActivityFromPcm(pcm, { windowMs });
  const cache: CamActivityCache = {
    version: 1,
    camId: cam.id,
    windowMs,
    sampleRate: DEFAULT_SAMPLE_RATE,
    sourceMtimeMs,
    db,
  };
  await writeActivityCache(cachePath, cache);
  return { camId: cam.id, windowMs, db };
}

function projectSecToCamLocalSec(projectSec: number, offsetMs: number): number {
  return projectSec - offsetMs / 1000;
}

function camLocalSecToProjectSample(camLocalSec: number, offsetMs: number): number {
  return Math.round((camLocalSec + offsetMs / 1000) * SAMPLE_RATE);
}

export function dbAt(
  activity: CamActivity,
  cam: ActivityCam,
  projectSec: number
): number {
  const camLocalSec = projectSecToCamLocalSec(projectSec, cam.offsetMs);
  if (camLocalSec < 0) {
    return Number.NEGATIVE_INFINITY;
  }
  const windowSec = activity.windowMs / 1000;
  const index = Math.floor(camLocalSec / windowSec);
  if (index < 0 || index >= activity.db.length) {
    return Number.NEGATIVE_INFINITY;
  }
  return activity.db[index] ?? Number.NEGATIVE_INFINITY;
}

function meanDbOverCamLocalRange(
  activity: CamActivity,
  camLocalFromSec: number,
  camLocalToSec: number
): number {
  if (camLocalToSec <= camLocalFromSec) {
    return Number.NEGATIVE_INFINITY;
  }
  const windowSec = activity.windowMs / 1000;
  const startWindow = Math.max(0, Math.floor(camLocalFromSec / windowSec));
  const endWindow = Math.min(
    activity.db.length,
    Math.ceil(camLocalToSec / windowSec)
  );
  if (startWindow >= endWindow) {
    return Number.NEGATIVE_INFINITY;
  }
  let sumPower = 0;
  let weightSec = 0;
  for (let w = startWindow; w < endWindow; w++) {
    const winStart = w * windowSec;
    const winEnd = (w + 1) * windowSec;
    const overlapStart = Math.max(camLocalFromSec, winStart);
    const overlapEnd = Math.min(camLocalToSec, winEnd);
    const overlapSec = overlapEnd - overlapStart;
    if (overlapSec > 0) {
      const db = activity.db[w] ?? SILENCE_FLOOR_DB;
      sumPower += 10 ** (db / 10) * overlapSec;
      weightSec += overlapSec;
    }
  }
  if (weightSec <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  const meanPower = sumPower / weightSec;
  return meanPower > 0 ? 10 * Math.log10(meanPower) : SILENCE_FLOOR_DB;
}

interface ActiveRun {
  startWindow: number;
  endWindowExclusive: number;
}

function activeRuns(
  activity: CamActivity,
  thresholdDb: number
): ActiveRun[] {
  const runs: ActiveRun[] = [];
  let runStart = -1;
  for (let w = 0; w < activity.db.length; w++) {
    const active = (activity.db[w] ?? SILENCE_FLOOR_DB) >= thresholdDb;
    if (active) {
      if (runStart === -1) {
        runStart = w;
      }
    } else if (runStart !== -1) {
      runs.push({ startWindow: runStart, endWindowExclusive: w });
      runStart = -1;
    }
  }
  if (runStart !== -1) {
    runs.push({
      startWindow: runStart,
      endWindowExclusive: activity.db.length,
    });
  }
  return runs;
}

function runToProjectSpan(
  run: ActiveRun,
  activity: CamActivity,
  offsetMs: number
): SpeakingSpan {
  const windowSec = activity.windowMs / 1000;
  const camLocalFromSec = run.startWindow * windowSec;
  const camLocalToSec = run.endWindowExclusive * windowSec;
  return {
    camId: activity.camId,
    fromSample: camLocalSecToProjectSample(camLocalFromSec, offsetMs),
    toSample: camLocalSecToProjectSample(camLocalToSec, offsetMs),
  };
}

function spanDurationMs(span: SpeakingSpan): number {
  return ((span.toSample - span.fromSample) / SAMPLE_RATE) * 1000;
}

function mergeSpansForCam(
  spans: SpeakingSpan[],
  mergeGapMs: number
): SpeakingSpan[] {
  if (spans.length === 0) {
    return [];
  }
  const sorted = [...spans].sort((a, b) => a.fromSample - b.fromSample);
  const merged: SpeakingSpan[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged.at(-1)!;
    const cur = sorted[i]!;
    const gapMs = ((cur.fromSample - prev.toSample) / SAMPLE_RATE) * 1000;
    if (gapMs <= mergeGapMs) {
      prev.toSample = Math.max(prev.toSample, cur.toSample);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

export function speakingSpans(
  activities: CamActivity[],
  cams: ActivityCam[],
  opts?: {
    thresholdDb?: number;
    minSpanMs?: number;
    mergeGapMs?: number;
  }
): SpeakingSpan[] {
  const thresholdDb = opts?.thresholdDb ?? DEFAULT_THRESHOLD_DB;
  const minSpanMs = opts?.minSpanMs ?? 300;
  const mergeGapMs = opts?.mergeGapMs ?? 200;
  const camById = new Map(cams.map((c) => [c.id, c]));
  const allSpans: SpeakingSpan[] = [];

  for (const activity of activities) {
    const cam = camById.get(activity.camId);
    if (!cam || cam.role !== "speaker") {
      continue;
    }
    const runs = activeRuns(activity, thresholdDb);
    const spans = runs
      .map((run) => runToProjectSpan(run, activity, cam.offsetMs))
      .filter((span) => spanDurationMs(span) >= minSpanMs);
    allSpans.push(...mergeSpansForCam(spans, mergeGapMs));
  }

  return allSpans.sort((a, b) => a.fromSample - b.fromSample);
}

export function attributeWords(
  words: Array<{ id: string; startSample: number; endSample: number }>,
  activities: CamActivity[],
  cams: ActivityCam[],
  opts?: { thresholdDb?: number }
): SpeakerAttribution[] {
  const thresholdDb = opts?.thresholdDb ?? DEFAULT_THRESHOLD_DB;
  const camById = new Map(cams.map((c) => [c.id, c]));

  return words.map((word) => {
    const projectFromSec = word.startSample / SAMPLE_RATE;
    const projectToSec = word.endSample / SAMPLE_RATE;
    let bestCamId: string | null = null;
    let bestDb = Number.NEGATIVE_INFINITY;

    for (const activity of activities) {
      const cam = camById.get(activity.camId);
      if (!cam || cam.role !== "speaker") {
        continue;
      }
      const camLocalFrom = projectSecToCamLocalSec(projectFromSec, cam.offsetMs);
      const camLocalTo = projectSecToCamLocalSec(projectToSec, cam.offsetMs);
      const meanDb = meanDbOverCamLocalRange(activity, camLocalFrom, camLocalTo);
      if (meanDb >= thresholdDb && meanDb > bestDb) {
        bestDb = meanDb;
        bestCamId = cam.id;
      }
    }

    return { wordId: word.id, camId: bestCamId };
  });
}

export function programAudioArgs(
  cams: ActivityCam[],
  opts: { out: string; masterMix?: string }
): string[] {
  if (opts.masterMix) {
    return [
      FFMPEG,
      "-y",
      "-i",
      opts.masterMix,
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      opts.out,
    ];
  }

  const speakers = cams.filter((c) => c.role === "speaker");
  const inputArgs: string[] = [];
  const filterParts: string[] = [];

  speakers.forEach((cam, i) => {
    // Ingested cam audio is headerless 16k mono f32le PCM; ffmpeg needs the
    // format declared before the input. Other containers probe normally.
    if (cam.audioPath.endsWith(".f32")) {
      inputArgs.push("-f", "f32le", "-ar", "16000", "-ac", "1");
    }
    inputArgs.push("-i", cam.audioPath);
    const offsetMs = Math.round(cam.offsetMs);
    // Positive offset: cam starts after project t0 — delay its audio.
    // Negative offset: cam started early — trim the lead-in instead.
    const align =
      offsetMs >= 0
        ? `adelay=${offsetMs}:all=1`
        : `atrim=start=${(-offsetMs / 1000).toFixed(3)},asetpts=PTS-STARTPTS`;
    filterParts.push(`[${i}:a]aresample=48000,${align}[pa${i}]`);
  });

  if (speakers.length === 0) {
    return [
      FFMPEG,
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-t",
      "0.1",
      "-c:a",
      "pcm_s16le",
      opts.out,
    ];
  }

  const mixLabels = speakers.map((_, i) => `[pa${i}]`).join("");
  filterParts.push(
    `${mixLabels}amix=inputs=${speakers.length}:duration=longest:normalize=0[pmix]`
  );
  filterParts.push(
    "[pmix]loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo[aout]"
  );

  return [
    FFMPEG,
    "-y",
    ...inputArgs,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[aout]",
    "-c:a",
    "pcm_s16le",
    opts.out,
  ];
}

export async function buildProgramAudio(
  slug: string,
  cams: ActivityCam[],
  opts?: { masterMix?: string }
): Promise<{ wav: string; pcm16k: string }> {
  const paths = projectPaths(slug);
  await mkdir(paths.working, { recursive: true });
  const wav = join(paths.working, "program-audio.wav");
  const pcm16k = join(paths.working, "program-audio16k.f32");

  const resolvedCams = cams.map((c) => ({
    ...c,
    audioPath: resolveAudioPath(slug, c.audioPath),
  }));

  const mixArgs = programAudioArgs(resolvedCams, {
    out: wav,
    masterMix: opts?.masterMix
      ? resolveAudioPath(slug, opts.masterMix)
      : undefined,
  });
  await run(mixArgs[0]!, mixArgs.slice(1), "ffmpeg(program-audio)");

  await run(
    FFMPEG,
    [
      "-y",
      "-i",
      wav,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "f32le",
      pcm16k,
    ],
    "ffmpeg(program-audio16k)"
  );

  return { wav, pcm16k };
}