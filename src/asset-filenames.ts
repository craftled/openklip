import { extname } from "node:path";
import type { AssetKind } from "./edl.ts";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

export function inferAssetKind(filename: string): AssetKind {
  const ext = extname(filename).toLowerCase();
  if (IMAGE_EXT.has(ext)) {
    return "still";
  }
  if (AUDIO_EXT.has(ext)) {
    return "music";
  }
  return "broll";
}

/** True when the filename looks like a droppable asset (not junk). */
export function isRecognizedAssetFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return IMAGE_EXT.has(ext) || AUDIO_EXT.has(ext) || VIDEO_EXT.has(ext);
}
