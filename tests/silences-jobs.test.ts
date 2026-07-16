import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { test } from "node:test";
import { DEFAULT_SAMPLE_RATE } from "../src/audio-analysis-core.ts";
import { projectPaths } from "../src/paths.ts";
import {
  getSilencesJob,
  isSlugSilencesAnalysisInFlight,
  resetSilencesJobsForTests,
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
