import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { readActionLog } from "../src/action-log.ts";
import type { Project } from "../src/edl.ts";
import { projectPaths } from "../src/paths.ts";
import { loadProject, mutateProject } from "../src/projectStore.ts";
import { resolveRevertTarget, revertProject } from "../src/revert.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function bumpPad(
  slug: string,
  padMs: number,
  opts: { actor?: "human" | "cli" | "agent" | "mcp"; taskId?: string } = {}
) {
  return mutateProject(
    slug,
    (p) => {
      p.padMs = padMs;
    },
    {
      action: "pad",
      actor: opts.actor ?? "human",
      input: { padMs },
      taskId: opts.taskId,
    }
  );
}

// Touches several field kinds at once (padMs, captions, titles, broll) so a
// deep-equal comparison after revert actually exercises the wholesale
// replace, not just a single scalar that happens to round-trip.
function bumpMulti(
  slug: string,
  n: number,
  opts: { actor?: "human" | "cli" | "agent" | "mcp"; taskId?: string } = {}
) {
  return mutateProject(
    slug,
    (p) => {
      p.padMs = n * 10;
      p.captions.maxWords = n;
      p.titles.push({
        id: `title-${n}`,
        text: `Title ${n}`,
        startSample: 0,
        endSample: 1000,
      });
      p.broll.push({
        id: `broll-${n}`,
        assetId: "broll-a",
        startSample: 0,
        endSample: 1000,
      });
    },
    {
      action: "multi",
      actor: opts.actor ?? "human",
      input: { n },
      taskId: opts.taskId,
    }
  );
}

/** Deep-clone through JSON (matching how project.json round-trips) and drop
 * the revision counter, which a revert always bumps regardless of content. */
function stripRevision(project: Project): unknown {
  const clone = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
  clone.revision = undefined;
  return clone;
}

// ── resolveRevertTarget ──────────────────────────────────────────────────

test("resolveRevertTarget with {to} passes the revision through unchanged", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const result = await resolveRevertTarget(slug, { to: 3 });
    assert.deepEqual(result, { revision: 3 });
  });
});

test("resolveRevertTarget with {last:true} resolves to the newest revision-bumping entry's revisionBefore", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10);
    await bumpPad(slug, 20);
    const result = await resolveRevertTarget(slug, { last: true });
    assert.deepEqual(result, { revision: 1 });
  });
});

test("resolveRevertTarget with {last:true} skips brief-set entries (revisionBefore === revisionAfter)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10);
    const { logBriefSet } = await import("../src/brief-log.ts");
    await logBriefSet(slug, "human", "Some brief text");
    const result = await resolveRevertTarget(slug, { last: true });
    assert.deepEqual(result, { revision: 0 });
  });
});

test("resolveRevertTarget with {last:true} throws when there is no revertible action", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await assert.rejects(
      resolveRevertTarget(slug, { last: true }),
      /no logged edit to revert|history is empty/i
    );
  });
});

test("resolveRevertTarget with {task} resolves to the revisionBefore of the task's EARLIEST entry", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10, { actor: "agent", taskId: "task-1" });
    await bumpPad(slug, 20, { actor: "agent", taskId: "task-1" });
    const result = await resolveRevertTarget(slug, { task: "task-1" });
    assert.deepEqual(result, { revision: 0 });
  });
});

test("resolveRevertTarget with {task} throws for an unknown task id", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10, { actor: "agent", taskId: "task-1" });
    await assert.rejects(
      resolveRevertTarget(slug, { task: "no-such-task" }),
      /no logged actions found for task/i
    );
  });
});

test("resolveRevertTarget with {task} throws when a later, different-task edit would also be discarded", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10, { actor: "agent", taskId: "task-1" });
    await bumpPad(slug, 20, { actor: "agent", taskId: "task-1" });
    await bumpPad(slug, 30, { actor: "human" }); // interloper, no taskId
    await assert.rejects(
      resolveRevertTarget(slug, { task: "task-1" }),
      /would also discard|force/i
    );
  });
});

test("resolveRevertTarget with {task, force:true} proceeds despite a later interloping edit", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10, { actor: "agent", taskId: "task-1" });
    await bumpPad(slug, 20, { actor: "agent", taskId: "task-1" });
    await bumpPad(slug, 30, { actor: "human" });
    const result = await resolveRevertTarget(slug, {
      task: "task-1",
      force: true,
    });
    assert.deepEqual(result, { revision: 0 });
  });
});

test("resolveRevertTarget with {task} throws when an interloping edit is interleaved BETWEEN the task's own entries", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10, { actor: "agent", taskId: "task-1" }); // rev0 -> rev1
    await bumpPad(slug, 15, { actor: "human" }); // rev1 -> rev2, interloper interleaved
    await bumpPad(slug, 20, { actor: "agent", taskId: "task-1" }); // rev2 -> rev3
    await assert.rejects(
      resolveRevertTarget(slug, { task: "task-1" }),
      /would also discard|force/i
    );
  });
});

