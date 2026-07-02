import { toast as sonnerToast } from "sonner";
import {
  assetRemovedToast,
  assetRemoveFailedToast,
  assetsSyncedToast,
  assetUploadFailedToast,
  assetUploadSuccessToast,
  chatArchiveFailedToast,
  chatAssetUploadSuccessToast,
  chatDeleteFailedToast,
  chatEnsureFailedToast,
  chatRenameFailedToast,
  chatSendFailedToast,
  chatUnarchiveFailedToast,
  nothingToPlayToast,
  playbackFailedToast,
  projectCreateFailedToast,
  projectDeletedToast,
  projectDeleteFailedToast,
  revealFailedToast,
  revertFailedToast,
  revertSucceededToast,
  saveFailedToast,
  type ToastPayload,
  workspacePickFailedToast,
} from "@/lib/toast-notifications";

export type { ToastPayload } from "@/lib/toast-notifications";

interface ToastOptions {
  description?: string;
}

export interface ToastBackend {
  dismiss: (id: string | number) => void;
  error: (title: string, options?: ToastOptions) => void;
  info: (title: string, options?: ToastOptions) => void;
  loading: (title: string, options?: ToastOptions) => string | number;
  promise: typeof sonnerToast.promise;
  success: (title: string, options?: ToastOptions) => void;
}

export interface ToastRecorderCall {
  description?: string;
  method: keyof Pick<ToastBackend, "error" | "info" | "loading" | "success">;
  title: string;
}

let toastBackend: ToastBackend = sonnerToast;

export function setToastBackendForTests(
  backend: Partial<ToastBackend> | null
): void {
  toastBackend = backend ? { ...sonnerToast, ...backend } : sonnerToast;
}

export function resetToastBackendForTests(): void {
  toastBackend = sonnerToast;
}

export function createToastRecorder(): {
  backend: ToastBackend;
  calls: ToastRecorderCall[];
} {
  const calls: ToastRecorderCall[] = [];
  const backend: ToastBackend = {
    dismiss: () => undefined,
    error: (title, options) => {
      calls.push({ method: "error", title, description: options?.description });
    },
    info: (title, options) => {
      calls.push({ method: "info", title, description: options?.description });
    },
    loading: (title, options) => {
      calls.push({
        method: "loading",
        title,
        description: options?.description,
      });
      return calls.length;
    },
    promise: sonnerToast.promise,
    success: (title, options) => {
      calls.push({
        method: "success",
        title,
        description: options?.description,
      });
    },
  };
  return { backend, calls };
}

export function applyToastPayload(
  backend: Pick<ToastBackend, "error" | "info" | "success">,
  payload: ToastPayload
): void {
  const options = payload.description
    ? { description: payload.description }
    : undefined;
  switch (payload.kind) {
    case "error":
      backend.error(payload.title, options);
      break;
    case "info":
      backend.info(payload.title, options);
      break;
    case "success":
      backend.success(payload.title, options);
      break;
    default:
      break;
  }
}

export function applyToasts(payloads: readonly ToastPayload[]): void {
  for (const payload of payloads) {
    applyToastPayload(toastBackend, payload);
  }
}

function show(payload: ToastPayload): void {
  applyToastPayload(toastBackend, payload);
}

export function toastError(title: string, description?: string): void {
  toastBackend.error(title, description ? { description } : undefined);
}

export function toastSuccess(title: string, description?: string): void {
  toastBackend.success(title, description ? { description } : undefined);
}

export function toastInfo(title: string, description?: string): void {
  toastBackend.info(title, description ? { description } : undefined);
}

export function toastLoading(
  title: string,
  description?: string
): string | number {
  return toastBackend.loading(title, description ? { description } : undefined);
}

export function toastDismiss(id: string | number): void {
  toastBackend.dismiss(id);
}

export function toastPromise<T>(
  promise: Promise<T> | (() => Promise<T>),
  messages: Parameters<typeof sonnerToast.promise<T>>[1]
) {
  return toastBackend.promise(promise, messages);
}

export function toastSaveError(message: string): void {
  show(saveFailedToast(message));
}

export function toastRevealError(message: string): void {
  show(revealFailedToast(message));
}

export function toastAssetUploadSuccess(count: number): void {
  show(assetUploadSuccessToast(count));
}

export function toastAssetUploadFailed(error: string): void {
  show(assetUploadFailedToast(error));
}

export function toastAssetRemoved(name?: string): void {
  show(assetRemovedToast(name));
}

export function toastAssetRemoveFailed(error: string): void {
  show(assetRemoveFailedToast(error));
}

export function toastRevertSucceeded(outcome: {
  restoredTo: number;
  revision: number;
}): void {
  show(revertSucceededToast(outcome));
}

export function toastRevertFailed(error: string): void {
  show(revertFailedToast(error));
}

export function toastAssetsSynced(count: number): void {
  const payload = assetsSyncedToast(count);
  if (payload) {
    show(payload);
  }
}

export function toastProjectCreateFailed(error: string): void {
  show(projectCreateFailedToast(error));
}

export function toastProjectDeleted(): void {
  show(projectDeletedToast());
}

export function toastProjectDeleteFailed(error: string): void {
  show(projectDeleteFailedToast(error));
}

export function toastWorkspacePickFailed(error: string): void {
  show(workspacePickFailedToast(error));
}

export function toastChatRenameFailed(error: string): void {
  show(chatRenameFailedToast(error));
}

export function toastChatArchiveFailed(error: string): void {
  show(chatArchiveFailedToast(error));
}

export function toastChatUnarchiveFailed(error: string): void {
  show(chatUnarchiveFailedToast(error));
}

export function toastChatDeleteFailed(error: string): void {
  show(chatDeleteFailedToast(error));
}

export function toastChatEnsureFailed(error: string): void {
  show(chatEnsureFailedToast(error));
}

export function toastChatSendFailed(error: string): void {
  show(chatSendFailedToast(error));
}

export function toastNothingToPlay(): void {
  show(nothingToPlayToast());
}

export function toastPlaybackFailed(error: string): void {
  show(playbackFailedToast(error));
}

export function toastChatAssetUploadSuccess(count: number): void {
  show(chatAssetUploadSuccessToast(count));
}
