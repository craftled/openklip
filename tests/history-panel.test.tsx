import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionLogEntry } from "../src/action-log.ts";
import {
  actorBadgeClass,
  canRevertEntry,
  canRevertGroup,
  canRevertLast,
  crossesAssembleBoundary,
  distinctActions,
  distinctActors,
  distinctTaskIds,
  filterHistoryEntries,
  groupHasBriefSet,
  groupHistoryEntries,
  groupTouchesTruncationBoundary,
  HISTORY_PAGE_LIMIT,
  HistoryFilterControls,
  HistoryList,
  historyEntryKey,
  historyEntryKeyForRevisionAfter,
  historyFilterForTask,
  newestAssembleIndex,
  newestRevertibleEntry,
  parseHistoryEntries,
  parseMaxHistorySnapshots,
  parseSnapshotRevisions,
  revertErrorNeedsForce,
  revisionSpanLabel,
  shouldShowTruncationWarning,
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

// ── revert affordances: snapshotRevisions, grouping, force-guard ───────────

test("parseSnapshotRevisions keeps only numbers from an untrusted payload", () => {
  assert.deepEqual(parseSnapshotRevisions([0, 1, "2", null, 3]), [0, 1, 3]);
  assert.deepEqual(parseSnapshotRevisions("not-an-array"), []);
  assert.deepEqual(parseSnapshotRevisions(undefined), []);
});

test("canRevertEntry requires the entry to bump revision AND have a snapshot for revisionBefore", () => {
  assert.equal(canRevertEntry(older, [0]), true);
  assert.equal(canRevertEntry(older, [1]), false); // no snapshot for rev 0
  assert.equal(canRevertEntry(older, []), false);
  const briefSet: ActionLogEntry = {
    at: 500,
    action: "brief-set",
    actor: "human",
    revisionBefore: 1,
    revisionAfter: 1,
  };
  assert.equal(canRevertEntry(briefSet, [1]), false); // never bumped revision
});

test("historyEntryKey is stable for equal entries and distinguishes different ones", () => {
  assert.equal(historyEntryKey(older), historyEntryKey({ ...older }));
  assert.notEqual(historyEntryKey(older), historyEntryKey(newer));
});

test("groupHistoryEntries groups consecutive entries sharing a taskId, leaves the rest singleton", () => {
  const taskA1: ActionLogEntry = {
    at: 10,
    action: "cut",
    actor: "agent",
    revisionBefore: 2,
    revisionAfter: 3,
    taskId: "task-1",
  };
  const taskA2: ActionLogEntry = {
    at: 20,
    action: "cut",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 2,
    taskId: "task-1",
  };
  const human: ActionLogEntry = {
    at: 30,
    action: "pad",
    actor: "human",
    revisionBefore: 0,
    revisionAfter: 1,
  };
  // groupHistoryEntries only looks at array order + taskId, not `at`/revision
  // fields: this array order is what the API returns (newest first).
  const groups = groupHistoryEntries([taskA1, taskA2, human]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].taskId, "task-1");
  assert.equal(groups[0].entries.length, 2);
  assert.equal(groups[1].taskId, undefined);
  assert.equal(groups[1].entries.length, 1);
});

test("groupHistoryEntries does not merge non-consecutive entries that happen to share a taskId", () => {
  const a: ActionLogEntry = {
    at: 10,
    action: "cut",
    actor: "agent",
    revisionBefore: 2,
    revisionAfter: 3,
    taskId: "task-1",
  };
  const interloper: ActionLogEntry = {
    at: 20,
    action: "pad",
    actor: "human",
    revisionBefore: 1,
    revisionAfter: 2,
  };
  const b: ActionLogEntry = {
    at: 30,
    action: "cut",
    actor: "agent",
    revisionBefore: 0,
    revisionAfter: 1,
    taskId: "task-1",
  };
  const groups = groupHistoryEntries([a, interloper, b]);
  assert.equal(groups.length, 3);
});

