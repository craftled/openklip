import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { type Project, ProjectSchema, SAMPLE_RATE, type Word } from "./edl.ts";
import { FFMPEG, probe, run } from "./ffmpeg.ts";
import { assertProjectCanBeIngested } from "./ingest-guard.ts";
import type { IngestPhase, IngestProgress } from "./ingest-types.ts";
import { projectPaths, slugFromVideo } from "./paths.ts";
import { cwdPath } from "./repo-paths.ts";
import { defaultTemplateId } from "./templates.ts";

export type { IngestPhase, IngestProgress } from "./ingest-types.ts";

interface RawChunk {
  end: number | null;
  start: number | null;
  text: string;
}

// ── Shared ingest core (reused by single-source ingest AND multi-take ingest) ─
// The same probe → all-intra 720p proxy → 16k mono PCM → Whisper pipeline backs
// both src/ingest.ts (one project source) and src/assembly.ts (one take). Kept
// here so the ffmpeg argv and the chunk→word mapping live in exactly one place
// and the two paths cannot drift.

/** Build the all-intra 720p proxy + 48k stereo AAC at `outProxy`. */
export function buildProxy(source: string, outProxy: string): Promise<void> {
  return run(
    FFMPEG,
    [
      "-y",
      "-i",
      source,
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
      outProxy,
    ],
    "ffmpeg(proxy)"
  );
}

/** Extract 16k mono f32 PCM to `outAudio` for Whisper. */
export function extractAudio(source: string, outAudio: string): Promise<void> {
  return run(
    FFMPEG,
    [
      "-y",
      "-i",
      source,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "f32le",
      outAudio,
    ],
    "ffmpeg(audio)"
  );
}

/** Map Whisper chunks into the canonical Word list (one shared mapping). */
export function wordsFromRawChunks(raw: RawChunk[]): Word[] {
  const words: Word[] = [];
  let prevEnd = 0;
  raw.forEach((c, i) => {
    const startSec = c.start ?? prevEnd;
    const endSec = c.end ?? startSec + 0.2;
    prevEnd = endSec;
    words.push({
      id: `w${i}`,
      text: c.text,
      startSample: Math.max(0, Math.round(startSec * SAMPLE_RATE)),
      endSample: Math.max(0, Math.round(endSec * SAMPLE_RATE)),
      deleted: false,
    });
  });
  return words;
}

// Run the Whisper transcriber on a 16k PCM file and return the canonical words.
// `rawJson` is the scratch path the node side writes its chunk JSON to.
export async function transcribeToWords(
  audioRaw: string,
  rawJson: string
): Promise<Word[]> {
  const proc = Bun.spawn(
    ["node", resolve(import.meta.dir, "transcribe.mjs"), audioRaw, rawJson],
    { stdout: "inherit", stderr: "inherit" }
  );
  if ((await proc.exited) !== 0) {
    throw new Error("transcription step failed");
  }
  const raw = (
    JSON.parse(await Bun.file(rawJson).text()) as { chunks: RawChunk[] }
  ).chunks;
  return wordsFromRawChunks(raw);
}

// The ordered work phases, so progress is a stable step/total the UI can show.
const INGEST_STEPS: Array<{ message: string; phase: IngestPhase }> = [
  { phase: "probe", message: "Reading video" },
  { phase: "proxy", message: "Building 720p preview" },
  { phase: "audio", message: "Extracting audio" },
  { phase: "frames", message: "Extracting frames" },
  { phase: "transcribe", message: "Transcribing" },
  { phase: "finalize", message: "Finishing" },
];

export async function ingest(
  videoArg: string,
  opts?: { force?: boolean; onProgress?: (p: IngestProgress) => void }
): Promise<string> {
  const total = INGEST_STEPS.length;
  const emit = (phase: IngestPhase) => {
    if (!opts?.onProgress) {
      return;
    }
    const i = INGEST_STEPS.findIndex((s) => s.phase === phase);
    if (i >= 0) {
      opts.onProgress({
        phase,
        message: INGEST_STEPS[i].message,
        step: i + 1,
        total,
      });
    }
  };
  const source = isAbsolute(videoArg) ? videoArg : cwdPath(videoArg);
  if (!existsSync(source)) {
    throw new Error(`video not found: ${source}`);
  }

  const slug = slugFromVideo(source);
  const p = projectPaths(slug);
  // Re-ingesting a slug wipes the whole project dir. Refuse unless the caller
  // explicitly opts in with --force, so an accidental re-upload can't destroy
  // an existing edit.
  assertProjectCanBeIngested(slug, opts?.force);
  await rm(p.dir, { recursive: true, force: true });
  await mkdir(p.assets, { recursive: true });
  await mkdir(p.frames, { recursive: true });
  await mkdir(p.output, { recursive: true });

  console.log(`[ingest] ${source}`);
  emit("probe");
  const meta = await probe(source);
  console.log(
    `[ingest] ${meta.width}x${meta.height} ${meta.fps}fps ${meta.durationSec.toFixed(1)}s`
  );

  emit("proxy");
  console.log(
    "[ingest] building all-intra 720p proxy (fast seeks) + 48k audio..."
  );
  await buildProxy(source, p.proxy);

  emit("audio");
  console.log("[ingest] extracting 16k mono PCM for transcription...");
  await extractAudio(source, p.audioRaw);

  emit("frames");
  console.log(
    "[ingest] extracting sample frames (for the agent layer later)..."
  );
  await run(
    FFMPEG,
    [
      "-y",
      "-i",
      p.proxy,
      "-vf",
      "fps=1/3",
      "-q:v",
      "4",
      `${p.frames}/%04d.jpg`,
    ],
    "ffmpeg(frames)"
  ).catch((e: Error) =>
    console.warn(`[ingest]   frames skipped: ${e.message}`)
  );

  emit("transcribe");
  console.log(
    "[ingest] transcribing (first run downloads the Whisper model)..."
  );
  const words = await transcribeToWords(
    p.audioRaw,
    `${p.working}/transcript.raw.json`
  );

  emit("finalize");
  const project: Project = ProjectSchema.parse({
    version: 1,
    slug,
    source,
    proxy: "working/proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: meta.fps,
    width: meta.width,
    height: meta.height,
    durationSamples: Math.round(meta.durationSec * SAMPLE_RATE),
    padMs: 50,
    template: defaultTemplateId(),
    captions: { enabled: true, maxWords: 6 },
    words,
  });

  await Bun.write(p.project, JSON.stringify(project, null, 2));
  await Bun.write(p.transcript, JSON.stringify({ words }, null, 2));

  emit("done");
  console.log(`[ingest] done: ${words.length} words`);
  console.log(`[ingest] project -> ${p.dir}`);
  console.log(`\nNext:  bun run serve ${slug}`);
  return slug;
}
