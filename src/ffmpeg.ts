import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export const FFMPEG = (ffmpegStatic as unknown as string) ?? "ffmpeg";
export const FFPROBE = (ffprobeStatic as { path: string }).path ?? "ffprobe";

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
  const json = JSON.parse(out) as {
    streams?: Array<Record<string, unknown>>;
    format?: { duration?: string };
  };
  const v = (json.streams ?? []).find((s) => s.codec_type === "video");
  const durationSec = Number(
    json.format?.duration ?? (v?.duration as string) ?? 0
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
