import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { test } from "node:test";
import {
  getIngestJob,
  isSlugInFlight,
  resetIngestJobsForTests,
  startIngestJob,
} from "../src/ingest-jobs.ts";
import type { IngestProgress } from "../src/ingest-types.ts";
import { ingestJobsStorePath } from "../src/paths.ts";
import { withTempProjectsRoot } from "./helpers/projectFixture.ts";

const tick = () => new Promise((r) => setTimeout(r, 5));

const progress = (step: number): IngestProgress => ({
  phase: "proxy",
  message: "Building 720p preview",
  step,
  total: 6,
});

interface OnDiskJob {
  id: string;
  progress?: unknown;
  status: string;
}

function readStore(): OnDiskJob[] {
  return (
    JSON.parse(readFileSync(ingestJobsStorePath(), "utf8")) as {
      jobs: OnDiskJob[];
    }
  ).jobs;
}

test("a job starts running, reports progress, then completes with a slug", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    let report: ((p: IngestProgress) => void) | null = null;
    let finish: ((slug: string) => void) | null = null;
    const job = startIngestJob({
      filename: "talk.mp4",
      slug: "talk",
      run: (onProgress) => {
        report = onProgress;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    });

    assert.equal(job.status, "running");
    assert.equal(isSlugInFlight("talk"), true);

    report?.(progress(2));
    assert.equal(getIngestJob(job.id)?.progress?.step, 2);

    finish?.("talk");
    await tick();
    assert.equal(getIngestJob(job.id)?.status, "done");
    assert.equal(getIngestJob(job.id)?.slug, "talk");
    assert.equal(isSlugInFlight("talk"), false);
  });
});

test("a failing run lands the job in error and clears the in-flight lock", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "bad.mp4",
      slug: "bad",
      run: () => Promise.reject(new Error("transcode failed")),
    });
    await tick();
    assert.equal(getIngestJob(job.id)?.status, "error");
    assert.equal(getIngestJob(job.id)?.error, "transcode failed");
    assert.equal(isSlugInFlight("bad"), false);
  });
});

test("job status transitions are persisted to the workspace-level ingest job store", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "clip.mp4",
      slug: "clip",
      run: () => Promise.resolve("clip"),
    });
    await tick();
    assert.equal(getIngestJob(job.id)?.status, "done");

    const persisted = readStore().find((j) => j.id === job.id);
    assert.equal(persisted?.status, "done");
  });
});

test("progress ticks do not rewrite the persisted store; only status transitions do", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    let report: ((p: IngestProgress) => void) | null = null;
    let finish: ((slug: string) => void) | null = null;
    const job = startIngestJob({
      filename: "reel.mp4",
      slug: "reel",
      run: (onProgress) => {
        report = onProgress;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    });
    await tick();
    const createdRecord = readStore().find((j) => j.id === job.id);
    assert.equal(createdRecord?.status, "running");
    assert.equal(createdRecord?.progress, undefined);

    for (let i = 1; i <= 5; i += 1) {
      report?.(progress(i));
      await tick();
    }
    // The on-disk record is byte-for-byte unchanged since creation: progress
    // ticks never triggered a write-through save, only CREATE and status
    // transitions do.
    const stillRecord = readStore().find((j) => j.id === job.id);
    assert.deepEqual(stillRecord, createdRecord);
    // Meanwhile the in-memory read (the poll hot path) IS live.
    assert.equal(getIngestJob(job.id)?.progress?.step, 5);

    finish?.("reel");
    await tick();
    const doneRecord = readStore().find((j) => j.id === job.id);
    assert.equal(doneRecord?.status, "done");
  });
});

test("a running job orphaned by a restart is reconciled to interrupted, not lost", async () => {
  await withTempProjectsRoot(() => {
    resetIngestJobsForTests();
    // Simulate a job left "running" when the process died: write the store
    // file directly, bypassing the write-through path entirely.
    const now = Date.now();
    const orphanedId = "orphan-job-1";
    const storePath = ingestJobsStorePath();
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(
      storePath,
      JSON.stringify({
        jobs: [
          {
            id: orphanedId,
            filename: "old.mp4",
            slug: "old",
            status: "running",
            createdAt: now,
            updatedAt: now,
          },
        ],
      })
    );

    // getIngestJob is exactly what the poll route calls: it must return the
    // record as "interrupted", never undefined (which the route would turn
    // into a 404 the client reads as "Ingest job lost").
    const job = getIngestJob(orphanedId);
    assert.equal(job?.status, "interrupted");
    assert.notEqual(job?.status, undefined);
  });
});