test("groupHistoryEntries never merges entries with no taskId into one group", () => {
  const groups = groupHistoryEntries([older, newer]);
  assert.equal(groups.length, 2);
});

test("revertErrorNeedsForce detects the force-guard message from src/revert.ts", () => {
  assert.equal(
    revertErrorNeedsForce(
      'reverting task "x" would also discard "cut" (rev 0 -> 1) from actor "human"; pass force to revert anyway'
    ),
    true
  );
  assert.equal(
    revertErrorNeedsForce("nothing to revert, already at revision 0"),
    false
  );
  assert.equal(revertErrorNeedsForce("no snapshot for revision 5"), false);
  assert.equal(
    revertErrorNeedsForce(
      "action history is inconsistent with project revision (project at 4, log tail at 2); use --to <revision> explicitly"
    ),
    false
  );
});

test("parseMaxHistorySnapshots accepts a positive number and rejects the rest", () => {
  assert.equal(parseMaxHistorySnapshots(100), 100);
  assert.equal(parseMaxHistorySnapshots(0), undefined);
  assert.equal(parseMaxHistorySnapshots("100"), undefined);
});

test("newestRevertibleEntry and canRevertLast mirror {last:true} eligibility", () => {
  const briefOnly: ActionLogEntry = {
    at: 3000,
    action: "brief-set",
    actor: "human",
    revisionBefore: 2,
    revisionAfter: 2,
  };
  assert.deepEqual(
    newestRevertibleEntry([newer, briefOnly, older], [0, 1]),
    newer
  );
  assert.equal(canRevertLast([newer, older], [0, 1]), true);
  assert.equal(canRevertLast([newer, older], []), false);
  assert.equal(
    canRevertLast(
      [
        {
          at: 4000,
          action: "assemble",
          actor: "human",
          revisionBefore: 2,
          revisionAfter: 3,
        },
        newer,
        older,
      ],
      [0, 1, 2]
    ),
    false
  );
});

test("HistoryList renders an enabled revert affordance for a revertible entry", () => {
  const html = renderToStaticMarkup(
    <HistoryList entries={[older]} snapshotRevisions={[0]} />
  );
  assert.match(html, /Revert to before this/);
  assert.doesNotMatch(html, /disabled=""/);
});

test("HistoryList disables the revert affordance when no snapshot exists for the entry", () => {
  const html = renderToStaticMarkup(
    <HistoryList entries={[older]} snapshotRevisions={[]} />
  );
  assert.match(html, /No snapshot to revert to/);
  assert.match(html, /disabled=""/);
});

test("HistoryList without snapshotRevisions renders no revert controls (backward compatible)", () => {
  const html = renderToStaticMarkup(<HistoryList entries={[older]} />);
  assert.doesNotMatch(html, /Revert/);
});

test("HistoryList renders one 'Revert task' affordance for a multi-entry task group", () => {
  const taskA1: ActionLogEntry = {
    at: 10,
    action: "cut",
    actor: "agent",
    revisionBefore: 2,
    revisionAfter: 3,
    taskId: "task-1",
  };
  const taskA2: ActionLogEntry = {
    at: 20,
    action: "cut",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 2,
    taskId: "task-1",
  };
  const html = renderToStaticMarkup(
    <HistoryList entries={[taskA1, taskA2]} snapshotRevisions={[1, 2]} />
  );
  assert.match(html, /Revert task/);
});

// canRevertGroup must gate on the group's EARLIEST entry's revisionBefore
// (the revision revertProject's {task} target actually restores to), not the
// newest one. A snapshotRevisions array containing both revisions (as used
// above) can't tell the two implementations apart, so probe each revision in
// isolation.

