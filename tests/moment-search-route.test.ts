import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GET, POST } from "../app/api/projects/[slug]/moment-search/route.ts";
import { shutdownEmbedService } from "../src/embed-service.ts";
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

const FAKE_EMBED_SCRIPT = fileURLToPath(
  new URL("./helpers/fake-embed-serve.mjs", import.meta.url)
);

// Points the warm embed worker (src/embed-service.ts, used by GET's real-query
// path) at a fake `serve` script (or, for the error-path test, a script path
// that doesn't exist at all) instead of the real embed.mjs, so a route test
// can exercise the actual embedText -> searchScenes -> Response.json wiring
// without a real CLIP model or network - see OPENKLIP_EMBED_SCRIPT_PATH in
// src/script-paths.ts. Always shuts the spawned worker down afterward so it
// doesn't leak past this test or answer a later test with a stale slug.
async function withFakeEmbedWorker<T>(
  fn: () => Promise<T>,
  scriptPath: string = FAKE_EMBED_SCRIPT
): Promise<T> {
  const prev = process.env.OPENKLIP_EMBED_SCRIPT_PATH;
  process.env.OPENKLIP_EMBED_SCRIPT_PATH = scriptPath;
  try {
    return await fn();
  } finally {
    await shutdownEmbedService();
    if (prev === undefined) {
      delete process.env.OPENKLIP_EMBED_SCRIPT_PATH;
    } else {
      process.env.OPENKLIP_EMBED_SCRIPT_PATH = prev;
    }
  }
}

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
// Only safe when the background work itself is expected to resolve near-
// instantly (e.g. buildMomentIndex's no-frames skip, which never spawns).
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

// Polls GET until the fire-and-forget build settles (building:false) or
// `timeoutMs` elapses. A real (if immediately-failing) child-process spawn
// takes measurably longer than one macrotask tick - unlike flush() above,
// this doesn't guess a fixed delay is enough.
async function waitUntilBuildSettled(
  slug: string,
  timeoutMs = 5000
): Promise<MomentSearchResponse> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await get(slug);
    const body = (await res.json()) as MomentSearchResponse;
    if (!body.building) {
      return body;
    }
    if (Date.now() >= deadline) {
      throw new Error(`build did not settle within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
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

test("GET surfaces the real build-failure message (not just a boolean), one-shot", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const mySlug = `${slug}-build-fails`;
    writeFixtureProject(mySlug, makeProject({ slug: mySlug }));
    const framesDir = projectPaths(mySlug).frames;
    mkdirSync(framesDir, { recursive: true });
    writeFileSync(join(framesDir, "0001.jpg"), "fake");

    // A script path that doesn't exist makes buildMomentIndex's own spawn
    // (the "index" subcommand, same OPENKLIP_EMBED_SCRIPT_PATH seam as the
    // "serve" subcommand used elsewhere in this file) exit non-zero.
    await withFakeEmbedWorker(async () => {
      const postRes = await post(mySlug);
      assert.equal(postRes.status, 200);

      const body = await waitUntilBuildSettled(mySlug);
      assert.equal(body.indexed, false);
      assert.equal(body.error, "moment index build failed");

      // One-shot: the next GET reverts to the plain not-indexed shape.
      const followUp = await get(mySlug);
      const followUpBody = (await followUp.json()) as MomentSearchResponse;
      assert.equal(followUpBody.error, undefined);
    }, "/nonexistent/embed-index.mjs");
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

test("GET with a real non-empty query against a current index embeds, searches, and returns a populated result", async () => {
  await withFakeEmbedWorker(async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      const mySlug = `${slug}-real-query`;
      writeFixtureProject(mySlug, makeProject({ slug: mySlug }));
      const framesDir = projectPaths(mySlug).frames;
      mkdirSync(framesDir, { recursive: true });
      writeFileSync(join(framesDir, "0001.jpg"), "fake");

      // The fake embed worker always returns [1, 0]; this frame vector is
      // identical, so the dot product is 1.0 - comfortably above both the
      // score floor and the peak-relative prune, guaranteeing a real match
      // through the full pipeline (embedText -> searchScenes -> response),
      // not just a coincidentally-empty result.
      const index = {
        version: 1 as const,
        model: MOMENT_MODEL,
        dim: 2,
        frameStepSec: 3,
        frames: [{ name: "0001.jpg", atSec: 0 }],
        vectorsB64: encodeVectors(new Float32Array([1, 0])),
      };
      writeFileSync(momentIndexPath(mySlug), JSON.stringify(index));

      const res = await get(mySlug, "?q=anything");
      assert.equal(res.status, 200);
      const body = (await res.json()) as MomentSearchResponse & {
        results: Array<{ fromSec: number; score: number }>;
      };
      assert.equal(body.indexed, true);
      assert.equal(body.building, false);
      assert.equal(body.results.length, 1);
      assert.equal(body.results[0].fromSec, 0);
      assert.ok(body.results[0].score > 0.9);
    });
  });
});

test("GET returns 500 with the underlying message when the embed worker fails", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const mySlug = `${slug}-embed-fails`;
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

    // A script path that doesn't exist: the spawned node process exits
    // immediately with an error, so the pending embed request rejects -
    // exercising GET's catch -> 500 branch with a real (if immediate)
    // subprocess failure rather than a mocked rejection.
    await withFakeEmbedWorker(async () => {
      const res = await get(mySlug, "?q=anything");
      assert.equal(res.status, 500);
      const body = (await res.json()) as { error?: string };
      assert.ok(body.error, "expected an error message in the response body");
    }, "/nonexistent/embed-serve.mjs");
  });
});
