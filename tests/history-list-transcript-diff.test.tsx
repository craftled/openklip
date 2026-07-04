import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionLogEntry } from "../src/action-log-entry.ts";
import { HistoryList } from "../web/components/history-panel.tsx";

const cutEntry: ActionLogEntry = {
  at: 1000,
  action: "cut",
  actor: "agent",
  revisionBefore: 4,
  revisionAfter: 5,
};

const lookEntry: ActionLogEntry = {
  at: 2000,
  action: "look-vignette",
  actor: "human",
  revisionBefore: 5,
  revisionAfter: 6,
};

test("HistoryList renders transcript diff toggle for transcript actions", () => {
  const html = renderToStaticMarkup(
    <HistoryList
      entries={[cutEntry]}
      snapshotRevisions={[4, 5]}
      transcriptDiff={{
        currentRevision: 5,
        currentWords: [{ deleted: false, id: "w0", text: "Hello." }],
        slug: "demo",
      }}
    />
  );
  assert.match(html, /Show transcript diff/);
  assert.match(html, /data-history-transcript-diff/);
});

test("HistoryList omits transcript diff toggle for non-transcript actions", () => {
  const html = renderToStaticMarkup(
    <HistoryList
      entries={[lookEntry]}
      snapshotRevisions={[5, 6]}
      transcriptDiff={{
        currentRevision: 6,
        currentWords: [{ deleted: false, id: "w0", text: "Hello." }],
        slug: "demo",
      }}
    />
  );
  assert.doesNotMatch(html, /Show transcript diff/);
});

test("HistoryList omits transcript diff toggle when transcript props are absent", () => {
  const html = renderToStaticMarkup(
    <HistoryList entries={[cutEntry]} snapshotRevisions={[4, 5]} />
  );
  assert.doesNotMatch(html, /Show transcript diff/);
});
