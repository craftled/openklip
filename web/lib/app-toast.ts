import { type ExternalToast, toast as sonnerToast } from "sonner";
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
  type ExportTransitionResultData,
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
  transitionFallbackToast,
  workspacePickFailedToast,
} from "@/lib/toast-notifications";

export type { ToastPayload } from "@/lib/toast-notifications";

type ToastOptions = Pick<ExternalToast, "action" | "description" | "duration">;
type ToastExtraOptions = Omit<ToastOptions, "description">;

export interface ToastBackend {
  dismiss: (id: string | number) => void;
  error: (title: string, options?: ToastOptions) => void;
  info: (title: string, options?: ToastOptions) => void;
  loading: (title: string, options?: ToastOptions) => string | number;
  promise: typeof sonnerToast.promise;
  success: (title: string, options?: ToastOptions) => void;
}

export interface ToastRecorderCall {
  action?: ToastOptions["action"];
  description?: ToastOptions["description"];
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
  const record = (
    method: ToastRecorderCall["method"],
    title: string,
    options?: ToastOptions
  ) => {
    const call: ToastRecorderCall = { method, title };
    if (options?.description !== undefined) {
      call.description = options.description;
    }
    if (options?.action !== undefined) {
      call.action = options.action;
    }
    calls.push(call);
  };
  const backend: ToastBackend = {
    dismiss: () => undefined,
    error: (title, options) => {
      record("error", title, options);
    },
    info: (title, options) => {
      record("info", title, options);
    },
    loading: (title, options) => {
      record("loading", title, options);
      return calls.length;
    },
    promise: sonnerToast.promise,
    success: (title, options) => {
      record("success", title, options);
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

function toastOptions(
  description?: string,
  options?: ToastExtraOptions
): ToastOptions | undefined {
  if (!(description || options)) {
    return;
  }
  return {
    ...options,
    ...(description ? { description } : {}),
  };
}

export function toastError(
  title: string,
  description?: string,
  options?: ToastExtraOptions
): void {
  toastBackend.error(title, toastOptions(description, options));
}

export function toastSuccess(
  title: string,
  description?: string,
  options?: ToastExtraOptions
): void {
  toastBackend.success(title, toastOptions(description, options));
}

export function toastInfo(
  title: string,
  description?: string,
  options?: ToastExtraOptions
): void {
  toastBackend.info(title, toastOptions(description, options));
}

export function toastLoading(
  title: string,
  description?: string,
  options?: ToastExtraOptions
): string | number {
  return toastBackend.loading(title, toastOptions(description, options));
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

export function toastTransitionFallback(
  transition: ExportTransitionResultData
): void {
  const payload = transitionFallbackToast(transition);
  if (payload) {
    show(payload);
  }
}
