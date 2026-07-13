import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_SAMPLE_RATE } from "../src/audio-analysis-core.ts";
import { projectPaths } from "../src/paths.ts";
import {
  getSilencesJob,
  isSlugSilencesAnalysisInFlight,
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

test("a silences job starts running, reports progress, then completes with spans", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
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
