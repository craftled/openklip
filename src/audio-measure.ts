import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { FFMPEG, run } from "./ffmpeg.ts";
import {
  analyzeLoudnormPass,
  type LoudnormMeasured,
} from "./loudnorm-two-pass.ts";
import { projectPaths } from "./paths.ts";

export type AudioMeasureSource = "export" | "proxy";

export interface AudioMeasureResult {
  integratedLufs: number;
  lra: number;
  path: string;
  source: AudioMeasureSource;
  targetLufs: number;
  truePeakDbtp: number;
}

async function extractAudioWav(
  mediaPath: string,
  outWav: string
): Promise<void> {
  await run(
    FFMPEG,
    ["-y", "-i", mediaPath, "-vn", "-ac", "1", "-ar", "48000", outWav],
    "ffmpeg(audio-measure)"
  );
}

/** Measure integrated loudness (LUFS) of a project's export or proxy (read-only). */
export async function measureProjectAudio(
  slug: string,
  opts?: { source?: AudioMeasureSource; targetLufs?: number }
): Promise<AudioMeasureResult> {
  const source = opts?.source ?? "export";
  const targetLufs = opts?.targetLufs ?? -16;
  const paths = projectPaths(slug);
  const mediaPath =
    source === "export"
      ? paths.out
      : existsSync(paths.proxy)
        ? paths.proxy
        : paths.out;
  const resolvedSource: AudioMeasureSource =
    mediaPath === paths.out && source === "proxy" && !existsSync(paths.proxy)
      ? "export"
      : source === "export" && !existsSync(paths.out) && existsSync(paths.proxy)
        ? "proxy"
        : source;

  if (!existsSync(mediaPath)) {
    throw new Error(
      resolvedSource === "export"
        ? "no export yet: run openklip export first, or pass --source proxy"
        : "no proxy.mp4 found: ingest the project first"
    );
  }

  const probeWav = join(paths.working, `.audio-measure-${process.pid}.wav`);
  await extractAudioWav(mediaPath, probeWav);
  let measured: LoudnormMeasured;
  try {
    measured = await analyzeLoudnormPass(probeWav, targetLufs);
  } finally {
    try {
      await unlink(probeWav);
    } catch {
      // best-effort cleanup
    }
  }

  return {
    source: resolvedSource,
    path: mediaPath,
    integratedLufs: Number.parseFloat(measured.input_i),
    truePeakDbtp: Number.parseFloat(measured.input_tp),
    lra: Number.parseFloat(measured.input_lra),
    targetLufs,
  };
}

/** Measure loudness of any local audio/video file (for tests and asset probes). */
export async function measureFileLoudness(
  filePath: string,
  targetLufs = -16
): Promise<Omit<AudioMeasureResult, "source" | "path">> {
  const measured = await analyzeLoudnormPass(filePath, targetLufs);
  return {
    integratedLufs: Number.parseFloat(measured.input_i),
    truePeakDbtp: Number.parseFloat(measured.input_tp),
    lra: Number.parseFloat(measured.input_lra),
    targetLufs,
  };
}
