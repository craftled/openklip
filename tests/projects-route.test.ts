import { mock } from "bun:test";
import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../app/api/projects/route.ts";
import { getIngestJob, type IngestJob } from "../src/ingest-jobs.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

// Ingest now runs as a background job; poll the registry until it settles.
async function pollJob(id: string): Promise<IngestJob> {
  for (let i = 0; i < 100; i += 1) {
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

function ingestRequest(file?: File) {
  const form = new FormData();
  if (file) {
    form.append("file", file);
  }
  return new Request("http://localhost/api/projects", {
    method: "POST",
    body: form,
  }) as unknown as Parameters<typeof POST>[0];
}

test("GET /api/projects lists ingested projects", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = GET();
    assert.equal(res.status, 200);
    const json = (await res.json()) as Array<{ slug: string }>;
    assert.equal(json.length, 1);
    assert.equal(json[0]?.slug, slug);
  });
});

test("POST /api/projects returns 400 when file is missing", async () => {
  await withTempProjectsRoot(async () => {
    const res = await POST(ingestRequest());
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /missing file/i);
  });
});

test("POST /api/projects starts an ingest job and returns its id + slug", async () => {
  await withTempProjectsRoot(async () => {
    mock.module("@engine/ingest", () => ({
      ingest: async () => "uploaded-demo",
    }));

    const res = await POST(
      ingestRequest(new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" }))
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as { jobId?: string; slug?: string };
    assert.ok(json.jobId);
    assert.equal(json.slug, "clip"); // derived from the filename, returned now

    // The job runs the (mocked) ingest to completion.
    const done = await pollJob(json.jobId as string);
    assert.equal(done.status, "done");
    assert.equal(done.slug, "uploaded-demo");

    mock.restore();
  });
});

test("POST /api/projects returns 409 when the project already exists", async () => {
  await withTempProjectsRoot(async () => {
    // The same-slug guard fires synchronously before any work starts.
    writeFixtureProject("demo", makeProject({ slug: "demo" }));

    const res = await POST(
      ingestRequest(new File(["fake-bytes"], "demo.mp4", { type: "video/mp4" }))
    );
    assert.equal(res.status, 409);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /already exists/i);
  });
});

test("POST /api/projects?force=1 passes force through to ingest", async () => {
  await withTempProjectsRoot(async () => {
    let receivedForce: boolean | undefined;
    mock.module("@engine/ingest", () => ({
      ingest: (_video: string, opts?: { force?: boolean }) => {
        receivedForce = opts?.force;
        return "force-demo";
      },
    }));

    const form = new FormData();
    form.append("file", new File(["fake-bytes"], "demo.mp4"));
    const req = new Request("http://localhost/api/projects?force=1", {
      method: "POST",
      body: form,
    }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    assert.equal(res.status, 200);
    assert.equal(receivedForce, true);

    mock.restore();
  });
});
