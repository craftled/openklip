import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeWordRange,
  reconcileTranscriptText,
  selectedWordStats,
  setWordRangeDeleted,
  transcriptTextTokens,
  transcriptTextUnchanged,
} from "../web/lib/transcript-edit.ts";

function words() {
  return ["w0", "w1", "w2", "w3"].map((id, index) => ({
    id,
    text: id,
    deleted: index === 1,
  }));
}

function majorityDeletedWords() {
  return ["w0", "w1", "w2", "w3", "w4"].map((id, index) => ({
    id,
    text: id,
    deleted: index !== 1,
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

test("reconcileTranscriptText does not restore a deleted word just because its text is still visible", () => {
  const next = reconcileTranscriptText(words(), "w0 w1 w2 w3");
  assert.deepEqual(
    next.map((word) => word.deleted),
    [false, true, false, false]
  );
});

test("reconcileTranscriptText preserves every deleted flag when the committed text is exactly the current words (blur-commit-of-unchanged-DOM scenario)", () => {
  const source = majorityDeletedWords();
  const editedText = source.map((word) => word.text).join(" ");
  const next = reconcileTranscriptText(source, editedText);
  assert.deepEqual(
    next.map((word) => word.deleted),
    source.map((word) => word.deleted)
  );
  assert.deepEqual(
    next.map((word) => word.text),
    source.map((word) => word.text)
  );
});

test("reconcileTranscriptText updates only the genuinely edited word's text while preserving all deleted flags", () => {
  const source = majorityDeletedWords();
  const next = reconcileTranscriptText(source, "w0 w1 changed w3 w4");
  assert.deepEqual(
    next.map((word) => word.deleted),
    source.map((word) => word.deleted)
  );
  assert.deepEqual(
    next.map((word) => word.text),
    ["w0", "w1", "changed", "w3", "w4"]
  );
});

test("reconcileTranscriptText updates a replaced timed word without touching its deleted flag", () => {
  // w1 is deleted in the words() fixture; replacing its text with "better"
  // must not undelete it (editing a struck word's text is not restoration).
  const next = reconcileTranscriptText(words(), "w0 better w2 w3");
  assert.deepEqual(
    next.map((word) => [word.deleted, word.text]),
    [
      [false, "w0"],
      [true, "better"],
      [false, "w2"],
      [false, "w3"],
    ]
  );
});

test("reconcileTranscriptText folds inserted words into the nearest timed word without touching deleted flags", () => {
  // w1 is deleted in the words() fixture and its text is unchanged here
  // (a match op), so it must stay deleted.
  const next = reconcileTranscriptText(words(), "intro w0 w1 w2 extra w3");
  assert.deepEqual(
    next.map((word) => [word.deleted, word.text]),
    [
      [false, "intro w0"],
      [true, "w1"],
      [false, "w2 extra"],
      [false, "w3"],
    ]
  );
});

test("reconcileTranscriptText anchors inserted text to the next non-deleted word when the immediate anchor is deleted", () => {
  // w1 is deleted; "newword" is typed right after it, before w2. It must
  // not graft onto the deleted w1 (where it would vanish from EDL/export
  // via src/edl.ts's deleted filter). It should prefix the next kept word.
  const source = words();
  const next = reconcileTranscriptText(source, "w0 w1 newword w2 w3");
  assert.deepEqual(
    next.map((word) => [word.deleted, word.text]),
    [
      [false, "w0"],
      [true, "w1"],
      [false, "newword w2"],
      [false, "w3"],
    ]
  );
});

test("reconcileTranscriptText skips a run of deleted words to anchor inserted text on the next non-deleted match", () => {
  const source = ["w0", "w1", "w2", "w3"].map((id, index) => ({
    id,
    text: id,
    deleted: index === 1 || index === 2,
  }));
  const next = reconcileTranscriptText(source, "w0 w1 newword w2 w3");
  assert.deepEqual(
    next.map((word) => [word.deleted, word.text]),
    [
      [false, "w0"],
      [true, "w1"],
      [true, "w2"],
      [false, "newword w3"],
    ]
  );
});

test("reconcileTranscriptText folds a trailing insert backward onto the nearest preceding non-deleted word when no later match exists", () => {
  const source = ["w0", "w1"].map((id, index) => ({
    id,
    text: id,
    deleted: index === 1,
  }));
  const next = reconcileTranscriptText(source, "w0 w1 tail");
  assert.deepEqual(
    next.map((word) => [word.deleted, word.text]),
    [
      [false, "w0 tail"],
      [true, "w1"],
    ]
  );
});

test("reconcileTranscriptText does not throw when every word is deleted and there is no non-deleted anchor at all (degenerate fallback)", () => {
  // No non-deleted word exists anywhere in the transcript, so there is no
  // safe anchor. Documented fallback: graft onto the last touched (still
  // deleted) word rather than throwing or silently dropping the insert.
  const source = ["w0", "w1"].map((id) => ({
    id,
    text: id,
    deleted: true,
  }));
  const next = reconcileTranscriptText(source, "w0 w1 tail");
  assert.deepEqual(
    next.map((word) => word.deleted),
    [true, true]
  );
  assert.deepEqual(
    next.map((word) => word.text),
    ["w0", "w1 tail"]
  );
});

test("transcriptTextUnchanged is true when extracted text tokenizes to the same words, including struck-through deleted ones", () => {
  const source = majorityDeletedWords();
  const editedText = source.map((word) => word.text).join(" ");
  assert.equal(transcriptTextUnchanged(source, editedText), true);
});

test("transcriptTextUnchanged ignores whitespace and styling differences between words", () => {
  const source = majorityDeletedWords();
  const editedText = `  ${source.map((word) => word.text).join("\n\n  ")}  `;
  assert.equal(transcriptTextUnchanged(source, editedText), true);
});

test("transcriptTextUnchanged is false when a token was actually added, removed, or edited", () => {
  const source = majorityDeletedWords();
  const baseline = source.map((word) => word.text).join(" ");
  assert.equal(transcriptTextUnchanged(source, `${baseline} extra`), false);
  assert.equal(transcriptTextUnchanged(source, "w0 w1 w2 w4"), false);
  assert.equal(transcriptTextUnchanged(source, "w0 w1 changed w3 w4"), false);
});
