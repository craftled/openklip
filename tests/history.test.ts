import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readActionLog } from "../src/action-log.ts";
import { projectPaths } from "../src/paths.ts";
import {
  listHistorySnapshotRevisions,
  loadProject,
  mutateProject,
  pruneHistorySnapshots,
} from "../src/projectStore.ts";
import { runAction } from "../src/registry.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

async function withoutActorEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.OPENKLIP_ACTOR;
  delete process.env.OPENKLIP_ACTOR;
  try {
    return await fn();
  } finally {
    if (prev === undefined) {
      delete process.env.OPENKLIP_ACTOR;
    } else {
      process.env.OPENKLIP_ACTOR = prev;
    }
  }
}

test("mutateProject with meta bumps revision 0 to 1 and appends one entry", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    await withoutActorEnv(async () => {
      writeFixtureProject(slug, makeProject({ slug }));
      await mutateProject(
        slug,
        (p) => {
          p.padMs = 10;
        },
        { action: "pad", input: { padMs: 10 } }
      );
      const project = await loadProject(slug);
      assert.equal(project.revision, 1);
      const entries = await readActionLog(slug);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].action, "pad");
      assert.equal(entries[0].actor, "human");
      assert.equal(entries[0].revisionBefore, 0);
      assert.equal(entries[0].revisionAfter, 1);
      assert.equal(typeof entries[0].at, "number");
    });
  });
});

test("a second meta mutation records revision 1 to 2, newest first", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "human" }
    );
    await mutateProject(
      slug,
      (p) => {
        p.captions.enabled = false;
      },
      { action: "captions", actor: "human" }
    );
    const project = await loadProject(slug);
    assert.equal(project.revision, 2);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].action, "captions");
    assert.equal(entries[0].revisionBefore, 1);
    assert.equal(entries[0].revisionAfter, 2);
    assert.equal(entries[1].action, "pad");
  });
});

test("mutateProject without meta neither bumps revision nor logs", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(slug, (p) => {
      p.padMs = 25;
    });
    const project = await loadProject(slug);
    assert.equal(project.padMs, 25);
    assert.equal(project.revision, undefined);
    assert.deepEqual(await readActionLog(slug), []);
  });
});

test("a throwing mutation logs nothing and leaves project.json unchanged", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const before = readFileSync(
      join(root, "projects", slug, "project.json"),
      "utf8"
    );
    await assert.rejects(
      mutateProject(
        slug,
        () => {
          throw new Error("boom");
        },
        { action: "pad", actor: "cli" }
      ),
      /boom/
    );
    const after = readFileSync(
      join(root, "projects", slug, "project.json"),
      "utf8"
    );
    assert.equal(after, before);
    assert.deepEqual(await readActionLog(slug), []);
  });
});

test("a failing action-log append never fails the edit", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // Occupy the log PATH with a directory so appendFile throws EISDIR.
    mkdirSync(projectPaths(slug).actionsLog, { recursive: true });
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "human", input: { padMs: 10 } }
    );
    // The edit and its revision bump saved; history is best-effort.
    const project = await loadProject(slug);
    assert.equal(project.padMs, 10);
    assert.equal(project.revision, 1);
    // The unreadable log reads back as an empty history rather than throwing.
    assert.deepEqual(await readActionLog(slug), []);
  });
});

test("the CLI logged-action shape records actor cli with the action name", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // Same delegation runLoggedAction in src/cli.ts uses (cli.ts runs its
    // command switch at module scope, so it cannot be imported in tests).
    const input = { ids: ["w0"], deleted: true };
    await mutateProject(slug, (p) => runAction("cut", p, input), {
      action: "cut",
      actor: "cli",
      input,
    });
    const project = await loadProject(slug);
    assert.equal(project.words[0].deleted, true);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "cut");
    assert.equal(entries[0].actor, "cli");
    assert.match(entries[0].input ?? "", /w0/);
  });
});

test("meta actor falls back to OPENKLIP_ACTOR when unset on the meta", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_ACTOR;
    process.env.OPENKLIP_ACTOR = "agent";
    try {
      await mutateProject(
        slug,
        (p) => {
          p.padMs = 15;
        },
        { action: "pad" }
      );
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_ACTOR;
      } else {
        process.env.OPENKLIP_ACTOR = prev;
      }
    }
    const entries = await readActionLog(slug);
    assert.equal(entries[0].actor, "agent");
  });
});

// ── HISTORY SNAPSHOTS: mutateProject writes a pre-mutation snapshot ─────────

