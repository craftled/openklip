import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionLogEntry } from "../src/action-log-entry.ts";
import { HistoryTranscriptDiffToggle } from "../web/components/history-transcript-diff.tsx";

const cutEntry: ActionLogEntry = {
  at: 1000,
  action: "cut",
  actor: "agent",
  revisionBefore: 4,
  revisionAfter: 5,
};

const currentWords = [
  { id: "w0", text: "Hello", deleted: false },
  { id: "w1", text: "world.", deleted: false },
];

test("HistoryTranscriptDiffToggle renders show button for transcript cut entries", () => {
  const html = renderToStaticMarkup(
    <HistoryTranscriptDiffToggle
      currentRevision={5}
      currentWords={currentWords}
      entry={cutEntry}
      slug="demo"
      snapshotRevisions={[4, 5]}
    />
  );
  assert.match(html, /Show transcript diff/);
  assert.match(html, /data-history-transcript-diff/);
});

test("HistoryTranscriptDiffToggle renders nothing for non-transcript actions", () => {
  const html = renderToStaticMarkup(
    <HistoryTranscriptDiffToggle
      currentRevision={5}
      currentWords={currentWords}
      entry={{ ...cutEntry, action: "look-vignette" }}
      slug="demo"
      snapshotRevisions={[4, 5]}
    />
  );
  assert.equal(html, "");
});

test("HistoryTranscriptDiffToggle renders nothing without a before snapshot", () => {
  const html = renderToStaticMarkup(
    <HistoryTranscriptDiffToggle
      currentRevision={5}
      currentWords={currentWords}
      entry={cutEntry}
      slug="demo"
      snapshotRevisions={[5]}
    />
  );
  assert.equal(html, "");
});
