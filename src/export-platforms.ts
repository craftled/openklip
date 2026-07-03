// Export platform presets: named per-destination bundles of export
// defaults (compression, fps, height, loudness target). A preset supplies
// DEFAULTS only: any explicitly passed individual option wins over the
// preset's value, so `--platform youtube --fps 24` exports at 24fps. A
// preset's `targetLufs` applies single-pass loudness normalization for
// that export invocation regardless of the project's saved
// audio.loudness settings, and never mutates the project.
//
import type { ExportAspect } from "./edl.ts";
import type { ExportCompression } from "./exporter.ts";

export const EXPORT_PLATFORM_IDS = [
  "youtube",
  "youtube-4k",
  "x",
  "linkedin",
  "shorts",
] as const;

export type ExportPlatformId = (typeof EXPORT_PLATFORM_IDS)[number];

export interface ExportPlatformDef {
  /** Output aspect default; undefined keeps the project's saved aspect. */
  aspect?: ExportAspect;
  /** Compression preset default (existing EXPORT_COMPRESSIONS id). */
  compression: ExportCompression;
  /** Output fps default; undefined keeps the source frame rate. */
  fps?: number;
  id: ExportPlatformId;
  /** Human label for pickers. */
  label: string;
  /** Output height ceiling default. */
  maxHeight: number;
  /** One-line description for pickers and CLI help. */
  summary: string;
  /**
   * Loudness normalization target for this destination, applied for the
   * export invocation only (overrides project audio.loudness). Undefined
   * leaves the project's saved loudness behavior untouched.
   */
  targetLufs?: number;
}

const PLATFORMS: readonly ExportPlatformDef[] = [
  {
    id: "youtube",
    label: "YouTube 1080p",
    summary: "1080p, source fps, social compression, -14 LUFS.",
    compression: "social",
    maxHeight: 1080,
    targetLufs: -14,
  },
  {
    id: "youtube-4k",
    label: "YouTube 4K",
    summary: "2160p, source fps, studio compression, -14 LUFS.",
    compression: "studio",
    maxHeight: 2160,
    targetLufs: -14,
  },
  {
    id: "x",
    label: "X",
    summary: "1080p, 30fps, web compression for X's tight bitrates.",
    compression: "web",
    fps: 30,
    maxHeight: 1080,
    targetLufs: -14,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    summary: "1080p, 30fps, web compression, -14 LUFS.",
    compression: "web",
    fps: 30,
    maxHeight: 1080,
    targetLufs: -14,
  },
  {
    id: "shorts",
    label: "Shorts / Reels / TikTok",
    summary:
      "9:16 vertical, 30fps, 1080p-class height, social compression, -14 LUFS.",
    aspect: "9:16",
    compression: "social",
    fps: 30,
    maxHeight: 1920,
    targetLufs: -14,
  },
];

const byId = new Map(PLATFORMS.map((p) => [p.id, p]));

export function listExportPlatforms(): readonly ExportPlatformDef[] {
  return PLATFORMS;
}

export function isExportPlatformId(id: string): id is ExportPlatformId {
  return byId.has(id as ExportPlatformId);
}

export function exportPlatform(id: ExportPlatformId): ExportPlatformDef {
  const def = byId.get(id);
  if (!def) {
    throw new Error(
      `unknown export platform "${id}". Known platforms: ${EXPORT_PLATFORM_IDS.join(", ")}`
    );
  }
  return def;
}

/**
 * Merge a platform's defaults under explicitly passed options. Explicit
 * values always win; the platform only fills gaps.
 */
export function resolvePlatformOptions<
  T extends {
    aspect?: ExportAspect;
    compression?: ExportCompression;
    fps?: number;
    loudnessTargetLufs?: number;
    maxHeight?: number;
  },
>(platformId: ExportPlatformId | undefined, explicit: T): T {
  if (!platformId) {
    return explicit;
  }
  const def = exportPlatform(platformId);
  return {
    ...explicit,
    aspect: explicit.aspect ?? def.aspect,
    compression: explicit.compression ?? def.compression,
    fps: explicit.fps ?? def.fps,
    loudnessTargetLufs: explicit.loudnessTargetLufs ?? def.targetLufs,
    maxHeight: explicit.maxHeight ?? def.maxHeight,
  };
}
