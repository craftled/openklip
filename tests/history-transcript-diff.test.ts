import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActionLogEntry } from "../src/action-log-entry.ts";
import { canShowHistoryTranscriptDiff } from "../web/components/history-transcript-diff.tsx";
import {
  effectiveCurrentRevision,
  historyEntryShowsTranscriptDiff,
  historySnapshotRevisionAvailable,
  historyTranscriptDiffTitle,
  projectWordsForTranscriptDiff,
  resolveHistoryTranscriptDiff,
} from "../web/lib/history-transcript-diff.ts";

const cutEntry: ActionLogEntry = {
  at: 1000,
  action: "cut",
  actor: "agent",
  revisionBefore: 4,
  revisionAfter: 5,
};

test("historyEntryShowsTranscriptDiff is true for transcript mutations", () => {
  assert.equal(historyEntryShowsTranscriptDiff(cutEntry), true);
  assert.equal(
    historyEntryShowsTranscriptDiff({ ...cutEntry, action: "cut-text" }),
    true
  );
  assert.equal(
    historyEntryShowsTranscriptDiff({ ...cutEntry, action: "restore" }),
    true
  );
});

test("historyEntryShowsTranscriptDiff is false for non-transcript actions", () => {
  assert.equal(
    historyEntryShowsTranscriptDiff({ ...cutEntry, action: "look-vignette" }),
    false
  );
  assert.equal(
    historyEntryShowsTranscriptDiff({ ...cutEntry, action: "broll-add" }),
    false
  );
});

test("resolveHistoryTranscriptDiff uses snapshot revisions before and after", () => {
  assert.deepEqual(resolveHistoryTranscriptDiff(cutEntry, 8), {
    afterRevision: 5,
    beforeRevision: 4,
    usesCurrentProjectForAfter: false,
  });
});

test("resolveHistoryTranscriptDiff uses current project when entry is the latest revision", () => {
  assert.deepEqual(resolveHistoryTranscriptDiff(cutEntry, 5), {
    afterRevision: 5,
    beforeRevision: 4,
    usesCurrentProjectForAfter: true,
  });
});

test("canShowHistoryTranscriptDiff requires a transcript action and snapshot", () => {
  assert.equal(canShowHistoryTranscriptDiff(cutEntry, [4, 5]), true);
  assert.equal(canShowHistoryTranscriptDiff(cutEntry, [5]), false);
  assert.equal(
    canShowHistoryTranscriptDiff({ ...cutEntry, action: "look-vignette" }, [4]),
    false
  );
});

test("historyTranscriptDiffTitle formats action and revision span", () => {
  assert.equal(historyTranscriptDiffTitle(cutEntry), "cut · 4 → 5");
});

test("projectWordsForTranscriptDiff maps project words to diff words", () => {
  assert.deepEqual(
    projectWordsForTranscriptDiff({
      words: [
        {
          deleted: true,
          endSample: 48_000,
          id: "w0",
          startSample: 0,
          text: "um",
        },
        {
          deleted: false,
          endSample: 96_000,
          id: "w1",
          startSample: 48_000,
          text: "hello",
        },
      ],
    }),
    [
      { deleted: true, id: "w0", text: "um" },
      { deleted: false, id: "w1", text: "hello" },
    ]
  );
});

test("historySnapshotRevisionAvailable checks revision membership", () => {
  assert.equal(historySnapshotRevisionAvailable(4, [3, 4, 5]), true);
  assert.equal(historySnapshotRevisionAvailable(2, [3, 4, 5]), false);
});

test("effectiveCurrentRevision uses the newer of project revision and history head", () => {
  assert.equal(effectiveCurrentRevision(5, [{ revisionAfter: 8 }]), 8);
  assert.equal(effectiveCurrentRevision(12, [{ revisionAfter: 8 }]), 12);
  assert.equal(effectiveCurrentRevision(undefined, []), 0);
});
