import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createCamsPost,
  loadProjectIngestCam,
} from "../app/api/projects/[slug]/cams/route.ts";
import { type Cam, listCams } from "../src/cams.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { getIngestJob, type IngestJob } from "../src/ingest-jobs.ts";
import { camDir, camFile } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

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

function camsRequest(
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
  return new Request(`http://localhost/api/projects/${slug}/cams`, {
    method: "POST",
    body: form,
  }) as unknown as Request & { formData: () => Promise<FormData> };
}

function routeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function stubCam(overrides: Partial<Cam> = {}): Cam {
  return {
    id: "cam1",
    name: "Speaker 1",
    role: "speaker",
    source: "/tmp/stub-source.mp4",
    proxy: "proxy.mp4",
    audio: "audio16k.f32",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 320,
    height: 240,
    durationSamples: SAMPLE_RATE * 2,
    offsetMs: 0,
    ingestedAt: "2026-06-29T00:00:00.000Z",
    ...overrides,
  };
}

test("POST /api/projects/[slug]/cams starts a job that resolves and shows up via listCams", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const seenVideoArgs: string[] = [];
    const post = createCamsPost({
      loadIngestCam: () =>
        Promise.resolve({
          listCams: () => Promise.resolve([]),
          nextCamId: () => "cam1",
          ingestCam: (projectSlug, videoArg, opts) => {
            seenVideoArgs.push(videoArg);
            const id = opts?.id ?? "cam1";
            const cam = stubCam({
              id,
              name: opts?.name ?? "Speaker 1",
              role: opts?.role ?? "speaker",
              offsetMs: opts?.offsetMs ?? 0,
              source: videoArg,
            });
            mkdirSync(camDir(projectSlug, id), { recursive: true });
            writeFileSync(
              camFile(projectSlug, id),
              JSON.stringify(cam, null, 2)
            );
            return Promise.resolve(cam);
          },
        }),
    });

    const res = await post(
      camsRequest(
        slug,
        new File(["fake-bytes"], "angle.mp4", { type: "video/mp4" })
      ) as never,
      routeParams(slug)
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      jobId?: string;
      slug?: string;
      camId?: string;
    };
    assert.ok(json.jobId);
    assert.equal(json.camId, "cam1");

    const done = await pollJob(json.jobId as string);
    assert.equal(done.status, "done");

    const cams = await listCams(slug);
    assert.equal(cams.length, 1);
    assert.equal(cams[0]?.id, "cam1");

    const videoArg = seenVideoArgs[0] ?? "";
    assert.ok(!videoArg.includes("openklip-cam-ingest-"));
    assert.ok(existsSync(videoArg), "durable source copy still exists");
  });
});

test("POST /api/projects/[slug]/cams returns 400 when file is missing", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const post = createCamsPost({ loadIngestCam: loadProjectIngestCam });
    const res = await post(camsRequest(slug) as never, routeParams(slug));
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /missing file/i);
  });
});

test("POST /api/projects/[slug]/cams rejects unsupported formats", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const post = createCamsPost({ loadIngestCam: loadProjectIngestCam });
    const res = await post(
      camsRequest(
        slug,
        new File(["hello"], "notes.txt", { type: "text/plain" })
      ) as never,
      routeParams(slug)
    );
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /unsupported/i);
  });
});

test("POST /api/projects/[slug]/cams returns 404 for a nonexistent project", async () => {
  await withTempProjectsRoot(async () => {
    const post = createCamsPost({ loadIngestCam: loadProjectIngestCam });
    const res = await post(
      camsRequest(
        "does-not-exist",
        new File(["fake-bytes"], "angle.mp4", { type: "video/mp4" })
      ) as never,
      routeParams("does-not-exist")
    );
    assert.equal(res.status, 404);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /not found/i);
  });
});

test("POST /api/projects/[slug]/cams rejects invalid role", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const post = createCamsPost({ loadIngestCam: loadProjectIngestCam });
    const res = await post(
      camsRequest(
        slug,
        new File(["fake-bytes"], "angle.mp4", { type: "video/mp4" }),
        { role: "gallery" }
      ) as never,
      routeParams(slug)
    );
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /role must be speaker or wide/i);
  });
});

test("POST /api/projects/[slug]/cams cleans temp upload when ingest fails", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const tempRoot = await mkdtemp(join(tmpdir(), "openklip-cams-route-test-"));
    try {
      const post = createCamsPost({
        loadIngestCam: () =>
          Promise.resolve({
            listCams: () => Promise.resolve([]),
            nextCamId: () => "cam1",
            ingestCam: () => Promise.reject(new Error("probe failed")),
          }),
        tempRoot,
      });
      const res = await post(
        camsRequest(
          slug,
          new File(["fake-bytes"], "angle.mp4", { type: "video/mp4" })
        ) as never,
        routeParams(slug)
      );
      assert.equal(res.status, 200);
      const json = (await res.json()) as { jobId?: string };
      const done = await pollJob(json.jobId as string);
      assert.equal(done.status, "error");
      assert.match(done.error ?? "", /probe failed/);

      const leftoverTemp = (await readdir(tempRoot)).filter((n) =>
        n.startsWith("openklip-cam-ingest-")
      );
      assert.deepEqual(leftoverTemp, []);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

test("POST /api/projects/[slug]/cams production ingest loader resolves", async () => {
  const mod = await loadProjectIngestCam();
  assert.equal(typeof mod.ingestCam, "function");
  assert.equal(typeof mod.listCams, "function");
  assert.equal(typeof mod.nextCamId, "function");
});
