// Single source of truth for the video container formats OpenKlip ingests.
// Shared by the inbox folder-watch (src/inbox.ts), the upload route
// (app/api/projects/post.ts), and the browser drop surfaces so an unsupported
// file fails fast with the same copy everywhere instead of minutes later deep
// in ffprobe.

export const SUPPORTED_VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
  ".avi",
]);

/** Human-readable format list for UI copy and error messages. */
export const SUPPORTED_VIDEO_LABEL = "MP4, MOV, M4V, WebM, MKV, AVI";

/** Accept attribute for file inputs: broad video/* plus explicit extensions. */
export const SUPPORTED_VIDEO_ACCEPT = [
  "video/*",
  ...SUPPORTED_VIDEO_EXTENSIONS,
].join(",");

// Lowercased extension including the dot; "" when there is none. `dot > 0`
// (not >= 0) so a bare dotfile like ".mp4" does not count as a video.
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

export function isSupportedVideoFilename(name: string): boolean {
  return SUPPORTED_VIDEO_EXTENSIONS.has(extensionOf(name));
}

/** Actionable copy, e.g. "Unsupported format: .txt. Supported: MP4, ...". */
export function unsupportedVideoMessage(name: string): string {
  const ext = extensionOf(name);
  const lead = ext
    ? `Unsupported format: ${ext}.`
    : "That file does not look like a video.";
  return `${lead} Supported: ${SUPPORTED_VIDEO_LABEL}`;
}
