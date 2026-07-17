import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { GET as LIST_JOBS } from "../app/api/projects/[slug]/silences/jobs/route.ts";
import { DEFAULT_SAMPLE_RATE } from "../src/audio-analysis-core.ts";
import { projectPaths } from "../src/paths.ts";
import {
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

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function req(path = "/x", extraHeaders?: HeadersInit) {
  return new Request(`http://localhost${path}`, { headers: extraHeaders });
}

async function pollUntilSettled(
  slug: string,
  id: string,
  maxTicks = 400
): Promise<void> {
  for (let i = 0; i < maxTicks; i += 1) {
    await tick();
    const res = await LIST_JOBS(req(), ctx(slug));
    const json = (await res.json()) as {
      jobs: { id: string; status: string }[];
    };
    const job = json.jobs.find((j) => j.id === id);
    if (job && job.status !== "running") {
      return;
    }
  }
  assert.fail(`silences job ${id} did not settle in time`);
}

test("GET list: 400 for an invalid slug", async () => {
  await withTempProjectsRoot(async () => {
    resetSilencesJobsForTests();
    const res = await LIST_JOBS(req(), ctx("Not Valid!"));
    assert.equal(res.status, 400);
  });
});

test("GET list: 404 for an unknown project", async () => {
  await withTempProjectsRoot(async () => {
    resetSilencesJobsForTests();
    const res = await LIST_JOBS(req(), ctx("no-such-project"));
    assert.equal(res.status, 404);
  });
});

test("GET list: returns an empty jobs array for a project with no jobs", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await LIST_JOBS(req(), ctx(slug));
    assert.equal(res.status, 200);
    const json = (await res.json()) as { jobs: unknown[] };
    assert.deepEqual(json.jobs, []);
  });
});

test("GET list: returns the project's silences jobs", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    writeAudio(slug, 1);
    const job = startSilencesJob(slug);

    const res = await LIST_JOBS(req(), ctx(slug));
    assert.equal(res.status, 200);
    const json = (await res.json()) as { jobs: { id: string }[] };
    assert.equal(json.jobs.length, 1);
    assert.equal(json.jobs[0]?.id, job.id);

    await pollUntilSettled(slug, job.id);
  });
});

// No trustGuard: this is a read-only GET, matching the sibling silences GETs.
test("GET list: no trust guard, an unrecognized origin still succeeds", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetSilencesJobsForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await LIST_JOBS(
      req("/x", { origin: "http://evil.example" }),
      ctx(slug)
    );
    assert.equal(res.status, 200);
  });
});
