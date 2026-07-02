// Shared drop-intake logic for every surface that accepts a dropped video
// (the new-project dialog and the empty-workspace drop target). Pure over
// anything with a `name` so it is testable without a DOM DataTransfer.
import {
  isSupportedVideoFilename,
  SUPPORTED_VIDEO_LABEL,
  unsupportedVideoMessage,
} from "../../src/video-formats.ts";

export type DroppedVideoResult<T extends { name: string }> =
  | { error: string }
  | { file: T };

// Single-file intake: pick the first supported video in the drop; anything
// else yields actionable copy naming the supported formats.
export function selectDroppedVideo<T extends { name: string }>(
  files: readonly T[]
): DroppedVideoResult<T> {
  const first = files[0];
  if (!first) {
    return {
      error: `Drop a video file. Supported: ${SUPPORTED_VIDEO_LABEL}`,
    };
  }
  const match = files.find((file) => isSupportedVideoFilename(file.name));
  if (match) {
    return { file: match };
  }
  return { error: unsupportedVideoMessage(first.name) };
}
