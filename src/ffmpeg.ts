import { chmodSync, existsSync } from "node:fs";
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

/**
 * npm/bun unpack sometimes drops the execute bit on optional binary packages
 * (seen on Linux CI with @ffprobe-installer/*). Best-effort chmod so the first
 * spawn does not fail with EACCES.
 */
export function ensureExecutableBinary(binPath: string): void {
  if (!(binPath.includes("node_modules") || binPath.startsWith("/"))) {
    return;
  }
  if (!existsSync(binPath)) {
    return;
  }
  try {
    chmodSync(binPath, 0o755);
  } catch {
    // Non-fatal: spawn will fall through to system candidates.
  }
}

function resolveBundledFfprobe(): string | null {
  const fromPkg =
    optionalRequire<{ path?: string }>("@ffprobe-installer/ffprobe")?.path ??
    null;
  const fromLocal = localBinary(
    "@ffprobe-installer",
    `${process.platform}-${process.arch}`,
    "ffprobe"
  );
  const path = fromPkg ?? fromLocal;
  if (path) {
    ensureExecutableBinary(path);
  }
  return path;
}

export const FFMPEG =
  optionalRequire<string>("ffmpeg-static") ??
  process.env.FFMPEG ??
  localBinary("ffmpeg-static", "ffmpeg") ??
  "ffmpeg";

// Platform-specific installer (CRAFT-6173): only the current OS/arch binary is
// installed (~17MB) instead of multi-platform ffprobe-static (~345MB). Resolves
// through createRequire so Turbopack does not hash the package path. On Apple
// Silicon, if the published binary is still the wrong arch, spawnFfprobe falls
// back to a system ffprobe on PATH.
export const FFPROBE =
  resolveBundledFfprobe() ?? process.env.FFPROBE ?? "ffprobe";

const SYSTEM_FFPROBE_CANDIDATES = [
  "/opt/homebrew/bin/ffprobe",
  "/usr/local/bin/ffprobe",
  "ffprobe",
] as const;

export function isFfprobeArchMismatchError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: string; errno?: number };
  return record.code === "EBADARCH" || record.errno === -86;
}

export function isFfprobePermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: string; errno?: number };
  return record.code === "EACCES" || record.errno === -13;
}

function shouldTryNextFfprobe(error: unknown): boolean {
  return isFfprobeArchMismatchError(error) || isFfprobePermissionError(error);
}

function ffprobeSpawnCandidates(): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const candidate of [FFPROBE, ...SYSTEM_FFPROBE_CANDIDATES]) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    candidates.push(candidate);
  }
  return candidates;
}

function spawnFfprobe(args: string[]) {
  const candidates = ffprobeSpawnCandidates();
  let lastError: unknown;
  for (const bin of candidates) {
    try {
      if (bin.includes("node_modules") || bin.startsWith("/")) {
        ensureExecutableBinary(bin);
      }
      return Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe" });
    } catch (error) {
      lastError = error;
      if (!shouldTryNextFfprobe(error)) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "ffprobe spawn failed"));
}

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

export async function ffprobeJson(
  args: string[],
  label = "ffprobe"
): Promise<ReturnType<typeof parseProbeJson>> {
  const proc = spawnFfprobe(args);
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `${label} failed (exit ${code}):\n${err.slice(-1800) || out.slice(-1800)}`
    );
  }
  return parseProbeJson(out);
}

export async function probe(file: string): Promise<ProbeResult> {
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
    "ffprobe"
  );
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
  const json = await ffprobeJson(
    ["-v", "quiet", "-print_format", "json", "-show_format", file],
    "ffprobe(audio)"
  );
  return { durationSec: Number(json.format?.duration ?? 0) };
}
