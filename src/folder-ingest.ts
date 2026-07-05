// Folder batch intake: pick one primary video for ingest, treat the rest as
// assets/ sidecars. Pure over { name, size }[] so GUI and API share logic.
import { isRecognizedAssetFile } from "./assets.ts";
import {
  isSupportedVideoFilename,
  unsupportedVideoMessage,
} from "./video-formats.ts";

export interface FolderIntakeFile {
  name: string;
  size: number;
}

export interface FolderIntakePlan<T extends FolderIntakeFile> {
  assets: T[];
  primary: T;
}

export type FolderIntakeResult<T extends FolderIntakeFile> =
  | { error: string }
  | { plan: FolderIntakePlan<T> };

function videoSortKey(file: FolderIntakeFile): [number, string] {
  return [-file.size, file.name.toLowerCase()];
}

/** Largest supported video wins; remaining recognized files become assets. */
export function planFolderIntake<T extends FolderIntakeFile>(
  files: readonly T[]
): FolderIntakeResult<T> {
  if (files.length === 0) {
    return { error: "Choose a folder with at least one video file." };
  }
  const videos = files.filter((f) => isSupportedVideoFilename(f.name));
  if (videos.length === 0) {
    return { error: unsupportedVideoMessage(files[0].name) };
  }
  const sorted = [...videos].sort((a, b) => {
    const ka = videoSortKey(a);
    const kb = videoSortKey(b);
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]);
  });
  const primary = sorted[0];
  const assets = files.filter(
    (f) =>
      f !== primary &&
      (isRecognizedAssetFile(f.name) || isSupportedVideoFilename(f.name))
  );
  return { plan: { primary, assets } };
}