test("a logged mutation writes rev-<revisionBefore>.json.gz with the pre-mutation project", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // loadProject runs the fixture through ProjectSchema.parse (adds field
    // defaults not present in the raw fixture literal), so compare the
    // snapshot against the PARSED pre-mutation state, not the raw fixture.
    const before = await loadProject(slug);
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 999;
      },
      { action: "pad", actor: "human", input: { padMs: 999 } }
    );
    const snapshotPath = join(projectPaths(slug).historyDir, "rev-0.json.gz");
    assert.ok(existsSync(snapshotPath), "expected a rev-0.json.gz snapshot");
    const { gunzipSync } = await import("node:zlib");
    const snapshot = JSON.parse(
      gunzipSync(readFileSync(snapshotPath)).toString("utf8")
    );
    assert.deepEqual(snapshot, before);
    // The live project moved on; the snapshot must not have.
    const loaded = await loadProject(slug);
    assert.equal(loaded.padMs, 999);
    assert.equal(snapshot.padMs, before.padMs);
  });
});

test("a second logged mutation writes rev-1.json.gz capturing the state after the first", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "human" }
    );
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 20;
      },
      { action: "pad", actor: "human" }
    );
    const dir = projectPaths(slug).historyDir;
    assert.ok(existsSync(join(dir, "rev-0.json.gz")));
    assert.ok(existsSync(join(dir, "rev-1.json.gz")));
    const { loadHistorySnapshot } = await import("../src/projectStore.ts");
    const rev1 = await loadHistorySnapshot(slug, 1);
    assert.equal(rev1.padMs, 10);
  });
});

test("an unlogged mutation (no meta) writes no snapshot", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(slug, (p) => {
      p.padMs = 25;
    });
    const dir = projectPaths(slug).historyDir;
    assert.ok(!existsSync(dir) || readdirSync(dir).length === 0);
  });
});

test("pruneHistorySnapshots keeps only the newest N by revision number", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const dir = projectPaths(slug).historyDir;
    mkdirSync(dir, { recursive: true });
    for (const rev of [0, 1, 2, 3, 4]) {
      writeFileSync(join(dir, `rev-${rev}.json.gz`), JSON.stringify({ rev }));
    }
    // Legacy plain file for rev 2 should prune with that revision group.
    writeFileSync(join(dir, "rev-2.json"), JSON.stringify({ rev: 2 }));
    await pruneHistorySnapshots(slug, 2);
    const remaining = readdirSync(dir).sort();
    assert.deepEqual(remaining, ["rev-3.json.gz", "rev-4.json.gz"]);
  });
});

test("pruneHistorySnapshots is a no-op when the history dir does not exist", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    await assert.doesNotReject(pruneHistorySnapshots(slug, 2));
  });
});

test("listHistorySnapshotRevisions returns the revisions that have a snapshot, ascending", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 1;
      },
      { action: "pad", actor: "human" }
    );
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 2;
      },
      { action: "pad", actor: "human" }
    );
    assert.deepEqual(listHistorySnapshotRevisions(slug), [0, 1]);
  });
});

test("listHistorySnapshotRevisions returns an empty array when no snapshots exist", async () => {
  await withTempProjectsRoot(({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    assert.deepEqual(listHistorySnapshotRevisions(slug), []);
  });
});

test("a failing snapshot write never fails the edit (best-effort, mirrors the log-append philosophy)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // Occupy the history dir PATH with a plain file so mkdir(recursive) throws.
    writeFileSync(projectPaths(slug).historyDir, "not-a-directory");
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "human" }
    );
    const project = await loadProject(slug);
    assert.equal(project.padMs, 10);
    assert.equal(project.revision, 1);
  });
});

test("loadHistorySnapshot reads legacy uncompressed rev-N.json", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, padMs: 42 }));
    const before = await loadProject(slug);
    const dir = projectPaths(slug).historyDir;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "rev-7.json"), JSON.stringify(before, null, 2));
    const { loadHistorySnapshot } = await import("../src/projectStore.ts");
    const loaded = await loadHistorySnapshot(slug, 7);
    assert.equal(loaded.padMs, before.padMs);
    assert.equal(loaded.slug, before.slug);
  });
});

test("snapshotRevisionFromFilename accepts .json and .json.gz", async () => {
  const { snapshotRevisionFromFilename } = await import(
    "../src/projectStore.ts"
  );
  assert.equal(snapshotRevisionFromFilename("rev-12.json"), 12);
  assert.equal(snapshotRevisionFromFilename("rev-12.json.gz"), 12);
  assert.equal(snapshotRevisionFromFilename("rev-12.json.tmp"), undefined);
  assert.equal(snapshotRevisionFromFilename("notes.txt"), undefined);
});