test("canRevertGroup is disabled when only the NEWEST entry's revisionBefore has a snapshot", () => {
  const taskA1: ActionLogEntry = {
    at: 10,
    action: "cut",
    actor: "agent",
    revisionBefore: 2,
    revisionAfter: 3,
    taskId: "task-1",
  };
  const taskA2: ActionLogEntry = {
    at: 20,
    action: "cut",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 2,
    taskId: "task-1",
  };
  const group = groupHistoryEntries([taskA1, taskA2])[0];
  // Only the newest entry's revisionBefore (2) has a snapshot; the earliest
  // entry's revisionBefore (1), which is what actually gets restored, does
  // not.
  assert.equal(canRevertGroup(group, [2]), false);

  const html = renderToStaticMarkup(
    <HistoryList entries={[taskA1, taskA2]} snapshotRevisions={[2]} />
  );
  assert.doesNotMatch(html, /Revert task/);
});

test("canRevertGroup is enabled when only the EARLIEST entry's revisionBefore has a snapshot", () => {
  const taskA1: ActionLogEntry = {
    at: 10,
    action: "cut",
    actor: "agent",
    revisionBefore: 2,
    revisionAfter: 3,
    taskId: "task-1",
  };
  const taskA2: ActionLogEntry = {
    at: 20,
    action: "cut",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 2,
    taskId: "task-1",
  };
  const group = groupHistoryEntries([taskA1, taskA2])[0];
  assert.equal(canRevertGroup(group, [1]), true);

  const html = renderToStaticMarkup(
    <HistoryList entries={[taskA1, taskA2]} snapshotRevisions={[1]} />
  );
  assert.match(html, /Revert task/);
});

// ── G2: revert can't cross an "assemble" (multi-take) boundary ─────────────

test("newestAssembleIndex finds the first (newest) assemble entry, or -1", () => {
  const assemble: ActionLogEntry = {
    at: 500,
    action: "assemble",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 2,
  };
  assert.equal(newestAssembleIndex([newer, assemble, older]), 1);
  assert.equal(newestAssembleIndex([newer, older]), -1);
  assert.equal(newestAssembleIndex([]), -1);
});

test("crossesAssembleBoundary blocks the assemble entry itself and everything older, not newer entries", () => {
  const assemble: ActionLogEntry = {
    at: 500,
    action: "assemble",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 2,
  };
  const entries = [newer, assemble, older];
  assert.equal(crossesAssembleBoundary(entries, newer), false);
  assert.equal(crossesAssembleBoundary(entries, assemble), true);
  assert.equal(crossesAssembleBoundary(entries, older), true);
  // No assemble entry anywhere: never blocks.
  assert.equal(crossesAssembleBoundary([newer, older], older), false);
});

test("HistoryList disables per-entry revert at/older than the newest assemble entry with a hint, leaves newer entries enabled", () => {
  const assemble: ActionLogEntry = {
    at: 500,
    action: "assemble",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 2,
  };
  const entries = [newer, assemble, older];
  const html = renderToStaticMarkup(
    <HistoryList entries={entries} snapshotRevisions={[0, 1, 2]} />
  );
  assert.match(html, /crosses a multi-take assembly/i);
  // newer (rev 1 -> 2) sits above the assemble entry: still revertible.
  // older (rev 0 -> 1) and the assemble entry itself sit at/below it: blocked.
  // (Match the space-prefixed attribute, not "data-disabled=\"\"", which
  // also renders on a disabled Button and would double-count otherwise.)
  const disabledCount = (html.match(/ disabled=""/g) ?? []).length;
  assert.equal(disabledCount, 2);
});

test("HistoryList with no assemble entries in view is unaffected (all revertible entries stay enabled)", () => {
  const html = renderToStaticMarkup(
    <HistoryList entries={[newer, older]} snapshotRevisions={[0, 1]} />
  );
  assert.doesNotMatch(html, /crosses a multi-take assembly/i);
  assert.doesNotMatch(html, /disabled=""/);
});

// ── G3: task-group revert doesn't restore brief.md, so the confirm copy
// must caveat groups that include a brief-set entry ───────────────────────

