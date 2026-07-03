import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createTakesPost,
  loadProjectIngestTake,
} from "../app/api/projects/[slug]/takes/route.ts";
import { listTakes } from "../src/assembly.ts";
import { SAMPLE_RATE, type Take } from "../src/edl.ts";
import { getIngestJob, type IngestJob } from "../src/ingest-jobs.ts";
import { takeDir, takeFile } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

// Ingest runs as a background job (mirrors tests/projects-route.test.ts); poll
// the registry until it settles.
async function pollJob(id: string): Promise<IngestJob> {
  for (let i = 0; i < 200; i += 1) {
    const job = getIngestJob(id);
    if (job && job.status !== "running") {
      return job;
    }
    await new Promise((r) => {
      setTimeout(r, 5);
    });
  }
  throw new Error("ingest job did not finish");
}

function takesRequest(
  slug: string,
  file?: File,
  extra?: Record<string, string>
) {
  const form = new FormData();
  if (file) {
    form.append("file", file);
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    form.append(key, value);
  }
  return new Request(`http://localhost/api/projects/${slug}/takes`, {
    method: "POST",
    body: form,
  }) as unknown as Request & { formData: () => Promise<FormData> };
}

function routeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function stubTake(overrides: Partial<Take> = {}): Take {
  return {
    id: "stub",
    label: "",
    source: "/tmp/stub-source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 320,
    height: 240,
    durationSamples: SAMPLE_RATE * 2,
    words: [
      {
        id: "w0",
        text: "hello",
        startSample: 0,
        endSample: SAMPLE_RATE,
        deleted: false,
      },
    ],
    ingestedAt: "2026-06-29T00:00:00.000Z",
    ...overrides,
  };
}

test("POST /api/projects/[slug]/takes starts a job that resolves and shows up via listTakes", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const seenVideoArgs: string[] = [];
    const post = createTakesPost({
      loadIngestTake: () =>
        Promise.resolve((projectSlug, videoArg, opts) => {
          seenVideoArgs.push(videoArg);
          const id = opts?.id ?? "stub";
          const take = stubTake({
            id,
            label: opts?.label ?? "",
            source: videoArg,
          });
          mkdirSync(takeDir(projectSlug, id), { recursive: true });
          writeFileSync(
            takeFile(projectSlug, id),
            JSON.stringify(take, null, 2)
          );
          return Promise.resolve(take);
        }),
    });

    const res = await post(
      takesRequest(
        slug,
        new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" })
      ) as never,
      routeParams(slug)
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      jobId?: string;
      slug?: string;
      takeId?: string;
    };
    assert.ok(json.jobId);
    assert.equal(json.takeId, "clip"); // derived from filename, matching CLI default

    const done = await pollJob(json.jobId as string);
    assert.equal(done.status, "done");

    const takes = await listTakes(slug);
    assert.equal(takes.length, 1);
    assert.equal(takes[0]?.id, "clip");

    // The ingest fn must have been called with a DURABLE path, not the temp
    // upload path (that dir is deleted once the job settles).
    const videoArg = seenVideoArgs[0] ?? "";
    assert.ok(!videoArg.includes("openklip-take-ingest-"));
    assert.ok(existsSync(videoArg), "durable source copy still exists");
  });
});

test("POST /api/projects/[slug]/takes returns 400 when file is missing", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const post = createTakesPost({ loadIngestTake: loadProjectIngestTake });
    const res = await post(takesRequest(slug) as never, routeParams(slug));
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /missing file/i);
  });
});

test("POST /api/projects/[slug]/takes rejects unsupported formats with actionable copy", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const post = createTakesPost({ loadIngestTake: loadProjectIngestTake });
    const res = await post(
      takesRequest(
        slug,
        new File(["hello"], "notes.txt", { type: "text/plain" })
      ) as never,
      routeParams(slug)
    );
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /unsupported/i);
    assert.match(json.error ?? "", /\.txt/);
    assert.match(json.error ?? "", /MP4, MOV, M4V, WebM, MKV, AVI/);
  });
});

test("POST /api/projects/[slug]/takes returns 404 for a nonexistent project", async () => {
  await withTempProjectsRoot(async () => {
    const post = createTakesPost({ loadIngestTake: loadProjectIngestTake });
    const res = await post(
      takesRequest(
        "does-not-exist",
        new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" })
      ) as never,
      routeParams("does-not-exist")
    );
    assert.equal(res.status, 404);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /not found/i);
  });
});

test("POST /api/projects/[slug]/takes returns 400 for an invalid slug", async () => {
  await withTempProjectsRoot(async () => {
    const post = createTakesPost({ loadIngestTake: loadProjectIngestTake });
    const res = await post(
      takesRequest(
        "../evil",
        new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" })
      ) as never,
      routeParams("../evil")
    );
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /invalid project slug/i);
  });
});

test("POST /api/projects/[slug]/takes rejects a hostile take id before touching disk", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const post = createTakesPost({ loadIngestTake: loadProjectIngestTake });
    const res = await post(
      takesRequest(
        slug,
        new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" }),
        { id: "../../evil" }
      ) as never,
      routeParams(slug)
    );
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /invalid/i);
  });
});

test("POST /api/projects/[slug]/takes cleans the temp upload and the durable copy when ingest fails", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const tempRoot = await mkdtemp(
      join(tmpdir(), "openklip-takes-route-test-")
    );
    try {
      const post = createTakesPost({
        loadIngestTake: () =>
          Promise.resolve(() => Promise.reject(new Error("probe failed"))),
        tempRoot,
      });
      const res = await post(
        takesRequest(
          slug,
          new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" })
        ) as never,
        routeParams(slug)
      );
      assert.equal(res.status, 200);
      const json = (await res.json()) as { jobId?: string };
      const done = await pollJob(json.jobId as string);
      assert.equal(done.status, "error");
      assert.match(done.error ?? "", /probe failed/);

      const leftoverTemp = (await readdir(tempRoot)).filter((n) =>
        n.startsWith("openklip-take-ingest-")
      );
      assert.deepEqual(leftoverTemp, []);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

test("POST /api/projects/[slug]/takes production ingest loader resolves the route import", async () => {
  const ingestTake = await loadProjectIngestTake();
  assert.equal(typeof ingestTake, "function");
});
