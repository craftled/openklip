import assert from "node:assert/strict";
import { appendFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import {
  appendActionLog,
  readActionLog,
  summarizeForLog,
} from "../src/action-log.ts";
import { isActionLogEntry } from "../src/action-log-entry.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("projectPaths exposes the actions log under working/", async () => {
  await withTempProjectsRoot(({ slug }) => {
    const fp = projectPaths(slug).actionsLog;
    assert.ok(fp.endsWith("actions.jsonl"));
    assert.ok(fp.includes("working"));
  });
});

test("appendActionLog and readActionLog round-trip newest first", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    // No writeFixtureProject on purpose: append must create working/ itself.
    await appendActionLog(slug, {
      at: 1,
      action: "cut",
      actor: "cli",
      input: '{"ids":["w0"]}',
      result: '{"deleted":1}',
      revisionBefore: 0,
      revisionAfter: 1,
    });
    await appendActionLog(slug, {
      at: 2,
      action: "pad",
      actor: "human",
      input: '{"padMs":10}',
      revisionBefore: 1,
      revisionAfter: 2,
    });
    assert.ok(existsSync(projectPaths(slug).actionsLog));
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].action, "pad");
    assert.equal(entries[0].revisionAfter, 2);
    assert.equal(entries[1].action, "cut");
    assert.equal(entries[1].actor, "cli");
    assert.equal(entries[1].input, '{"ids":["w0"]}');

    const limited = await readActionLog(slug, { limit: 1 });
    assert.equal(limited.length, 1);
    assert.equal(limited[0].action, "pad");
  });
});

test("readActionLog returns an empty list when no log exists", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    assert.deepEqual(await readActionLog(slug), []);
  });
});

test("readActionLog skips corrupt lines", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    await appendActionLog(slug, {
      at: 1,
      action: "cut",
      actor: "cli",
      revisionBefore: 0,
      revisionAfter: 1,
    });
    appendFileSync(
      projectPaths(slug).actionsLog,
      '{"broken\nnot-json at all\n42\n'
    );
    await appendActionLog(slug, {
      at: 2,
      action: "restore-all",
      actor: "mcp",
      revisionBefore: 1,
      revisionAfter: 2,
    });
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].action, "restore-all");
    assert.equal(entries[1].action, "cut");
  });
});

// ── E1a: torn tail healing ──────────────────────────────────────────────────

test("appendActionLog heals a torn tail: a crash mid-append does not swallow the next append", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    await appendActionLog(slug, {
      at: 1,
      action: "pad",
      actor: "human",
      revisionBefore: 0,
      revisionAfter: 1,
    });
    // Simulate a crash mid-append: a partial, unterminated line glued onto
    // the file (mutateProject already saved project.json at revision 2
    // before this append started, so the project is ahead of what the log
    // shows).
    appendFileSync(
      projectPaths(slug).actionsLog,
      '{"action":"torn","actor":"human","at":2,"revisionBefore":1,"revisionAfter":2'
    );
    await appendActionLog(slug, {
      at: 3,
      action: "cut",
      actor: "cli",
      revisionBefore: 2,
      revisionAfter: 3,
    });
    // Without healing, the new entry glues onto the torn line and BOTH
    // become unparseable, silently losing the "cut" entry too.
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].action, "cut");
    assert.equal(entries[0].revisionAfter, 3);
    assert.equal(entries[1].action, "pad");
  });
});

test("appendActionLog does not add a spurious blank line when the log already ends with a newline", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    await appendActionLog(slug, {
      at: 1,
      action: "pad",
      actor: "human",
      revisionBefore: 0,
      revisionAfter: 1,
    });
    await appendActionLog(slug, {
      at: 2,
      action: "cut",
      actor: "cli",
      revisionBefore: 1,
      revisionAfter: 2,
    });
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 2);
  });
});

// ── taskId: threads a spawned agent task through the action history ────────

test("appendActionLog and readActionLog round-trip taskId", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    await appendActionLog(slug, {
      at: 1,
      action: "cut",
      actor: "agent",
      revisionBefore: 0,
      revisionAfter: 1,
      taskId: "task-1",
    });
    await appendActionLog(slug, {
      at: 2,
      action: "pad",
      actor: "human",
      revisionBefore: 1,
      revisionAfter: 2,
    });
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].action, "pad");
    assert.equal(entries[0].taskId, undefined);
    assert.equal(entries[1].action, "cut");
    assert.equal(entries[1].taskId, "task-1");
  });
});

test("isActionLogEntry accepts entries with and without taskId, rejects a non-string taskId", () => {
  const base = {
    action: "cut",
    actor: "cli" as const,
    at: 1,
    revisionBefore: 0,
    revisionAfter: 1,
  };
  assert.equal(isActionLogEntry(base), true);
  assert.equal(isActionLogEntry({ ...base, taskId: "task-1" }), true);
  assert.equal(isActionLogEntry({ ...base, taskId: 42 }), false);
});

test('isActionLogEntry accepts actor "system" (background maintenance, e.g. asset-prune)', () => {
  const entry = {
    action: "asset-prune",
    actor: "system" as const,
    at: 1,
    revisionBefore: 0,
    revisionAfter: 1,
  };
  assert.equal(isActionLogEntry(entry), true);
});

test("summarizeForLog truncates huge values and survives circular refs", () => {
  const huge = { text: "x".repeat(10_000) };
  const summary = summarizeForLog(huge);
  assert.ok(summary);
  assert.ok(summary.length <= 220, `summary too long: ${summary.length}`);

  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.doesNotThrow(() => summarizeForLog(circular));
  assert.equal(typeof summarizeForLog(circular), "string");

  assert.equal(summarizeForLog(undefined), undefined);
});
