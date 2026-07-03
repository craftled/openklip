import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  acquireProjectFileLock,
  PROJECT_LOCK_STALE_MS,
} from "../src/project-file-lock.ts";
import { loadProject, mutateProject } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

// ── acquireProjectFileLock unit tests ────────────────────────────────────────

test("acquireProjectFileLock creates the lockfile and writes the pid", async () => {
  const dir = mkdtempSync(join(tmpdir(), "openklip-lock-test-"));
  const lockPath = join(dir, "project.json.lock");
  try {
    await acquireProjectFileLock(lockPath);
    assert.ok(existsSync(lockPath), "lockfile should exist after acquire");
    const content = readFileSync(lockPath, "utf8");
    assert.equal(content, String(process.pid));
    await unlink(lockPath);
    assert.ok(!existsSync(lockPath), "lockfile removed after unlink");
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      // best-effort cleanup
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("acquireProjectFileLock rejects non-EEXIST errors", async () => {
  // Acquire in a directory that does not exist: open("wx") fails with ENOENT,
  // which should propagate rather than be swallowed.
  const lockPath = "/nonexistent-dir-openklip/project.json.lock";
  await assert.rejects(
    () => acquireProjectFileLock(lockPath),
    (err: NodeJS.ErrnoException) => err.code === "ENOENT"
  );
});

// ── Stale-lock / blocking behaviour (mirrors agent-tasks.test.ts pattern) ────

test("a stale project.json lockfile (mtime > LOCK_STALE_MS) is broken rather than causing a timeout", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const lockPath = join(root, "projects", slug, "project.json.lock");
    // Simulate a crashed process: lockfile with mtime well past stale cutoff.
    writeFileSync(lockPath, "99999");
    const old = new Date(Date.now() - (PROJECT_LOCK_STALE_MS + 5000));
    utimesSync(lockPath, old, old);

    const result = await mutateProject(slug, (p) => {
      p.padMs = 100;
      return "ok";
    });
    assert.equal(result, "ok");
    // Lock is released once the mutation finishes.
    assert.equal(existsSync(lockPath), false);
  });
});

test("a fresh project.json lockfile blocks mutateProject until released", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const lockPath = join(root, "projects", slug, "project.json.lock");
    // Simulate another live process holding the lock (fresh mtime).
    writeFileSync(lockPath, String(process.pid + 1));

    let mutated = false;
    const pending = mutateProject(slug, (p) => {
      p.padMs = 200;
      return "done";
    }).then((v) => {
      mutated = true;
      return v;
    });

    // Give it 150 ms: should still be blocked on the file lock.
    await new Promise<void>((r) => setTimeout(r, 150));
    assert.equal(
      mutated,
      false,
      "mutateProject should still be blocked on the file lock"
    );

    // Release the lock.
    unlinkSync(lockPath);
    const result = await pending;
    assert.equal(result, "done");
    assert.equal(mutated, true);
    assert.equal(existsSync(lockPath), false);
  });
});

// ── Concurrent mutateProject correctness ─────────────────────────────────────

test("two concurrent mutateProject calls serialize: neither update is lost", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, padMs: 0 }));

    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // Both callers increment padMs after an async delay. Without serialization
    // one would read the pre-increment value and overwrite the other's write.
    const a = mutateProject(slug, async (p) => {
      await delay(20);
      p.padMs = (p.padMs ?? 0) + 1;
    });
    const b = mutateProject(slug, async (p) => {
      await delay(20);
      p.padMs = (p.padMs ?? 0) + 1;
    });

    await Promise.all([a, b]);

    const final = await loadProject(slug);
    assert.equal(
      final.padMs,
      2,
      "both increments must be serialized and saved"
    );
  });
});

test("lockfile is placed next to project.json and cleaned up after mutation", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const expectedLockPath = join(root, "projects", slug, "project.json.lock");

    let lockObservedDuring = false;
    await mutateProject(slug, (p) => {
      lockObservedDuring = existsSync(expectedLockPath);
      p.padMs = 99;
    });

    assert.ok(
      lockObservedDuring,
      "lockfile should exist while mutateProject runs"
    );
    assert.equal(
      existsSync(expectedLockPath),
      false,
      "lockfile cleaned up after mutation"
    );
  });
});
