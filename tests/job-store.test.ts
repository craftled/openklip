import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  type JobStoreConfig,
  type JobStoreRecord,
  loadJobRecords,
  resetJobStoreReconciliationForTests,
  saveJobRecord,
} from "../src/job-store.ts";

interface TestJob extends JobStoreRecord {
  status: "running" | "done" | "interrupted";
}

function isTestJob(value: unknown): value is TestJob {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.status === "string" &&
    typeof row.createdAt === "number" &&
    typeof row.updatedAt === "number"
  );
}

function config(filePath: string, cap = 100): JobStoreConfig<TestJob> {
  return {
    filePath,
    cap,
    terminalStatuses: new Set(["done", "interrupted"]),
    runningStatuses: new Set(["running"]),
    isRecord: isTestJob,
    reconcileRunning: (record, now) => ({
      ...record,
      status: "interrupted",
      updatedAt: now,
    }),
  };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "job-store-"));
}

test("saveJobRecord persists a status transition atomically; loadJobRecords reads it back", () => {
  const dir = tempDir();
  try {
    const filePath = join(dir, "jobs.json");
    const cfg = config(filePath);
    const now = Date.now();
    saveJobRecord(cfg, {
      id: "j1",
      status: "running",
      createdAt: now,
      updatedAt: now,
    });
    saveJobRecord(cfg, {
      id: "j1",
      status: "done",
      createdAt: now,
      updatedAt: now + 10,
    });

    const records = loadJobRecords(cfg);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.status, "done");
    assert.equal(records[0]?.updatedAt, now + 10);

    // Atomic write: no leftover tmp file after a successful save.
    const siblings = readdirSync(dir);
    assert.ok(!siblings.some((name) => name.includes(".tmp-")));
    const onDisk = JSON.parse(readFileSync(filePath, "utf8")) as {
      jobs: TestJob[];
    };
    assert.equal(onDisk.jobs[0]?.status, "done");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadJobRecords reconciles an on-disk running record to interrupted exactly once per process", () => {
  const dir = tempDir();
  try {
    const filePath = join(dir, "jobs.json");
    const cfg = config(filePath);
    const now = Date.now();
    // Simulate a process that crashed mid-job: the file was never written
    // through saveJobRecord's reconciliation path.
    writeFileSync(
      filePath,
      JSON.stringify({
        jobs: [{ id: "j1", status: "running", createdAt: now, updatedAt: now }],
      })
    );

    const first = loadJobRecords(cfg);
    assert.equal(first[0]?.status, "interrupted");
    const onDisk = JSON.parse(readFileSync(filePath, "utf8")) as {
      jobs: TestJob[];
    };
    assert.equal(onDisk.jobs[0]?.status, "interrupted");

    // The gate is now tripped for this filePath: a fresh "running" row
    // dropped in afterward is NOT auto-reconciled by a second load.
    writeFileSync(
      filePath,
      JSON.stringify({
        jobs: [{ id: "j2", status: "running", createdAt: now, updatedAt: now }],
      })
    );
    const second = loadJobRecords(cfg);
    assert.equal(second.find((r) => r.id === "j2")?.status, "running");

    // Resetting the gate (test-only) lets the next load reconcile again.
    resetJobStoreReconciliationForTests(filePath);
    const third = loadJobRecords(cfg);
    assert.equal(third.find((r) => r.id === "j2")?.status, "interrupted");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("retention caps terminal records and never evicts a running one", () => {
  const dir = tempDir();
  try {
    const filePath = join(dir, "jobs.json");
    const cfg = config(filePath, 3);
    const now = Date.now();
    saveJobRecord(cfg, {
      id: "running-1",
      status: "running",
      createdAt: now,
      updatedAt: now,
    });
    for (let i = 0; i < 5; i += 1) {
      saveJobRecord(cfg, {
        id: `done-${i}`,
        status: "done",
        createdAt: now + i,
        updatedAt: now + i,
      });
    }

    const records = loadJobRecords(cfg);
    assert.equal(records.length, 3);
    const ids = records.map((r) => r.id);
    assert.ok(
      ids.includes("running-1"),
      "running record must never be evicted"
    );
    assert.ok(ids.includes("done-4"), "newest terminal record kept");
    assert.ok(ids.includes("done-3"), "second-newest terminal record kept");
    assert.ok(!ids.includes("done-0"), "oldest terminal record evicted");
    assert.ok(!ids.includes("done-1"), "second-oldest terminal record evicted");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a corrupt store file is backed up and the store recovers to empty", () => {
  const dir = tempDir();
  try {
    const filePath = join(dir, "jobs.json");
    writeFileSync(filePath, "{not valid json");
    const cfg = config(filePath);

    const records = loadJobRecords(cfg);
    assert.deepEqual(records, []);

    const siblings = readdirSync(dir);
    assert.ok(
      siblings.some((name) => name.startsWith("jobs.json.bad-")),
      "corrupt file should be backed up aside, not discarded silently"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a store file with a non-array jobs field is backed up and recovers to empty", () => {
  const dir = tempDir();
  try {
    const filePath = join(dir, "jobs.json");
    writeFileSync(filePath, JSON.stringify({ jobs: "not-an-array" }));
    const cfg = config(filePath);

    const records = loadJobRecords(cfg);
    assert.deepEqual(records, []);
    const siblings = readdirSync(dir);
    assert.ok(siblings.some((name) => name.startsWith("jobs.json.bad-")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a malformed row is filtered out without discarding the well-formed rows", () => {
  const dir = tempDir();
  try {
    const filePath = join(dir, "jobs.json");
    const now = Date.now();
    writeFileSync(
      filePath,
      JSON.stringify({
        jobs: [
          { id: "good", status: "done", createdAt: now, updatedAt: now },
          { id: "bad-missing-fields" },
        ],
      })
    );
    const cfg = config(filePath);

    const records = loadJobRecords(cfg);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.id, "good");
    // A malformed row is filtered, not treated as file-level corruption: no
    // backup should be created for this case.
    const siblings = readdirSync(dir);
    assert.ok(!siblings.some((name) => name.startsWith("jobs.json.bad-")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