test("resolveRevertTarget with {task, force:true} proceeds despite an interleaved interloping edit", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10, { actor: "agent", taskId: "task-1" });
    await bumpPad(slug, 15, { actor: "human" });
    await bumpPad(slug, 20, { actor: "agent", taskId: "task-1" });
    const result = await resolveRevertTarget(slug, {
      task: "task-1",
      force: true,
    });
    assert.deepEqual(result, { revision: 0 });
  });
});

test("resolveRevertTarget with {task} does not throw when the later edit shares the same task", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10, { actor: "agent", taskId: "task-1" });
    await bumpPad(slug, 20, { actor: "agent", taskId: "task-1" });
    const result = await resolveRevertTarget(slug, { task: "task-1" });
    assert.deepEqual(result, { revision: 0 });
  });
});

// ── revertProject ─────────────────────────────────────────────────────────

test("revertProject --to restores a deep-equal project state (modulo revision) and logs a revert entry", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const original = await loadProject(slug);
    const originalSnapshot = stripRevision(original);
    await bumpMulti(slug, 1);
    await bumpMulti(slug, 2);

    const outcome = await revertProject(slug, { to: 0 }, { actor: "human" });
    assert.equal(outcome.restoredTo, 0);
    assert.equal(outcome.revision, 3);

    const reverted = await loadProject(slug);
    assert.equal(reverted.padMs, original.padMs);
    assert.equal(reverted.revision, 3);
    // Full-state comparison (revision excluded): catches a wholesale-replace
    // regression (subset copy, wrong clear/assign order) that a padMs-only
    // check would miss, since padMs alone can round-trip correctly even when
    // other fields (titles, broll, captions) are copied wrong or not at all.
    assert.deepEqual(stripRevision(reverted), originalSnapshot);

    const entries = await readActionLog(slug);
    assert.equal(entries[0].action, "revert");
    assert.equal(entries[0].actor, "human");
    assert.equal(entries[0].revisionBefore, 2);
    assert.equal(entries[0].revisionAfter, 3);
  });
});

test("revert of a revert returns to the pre-revert state", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpMulti(slug, 1); // rev0 -> rev1, snapshot rev-0 = original state
    await bumpMulti(slug, 2); // rev1 -> rev2, snapshot rev-1 = state after bumpMulti(1)
    const beforeFirstRevert = await loadProject(slug);
    const beforeFirstRevertSnapshot = stripRevision(beforeFirstRevert);

    await revertProject(slug, { to: 0 }, { actor: "human" }); // rev2 -> rev3, back to original; snapshot rev-2 = state right before this revert (== beforeFirstRevert)
    const afterFirstRevert = await loadProject(slug);
    assert.equal(afterFirstRevert.padMs, 50);

    await revertProject(slug, { to: 2 }, { actor: "human" }); // rev3 -> rev4, undoes the revert, restoring the state right before it
    const afterSecondRevert = await loadProject(slug);
    assert.equal(afterSecondRevert.padMs, beforeFirstRevert.padMs);
    assert.equal(afterSecondRevert.revision, 4);
    // Full-state comparison, not just padMs: proves the pre-revert state's
    // titles/broll/captions came back too, not only the scalar field.
    assert.deepEqual(
      stripRevision(afterSecondRevert),
      beforeFirstRevertSnapshot
    );
  });
});

test("revertProject with {task} reverts a multi-entry task", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const original = await loadProject(slug);
    await bumpPad(slug, 10, { actor: "agent", taskId: "task-1" });
    await bumpPad(slug, 20, { actor: "agent", taskId: "task-1" });

    const outcome = await revertProject(
      slug,
      { task: "task-1" },
      { actor: "human" }
    );
    assert.equal(outcome.restoredTo, 0);
    const reverted = await loadProject(slug);
    assert.equal(reverted.padMs, original.padMs);
  });
});

test("revertProject throws nothing-to-revert when the target equals the current revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10);
    await assert.rejects(
      revertProject(slug, { to: 1 }, { actor: "human" }),
      /nothing to revert/i
    );
  });
});

test("revertProject throws a clear error when the target snapshot is missing", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10);
    await assert.rejects(
      revertProject(slug, { to: 5 }, { actor: "human" }),
      /no snapshot for revision 5/i
    );
  });
});

test("revertProject records the taskId passed via opts on the revert entry", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10);
    await revertProject(
      slug,
      { to: 0 },
      { actor: "agent", taskId: "revert-task" }
    );
    const entries = await readActionLog(slug);
    assert.equal(entries[0].action, "revert");
    assert.equal(entries[0].taskId, "revert-task");
  });
});

// ── E1b: log-vs-project revision consistency guard ─────────────────────────

