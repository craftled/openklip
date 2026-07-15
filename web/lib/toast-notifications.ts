import type { CutTransitionType } from "@engine/edl";
import {
  type CutTransitionFallbackReason,
  cutTransitionFallbackReasonLabel,
} from "@engine/export-segments";

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

export interface ExportTransitionResultData {
  applied: boolean;
  reason?: CutTransitionFallbackReason;
  type: CutTransitionType;
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

// Only surfaces when a transition was requested but silently fell back to a
// hard cut: matches the "only say something when it's surprising" principle
// already used for the CLI's formatNote/platformNote fragments. Returns null
// when no transition was requested (type "none") or when it applied as
// expected, so a normal export stays quiet.
export function ingestPartialSuccessToast(warning: string): ToastPayload {
  return {
    kind: "info",
    title: "Project created with a warning",
    description: warning,
  };
}

export function proxyExportWarningToast(
  warn: string | undefined
): ToastPayload | null {
  if (!warn) {
    return null;
  }
  return {
    kind: "info",
    title: "Exporting from proxy",
    description: warn,
  };
}

export function transitionFallbackToast(
  transition: ExportTransitionResultData
): ToastPayload | null {
  if (transition.type === "none" || transition.applied) {
    return null;
  }
  const reasonLabel = transition.reason
    ? cutTransitionFallbackReasonLabel(transition.reason)
    : "not supported for this export";
  return {
    kind: "info",
    title: "Transition not applied",
    description: `Requested ${transition.type} but exported a hard cut: ${reasonLabel}.`,
  };
}

export function momentKeptToast(
  fromSec: number,
  toSec: number,
  restoredCount: number,
  formatClock: (sec: number) => string
): ToastPayload {
  return {
    kind: "success",
    title: `Kept ${formatClock(fromSec)}-${formatClock(toSec)} - restored ${restoredCount} word${restoredCount === 1 ? "" : "s"}`,
  };
}

export function momentAlreadyInEditToast(): ToastPayload {
  return {
    kind: "info",
    title: "Already in the edit",
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

export function revertSucceededToast(outcome: {
  restoredTo: number;
  revision: number;
}): ToastPayload {
  return {
    kind: "success",
    title: "Reverted",
    description: `Restored revision ${outcome.restoredTo} (now revision ${outcome.revision})`,
  };
}

export function revertFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "Could not revert",
    description: error,
  };
}

/** Shown when CLI/MCP advanced project.json and the open editor reseeds. */
export function externalEditSyncedToast(revision: number): ToastPayload {
  return {
    kind: "info",
    title: "Edit updated",
    description: `Loaded revision ${revision} from disk`,
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

export function suggestCleanupCutsLoadingMessage(
  providerLabel: string
): string {
  return `${providerLabel} is scanning for false starts…`;
}

export function suggestCleanupCutsSuccessToast(result: {
  words: Array<{ id: string; text: string }>;
}): ToastPayload {
  const count = result.words.length;
  return {
    kind: "success",
    title:
      count > 0
        ? `Found ${count} AI suggestion${count === 1 ? "" : "s"}`
        : "No false starts or mistakes found",
    ...(count > 0
      ? {
          description: result.words
            .slice(0, 6)
            .map((word) => `${word.id} "${word.text}"`)
            .join(", "),
        }
      : {}),
  };
}

export function suggestCleanupCutsFailedToast(error: string): ToastPayload {
  return {
    kind: "error",
    title: "AI cleanup scan failed",
    description: error,
  };
}

export function suggestCleanupCutsPromiseMessages(providerLabel: string): {
  error: (error: unknown) => { description?: string; message: string };
  loading: string;
  success: (result: { words: Array<{ id: string; text: string }> }) => {
    description?: string;
    message: string;
  };
} {
  return {
    loading: suggestCleanupCutsLoadingMessage(providerLabel),
    success: (result) => {
      const payload = suggestCleanupCutsSuccessToast(result);
      return {
        message: payload.title,
        description: payload.description,
      };
    },
    error: (error) => {
      const payload = suggestCleanupCutsFailedToast((error as Error).message);
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

export function verifyPromiseMessages(): {
  error: (error: unknown) => { description?: string; message: string };
  loading: string;
  success: (result: { report: { ok: boolean }; verdict: string }) => {
    description?: string;
    message: string;
  };
} {
  return {
    loading: "Re-transcribing the rendered cut…",
    success: (result) => ({
      message: result.report.ok ? "Cut verified" : "Cut drift detected",
      description: result.verdict,
    }),
    error: (error) => ({
      message: "Verify failed",
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
