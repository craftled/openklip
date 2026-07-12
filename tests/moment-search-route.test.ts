import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { GET, POST } from "../app/api/projects/[slug]/moment-search/route.ts";
import {
  encodeVectors,
  MOMENT_MODEL,
  momentIndexPath,
} from "../src/moment-search.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

interface MomentSearchResponse {
  building: boolean;
  error?: boolean;
  indexed: boolean;
  results: unknown[];
}

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function get(slug: string, qs = "") {
  return GET(
    new Request(
      `http://localhost/api/projects/${slug}/moment-search${qs}`
    ) as Parameters<typeof GET>[0],
    ctx(slug)
  );
}

function post(slug: string) {
  return POST(
    new Request(`http://localhost/api/projects/${slug}/moment-search`, {
      method: "POST",
    }) as Parameters<typeof POST>[0],
    ctx(slug)
  );
}

// Flushes both the microtask queue and one macrotask tick, so a settled
// (but not yet `await`ed anywhere) promise chain - like the fire-and-forget
// buildMomentIndex().then()/.catch() the route starts on POST - has had a
// chance to run before the test reads state back out via a follow-up GET.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

test("GET returns 400 for an invalid slug", async () => {
  await withTempProjectsRoot(async () => {
    const res = await get("../etc");
    assert.equal(res.status, 400);
  });
});

test("GET returns 404 for a missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await get("no-such-project");
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "project not found: no-such-project");
  });
});

test("POST returns 404 for a missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await post("no-such-project-2");
    assert.equal(res.status, 404);
  });
});

test("GET returns indexed:false and building:false before any build has been requested", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const mySlug = `${slug}-idle`;
    writeFixtureProject(mySlug, makeProject({ slug: mySlug }));
    const res = await get(mySlug);
    assert.equal(res.status, 200);
    const body = (await res.json()) as MomentSearchResponse;
    assert.deepEqual(body, { indexed: false, building: false, results: [] });
  });
});

test("GET rejects a non-positive limit", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const mySlug = `${slug}-limit`;
    writeFixtureProject(mySlug, makeProject({ slug: mySlug }));
    const res = await get(mySlug, "?limit=0");
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "limit must be a positive integer when provided");
  });
});

test("GET rejects a non-integer limit", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const mySlug = `${slug}-limit-2`;
    writeFixtureProject(mySlug, makeProject({ slug: mySlug }));
    const res = await get(mySlug, "?limit=abc");
    assert.equal(res.status, 400);
  });
});

test("POST responds building:true, and a follow-up GET reflects it settling back to false once the (frameless) build resolves", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const mySlug = `${slug}-build`;
    writeFixtureProject(mySlug, makeProject({ slug: mySlug }));

    const postRes = await post(mySlug);
    assert.equal(postRes.status, 200);
    const postBody = (await postRes.json()) as { building: boolean };
    assert.equal(postBody.building, true);

    // No frames exist, so buildMomentIndex resolves via its no-frames skip
    // path without ever spawning a process; flush so the route's settle
    // handler (which clears the in-flight marker) has run.
    await flush();

    const getRes = await get(mySlug);
    assert.equal(getRes.status, 200);
    const getBody = (await getRes.json()) as MomentSearchResponse;
    assert.equal(getBody.building, false);
    assert.equal(getBody.indexed, false);
  });
});

test("a second POST while a build is already in flight does not error", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const mySlug = `${slug}-double-post`;
    writeFixtureProject(mySlug, makeProject({ slug: mySlug }));

    const first = await post(mySlug);
    const second = await post(mySlug);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as { building: boolean };
    assert.equal(secondBody.building, true);

    await flush();
  });
});

test("GET reports indexed:true with empty results for an empty query against a current index, without embedding", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const mySlug = `${slug}-current`;
    writeFixtureProject(mySlug, makeProject({ slug: mySlug }));
    const framesDir = projectPaths(mySlug).frames;
    mkdirSync(framesDir, { recursive: true });
    writeFileSync(join(framesDir, "0001.jpg"), "fake");

    const index = {
      version: 1 as const,
      model: MOMENT_MODEL,
      dim: 2,
      frameStepSec: 3,
      frames: [{ name: "0001.jpg", atSec: 0 }],
      vectorsB64: encodeVectors(new Float32Array([1, 0])),
    };
    writeFileSync(momentIndexPath(mySlug), JSON.stringify(index));

    // No `q` param at all: the same "status check" shape the panel's poll
    // loop uses while waiting for indexing to finish.
    const res = await get(mySlug);
    assert.equal(res.status, 200);
    const body = (await res.json()) as MomentSearchResponse;
    assert.deepEqual(body, { indexed: true, building: false, results: [] });
  });
});

test("GET treats a blank/whitespace-only query the same as an absent one", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const mySlug = `${slug}-blank-q`;
    writeFixtureProject(mySlug, makeProject({ slug: mySlug }));
    const framesDir = projectPaths(mySlug).frames;
    mkdirSync(framesDir, { recursive: true });
    writeFileSync(join(framesDir, "0001.jpg"), "fake");

    const index = {
      version: 1 as const,
      model: MOMENT_MODEL,
      dim: 2,
      frameStepSec: 3,
      frames: [{ name: "0001.jpg", atSec: 0 }],
      vectorsB64: encodeVectors(new Float32Array([1, 0])),
    };
    writeFileSync(momentIndexPath(mySlug), JSON.stringify(index));

    const res = await get(mySlug, `?q=${encodeURIComponent("   ")}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as MomentSearchResponse;
    assert.deepEqual(body, { indexed: true, building: false, results: [] });
  });
});
