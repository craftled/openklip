import assert from "node:assert/strict";
import {
  existsSync,
  readdirSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  cancelAgentTask,
  completeAgentTask,
  createAgentTask,
  getAgentTask,
  listAgentTasks,
  loadAgentTasks,
  resetAgentTaskIdSequenceForTests,
  resetStartupTaskReconciliationForTests,
  saveAgentTasks,
  setAgentTaskStep,
} from "../src/agent-tasks.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

test("createAgentTask starts running with empty steps", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, {
      request: "Add a title",
      chatId: "th1",
    });
    assert.equal(task.status, "running");
    assert.deepEqual(task.steps, []);
    assert.equal(task.request, "Add a title");
    assert.equal(task.chatId, "th1");
    assert.equal(task.slug, slug);
    assert.ok(task.id);
    assert.ok(task.startedAt > 0);
    assert.equal(task.updatedAt, task.startedAt);
  });
});

test("setAgentTaskStep marks the prior running step done and appends a new one", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Cut filler words" });

    const afterFirst = await setAgentTaskStep(slug, task.id, {
      title: "Scan transcript",
    });
    assert.equal(afterFirst?.steps.length, 1);
    assert.equal(afterFirst?.steps[0]?.status, "running");
    assert.equal(afterFirst?.steps[0]?.title, "Scan transcript");

    const afterSecond = await setAgentTaskStep(slug, task.id, {
      title: "Cut words",
      note: "12 words removed",
    });
    assert.equal(afterSecond?.steps.length, 2);
    assert.equal(afterSecond?.steps[0]?.status, "done");
    assert.equal(afterSecond?.steps[1]?.status, "running");
    assert.equal(afterSecond?.steps[1]?.note, "12 words removed");
  });
});

test("completeAgentTask completed stores summary and marks the running step done", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Add captions" });
    await setAgentTaskStep(slug, task.id, { title: "Enable captions" });

    const done = await completeAgentTask(slug, task.id, {
      kind: "completed",
      summary: "Captions enabled",
    });
    assert.equal(done?.status, "completed");
    assert.equal(done?.summary, "Captions enabled");
    assert.equal(done?.steps[0]?.status, "done");
    assert.ok(done?.completedAt);

    // Idempotent: completing an already-terminal task is a no-op.
    const again = await completeAgentTask(slug, task.id, {
      kind: "completed",
      summary: "changed?",
    });
    assert.equal(again?.summary, "Captions enabled");
    assert.equal(again?.completedAt, done?.completedAt);
  });
});

test("completed outcome with remaining stays status completed (partial completion)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Full edit pass" });
    await setAgentTaskStep(slug, task.id, { title: "Cut filler" });

    const result = await completeAgentTask(slug, task.id, {
      kind: "completed",
      summary: "Cut filler words",
      remaining: ["Add b-roll", "Export"],
    });
    assert.equal(result?.status, "completed");
    assert.deepEqual(result?.remaining, ["Add b-roll", "Export"]);
  });
});

test("completeAgentTask blocked stores the question and leaves the running step running", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Pick a b-roll clip" });
    await setAgentTaskStep(slug, task.id, { title: "Looking for footage" });

    const blocked = await completeAgentTask(slug, task.id, {
      kind: "blocked",
      question: "Which b-roll clip should I use?",
    });
    assert.equal(blocked?.status, "blocked");
    assert.equal(blocked?.blockedQuestion, "Which b-roll clip should I use?");
    assert.equal(blocked?.steps[0]?.status, "running");
    assert.ok(blocked?.completedAt);
  });
});

test("completeAgentTask failed marks the running step failed", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Export the cut" });
    await setAgentTaskStep(slug, task.id, { title: "Render" });

    const failed = await completeAgentTask(slug, task.id, {
      kind: "failed",
      error: "ffmpeg exited with code 1",
    });
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.steps[0]?.status, "failed");
    assert.ok(failed?.completedAt);
  });
});

test("cancelAgentTask is terminal-safe and idempotent", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Long running task" });

    const cancelled = await cancelAgentTask(slug, task.id);
    assert.equal(cancelled?.status, "cancelled");
    assert.ok(cancelled?.completedAt);

    const again = await cancelAgentTask(slug, task.id);
    assert.equal(again?.status, "cancelled");
    assert.equal(again?.completedAt, cancelled?.completedAt);

    // Cancelling an already-completed task is a terminal-safe no-op.
    const other = await createAgentTask(slug, { request: "Another task" });
    await completeAgentTask(slug, other.id, {
      kind: "completed",
      summary: "ok",
    });
    const stillCompleted = await cancelAgentTask(slug, other.id);
    assert.equal(stillCompleted?.status, "completed");
  });
});

