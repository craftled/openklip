import { FFMPEG } from "./ffmpeg.ts";

export interface LoudnormMeasured {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** Parse the JSON object ffmpeg loudnorm prints to stderr on pass 1. */
export function parseLoudnormJson(stderr: string): LoudnormMeasured {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("loudnorm analysis did not emit JSON on stderr");
  }
  const parsed = JSON.parse(stderr.slice(start, end + 1)) as Record<
    string,
    unknown
  >;
  const pick = (key: keyof LoudnormMeasured) => {
    const value = parsed[key];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(`loudnorm JSON missing ${key}`);
    }
    return String(value);
  };
  return {
    input_i: pick("input_i"),
    input_tp: pick("input_tp"),
    input_lra: pick("input_lra"),
    input_thresh: pick("input_thresh"),
    target_offset: pick("target_offset"),
  };
}

/** ffmpeg loudnorm filter for pass 2 using measured values from pass 1. */
export function buildTwoPassLoudnormFilter(input: {
  inputLabel: string;
  measured: LoudnormMeasured;
  outputLabel: string;
  sampleRate: number;
  targetLufs: number;
}): string {
  const { measured, targetLufs, inputLabel, outputLabel, sampleRate } = input;
  return (
    `[${inputLabel}]loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:` +
    `measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:` +
    `measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:` +
    `offset=${measured.target_offset}:linear=true:` +
    `aformat=sample_rates=${sampleRate}[${outputLabel}]`
  );
}

/** Run pass-1 loudnorm analysis on a mixed audio file. */
export async function analyzeLoudnormPass(
  audioPath: string,
  targetLufs: number
): Promise<LoudnormMeasured> {
  const proc = Bun.spawn(
    [
      FFMPEG,
      "-hide_banner",
      "-nostats",
      "-i",
      audioPath,
      "-af",
      `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { stdout: "pipe", stderr: "pipe" }
  );
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(
      `loudnorm analysis failed (exit ${code}):\n${stderr.slice(-1200)}`
    );
  }
  return parseLoudnormJson(stderr);
}
