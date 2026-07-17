import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { test } from "node:test";
import { DEFAULT_SAMPLE_RATE } from "../src/audio-analysis-core.ts";
import { projectPaths } from "../src/paths.ts";
import {
  cancelSilencesJob,
  deleteSilencesJobRecord,
  getSilencesJob,
  isSlugSilencesAnalysisInFlight,
  listSilencesJobs,
  resetSilencesJobsForTests,
  retrySilencesJob,
  startSilencesJob,
} from "../src/silences-jobs.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const SR = DEFAULT_SAMPLE_RATE;
const tick = () => new Promise((r) => setTimeout(r, 5));

function sinePcm(seconds: number, amplitude = 0.5): Float32Array {
  const total = SR * seconds;
  const pcm = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    pcm[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / SR);
  }
  return pcm;
}

interface OnDiskJob {
  id: string;
  progress?: unknown;
  status: string;
}

function readStore(slug: string): OnDiskJob[] {
  return (
    JSON.parse(readFileSync(projectPaths(slug).silencesJobs, "utf8")) as {
      jobs: OnDiskJob[];
    }
  ).jobs;
}

test("a silences job starts running, reports progress, then completes with spans", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(2);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const job = startSilencesJob(slug);
    assert.equal(job.status, "running");
    assert.equal(isSlugSilencesAnalysisInFlight(slug), true);

    for (let i = 0; i < 200; i++) {
      await tick();
      const current = getSilencesJob(job.id);
      if (current?.status === "done") {
        assert.ok(Array.isArray(current.silences));
        assert.equal(isSlugSilencesAnalysisInFlight(slug), false);
        return;
      }
    }
    assert.fail("job did not complete in time");
  });
});

test("a second start for the same slug returns the in-flight job", async () => {
  await withTempProjectsRoot(({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(2);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const first = startSilencesJob(slug);
    const second = startSilencesJob(slug);
    assert.equal(second.id, first.id);
    assert.equal(isSlugSilencesAnalysisInFlight(slug), true);
  });
});

test("silences job status transitions are persisted to the per-project job store", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(2);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const job = startSilencesJob(slug);
    for (let i = 0; i < 200; i++) {
      await tick();
      if (getSilencesJob(job.id)?.status === "done") {
        break;
      }
    }
    const persisted = readStore(slug).find((j) => j.id === job.id);
    assert.equal(persisted?.status, "done");
  });
});

test("progress ticks do not rewrite the persisted silences job store; only status transitions do", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(2);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const job = startSilencesJob(slug);
    for (let i = 0; i < 200; i++) {
      await tick();
      const record = readStore(slug).find((j) => j.id === job.id);
      if (record?.status === "running") {
        // Invariant, checked on every tick: while the on-disk record still
        // reads "running", progress must never have been persisted (a
        // write-through save only fires on create/status-transition, never
        // from the progress callback).
        assert.equal(record.progress, undefined);
      }
      if (getSilencesJob(job.id)?.status === "done") {
        const finalRecord = readStore(slug).find((j) => j.id === job.id);
        assert.equal(finalRecord?.status, "done");
        return;
      }
    }
    assert.fail("job did not complete in time");
  });
});