test("groupHasBriefSet is true only when a brief-set entry is in the group", () => {
  const taskCut: ActionLogEntry = {
    at: 10,
    action: "cut",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 2,
    taskId: "task-1",
  };
  const taskBrief: ActionLogEntry = {
    at: 20,
    action: "brief-set",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 1,
    taskId: "task-1",
  };
  const withBrief = groupHistoryEntries([taskBrief, taskCut])[0];
  assert.equal(groupHasBriefSet(withBrief), true);
  const withoutBrief = groupHistoryEntries([taskCut])[0];
  assert.equal(groupHasBriefSet(withoutBrief), false);
});

test("HistoryList's task-revert confirm copy caveats groups that include a brief-set entry", () => {
  const taskCut: ActionLogEntry = {
    at: 10,
    action: "cut",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 2,
    taskId: "task-1",
  };
  const taskBrief: ActionLogEntry = {
    at: 20,
    action: "brief-set",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 1,
    taskId: "task-1",
  };
  const entries = [taskBrief, taskCut];
  const group = groupHistoryEntries(entries)[0];
  const groupKey = `task:${group.taskId}:${historyEntryKey(group.entries[0])}`;
  const html = renderToStaticMarkup(
    <HistoryList
      confirmingKey={groupKey}
      entries={entries}
      snapshotRevisions={[1]}
    />
  );
  assert.match(html, /brief changes are not restored/i);
});

test("HistoryList's task-revert confirm copy has no caveat for a group without a brief-set entry", () => {
  const taskCut1: ActionLogEntry = {
    at: 10,
    action: "cut",
    actor: "agent",
    revisionBefore: 1,
    revisionAfter: 2,
    taskId: "task-1",
  };
  const taskCut2: ActionLogEntry = {
    at: 20,
    action: "cut",
    actor: "agent",
    revisionBefore: 0,
    revisionAfter: 1,
    taskId: "task-1",
  };
  const entries = [taskCut1, taskCut2];
  const group = groupHistoryEntries(entries)[0];
  const groupKey = `task:${group.taskId}:${historyEntryKey(group.entries[0])}`;
  const html = renderToStaticMarkup(
    <HistoryList
      confirmingKey={groupKey}
      entries={entries}
      snapshotRevisions={[0]}
    />
  );
  assert.doesNotMatch(html, /brief changes are not restored/i);
});

// ── G4: canRevertGroup is only as trustworthy as the (possibly truncated)
// 200-entry view the panel is showing ───────────────────────────────────────

function makeChainEntries(count: number): ActionLogEntry[] {
  // Newest first, as the API returns them: revisionAfter counts DOWN from
  // count to 1 so entries[i] has revisionBefore = count - i - 1.
  return Array.from({ length: count }, (_, i) => ({
    at: 1000 - i,
    action: "cut",
    actor: "agent" as const,
    revisionBefore: count - i - 1,
    revisionAfter: count - i,
    taskId: "task-1",
  }));
}

test("groupTouchesTruncationBoundary is false when the view is under the page limit", () => {
  const entries = makeChainEntries(5);
  const group = groupHistoryEntries(entries)[0];
  assert.equal(
    groupTouchesTruncationBoundary(group, entries, HISTORY_PAGE_LIMIT),
    false
  );
});

test("groupTouchesTruncationBoundary is true when the view is exactly the page limit and the group reaches the oldest visible entry", () => {
  const entries = makeChainEntries(HISTORY_PAGE_LIMIT);
  const group = groupHistoryEntries(entries)[0];
  assert.equal(group.entries.length, HISTORY_PAGE_LIMIT);
  assert.equal(
    groupTouchesTruncationBoundary(group, entries, HISTORY_PAGE_LIMIT),
    true
  );
});

