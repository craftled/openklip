import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeWordRange,
  reconcileTranscriptText,
  selectedWordStats,
  setWordRangeDeleted,
  transcriptTextTokens,
} from "../web/lib/transcript-edit.ts";

function words() {
  return ["w0", "w1", "w2", "w3"].map((id, index) => ({
    id,
    text: id,
    deleted: index === 1,
  }));
}

test("normalizeWordRange orders and clamps transcript selections", () => {
  assert.deepEqual(normalizeWordRange([3, 1], 4), [1, 3]);
  assert.deepEqual(normalizeWordRange([-10, 99], 4), [0, 3]);
  assert.equal(normalizeWordRange([0, 1], 0), null);
});

test("setWordRangeDeleted cuts or restores every word in a range", () => {
  const cut = setWordRangeDeleted(words(), [0, 2], true);
  assert.deepEqual(
    cut.map((word) => word.deleted),
    [true, true, true, false]
  );

  const restored = setWordRangeDeleted(cut, [1, 3], false);
  assert.deepEqual(
    restored.map((word) => word.deleted),
    [true, false, false, false]
  );
});

test("selectedWordStats counts kept and cut words in the selection", () => {
  assert.deepEqual(selectedWordStats(words(), [0, 2]), {
    total: 3,
    kept: 2,
    cut: 1,
  });
  assert.deepEqual(selectedWordStats(words(), null), {
    total: 0,
    kept: 0,
    cut: 0,
  });
});

test("transcriptTextTokens tokenizes edited transcript text", () => {
  assert.deepEqual(transcriptTextTokens(" Hello   brave world\n"), [
    "Hello",
    "brave",
    "world",
  ]);
});

test("reconcileTranscriptText cuts words removed from edited text", () => {
  const next = reconcileTranscriptText(words(), "w0 w2 w3");
  assert.deepEqual(
    next.map((word) => [word.id, word.deleted, word.text]),
    [
      ["w0", false, "w0"],
      ["w1", true, "w1"],
      ["w2", false, "w2"],
      ["w3", false, "w3"],
    ]
  );
});

test("reconcileTranscriptText restores exact words typed back into the text", () => {
  const next = reconcileTranscriptText(words(), "w0 w1 w2 w3");
  assert.deepEqual(
    next.map((word) => word.deleted),
    [false, false, false, false]
  );
});

test("reconcileTranscriptText updates a replaced timed word", () => {
  const next = reconcileTranscriptText(words(), "w0 better w2 w3");
  assert.deepEqual(
    next.map((word) => [word.deleted, word.text]),
    [
      [false, "w0"],
      [false, "better"],
      [false, "w2"],
      [false, "w3"],
    ]
  );
});

test("reconcileTranscriptText folds inserted words into the nearest timed word", () => {
  const next = reconcileTranscriptText(words(), "intro w0 w1 w2 extra w3");
  assert.deepEqual(
    next.map((word) => [word.deleted, word.text]),
    [
      [false, "intro w0"],
      [false, "w1"],
      [false, "w2 extra"],
      [false, "w3"],
    ]
  );
});
