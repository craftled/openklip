// Retry idempotency tests for src/ingest-jobs.ts's retryIngestJob. Kept in
// its own file (not tests/ingest-jobs.test.ts) because retryIngestJob has
// no mediaDeps override of its own (see its doc comment): it always calls
// the real, exported `ingest` from src/ingest.ts. The only way to make that
// call fast/controllable for a test is to mock.module the whole
// "../src/ingest.ts" export (house style, mirroring tests/cams.test.ts),
// which is a file-wide effect under `bun test --isolate` and would break
// tests/ingest-jobs.test.ts's real-ffmpeg cancellation test if they shared
// a file.
import { mock, test } from "bun:test";
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IngestProgress } from "../src/ingest-types.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

interface FakeIngestOpts {
  force?: boolean;
  onProgress?: (p: IngestProgress) => void;
  signal?: AbortSignal;
}

let ingestCallCount = 0;
let failNextCall = false;
let ingestedSlug = "retry-fixture";

mock.module("../src/ingest.ts", () => ({
  ingest: (_source: string, opts?: FakeIngestOpts) => {
    ingestCallCount += 1;
    return new Promise<string>((resolve, reject) => {
      // A microtask-scale delay (not synchronous) so a missing
      // exactly-once guard would have a real window to let two concurrent
      // calls both slip through, rather than the guard only "working" by
      // accident of everything happening in one synchronous tick.
      setTimeout(() => {
        opts?.onProgress?.({
          phase: "probe",
          message: "Reading video",
          step: 1,
          total: 7,
        });
        if (failNextCall) {
          failNextCall = false;
          reject(new Error("simulated ingest failure"));
          return;
        }
        writeFixtureProject(ingestedSlug, makeProject({ slug: ingestedSlug }));
        resolve(ingestedSlug);
      }, 10);
    });
  },
}));

const { ingest } = await import("../src/ingest.ts");
const {
  getIngestJob,
  resetIngestJobsForTests,
  retryIngestJob,
  startIngestJob,
} = await import("../src/ingest-jobs.ts");

const tick = () => new Promise((r) => setTimeout(r, 5));

async function pollUntilSettled(id: string, maxTicks = 200): Promise<void> {
  for (let i = 0; i < maxTicks; i += 1) {
    await tick();
    if (getIngestJob(id)?.status !== "running") {
      return;
    }
  }
  assert.fail(`job ${id} did not settle in time`);
}

function tempSourceFile(root: string, name = "source.mp4"): string {
  const p = join(root, name);
  writeFileSync(p, "fake-source-bytes");
  return p;
}

test("retryIngestJob re-runs a failed job to completion, calling ingest exactly once more (not doubled)", async () => {
  await withTempProjectsRoot(async ({ root }) => {
    resetIngestJobsForTests();
    ingestCallCount = 0;
    failNextCall = true;
    ingestedSlug = "retry-once";
    const sourcePath = tempSourceFile(root);

    const job = startIngestJob({
      filename: "source.mp4",
      slug: "placeholder",
      sourcePath,
      run: (onProgress, signal) => ingest(sourcePath, { onProgress, signal }),
    });
    await pollUntilSettled(job.id);
    assert.equal(getIngestJob(job.id)?.status, "error");
    assert.equal(ingestCallCount, 1);

    const result = await retryIngestJob(job.id);
    assert.equal(result.ok, true);
    // Flips the SAME job id back to running immediately (synchronously),
    // not a new job id.
    assert.equal(getIngestJob(job.id)?.status, "running");

    await pollUntilSettled(job.id);
    assert.equal(getIngestJob(job.id)?.status, "done");
    assert.equal(getIngestJob(job.id)?.slug, "retry-once");
    assert.equal(
      ingestCallCount,
      2,
      "retry must call ingest exactly once more, not doubled"
    );
  });
});

test("concurrent retryIngestJob calls for the same job only run ingest once", async () => {
  await withTempProjectsRoot(async ({ root }) => {
    resetIngestJobsForTests();
    ingestCallCount = 0;
    failNextCall = true;
    ingestedSlug = "retry-concurrent";
    const sourcePath = tempSourceFile(root);

    const job = startIngestJob({
      filename: "source.mp4",
      slug: "placeholder",
      sourcePath,
      run: (onProgress, signal) => ingest(sourcePath, { onProgress, signal }),
    });
    await pollUntilSettled(job.id);
    assert.equal(getIngestJob(job.id)?.status, "error");
    assert.equal(ingestCallCount, 1);

    const [r1, r2] = await Promise.all([
      retryIngestJob(job.id),
      retryIngestJob(job.id),
    ]);
    const okCount = [r1, r2].filter((r) => r.ok).length;
    assert.equal(
      okCount,
      1,
      "exactly one of the two concurrent retry calls should be accepted"
    );

    await pollUntilSettled(job.id);
    assert.equal(getIngestJob(job.id)?.status, "done");
    assert.equal(
      ingestCallCount,
      2,
      "only the accepted retry call actually invoked ingest (1 initial failure + 1 retry, not 2 retries)"
    );
  });
});

test("retryIngestJob refuses when the original source no longer exists on disk", async () => {
  await withTempProjectsRoot(async ({ root }) => {
    resetIngestJobsForTests();
    ingestCallCount = 0;
    failNextCall = true;
    const sourcePath = tempSourceFile(root, "gone.mp4");

    const job = startIngestJob({
      filename: "gone.mp4",
      slug: "placeholder",
      sourcePath,
      run: (onProgress, signal) => ingest(sourcePath, { onProgress, signal }),
    });
    await pollUntilSettled(job.id);
    assert.equal(getIngestJob(job.id)?.status, "error");

    rmSync(sourcePath);
    const result = await retryIngestJob(job.id);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /source no longer available/);
    assert.equal(
      getIngestJob(job.id)?.status,
      "error",
      "a refused retry must not touch the job's status"
    );
    assert.equal(ingestCallCount, 1, "a refused retry must not call ingest");
  });
});

test("retryIngestJob on a job interrupted by a restart also retries cleanly", async () => {
  await withTempProjectsRoot(async ({ root }) => {
    resetIngestJobsForTests();
    ingestCallCount = 0;
    failNextCall = false;
    ingestedSlug = "retry-interrupted";
    const sourcePath = tempSourceFile(root);

    const job = startIngestJob({
      filename: "source.mp4",
      slug: "placeholder",
      sourcePath,
      run: () => new Promise<string>(() => undefined),
    });
    // Simulate the CRAFT-6183 restart reconciliation landing this job in
    // "interrupted" (bypassing the real settle path, the way a process
    // restart would).
    const live = getIngestJob(job.id);
    assert.ok(live);
    live.status = "interrupted";

    const result = await retryIngestJob(job.id);
    assert.equal(result.ok, true);
    await pollUntilSettled(job.id);
    assert.equal(getIngestJob(job.id)?.status, "done");
    assert.equal(ingestCallCount, 1);
  });
});