test("revertProject with {last} throws a clear error when the log tail is inconsistent with the project revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10); // rev0 -> rev1
    await bumpPad(slug, 20); // rev1 -> rev2
    await bumpPad(slug, 30); // rev2 -> rev3
    await bumpPad(slug, 40); // rev3 -> rev4

    // Simulate a crash mid-append (finding E1): project.json is at revision
    // 4, but the log on disk only shows entries up through revision 2 (the
    // rest were lost to a torn tail). Rewrite the log directly to model
    // this rather than the appendActionLog healing path, which only
    // protects the NEXT append, not history already lost before it landed.
    const entries = await readActionLog(slug);
    const survivors = entries.slice(2).reverse(); // oldest-first: the first two bumps
    writeFileSync(
      projectPaths(slug).actionsLog,
      `${survivors.map((e) => JSON.stringify(e)).join("\n")}\n`
    );

    await assert.rejects(
      revertProject(slug, { last: true }, { actor: "human" }),
      /inconsistent|use --to/i
    );

    // Refused before any write: project untouched at revision 4.
    const project = await loadProject(slug);
    assert.equal(project.revision, 4);
  });
});

test("revertProject with {task} also enforces the log-vs-project consistency guard", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10, { actor: "agent", taskId: "task-1" }); // rev0 -> rev1
    await bumpPad(slug, 20); // rev1 -> rev2

    const entries = await readActionLog(slug);
    const survivors = entries.slice(1).reverse();
    writeFileSync(
      projectPaths(slug).actionsLog,
      `${survivors.map((e) => JSON.stringify(e)).join("\n")}\n`
    );

    await assert.rejects(
      revertProject(slug, { task: "task-1" }, { actor: "human" }),
      /inconsistent|use --to/i
    );
  });
});

test("revertProject with explicit {to} bypasses the consistency guard and still applies", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10); // rev0 -> rev1
    await bumpPad(slug, 20); // rev1 -> rev2

    // Corrupt the log tail so it disagrees with the project revision.
    writeFileSync(projectPaths(slug).actionsLog, "");

    const outcome = await revertProject(slug, { to: 0 }, { actor: "human" });
    assert.equal(outcome.restoredTo, 0);
    const project = await loadProject(slug);
    assert.equal(project.padMs, 50); // makeProject's default, unbumped
  });
});

// ── E2: resolve-to-lock TOCTOU guard ────────────────────────────────────────

test("revertProject aborts with a clear error when the project changes between resolving the target and acquiring the lock", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await bumpPad(slug, 10); // rev0 -> rev1, snapshot rev-0
    await bumpPad(slug, 20); // rev1 -> rev2, snapshot rev-1

    await assert.rejects(
      revertProject(
        slug,
        { to: 0 },
        {
          actor: "human",
          // Test-only seam (see src/revert.ts): fires right before
          // revertProject enters mutateProject's lock, modeling an edit
          // that lands in the resolve -> lock window (a queued server
          // action, another tab, the folder sync).
          onBeforeApply: async () => {
            await bumpPad(slug, 30); // rev2 -> rev3
          },
        }
      ),
      /project changed while preparing the revert|retry/i
    );

    // Refused inside the lock before any save: the interleaved edit (rev 3,
    // padMs 30) survives untouched, not wholesale-overwritten.
    const project = await loadProject(slug);
    assert.equal(project.revision, 3);
    assert.equal(project.padMs, 30);
  });
});

// ── E3: refuse a revert across a multi-take assembly boundary ──────────────

test("revertProject refuses when the snapshot's source differs from the project's current source (assembly boundary)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, source: "/tmp/take-a.mp4" }));
    await bumpPad(slug, 10); // rev0 -> rev1, snapshot rev-0 has source take-a.mp4

    // Model an assemble: it replaces project.source wholesale along with the
    // working media (src/assembly.ts). We only need the source field
    // changed to exercise this guard.
    await mutateProject(
      slug,
      (p) => {
        p.source = "/tmp/assembled.mp4";
      },
      { action: "assemble", actor: "human", input: {} }
    ); // rev1 -> rev2

    await assert.rejects(
      revertProject(slug, { to: 0 }, { actor: "human" }),
      /source|assembly/i
    );

    // Refused before any write: project untouched, no "revert" entry logged.
    const project = await loadProject(slug);
    assert.equal(project.source, "/tmp/assembled.mp4");
    assert.equal(project.revision, 2);
    const entries = await readActionLog(slug);
    assert.equal(entries[0].action, "assemble");
  });
});

test("revertProject succeeds normally when the snapshot's source matches the current source", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, source: "/tmp/take-a.mp4" }));
    await bumpPad(slug, 10);
    await bumpPad(slug, 20);

    const outcome = await revertProject(slug, { to: 0 }, { actor: "human" });
    assert.equal(outcome.restoredTo, 0);
    const project = await loadProject(slug);
    assert.equal(project.source, "/tmp/take-a.mp4");
    assert.equal(project.padMs, 50); // makeProject's default, unbumped
  });
});