test("groupTouchesTruncationBoundary is false when the group ends before the oldest visible entry", () => {
  const taskEntries = makeChainEntries(3); // task-1, revisionBefore 2,1,0
  const filler: ActionLogEntry = {
    at: 1,
    action: "look-vignette",
    actor: "human",
    revisionBefore: -1,
    revisionAfter: 0,
  };
  const entries = [
    ...taskEntries,
    ...Array.from({ length: HISTORY_PAGE_LIMIT - 4 }, (_, i) => ({
      at: -i,
      action: "look-vignette",
      actor: "human" as const,
      revisionBefore: -2 - i,
      revisionAfter: -1 - i,
    })),
    filler,
  ];
  assert.equal(entries.length, HISTORY_PAGE_LIMIT);
  const group = groupHistoryEntries(entries)[0];
  assert.equal(group.taskId, "task-1");
  assert.equal(
    groupTouchesTruncationBoundary(group, entries, HISTORY_PAGE_LIMIT),
    false
  );
});

test("HistoryList disables a task revert with a 'history truncated' hint when the group reaches the oldest visible entry of a full-limit view", () => {
  const entries = makeChainEntries(HISTORY_PAGE_LIMIT);
  const snapshotRevisions = entries.map((e) => e.revisionBefore);
  const html = renderToStaticMarkup(
    <HistoryList entries={entries} snapshotRevisions={snapshotRevisions} />
  );
  assert.match(html, /history truncated/i);
});

// ── G5: the truncation warning must read the RAW fetched count, never a
// client-side filtered/displayed count. A filter can only narrow what's
// shown from what was already fetched; it can never prove there isn't more
// matching history further back that was never fetched at all. ────────────

test("shouldShowTruncationWarning is true exactly when the raw fetched count hits the page limit", () => {
  assert.equal(
    shouldShowTruncationWarning(HISTORY_PAGE_LIMIT, HISTORY_PAGE_LIMIT),
    true
  );
  assert.equal(
    shouldShowTruncationWarning(HISTORY_PAGE_LIMIT - 1, HISTORY_PAGE_LIMIT),
    false
  );
  assert.equal(shouldShowTruncationWarning(0, HISTORY_PAGE_LIMIT), false);
});

test("HistoryList's truncation hint fires with no filter active, entries and rawEntries equal at the page limit (already worked, must keep working)", () => {
  const entries = makeChainEntries(HISTORY_PAGE_LIMIT);
  const snapshotRevisions = entries.map((e) => e.revisionBefore);
  const html = renderToStaticMarkup(
    <HistoryList
      entries={entries}
      rawEntries={entries}
      snapshotRevisions={snapshotRevisions}
    />
  );
  assert.match(html, /history truncated/i);
});

test("HistoryList's truncation hint still fires when a filter narrows the displayed entries well below the page limit, because it reads the raw fetched count, not the filtered display count", () => {
  const raw = makeChainEntries(HISTORY_PAGE_LIMIT);
  // Simulates what filterHistoryEntries would hand back: a narrower subarray
  // that still contains the true oldest entry by reference, standing in for
  // a filter that happens to keep the tail of the chain.
  const narrowed = raw.slice(-5);
  const snapshotRevisions = raw.map((e) => e.revisionBefore);
  const html = renderToStaticMarkup(
    <HistoryList
      entries={narrowed}
      rawEntries={raw}
      snapshotRevisions={snapshotRevisions}
    />
  );
  assert.match(html, /history truncated/i);
});

test("HistoryList's truncation hint does not false-positive when the raw fetch is genuinely under the page limit, even with a filter narrowing the display further", () => {
  const raw = makeChainEntries(50);
  const narrowed = raw.slice(-5);
  const snapshotRevisions = raw.map((e) => e.revisionBefore);
  const html = renderToStaticMarkup(
    <HistoryList
      entries={narrowed}
      rawEntries={raw}
      snapshotRevisions={snapshotRevisions}
    />
  );
  assert.doesNotMatch(html, /history truncated/i);
});