test("a silences job orphaned by a restart is reconciled to interrupted, not lost", async () => {
  await withTempProjectsRoot(({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const now = Date.now();
    const jobId = `${slug}~orphan-1`;
    const storePath = projectPaths(slug).silencesJobs;
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(
      storePath,
      JSON.stringify({
        jobs: [
          {
            id: jobId,
            slug,
            status: "running",
            createdAt: now,
            updatedAt: now,
          },
        ],
      })
    );

    // getSilencesJob is exactly what the poll route calls (by id alone, no
    // slug threaded through): it must return "interrupted", never undefined.
    const job = getSilencesJob(jobId);
    assert.equal(job?.status, "interrupted");
  });
});

async function pollSilencesUntilSettled(
  id: string,
  maxTicks = 400
): Promise<void> {
  for (let i = 0; i < maxTicks; i += 1) {
    await tick();
    if (getSilencesJob(id)?.status !== "running") {
      return;
    }
  }
  assert.fail(`silences job ${id} did not settle in time`);
}

// ── cancelSilencesJob: real, multi-chunk cancellation ──────────────────────
// analyzePcmChunked splits into PCM_CHUNK_SEC=120s chunks and checks the
// signal at the top of every chunk iteration. Measured empirically: pure-JS
// windowed-RMS analysis over already-in-memory/OS-cached PCM is fast enough
// that even a synthetic 600s (5-chunk) recording completes in under 20ms
// wall time end to end, so there is no reliable wall-clock window to cancel
// strictly "between" chunks. Cancelling synchronously, in the same tick
// startSilencesJob returns in, is still a deterministic proof the signal
// actually stops the loop rather than it eventually completing anyway:
// computeAudioAnalysis's first `await stat(...)` yields before doing any
// chunk work, so the abort() call below is guaranteed to land before
// analyzePcmChunked's first per-chunk aborted-check ever runs, and this
// still exercises the exact same signal plumbing a later-landing cancel
// would use.
test("cancelling a running silences job stops the chunk loop and lands in cancelled, not done", {
  timeout: 20_000,
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(600); // 5 chunks at PCM_CHUNK_SEC=120
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const job = startSilencesJob(slug);
    assert.equal(job.status, "running");
    // No await between start and cancel: see comment above for why this is
    // the deterministic window, not a race.
    assert.equal(cancelSilencesJob(job.id), true);

    await pollSilencesUntilSettled(job.id);
    assert.equal(getSilencesJob(job.id)?.status, "cancelled");
    assert.equal(getSilencesJob(job.id)?.error, "Cancelled by user");
    assert.equal(isSlugSilencesAnalysisInFlight(slug), false);
    // Never reached a "done" result: the chunked loop was stopped before
    // producing (or persisting) a silences array.
    assert.equal(getSilencesJob(job.id)?.silences, undefined);

    const persisted = readStore(slug).find((j) => j.id === job.id);
    assert.equal(persisted?.status, "cancelled");
  });
});

test("cancelSilencesJob returns false for an unknown job id", async () => {
  await withTempProjectsRoot(() => {
    resetSilencesJobsForTests();
    assert.equal(cancelSilencesJob("nope"), false);
  });
});

test("cancelSilencesJob returns false for a job that already finished", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(1);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );
    const job = startSilencesJob(slug);
    await pollSilencesUntilSettled(job.id);
    assert.equal(getSilencesJob(job.id)?.status, "done");
    assert.equal(cancelSilencesJob(job.id), false);
  });
});

// ── retrySilencesJob ────────────────────────────────────────────────────────
// No mocking needed: computeAudioAnalysis throws missingAudioRawError
// synchronously whenever audioRaw is absent, which is a clean, real way to
// force a first-run failure and then make retry succeed by supplying the
// audio before retrying.

test("retrySilencesJob re-runs a failed job to completion", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    // No audioRaw yet: the first run fails immediately.
    const job = startSilencesJob(slug);
    await pollSilencesUntilSettled(job.id);
    assert.equal(getSilencesJob(job.id)?.status, "error");

    const pcm = sinePcm(2);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const result = await retrySilencesJob(job.id);
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    await pollSilencesUntilSettled(result.job.id);
    assert.equal(getSilencesJob(result.job.id)?.status, "done");
    assert.ok(Array.isArray(getSilencesJob(result.job.id)?.silences));
  });
});

test("concurrent retrySilencesJob calls for the same job only run one analysis", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const job = startSilencesJob(slug);
    await pollSilencesUntilSettled(job.id);
    assert.equal(getSilencesJob(job.id)?.status, "error");

    const pcm = sinePcm(2);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const [r1, r2] = await Promise.all([
      retrySilencesJob(job.id),
      retrySilencesJob(job.id),
    ]);
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    if (!(r1.ok && r2.ok)) {
      return;
    }
    // startSilencesJob's own per-slug dedup means both retry calls resolve
    // to the SAME running job: only one computeAudioAnalysis was started.
    assert.equal(r1.job.id, r2.job.id);

    await pollSilencesUntilSettled(r1.job.id);
    assert.equal(getSilencesJob(r1.job.id)?.status, "done");
  });
});

test("retrySilencesJob returns an actionable error for an unknown job id", async () => {
  await withTempProjectsRoot(async () => {
    resetSilencesJobsForTests();
    const result = await retrySilencesJob("nope");
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.match(result.error, /not found/);
  });
});

