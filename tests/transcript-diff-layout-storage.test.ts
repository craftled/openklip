import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  commitTranscriptDiffLayoutChange,
  readStoredTranscriptDiffLayout,
  storeTranscriptDiffLayout,
  TRANSCRIPT_DIFF_LAYOUT_STORAGE_KEY,
  type TranscriptDiffLayout,
} from "../web/lib/transcript-diff-layout.ts";
import {
  installLocalStorageMock,
  uninstallLocalStorageMock,
} from "./helpers/localStorageMock.ts";

beforeEach(() => {
  installLocalStorageMock();
});

afterEach(() => {
  uninstallLocalStorageMock();
});

test("readStoredTranscriptDiffLayout defaults to inline when unset", () => {
  assert.equal(readStoredTranscriptDiffLayout(), "inline");
});

test("storeTranscriptDiffLayout persists classic layout", () => {
  storeTranscriptDiffLayout("classic");
  assert.equal(
    localStorage.getItem(TRANSCRIPT_DIFF_LAYOUT_STORAGE_KEY),
    "classic"
  );
  assert.equal(readStoredTranscriptDiffLayout(), "classic");
});

test("readStoredTranscriptDiffLayout ignores invalid stored values", () => {
  localStorage.setItem(TRANSCRIPT_DIFF_LAYOUT_STORAGE_KEY, "split");
  assert.equal(readStoredTranscriptDiffLayout(), "inline");
});

test("commitTranscriptDiffLayoutChange persists uncontrolled layout changes", () => {
  let current: TranscriptDiffLayout = "inline";
  commitTranscriptDiffLayoutChange("classic", {
    setUncontrolledLayout: (next) => {
      current = next;
    },
  });
  assert.equal(current, "classic");
  assert.equal(readStoredTranscriptDiffLayout(), "classic");
});

test("commitTranscriptDiffLayoutChange skips persistence for controlled layout", () => {
  let current: TranscriptDiffLayout = "inline";
  let notified: TranscriptDiffLayout | undefined;
  commitTranscriptDiffLayoutChange("classic", {
    controlledLayout: "inline",
    onLayoutChange: (next) => {
      notified = next;
    },
    setUncontrolledLayout: (next) => {
      current = next;
    },
  });
  assert.equal(current, "inline");
  assert.equal(notified, "classic");
  assert.equal(readStoredTranscriptDiffLayout(), "inline");
});