test("history-truncated hint wording distinguishes an active filter from the plain no-filter case, without claiming certainty either way", () => {
  const raw = makeChainEntries(HISTORY_PAGE_LIMIT);
  const narrowed = raw.slice(-5);
  const snapshotRevisions = raw.map((e) => e.revisionBefore);

  const noFilterHtml = renderToStaticMarkup(
    <HistoryList
      entries={raw}
      rawEntries={raw}
      snapshotRevisions={snapshotRevisions}
    />
  );
  const filteredHtml = renderToStaticMarkup(
    <HistoryList
      entries={narrowed}
      filterActive
      rawEntries={raw}
      snapshotRevisions={snapshotRevisions}
    />
  );

  assert.match(noFilterHtml, /history truncated/i);
  assert.match(filteredHtml, /history truncated/i);
  // The filtered variant calls out the filter explicitly; the plain variant
  // does not, so the two labels must differ.
  assert.match(filteredHtml, /filter/i);
  const noFilterLabel = noFilterHtml.match(/aria-label="([^"]*)"/)?.[1];
  const filteredLabel = filteredHtml.match(/aria-label="([^"]*)"/)?.[1];
  assert.ok(noFilterLabel);
  assert.ok(filteredLabel);
  assert.notEqual(noFilterLabel, filteredLabel);
});

// ── History panel filter UI: actor/action/task, AND semantics, empty states ─

const taskCut: ActionLogEntry = {
  at: 10,
  action: "cut",
  actor: "agent",
  revisionBefore: 2,
  revisionAfter: 3,
  taskId: "task-1",
};

const taskPad: ActionLogEntry = {
  at: 20,
  action: "pad",
  actor: "agent",
  revisionBefore: 1,
  revisionAfter: 2,
  taskId: "task-1",
};

const humanLook: ActionLogEntry = {
  at: 30,
  action: "look-vignette",
  actor: "human",
  revisionBefore: 0,
  revisionAfter: 1,
};

test("filterHistoryEntries with no active filter returns every entry unchanged", () => {
  const entries = [taskCut, taskPad, humanLook];
  assert.deepEqual(filterHistoryEntries(entries, {}), entries);
  assert.deepEqual(
    filterHistoryEntries(entries, { actor: "", action: "", task: "" }),
    entries
  );
  assert.deepEqual(
    filterHistoryEntries(entries, {
      actor: undefined,
      action: undefined,
      task: undefined,
    }),
    entries
  );
});

test("filterHistoryEntries matches on a single dimension", () => {
  const entries = [taskCut, taskPad, humanLook];
  assert.deepEqual(filterHistoryEntries(entries, { actor: "human" }), [
    humanLook,
  ]);
  assert.deepEqual(filterHistoryEntries(entries, { action: "cut" }), [taskCut]);
  assert.deepEqual(filterHistoryEntries(entries, { task: "task-1" }), [
    taskCut,
    taskPad,
  ]);
});

test("filterHistoryEntries combines actor, action, and task filters with AND semantics, not OR", () => {
  const entries = [taskCut, taskPad, humanLook];
  // Matches actor AND action AND task all at once: only taskCut qualifies.
  assert.deepEqual(
    filterHistoryEntries(entries, {
      actor: "agent",
      action: "cut",
      task: "task-1",
    }),
    [taskCut]
  );
  // An OR-shaped implementation would wrongly include taskPad (agent, task-1)
  // and humanLook (neither) alongside taskCut here.
  assert.notDeepEqual(
    filterHistoryEntries(entries, {
      actor: "agent",
      action: "cut",
      task: "task-1",
    }),
    entries
  );
});

test("filterHistoryEntries returns an empty array cleanly for a value present in the UI options but matching zero entries", () => {
  const entries = [taskCut, taskPad, humanLook];
  assert.deepEqual(filterHistoryEntries(entries, { actor: "mcp" }), []);
  assert.deepEqual(
    filterHistoryEntries(entries, { actor: "agent", action: "look-vignette" }),
    []
  );
});