test("retrySilencesJob refuses a still-running job", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(600);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );
    const job = startSilencesJob(slug);
    assert.equal(job.status, "running");
    const result = await retrySilencesJob(job.id);
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.match(result.error, /running/);
    cancelSilencesJob(job.id);
    await pollSilencesUntilSettled(job.id);
  });
});

test("retrySilencesJob refuses a job that already completed successfully", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(1);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );
    const job = startSilencesJob(slug);
    await pollSilencesUntilSettled(job.id);
    assert.equal(getSilencesJob(job.id)?.status, "done");

    const result = await retrySilencesJob(job.id);
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.match(result.error, /already completed/);
  });
});

// ── deleteSilencesJobRecord (clean-up) ─────────────────────────────────────

test("deleteSilencesJobRecord removes a terminal job from memory and the per-project store file", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(1);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );
    const job = startSilencesJob(slug);
    await pollSilencesUntilSettled(job.id);
    assert.equal(getSilencesJob(job.id)?.status, "done");

    assert.equal(deleteSilencesJobRecord(job.id), true);
    assert.equal(getSilencesJob(job.id), undefined);
    assert.equal(
      readStore(slug).some((j) => j.id === job.id),
      false
    );
  });
});

test("deleteSilencesJobRecord refuses a running job with an actionable error", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(600);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );
    const job = startSilencesJob(slug);
    assert.throws(() => deleteSilencesJobRecord(job.id), /still running/i);
    assert.equal(getSilencesJob(job.id)?.status, "running");
    cancelSilencesJob(job.id);
    await pollSilencesUntilSettled(job.id);
  });
});

test("deleteSilencesJobRecord returns false for an unknown job id", async () => {
  await withTempProjectsRoot(() => {
    resetSilencesJobsForTests();
    assert.equal(deleteSilencesJobRecord("nope"), false);
  });
});

// ── listSilencesJobs: per-project listing for the Job Center UI ───────────

test("listSilencesJobs returns an empty array for a project with no jobs", async () => {
  await withTempProjectsRoot(() => {
    resetSilencesJobsForTests();
    assert.deepEqual(listSilencesJobs("nope"), []);
  });
});

test("listSilencesJobs returns a freshly started job for its slug", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(1);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );
    const job = startSilencesJob(slug);
    const jobs = listSilencesJobs(slug);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.id, job.id);
    await pollSilencesUntilSettled(job.id);
  });
});

test("listSilencesJobs hydrates a project's persisted history on a cold Map miss (restart)", async () => {
  await withTempProjectsRoot(() => {
    resetSilencesJobsForTests();
    const now = Date.now();
    const jobId = "restart-slug~orphan-2";
    const storePath = projectPaths("restart-slug").silencesJobs;
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(
      storePath,
      JSON.stringify({
        jobs: [
          {
            id: jobId,
            slug: "restart-slug",
            status: "done",
            createdAt: now,
            updatedAt: now,
            silences: [],
          },
        ],
      })
    );
    // No prior getSilencesJob/startSilencesJob call for this slug in this
    // process: the Map has never been hydrated for it. listSilencesJobs must
    // hydrate on its own, the same way getSilencesJob does on a cold miss.
    const jobs = listSilencesJobs("restart-slug");
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.id, jobId);
    assert.equal(jobs[0]?.status, "done");
  });
});

test("listSilencesJobs only returns jobs belonging to the requested slug", async () => {
  await withTempProjectsRoot(async ({ slug: slugA }) => {
    resetSilencesJobsForTests();
    const slugB = `${slugA}-b`;
    writeFixtureProject(slugA, makeProject({ slug: slugA }));
    writeFixtureProject(slugB, makeProject({ slug: slugB }));
    const pcm = sinePcm(1);
    for (const slug of [slugA, slugB]) {
      writeFileSync(
        projectPaths(slug).audioRaw,
        Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
      );
    }
    const jobA = startSilencesJob(slugA);
    const jobB = startSilencesJob(slugB);
    const jobsA = listSilencesJobs(slugA);
    assert.equal(jobsA.length, 1);
    assert.equal(jobsA[0]?.id, jobA.id);
    await pollSilencesUntilSettled(jobA.id);
    await pollSilencesUntilSettled(jobB.id);
  });
});
