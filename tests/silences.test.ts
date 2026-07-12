import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { GET } from "../app/api/projects/[slug]/silences/route.ts";
import { DEFAULT_SAMPLE_RATE } from "../src/audio-analysis-core.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const SR = DEFAULT_SAMPLE_RATE;

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

test("GET silences: returns analyzed silence spans for a valid project", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(2);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const res = await GET(silencesRequest(slug), routeParams(slug));
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      silences: { startSec: number; endSec: number }[];
    };
    assert.ok(Array.isArray(json.silences));
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
  });
});