test("completeAgentTask on a cancelled task is a no-op that keeps status cancelled", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Cancel me" });

    const cancelled = await cancelAgentTask(slug, task.id);
    assert.equal(cancelled?.status, "cancelled");

    // Mirrors the chatWithAgent catch-path invariant: a run that was
    // cancelled by the user must not be flipped back to "failed"/"completed"
    // by a completeAgentTask call racing in from the (now stale) agent run.
    const result = await completeAgentTask(slug, task.id, {
      kind: "completed",
      summary: "should not apply",
    });
    assert.equal(result?.status, "cancelled");
    assert.equal(result?.summary, undefined);
    assert.equal(result?.completedAt, cancelled?.completedAt);
  });
});

test("createAgentTask truncates an oversized request to 2000 chars", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "r".repeat(2500) });
    assert.equal(task.request.length, 2000);
  });
});

test("setAgentTaskStep truncates an oversized title and note", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Do work" });
    const updated = await setAgentTaskStep(slug, task.id, {
      title: "t".repeat(250),
      note: "n".repeat(600),
    });
    assert.equal(updated?.steps[0]?.title.length, 200);
    assert.equal(updated?.steps[0]?.note?.length, 500);
  });
});

test("completeAgentTask truncates an oversized summary, question, and remaining list", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));

    const completedTask = await createAgentTask(slug, { request: "Task A" });
    const withSummary = await completeAgentTask(slug, completedTask.id, {
      kind: "completed",
      summary: "s".repeat(2500),
      remaining: Array.from({ length: 30 }, (_, i) =>
        `remaining-${i}`.padEnd(320, "x")
      ),
    });
    assert.equal(withSummary?.summary?.length, 2000);
    assert.equal(withSummary?.remaining?.length, 20);
    assert.ok(withSummary?.remaining?.every((item) => item.length <= 300));

    const blockedTask = await createAgentTask(slug, { request: "Task B" });
    const blocked = await completeAgentTask(slug, blockedTask.id, {
      kind: "blocked",
      question: "q".repeat(1500),
    });
    assert.equal(blocked?.blockedQuestion?.length, 1000);

    const failedTask = await createAgentTask(slug, { request: "Task C" });
    const failed = await completeAgentTask(slug, failedTask.id, {
      kind: "failed",
      error: "e".repeat(2500),
    });
    assert.equal(failed?.summary?.length, 2000);
  });
});

test("terminal tasks reject further step reports", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Task" });
    await completeAgentTask(slug, task.id, {
      kind: "completed",
      summary: "done",
    });

    const result = await setAgentTaskStep(slug, task.id, { title: "too late" });
    assert.equal(result, undefined);
  });
});

test("tasks persist across a fresh load", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Persisted task" });
    await setAgentTaskStep(slug, task.id, { title: "Step 1" });

    const reloaded = await loadAgentTasks(slug);
    assert.equal(reloaded.tasks.length, 1);
    assert.equal(reloaded.tasks[0]?.id, task.id);
    assert.equal(reloaded.tasks[0]?.steps.length, 1);

    const found = await getAgentTask(slug, task.id);
    assert.equal(found?.request, "Persisted task");

    const listed = await listAgentTasks(slug);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, task.id);
  });
});

test("corrupt tasks.json is backed up and surfaces an error instead of wiping", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const workingDir = join(root, "projects", slug, "working");
    writeFileSync(join(workingDir, "tasks.json"), "{not valid json");

    // loadAgentTasks must reject (not silently return empty), otherwise the
    // next mutation would persist {tasks: []} and destroy the history.
    await assert.rejects(loadAgentTasks(slug), /corrupt/i);

    const backups = readdirSync(workingDir).filter((f) =>
      f.startsWith("tasks.json.bad-")
    );
    assert.equal(backups.length, 1, "corrupt file should be backed up");

    // After the bad file is moved aside, the project recovers.
    const task = await createAgentTask(slug, { request: "Recovery task" });
    assert.equal(task.request, "Recovery task");
    const reloaded = await loadAgentTasks(slug);
    assert.equal(reloaded.tasks.length, 1);
  });
});

test("tasks.json containing literal null is backed up and recovers", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const workingDir = join(root, "projects", slug, "working");
    // JSON.parse("null") SUCCEEDS, so this must take the same
    // backup-and-throw recovery path as unparseable JSON rather than
    // throwing on `.tasks` access forever.
    writeFileSync(join(workingDir, "tasks.json"), "null");

    await assert.rejects(loadAgentTasks(slug), /corrupt/i);

    const backups = readdirSync(workingDir).filter((f) =>
      f.startsWith("tasks.json.bad-")
    );
    assert.equal(backups.length, 1, "corrupt file should be backed up");

    const task = await createAgentTask(slug, { request: "Recovered" });
    assert.equal(task.request, "Recovered");
  });
});

