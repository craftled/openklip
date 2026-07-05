// Browser upload size caps (bytes). Fail fast before streaming to disk.

/** Whole-project video ingest via POST /api/projects. */
export const MAX_PROJECT_UPLOAD_BYTES = 12 * 1024 * 1024 * 1024;

/** Per-file cap for asset/take/folder sidecar uploads. */
export const MAX_ASSET_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;

export function uploadTooLargeMessage(
  label: string,
  bytes: number,
  limitBytes: number
): string {
  const gb = (n: number) => (n / (1024 * 1024 * 1024)).toFixed(1);
  return `${label} is ${gb(bytes)} GB; limit is ${gb(limitBytes)} GB`;
}

export function assertUploadSize(
  bytes: number,
  limitBytes: number,
  label: string
): void {
  if (bytes > limitBytes) {
    throw new Error(uploadTooLargeMessage(label, bytes, limitBytes));
  }
}
