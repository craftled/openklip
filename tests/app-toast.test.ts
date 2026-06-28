import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  applyToastPayload,
  createToastRecorder,
  resetToastBackendForTests,
  setToastBackendForTests,
  toastError,
} from "../web/lib/app-toast.ts";
import {
  exportSuccessToast,
  saveFailedToast,
} from "../web/lib/toast-notifications.ts";

afterEach(() => {
  resetToastBackendForTests();
});

test("applyToastPayload dispatches to recorder", () => {
  const recorder = createToastRecorder();
  applyToastPayload(recorder.backend, saveFailedToast("disk full"));
  assert.deepEqual(recorder.calls, [
    {
      method: "error",
      title: "Could not save edit",
      description: "disk full",
    },
  ]);
});

test("applyToastPayload handles success payloads", () => {
  const recorder = createToastRecorder();
  applyToastPayload(
    recorder.backend,
    exportSuccessToast({
      ranges: 1,
      height: 720,
      durationSec: 3,
      out: "output/out.mp4",
    })
  );
  assert.equal(recorder.calls[0]?.method, "success");
  assert.equal(recorder.calls[0]?.title, "Export complete");
});

test("setToastBackendForTests routes toastError through mock", () => {
  const calls: Array<{ title: string; description?: string }> = [];
  setToastBackendForTests({
    error: (title, options) => {
      calls.push({ title, description: options?.description });
    },
    success: () => undefined,
    info: () => undefined,
    loading: () => "id",
    dismiss: () => undefined,
    promise: async (p) => p,
  });
  toastError("Test error", "details");
  assert.deepEqual(calls, [{ title: "Test error", description: "details" }]);
});
