// macOS Vision sidecar for saliency/face-based reframe focus (no LLM).
// Compiles tools/vision-focus.swift on first use; no-op on other platforms.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CropSuggestion } from "./auto-crop.ts";
import type { ExportAspect, Project, SceneSegment } from "./edl.ts";
import { run } from "./ffmpeg.ts";
import { repoPath } from "./repo-paths.ts";
import { frameTimeSec, listFrameSamples } from "./scene-log.ts";

export interface VisionFocusSample {
  confidence: number;
  focusX: number;
  focusY: number;
}

const SWIFT_SRC = repoPath("tools", "vision-focus.swift");
const BIN_NAME = "vision-focus";

function visionBinaryPath(): string {
  return join(repoPath("tools"), BIN_NAME);
}

export function visionFocusAvailable(): boolean {
  return process.platform === "darwin" && existsSync(SWIFT_SRC);
}

async function ensureVisionBinary(): Promise<string | null> {
  if (!visionFocusAvailable()) {
    return null;
  }
  const bin = visionBinaryPath();
  if (existsSync(bin)) {
    return bin;
  }
  try {
    await run("swiftc", [SWIFT_SRC, "-o", bin], "vision-focus-build");
    return existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

export function parseVisionFocusOutput(raw: string): VisionFocusSample | null {
  try {
    const obj = JSON.parse(raw.trim()) as Record<string, unknown>;
    if (obj.error) {
      return null;
    }
    const focusX = obj.focusX;
    const focusY = obj.focusY;
    const confidence = obj.confidence;
    if (
      typeof focusX !== "number" ||
      typeof focusY !== "number" ||
      !Number.isFinite(focusX) ||
      !Number.isFinite(focusY)
    ) {
      return null;
    }
    return {
      focusX: Math.min(1, Math.max(0, focusX)),
      focusY: Math.min(1, Math.max(0, focusY)),
      confidence:
        typeof confidence === "number" && Number.isFinite(confidence)
          ? confidence
          : 1,
    };
  } catch {
    return null;
  }
}

export function averageFocusSamples(
  samples: VisionFocusSample[]
): CropSuggestion | null {
  if (samples.length === 0) {
    return null;
  }
  let sumX = 0;
  let sumY = 0;
  let weight = 0;
  for (const s of samples) {
    const w = Math.max(0.01, s.confidence);
    sumX += s.focusX * w;
    sumY += s.focusY * w;
    weight += w;
  }
  return { focusX: sumX / weight, focusY: sumY / weight };
}

export async function detectFocusFromImage(
  imagePath: string
): Promise<VisionFocusSample | null> {
  const bin = await ensureVisionBinary();
  if (!bin) {
    return null;
  }
  try {
    const proc = Bun.spawn([bin, imagePath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    if (code !== 0) {
      return null;
    }
    return parseVisionFocusOutput(stdout);
  } catch {
    return null;
  }
}

/** Sample ingest frames and average face-center focus (darwin + frames only). */
export async function suggestCropFromVision(
  slug: string,
  project: Project,
  aspect: ExportAspect,
  maxFrames = 8
): Promise<CropSuggestion | null> {
  if (aspect === "source" || !visionFocusAvailable()) {
    return null;
  }
  const frames = listFrameSamples(slug, maxFrames);
  if (frames.length === 0) {
    return null;
  }
  const samples: VisionFocusSample[] = [];
  for (const frame of frames) {
    const hit = await detectFocusFromImage(frame.path);
    if (hit) {
      samples.push(hit);
    }
  }
  return averageFocusSamples(samples);
}

/** Pick frames whose timestamp falls inside a scene segment. */
function framesForSegment(
  slug: string,
  seg: SceneSegment,
  maxPerSegment: number
): Array<{ atSec: number; path: string }> {
  const all = listFrameSamples(slug, 64);
  const inside = all.filter(
    (f) => f.atSec >= seg.fromSec && f.atSec <= seg.toSec
  );
  if (inside.length === 0) {
    const mid = (seg.fromSec + seg.toSec) / 2;
    const nearest = all.reduce<{ atSec: number; path: string } | null>(
      (best, f) => {
        if (!best) {
          return f;
        }
        return Math.abs(f.atSec - mid) < Math.abs(best.atSec - mid) ? f : best;
      },
      null
    );
    return nearest ? [nearest] : [];
  }
  if (inside.length <= maxPerSegment) {
    return inside;
  }
  const stride = inside.length / maxPerSegment;
  const picked: Array<{ atSec: number; path: string }> = [];
  for (let i = 0; i < maxPerSegment; i += 1) {
    picked.push(inside[Math.floor(i * stride)]);
  }
  return picked;
}

/**
 * Write focusX/focusY onto speaker sceneLog segments from Vision face detection.
 * Returns how many segments were updated.
 */
export async function enrichSceneLogWithVisionFocus(
  slug: string,
  project: Project
): Promise<number> {
  if (!(project.sceneLog && visionFocusAvailable())) {
    return 0;
  }
  let updated = 0;
  for (const seg of project.sceneLog.segments) {
    if (seg.onScreen !== "speaker") {
      continue;
    }
    const frames = framesForSegment(slug, seg, 4);
    const samples: VisionFocusSample[] = [];
    for (const frame of frames) {
      const hit = await detectFocusFromImage(frame.path);
      if (hit) {
        samples.push(hit);
      }
    }
    const avg = averageFocusSamples(samples);
    if (!avg) {
      continue;
    }
    seg.focusX = avg.focusX;
    seg.focusY = avg.focusY;
    updated += 1;
  }
  return updated;
}

export { frameTimeSec };
