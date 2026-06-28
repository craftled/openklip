export type ToastKind = "error" | "info" | "success";

export interface ToastPayload {
  description?: string;
  kind: ToastKind;
  title: string;
}

export interface ExportResultData {
  durationSec: number;
  height: number;
  out: string;
  ranges: number;
}

export interface FindFillerResult {
  cut: number;
  words: Array<{ id: string; text: string }>;
}

export interface WorkspacePickerResult {
  cancelled?: boolean;
  projects?: Array<{ slug: string }>;
  root?: string;
}

export interface AssetIdRef {
  id: string;
}

export function saveFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not save edit",
    description: error,
  };
}

export function exportLoadingMessage(): string {
  return "Exporting MP4…";
}

export function exportSuccessToast(data: ExportResultData): ToastPayload {
  return {
    kind: "success",
    title: "Export complete",
    description: `${data.ranges} cuts @ ${data.height}p (${data.durationSec.toFixed(1)}s) · ${data.out}`,
  };
}

export function exportFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Export failed",
    description: error,
  };
}

export function nothingToPlayToast(): ToastPayload {
  return {
    kind: "info",
    title: "Nothing to play",
    description: "All words in the transcript are cut.",
  };
}

export function playbackFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Playback failed",
    description: error,
  };
}

export function assetUploadSuccessToast(count: number): ToastPayload {
  return {
    kind: "success",
    title: count === 1 ? "Asset added" : `${count} assets added`,
  };
}

export function chatAssetUploadSuccessToast(count: number): ToastPayload {
  const base = assetUploadSuccessToast(count);
  return {
    ...base,
    description: "Available in the asset bin.",
  };
}

export function assetUploadFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Upload failed",
    description: error,
  };
}

export function assetRemovedToast(name?: string): ToastPayload {
  return {
    kind: "success",
    title: "Asset removed",
    ...(name ? { description: name } : {}),
  };
}

export function assetRemoveFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not remove asset",
    description: error,
  };
}

export function countNewAssetIds(
  knownIds: ReadonlySet<string>,
  assets: ReadonlyArray<AssetIdRef>
): string[] {
  return assets
    .filter((asset) => !knownIds.has(asset.id))
    .map((asset) => asset.id);
}

export function assetsSyncedToast(count: number): ToastPayload | null {
  if (count <= 0) {
    return null;
  }
  return {
    kind: "info",
    title: count === 1 ? "Synced 1 new asset" : `Synced ${count} new assets`,
    description: "Registered from the assets folder.",
  };
}

export function projectIngestLoadingMessage(): string {
  return "Ingesting video…";
}

export function projectCreateFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not create project",
    description: error,
  };
}

export function projectDeletedToast(): ToastPayload {
  return {
    kind: "success",
    title: "Project deleted",
  };
}

export function projectDeleteFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not delete project",
    description: error,
  };
}

export function workspacePickerToasts(
  result: WorkspacePickerResult
): ToastPayload[] {
  if (result.cancelled) {
    return [];
  }
  const toasts: ToastPayload[] = [];
  if (result.root) {
    toasts.push({
      kind: "success",
      title: "Workspace folder set",
      description: result.root,
    });
  }
  if (result.root && (result.projects?.length ?? 0) === 0) {
    toasts.push({
      kind: "info",
      title: "No projects yet",
      description: "Run openklip ingest <video> to create one in this folder.",
    });
  }
  return toasts;
}

export function workspacePickFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not choose folder",
    description: error,
  };
}

export function revealFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not open in Finder",
    description: error,
  };
}

export function chatRenameFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not rename chat",
    description: error,
  };
}

export function chatArchiveFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not archive chat",
    description: error,
  };
}

export function chatUnarchiveFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not restore chat",
    description: error,
  };
}

export function chatDeleteFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not delete chat",
    description: error,
  };
}

export function chatEnsureFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not start chat",
    description: error,
  };
}

export function chatSendFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not send message",
    description: error,
  };
}

export function findFillerLoadingMessage(providerLabel: string): string {
  return `${providerLabel} is reading the transcript…`;
}

export function findFillerSuccessToast(result: FindFillerResult): ToastPayload {
  return {
    kind: "success",
    title:
      result.cut > 0
        ? `Cut ${result.cut} filler word${result.cut === 1 ? "" : "s"}`
        : "No filler words found",
    ...(result.words.length > 0
      ? {
          description: result.words
            .map((word) => `${word.id} "${word.text}"`)
            .join(", "),
        }
      : {}),
  };
}

export function findFillerFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Find filler failed",
    description: error,
  };
}

export function findFillerPromiseMessages(providerLabel: string): {
  error: (error: unknown) => { description?: string; message: string };
  loading: string;
  success: (result: FindFillerResult) => {
    description?: string;
    message: string;
  };
} {
  return {
    loading: findFillerLoadingMessage(providerLabel),
    success: (result) => {
      const payload = findFillerSuccessToast(result);
      return {
        message: payload.title,
        description: payload.description,
      };
    },
    error: (error) => {
      const payload = findFillerFailedToast((error as Error).message);
      return {
        message: payload.title,
        description: payload.description,
      };
    },
  };
}

export function analyzeAssetsPromiseMessages(providerLabel: string): {
  error: (error: unknown) => { description?: string; message: string };
  loading: string;
  success: (result: {
    analyzed: number;
    sceneLogged?: boolean;
    skipped: number;
    total: number;
  }) => {
    description?: string;
    message: string;
  };
} {
  return {
    loading: `${providerLabel} is reading your media…`,
    success: (result) => {
      const scene = result.sceneLogged ? " Logged the video's scenes." : "";
      if (result.total === 0) {
        return result.sceneLogged
          ? {
              message: "Logged the video's scenes",
              description: `${providerLabel} read the source frames.`,
            }
          : { message: "Media already described" };
      }
      const skipped = result.skipped > 0 ? ` (${result.skipped} skipped)` : "";
      return {
        message: `Described ${result.analyzed} of ${result.total} asset(s)`,
        description: `${providerLabel} catalogued b-roll and stills${skipped}.${scene}`,
      };
    },
    error: (error) => ({
      message: "Media analysis failed",
      description: (error as Error).message,
    }),
  };
}

export function exportPromiseMessages(): {
  error: (error: unknown) => { description?: string; message: string };
  loading: string;
  success: (data: ExportResultData) => {
    description?: string;
    message: string;
  };
} {
  return {
    loading: exportLoadingMessage(),
    success: (data) => {
      const payload = exportSuccessToast(data);
      return {
        message: payload.title,
        description: payload.description,
      };
    },
    error: (error) => {
      const payload = exportFailedToast((error as Error).message);
      return {
        message: payload.title,
        description: payload.description,
      };
    },
  };
}
