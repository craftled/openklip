import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { POST as CANCEL_JOB } from "../app/api/projects/[slug]/silences/[jobId]/cancel/route.ts";
import { POST as RETRY_JOB } from "../app/api/projects/[slug]/silences/[jobId]/retry/route.ts";
import {
  DELETE as DELETE_JOB,
  GET as GET_JOB,
} from "../app/api/projects/[slug]/silences/[jobId]/route.ts";
import { DEFAULT_SAMPLE_RATE } from "../src/audio-analysis-core.ts";
import { projectPaths } from "../src/paths.ts";
import {
  getSilencesJob,
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

function writeAudio(slug: string, seconds: number): void {
  const pcm = sinePcm(seconds);
  writeFileSync(
    projectPaths(slug).audioRaw,
    Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  );
}

function ctx(slug: string, jobId: string) {
  return { params: Promise.resolve({ slug, jobId }) };
}

function req(method: string, path = "/x", extraHeaders?: HeadersInit) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: extraHeaders,
  });
}

async function pollUntilSettled(id: string, maxTicks = 400): Promise<void> {
  for (let i = 0; i < maxTicks; i += 1) {
    await tick();
    if (getSilencesJob(id)?.status !== "running") {
      return;
    }
  }
  assert.fail(`job ${id} did not settle in time`);
}

test("POST cancel: 404 for a job id that belongs to a different (or no) slug", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await CANCEL_JOB(req("POST"), ctx(slug, "nope"));
    assert.equal(res.status, 404);
  });
});

test("POST cancel: cancels a running job and returns { ok: true }", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    writeAudio(slug, 600);
    const job = startSilencesJob(slug);

    const res = await CANCEL_JOB(req("POST"), ctx(slug, job.id));
    assert.equal(res.status, 200);
    const json = (await res.json()) as { ok: boolean };
    assert.equal(json.ok, true);

    await pollUntilSettled(job.id);
    assert.equal(getSilencesJob(job.id)?.status, "cancelled");
  });
});

test("POST cancel: 403 when the trust guard rejects the request", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    writeAudio(slug, 600);
    const job = startSilencesJob(slug);
    const res = await CANCEL_JOB(
      req("POST", "/x", { origin: "http://evil.example" }),
      ctx(slug, job.id)
    );
    assert.equal(res.status, 403);
    assert.equal(getSilencesJob(job.id)?.status, "running");
  });
});

test("POST retry: 409 with an actionable error for a still-running job", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    writeAudio(slug, 600);
    const job = startSilencesJob(slug);
    const res = await RETRY_JOB(req("POST"), ctx(slug, job.id));
    assert.equal(res.status, 409);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /running/);
  });
});

test("POST retry: retries a failed job and returns the (possibly new) running job", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    // No audioRaw yet: first run fails.
    const job = startSilencesJob(slug);
    await pollUntilSettled(job.id);
    assert.equal(getSilencesJob(job.id)?.status, "error");

    writeAudio(slug, 1);
    const res = await RETRY_JOB(req("POST"), ctx(slug, job.id));
    assert.equal(res.status, 200);
    const json = (await res.json()) as { job?: { id: string } };
    assert.ok(json.job?.id);
    if (!json.job) {
      return;
    }
    await pollUntilSettled(json.job.id);
    assert.equal(getSilencesJob(json.job.id)?.status, "done");
  });
});

test("POST retry: 403 when the trust guard rejects the request", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const job = startSilencesJob(slug);
    await pollUntilSettled(job.id);
    const res = await RETRY_JOB(
      req("POST", "/x", { origin: "http://evil.example" }),
      ctx(slug, job.id)
    );
    assert.equal(res.status, 403);
  });
});

test("GET job then DELETE: cleans up a terminal job, then GET 404s", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    writeAudio(slug, 1);
    const job = startSilencesJob(slug);
    await pollUntilSettled(job.id);

    const getRes = await GET_JOB(req("GET"), ctx(slug, job.id));
    assert.equal(getRes.status, 200);

    const delRes = await DELETE_JOB(req("DELETE"), ctx(slug, job.id));
    assert.equal(delRes.status, 200);
    const json = (await delRes.json()) as { ok: boolean };
    assert.equal(json.ok, true);

    const afterRes = await GET_JOB(req("GET"), ctx(slug, job.id));
    assert.equal(afterRes.status, 404);
  });
});

test("DELETE: 409 with an actionable error for a running job", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    writeAudio(slug, 600);
    const job = startSilencesJob(slug);
    const res = await DELETE_JOB(req("DELETE"), ctx(slug, job.id));
    assert.equal(res.status, 409);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /running/);
  });
});

test("DELETE: 403 when the trust guard rejects the request", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    writeAudio(slug, 1);
    const job = startSilencesJob(slug);
    await pollUntilSettled(job.id);
    const res = await DELETE_JOB(
      req("DELETE", "/x", { origin: "http://evil.example" }),
      ctx(slug, job.id)
    );
    assert.equal(res.status, 403);
    assert.equal(getSilencesJob(job.id)?.status, "done");
  });
});
