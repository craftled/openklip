import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionLogEntry } from "../src/action-log.ts";
import {
  actorBadgeClass,
  HistoryList,
  parseHistoryEntries,
  revisionSpanLabel,
} from "../web/components/history-panel.tsx";

const older: ActionLogEntry = {
  at: 1000,
  action: "cut",
  actor: "cli",
  input: '{"ids":["w0"]}',
  result: '{"deleted":1}',
  revisionBefore: 0,
  revisionAfter: 1,
};

const newer: ActionLogEntry = {
  at: 2000,
  action: "look-vignette",
  actor: "human",
  revisionBefore: 1,
  revisionAfter: 2,
};

test("HistoryList renders entries newest-first with actor badge and name", () => {
  const html = renderToStaticMarkup(
    <HistoryList entries={[newer, older]} now={120_000} />
  );
  const newerAt = html.indexOf("look-vignette");
  const olderAt = html.indexOf("cut");
  assert.ok(newerAt !== -1, "newest action name rendered");
  assert.ok(olderAt !== -1, "older action name rendered");
  assert.ok(newerAt < olderAt, "newest entry renders first");
  assert.match(html, /human/);
  assert.match(html, /cli/);
  // The typographic arrow needs no HTML escaping, so the label appears as-is.
  assert.ok(html.includes(revisionSpanLabel(newer)));
  assert.ok(html.includes(revisionSpanLabel(older)));
});

test("HistoryList renders an empty state", () => {
  const html = renderToStaticMarkup(<HistoryList entries={[]} />);
  assert.match(html, /No actions yet/);
});

test("revisionSpanLabel formats the before and after revisions", () => {
  assert.equal(revisionSpanLabel(older), "rev 0 → 1");
  assert.equal(revisionSpanLabel(newer), "rev 1 → 2");
});

test("actorBadgeClass distinguishes actors and tolerates unknown values", () => {
  assert.notEqual(actorBadgeClass("human"), actorBadgeClass("agent"));
  assert.equal(typeof actorBadgeClass("nonsense"), "string");
  assert.ok(actorBadgeClass("nonsense").length > 0);
});

test("parseHistoryEntries keeps well-formed rows and drops the rest", () => {
  const parsed = parseHistoryEntries([
    older,
    { bogus: true },
    "nope",
    42,
    null,
    // Non-string input/result would reach the panel as React children and
    // crash the render ("Objects are not valid as a React child").
    { ...older, input: { ids: ["w0"] } },
    { ...older, result: 42 },
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].action, "cut");
  assert.deepEqual(parseHistoryEntries("not-an-array"), []);
});
