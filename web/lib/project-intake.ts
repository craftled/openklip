// Shared drop-intake logic for every surface that accepts a dropped video
// (the new-project dialog and the empty-workspace drop target). Pure over
// anything with a `name` so it is testable without a DOM DataTransfer.
import { planFolderIntake } from "../../src/folder-ingest.ts";
import {
  isSupportedVideoFilename,
  SUPPORTED_VIDEO_LABEL,
  unsupportedVideoMessage,
} from "../../src/video-formats.ts";

export type DroppedVideoResult<T extends { name: string }> =
  | { error: string }
  | { file: T };

export type DroppedIntakeResult<T extends { name: string; size: number }> =
  | { error: string }
  | { kind: "single"; file: T }
  | { kind: "folder"; files: T[]; primary: T; assetCount: number };

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

/** Multi-file drop: one video uses single intake; several files use folder plan. */
export function selectDroppedIntake<T extends { name: string; size: number }>(
  files: readonly T[]
): DroppedIntakeResult<T> {
  if (files.length <= 1) {
    const single = selectDroppedVideo(files);
    if ("error" in single) {
      return { error: single.error };
    }
    return { kind: "single", file: single.file };
  }
  const planned = planFolderIntake(files);
  if ("error" in planned) {
    return { error: planned.error };
  }
  const primary =
    files.find((file) => file.name === planned.plan.primary.name) ?? files[0];
  const matched = files.filter((file) =>
    [planned.plan.primary, ...planned.plan.assets].some(
      (entry) => entry.name === file.name
    )
  );
  return {
    kind: "folder",
    files: matched,
    primary,
    assetCount: planned.plan.assets.length,
  };
}
