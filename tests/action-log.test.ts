import assert from "node:assert/strict";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  appendActionLog,
  MAX_ACTION_LOG_BYTES,
  MAX_ACTION_LOG_ENTRIES,
  pruneActionLog,
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

test("readActionLog with limit reads newest entries without loading the full file semantics", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    for (let index = 0; index < 30; index += 1) {
      await appendActionLog(slug, {
        at: index,
        action: "pad",
        actor: "cli",
        revisionBefore: index,
        revisionAfter: index + 1,
      });
    }
    const limited = await readActionLog(slug, { limit: 3 });
    assert.equal(limited.length, 3);
    assert.equal(limited[0].revisionAfter, 30);
    assert.equal(limited[1].revisionAfter, 29);
    assert.equal(limited[2].revisionAfter, 28);
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

test("pruneActionLog drops oldest entries when the count cap is exceeded", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    for (let index = 0; index < 12; index += 1) {
      await appendActionLog(slug, {
        at: index,
        action: "pad",
        actor: "cli",
        revisionBefore: index,
        revisionAfter: index + 1,
      });
    }
    const { pruned, kept } = await pruneActionLog(slug, { maxEntries: 5 });
    assert.equal(pruned, 7);
    assert.equal(kept, 5);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 5);
    assert.equal(entries[0].revisionAfter, 12);
    assert.equal(entries.at(-1)?.revisionAfter, 8);
  });
});

test("pruneActionLog keeps the newest revision tail for revert-last", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    for (let index = 0; index < 8; index += 1) {
      await appendActionLog(slug, {
        at: index,
        action: "pad",
        actor: "cli",
        revisionBefore: index,
        revisionAfter: index + 1,
      });
    }
    await pruneActionLog(slug, { maxEntries: 3 });
    const entries = await readActionLog(slug);
    assert.equal(entries[0].revisionAfter, 8);
    assert.equal(entries[0].revisionBefore, 7);
  });
});

test("pruneActionLog enforces the byte cap without touching history snapshots", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    for (let index = 0; index < 40; index += 1) {
      await appendActionLog(slug, {
        at: index,
        action: "cut",
        actor: "cli",
        input: `entry-${index}-${"x".repeat(80)}`,
        revisionBefore: index,
        revisionAfter: index + 1,
      });
    }
    const logPath = projectPaths(slug).actionsLog;
    const beforeSize = (await Bun.file(logPath).arrayBuffer()).byteLength;
    assert.ok(beforeSize > 4096);
    const historyDir = projectPaths(slug).historyDir;
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(historyDir, { recursive: true });
    writeFileSync(
      join(historyDir, "rev-0.json"),
      JSON.stringify(makeProject({ slug }), null, 2)
    );
    const { pruned } = await pruneActionLog(slug, {
      maxBytes: 2048,
      maxEntries: MAX_ACTION_LOG_ENTRIES,
    });
    assert.ok(pruned > 0);
    const afterSize = (await Bun.file(logPath).arrayBuffer()).byteLength;
    assert.ok(afterSize <= 2048);
    assert.ok(existsSync(join(historyDir, "rev-0.json")));
  });
});

test("appendActionLog rotates when default caps are exceeded in tests", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    assert.ok(MAX_ACTION_LOG_ENTRIES >= 100);
    assert.ok(MAX_ACTION_LOG_BYTES >= 1024);
    for (let index = 0; index < 8; index += 1) {
      await appendActionLog(slug, {
        at: index,
        action: "pad",
        actor: "cli",
        revisionBefore: index,
        revisionAfter: index + 1,
      });
    }
    const { pruned } = await pruneActionLog(slug, { maxEntries: 4 });
    assert.equal(pruned, 4);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 4);
  });
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