test("tasks.json containing a bare number is backed up and recovers", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const workingDir = join(root, "projects", slug, "working");
    writeFileSync(join(workingDir, "tasks.json"), "123");

    await assert.rejects(loadAgentTasks(slug), /corrupt/i);

    const backups = readdirSync(workingDir).filter((f) =>
      f.startsWith("tasks.json.bad-")
    );
    assert.equal(backups.length, 1, "corrupt file should be backed up");

    const task = await createAgentTask(slug, { request: "Recovered again" });
    assert.equal(task.request, "Recovered again");
  });
});

// ── Cross-process store lock (advisory lockfile next to tasks.json) ─────────

test("a stale tasks lockfile (older than 10s) is broken instead of deadlocking", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const lockPath = join(root, "projects", slug, "working", "tasks.json.lock");
    // Simulate a crashed process's leftover lock: an mtime well past the
    // 10s staleness cutoff.
    writeFileSync(lockPath, "99999");
    const old = new Date(Date.now() - 20_000);
    utimesSync(lockPath, old, old);

    const task = await createAgentTask(slug, { request: "Breaks stale lock" });
    assert.equal(task.status, "running");
    // The lock is released once the mutation finishes.
    assert.equal(existsSync(lockPath), false);
  });
});

test("a fresh tasks lockfile blocks mutations until released", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const lockPath = join(root, "projects", slug, "working", "tasks.json.lock");
    // Another live process holds the lock (fresh mtime).
    writeFileSync(lockPath, String(process.pid));

    let created = false;
    const pending = createAgentTask(slug, { request: "Waits for lock" }).then(
      (task) => {
        created = true;
        return task;
      }
    );
    await delay(150);
    assert.equal(created, false, "create should still be waiting on the lock");

    unlinkSync(lockPath);
    const task = await pending;
    assert.equal(task.request, "Waits for lock");
    assert.equal(existsSync(lockPath), false);
  });
});

test("concurrent step and cancel sequences settle without lost updates", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const a = await createAgentTask(slug, { request: "Task A" });
    const b = await createAgentTask(slug, { request: "Task B" });

    await Promise.all([
      setAgentTaskStep(slug, a.id, { title: "A step 1" }),
      setAgentTaskStep(slug, a.id, { title: "A step 2" }),
      cancelAgentTask(slug, b.id),
    ]);

    const storedA = await getAgentTask(slug, a.id);
    const storedB = await getAgentTask(slug, b.id);
    assert.equal(storedA?.steps.length, 2);
    assert.equal(storedA?.status, "running");
    assert.equal(storedB?.status, "cancelled");
  });
});

// ── Step cap ─────────────────────────────────────────────────────────────────

test("steps are capped at 50, dropping the oldest non-running steps first", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Loops forever" });

    for (let i = 0; i < 60; i += 1) {
      await setAgentTaskStep(slug, task.id, { title: `step ${i}` });
    }

    const stored = await getAgentTask(slug, task.id);
    assert.equal(stored?.steps.length, 50);
    // The live (running) step is the newest and always survives.
    assert.equal(stored?.steps.at(-1)?.title, "step 59");
    assert.equal(stored?.steps.at(-1)?.status, "running");
    // The oldest steps were dropped first.
    assert.equal(
      stored?.steps.some((s) => s.title === "step 0"),
      false
    );
    assert.equal(
      stored?.steps.some((s) => s.title === "step 10"),
      true
    );
  });
});

test("100-cap drops oldest terminal tasks past the cap", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));

    const ids: string[] = [];
    for (let i = 0; i < 105; i += 1) {
      const task = await createAgentTask(slug, { request: `req ${i}` });
      ids.push(task.id);
      await completeAgentTask(slug, task.id, {
        kind: "completed",
        summary: "done",
      });
    }

    const { tasks } = await loadAgentTasks(slug);
    assert.equal(tasks.length, 100);
    assert.ok(
      !tasks.some((t) => t.id === ids[0]),
      "oldest task should be dropped past the cap"
    );
    assert.ok(
      tasks.some((t) => t.id === ids.at(-1)),
      "newest task should remain"
    );
  });
});

test("loadAgentTasks finalizes running tasks once per process after server restart", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    resetStartupTaskReconciliationForTests();
    writeFixtureProject(slug, makeProject({ slug }));

    await saveAgentTasks(slug, {
      tasks: [
        {
          id: "task-stale",
          slug,
          request: "Stale run",
          status: "running",
          steps: [{ id: "s1", title: "Export", status: "running" }],
          startedAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const { tasks } = await loadAgentTasks(slug);
    assert.equal(tasks[0]?.status, "failed");
    assert.match(tasks[0]?.summary ?? "", /Server restarted/);
    assert.equal(tasks[0]?.steps[0]?.status, "failed");

    await saveAgentTasks(slug, {
      tasks: [
        {
          id: "task-live",
          slug,
          request: "Live run",
          status: "running",
          steps: [{ id: "s1", title: "Cut", status: "running" }],
          startedAt: 2,
          updatedAt: 2,
        },
      ],
    });

    const { tasks: again } = await loadAgentTasks(slug);
    assert.equal(again[0]?.status, "running");
  });
});