test("historyFilterForTask clears other dimensions and sets task", () => {
  assert.deepEqual(historyFilterForTask("task-42"), {
    action: "",
    actor: "",
    author: "",
    task: "task-42",
  });
  const filtered = filterHistoryEntries(
    [taskCut, taskPad, humanLook],
    historyFilterForTask("task-1")
  );
  assert.deepEqual(filtered, [taskCut, taskPad]);
});

test("historyEntryKeyForRevisionAfter finds the row key for a revision", () => {
  const entries = [taskCut, taskPad, humanLook];
  const key = historyEntryKeyForRevisionAfter(entries, taskCut.revisionAfter);
  assert.equal(key, historyEntryKey(taskCut));
  assert.equal(historyEntryKeyForRevisionAfter(entries, 999), undefined);
});

test("distinctActors, distinctActions, and distinctTaskIds derive sorted unique values present in the loaded entries", () => {
  const entries = [taskCut, taskPad, humanLook];
  assert.deepEqual(distinctActors(entries), ["agent", "human"]);
  assert.deepEqual(distinctActions(entries), ["cut", "look-vignette", "pad"]);
  assert.deepEqual(distinctTaskIds(entries), ["task-1"]);
  // No taskId anywhere: an empty option list, not a list of undefined.
  assert.deepEqual(distinctTaskIds([humanLook]), []);
});

test("actorBadgeClass gives 'system' its own style distinct from mcp and the unknown-actor fallback", () => {
  assert.notEqual(actorBadgeClass("system"), actorBadgeClass("mcp"));
  assert.notEqual(actorBadgeClass("system"), actorBadgeClass("totally-bogus"));
  assert.ok(actorBadgeClass("system").length > 0);
});

test("HistoryFilterControls renders an actor, action, and task filter control", () => {
  const html = renderToStaticMarkup(
    <HistoryFilterControls
      actionOptions={["cut", "pad"]}
      actorOptions={["agent", "human"]}
      authorOptions={["human:local"]}
      onChange={() => {
        // no-op for a static render
      }}
      taskOptions={["task-1"]}
      value={{ actor: "", action: "", author: "", task: "" }}
    />
  );
  assert.match(html, /Filter by actor/i);
  assert.match(html, /Filter by action/i);
  assert.match(html, /Filter by task/i);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-label="Filter by task"/);
});

test("HistoryFilterControls shows 'Clear filters' only when a filter is active", () => {
  const idle = renderToStaticMarkup(
    <HistoryFilterControls
      actionOptions={["cut"]}
      actorOptions={["agent"]}
      authorOptions={[]}
      onChange={() => {
        // no-op
      }}
      taskOptions={[]}
      value={{ actor: "", action: "", author: "", task: "" }}
    />
  );
  assert.doesNotMatch(idle, /Clear filters/);

  const active = renderToStaticMarkup(
    <HistoryFilterControls
      actionOptions={["cut"]}
      actorOptions={["agent"]}
      authorOptions={[]}
      onChange={() => {
        // no-op
      }}
      taskOptions={[]}
      value={{ actor: "agent", action: "", author: "", task: "" }}
    />
  );
  assert.match(active, /Clear filters/);
});

test("HistoryList's 'no entries match the filter' empty state renders distinctly from 'no history at all'", () => {
  const noHistory = renderToStaticMarkup(<HistoryList entries={[]} />);
  assert.match(noHistory, /No actions yet/);
  assert.doesNotMatch(noHistory, /match the current filters/i);

  const filteredOut = renderToStaticMarkup(
    <HistoryList entries={[]} unfilteredCount={3} />
  );
  assert.match(filteredOut, /match the current filters/i);
  assert.doesNotMatch(filteredOut, /No actions yet/);
});
