import assert from "node:assert/strict";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
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
    assert.equal(
      json.error?.includes(projectPaths(slug).audioRaw),
      false,
      `404 response leaked the absolute path: ${json.error}`
    );
  });
});

test("GET silences: a 500 from analysis never echoes the absolute filesystem path (info-disclosure guard)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    writeFileSync(projectPaths(slug).audioRaw, Buffer.alloc(SR * 4));
    // A permission-denied audio16k.f32 forces a native fs error (EACCES) out
    // of loadAudioAnalysis's stat()/read instead of the handled "missing"
    // 404 path. Node/Bun format EACCES as `EACCES: permission denied, open
    // '<absolute path>'`, exercising the route's generic catch(e) -> 500
    // branch with an error whose message genuinely contains the path.
    chmodSync(projectPaths(slug).audioRaw, 0o000);
    try {
      const res = await GET(silencesRequest(slug), routeParams(slug));
      assert.equal(res.status, 500);
      const json = (await res.json()) as { error?: string };
      assert.equal(
        json.error?.includes(projectPaths(slug).audioRaw),
        false,
        `500 response leaked the absolute path: ${json.error}`
      );
    } finally {
      chmodSync(projectPaths(slug).audioRaw, 0o644);
    }
  });
});
