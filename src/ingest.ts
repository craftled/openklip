import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { ProjectSchema, SAMPLE_RATE, type Project, type Word } from "./edl.ts";
import { FFMPEG, probe, run } from "./ffmpeg.ts";
import { projectPaths, slugFromVideo } from "./paths.ts";

interface RawChunk {
  text: string;
  start: number | null;
  end: number | null;
}

export async function ingest(videoArg: string): Promise<string> {
  const source = isAbsolute(videoArg) ? videoArg : resolve(process.cwd(), videoArg);
  if (!existsSync(source)) throw new Error(`video not found: ${source}`);

  const slug = slugFromVideo(source);
  const p = projectPaths(slug);
  await rm(p.dir, { recursive: true, force: true });
  await mkdir(p.frames, { recursive: true });

  console.log(`[ingest] ${source}`);
  const meta = await probe(source);
  console.log(`[ingest] ${meta.width}x${meta.height} ${meta.fps}fps ${meta.durationSec.toFixed(1)}s`);

  console.log("[ingest] building all-intra 720p proxy (fast seeks) + 48k audio...");
  await run(
    FFMPEG,
    [
      "-y", "-i", source,
      "-vf", "scale=-2:720",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
      "-g", "1", "-keyint_min", "1", "-sc_threshold", "0",
      "-c:a", "aac", "-ar", String(SAMPLE_RATE), "-ac", "2",
      "-movflags", "+faststart",
      p.proxy,
    ],
    "ffmpeg(proxy)",
  );

  console.log("[ingest] extracting 16k mono PCM for transcription...");
  await run(
    FFMPEG,
    ["-y", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", p.audioRaw],
    "ffmpeg(audio)",
  );

  console.log("[ingest] extracting sample frames (for the agent layer later)...");
  await run(FFMPEG, ["-y", "-i", p.proxy, "-vf", "fps=1/3", "-q:v", "4", `${p.frames}/%04d.jpg`], "ffmpeg(frames)").catch(
    (e: Error) => console.warn(`[ingest]   frames skipped: ${e.message}`),
  );

  console.log("[ingest] transcribing (first run downloads the Whisper model)...");
  const rawJson = `${p.dir}/transcript.raw.json`;
  const proc = Bun.spawn(["node", resolve(import.meta.dir, "transcribe.mjs"), p.audioRaw, rawJson], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0) throw new Error("transcription step failed");

  const raw = (JSON.parse(await Bun.file(rawJson).text()) as { chunks: RawChunk[] }).chunks;
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

  const project: Project = ProjectSchema.parse({
    version: 1,
    slug,
    source,
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: meta.fps,
    width: meta.width,
    height: meta.height,
    durationSamples: Math.round(meta.durationSec * SAMPLE_RATE),
    padMs: 50,
    words,
  } satisfies Project);

  await Bun.write(p.project, JSON.stringify(project, null, 2));
  await Bun.write(p.transcript, JSON.stringify({ words }, null, 2));

  console.log(`[ingest] done: ${words.length} words`);
  console.log(`[ingest] project -> ${p.dir}`);
  console.log(`\nNext:  bun run dev ${slug}`);
  return slug;
}
