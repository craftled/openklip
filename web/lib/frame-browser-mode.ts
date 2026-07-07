export type FrameBrowserMode = "webcodecs" | "media-seek";

export const frameBrowserMarkStorageNote =
  "Frame marks are review-only in this POC. If persisted later, store them under working/scene-marks.json through normal action history.";

interface FrameBrowserGlobal {
  VideoDecoder?: unknown;
  VideoFrame?: unknown;
}

export function frameBrowserMode(
  global: FrameBrowserGlobal = globalThis
): FrameBrowserMode {
  return global.VideoDecoder && global.VideoFrame ? "webcodecs" : "media-seek";
}
