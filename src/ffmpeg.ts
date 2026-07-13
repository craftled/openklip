import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);

function optionalRequire<T>(id: string): T | null {
  try {
    return require(id) as T;
  } catch {
    return null;
  }
}

function localBinary(...parts: string[]): string | null {
  const fp = join(process.cwd(), "node_modules", ...parts);
  return existsSync(fp) ? fp : null;
}

export const FFMPEG =
  optionalRequire<string>("ffmpeg-static") ??
  process.env.FFMPEG ??
  localBinary("ffmpeg-static", "ffmpeg") ??
  "ffmpeg";
function executableOnHost(bin: string): boolean {
  if (bin.includes("/") && !existsSync(bin)) {
    return false;
  }
  try {
    const proc = Bun.spawnSync([bin, "-version"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

function resolveFfprobe(): string {
  const candidates = [
    process.env.FFPROBE,
    optionalRequire<{ path?: string }>("ffprobe-static")?.path,
    localBinary(
      "ffprobe-static",
      "bin",
      process.platform,
      process.arch,
      "ffprobe"
    ),
    "/opt/homebrew/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "ffprobe",
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    if (executableOnHost(candidate)) {
      return candidate;
    }
  }
  return "ffprobe";
}

export const FFPROBE = resolveFfprobe();

export async function run(
  bin: string,
  args: string[],
  label = "ffmpeg"
): Promise<void> {
  const proc = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`${label} failed (exit ${code}):\n${err.slice(-1800)}`);
  }
}

export interface ProbeResult {
  durationSec: number;
  fps: number;
  height: number;
  width: number;
}

function parseProbeJson(out: string): {
  streams?: Array<Record<string, unknown>>;
  format?: { duration?: string };
} {
  return JSON.parse(out) as {
    streams?: Array<Record<string, unknown>>;
    format?: { duration?: string };
  };
}

export async function probe(file: string): Promise<ProbeResult> {
  const proc = Bun.spawn(
    [
      FFPROBE,
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      file,
    ],
    { stdout: "pipe", stderr: "pipe" }
  );
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  const json = parseProbeJson(out);
  const v = (json.streams ?? []).find((s) => s.codec_type === "video");
  const a = (json.streams ?? []).find((s) => s.codec_type === "audio");
  const durationSec = Number(
    json.format?.duration ??
      (v?.duration as string) ??
      (a?.duration as string) ??
      0
  );
  let fps = 30;
  const rate = v?.r_frame_rate;
  if (typeof rate === "string" && rate.includes("/")) {
    const [n, d] = rate.split("/").map(Number);
    if (n && d) {
      fps = n / d;
    }
  }
  return {
    durationSec,
    fps: Math.round(fps * 1000) / 1000,
    width: Number(v?.width ?? 1920),
    height: Number(v?.height ?? 1080),
  };
}

/** Duration-only probe for audio files (no video stream required). */
export async function probeAudio(
  file: string
): Promise<{ durationSec: number }> {
  const proc = Bun.spawn(
    [FFPROBE, "-v", "quiet", "-print_format", "json", "-show_format", file],
    { stdout: "pipe", stderr: "pipe" }
  );
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  const json = parseProbeJson(out);
  return { durationSec: Number(json.format?.duration ?? 0) };
}
