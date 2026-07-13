import assert from "node:assert/strict";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { GET as GET_JOB } from "../app/api/projects/[slug]/silences/[jobId]/route.ts";
import { GET } from "../app/api/projects/[slug]/silences/route.ts";
import { loadAudioAnalysis } from "../src/audio-analysis.ts";
import { DEFAULT_SAMPLE_RATE } from "../src/audio-analysis-core.ts";
import { projectPaths } from "../src/paths.ts";
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

function silencesRequest(slug: string) {
  return new Request(`http://localhost/api/projects/${slug}/silences`);
}

function routeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function jobRouteParams(slug: string, jobId: string) {
  return { params: Promise.resolve({ slug, jobId }) };
}

async function pollSilencesJob(slug: string, jobId: string) {
  for (let i = 0; i < 200; i++) {
    const res = await GET_JOB(
      new Request(`http://localhost/api/projects/${slug}/silences/${jobId}`),
      jobRouteParams(slug, jobId)
    );
    assert.equal(res.status, 200);
    const job = (await res.json()) as {
      status: string;
      silences?: { startSec: number; endSec: number }[];
    };
    if (job.status === "done") {
      return job;
    }
    if (job.status === "error") {
      assert.fail("silences job failed");
    }
    await tick();
  }
  assert.fail("silences job did not complete in time");
}

test("GET silences: cached analysis returns silence spans immediately", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(2);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );
    await loadAudioAnalysis(slug);

    const res = await GET(silencesRequest(slug), routeParams(slug));
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      jobId?: string;
      silences: { startSec: number; endSec: number }[];
    };
    assert.ok(Array.isArray(json.silences));
    assert.equal(json.jobId, undefined);
  });
});

test("GET silences: cold analysis starts a job and poll completes with spans", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(2);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const res = await GET(silencesRequest(slug), routeParams(slug));
    assert.equal(res.status, 200);
    const start = (await res.json()) as {
      jobId: string;
      status: string;
    };
    assert.equal(start.status, "running");
    assert.ok(start.jobId);

    const job = await pollSilencesJob(slug, start.jobId);
    assert.ok(Array.isArray(job.silences));
  });
});

test("GET silences: returns 404 when the project is missing", async () => {
  await withTempProjectsRoot(async () => {
    const res = await GET(
      silencesRequest("missing-project"),
      routeParams("missing-project")
    );
    assert.equal(res.status, 404);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /not found/i);
  });
});

test("GET silences: returns 404 when audio16k.f32 is missing", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    assert.ok(!existsSync(projectPaths(slug).audioRaw));

    const res = await GET(silencesRequest(slug), routeParams(slug));
    assert.equal(res.status, 404);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /audio16k\.f32|re-ingest/i);
    assert.equal(
      json.error?.includes(projectPaths(slug).audioRaw),
      false,
      `404 response leaked the absolute path: ${json.error}`
    );
  });
});

test("GET silences: a failed background job never echoes the absolute filesystem path (info-disclosure guard)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    writeFileSync(projectPaths(slug).audioRaw, Buffer.alloc(SR * 4));
    // A permission-denied audio16k.f32 forces a native fs error (EACCES) out
    // of computeAudioAnalysis's read instead of the handled "missing" 404 path.
    // Node/Bun format EACCES as `EACCES: permission denied, open
    // '<absolute path>'`, exercising the job runner's sanitized error branch.
    chmodSync(projectPaths(slug).audioRaw, 0o000);
    try {
      const res = await GET(silencesRequest(slug), routeParams(slug));
      assert.equal(res.status, 200);
      const start = (await res.json()) as { jobId: string };
      assert.ok(start.jobId);

      for (let i = 0; i < 200; i++) {
        const poll = await GET_JOB(
          new Request(
            `http://localhost/api/projects/${slug}/silences/${start.jobId}`
          ),
          jobRouteParams(slug, start.jobId)
        );
        assert.equal(poll.status, 200);
        const job = (await poll.json()) as { error?: string; status: string };
        if (job.status === "error") {
          assert.equal(
            job.error?.includes(projectPaths(slug).audioRaw),
            false,
            `job error leaked the absolute path: ${job.error}`
          );
          return;
        }
        await tick();
      }
      assert.fail("job did not reach error status in time");
    } finally {
      chmodSync(projectPaths(slug).audioRaw, 0o644);
    }
  });
});
