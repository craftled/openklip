import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTranscriptFileDiff,
  transcriptDiffLines,
  transcriptDiffSummary,
  wordRangeForDiffLine,
} from "../web/lib/transcript-diff.ts";

function sampleWords() {
  return [
    { id: "w0", text: "Hello", deleted: false },
    { id: "w1", text: "world.", deleted: false },
    { id: "w2", text: "This", deleted: false },
    { id: "w3", text: "is", deleted: false },
    { id: "w4", text: "fine.", deleted: false },
  ];
}

test("transcriptDiffLines joins kept words into one line per sentence", () => {
  const result = transcriptDiffLines(sampleWords());
  assert.equal(result.contents, "Hello world.\nThis is fine.");
  assert.deepEqual(result.lines, [
    { lineNumber: 1, wordStartIndex: 0, wordEndIndex: 1, text: "Hello world." },
    {
      lineNumber: 2,
      wordStartIndex: 2,
      wordEndIndex: 4,
      text: "This is fine.",
    },
  ]);
});

test("transcriptDiffLines omits deleted words from line text", () => {
  const words = [
    { id: "w0", text: "Well", deleted: true },
    { id: "w1", text: "hello.", deleted: false },
  ];
  const result = transcriptDiffLines(words);
  assert.equal(result.contents, "hello.");
  assert.equal(result.lines[0]?.text, "hello.");
  assert.equal(result.lines[0]?.wordStartIndex, 0);
  assert.equal(result.lines[0]?.wordEndIndex, 1);
});

test("wordRangeForDiffLine maps a 1-based diff line back to word indices", () => {
  const { lines } = transcriptDiffLines(sampleWords());
  assert.deepEqual(wordRangeForDiffLine(lines, 2), [2, 4]);
  assert.equal(wordRangeForDiffLine(lines, 99), null);
});

test("buildTranscriptFileDiff reports a deletion when a kept word is cut", () => {
  const oldWords = sampleWords();
  const newWords = sampleWords().map((word) =>
    word.id === "w1" ? { ...word, deleted: true } : word
  );
  const { fileDiff } = buildTranscriptFileDiff(oldWords, newWords);
  assert.ok(fileDiff.hunks.length >= 1);
  const summary = transcriptDiffSummary(fileDiff);
  assert.ok(summary.deletions >= 1);
});

test("buildTranscriptFileDiff is unchanged when kept transcript text matches", () => {
  const words = sampleWords();
  const { fileDiff } = buildTranscriptFileDiff(words, words);
  const summary = transcriptDiffSummary(fileDiff);
  assert.equal(summary.hunks, 0);
  assert.equal(summary.additions, 0);
  assert.equal(summary.deletions, 0);
});
