import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { POST } from "../app/api/projects/[slug]/rebuild/route.ts";
import { resetIngestJobsForTests } from "../src/ingest-jobs.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function req(method: string, path = "/x", extraHeaders?: HeadersInit) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: extraHeaders,
  });
}

test("POST /api/projects/:slug/rebuild starts a Job Center job and returns jobId", async () => {
  await withTempProjectsRoot(async ({ root, slug }) => {
    resetIngestJobsForTests();
    const sourcePath = join(root, "source.mp4");
    writeFileSync(sourcePath, "not-a-real-video");
    writeFixtureProject(slug, makeProject({ slug, source: sourcePath }));

    const res = await POST(req("POST"), ctx(slug));
    const data = (await res.json()) as { jobId?: string };

    assert.equal(res.status, 200);
    assert.ok(typeof data.jobId === "string" && data.jobId.length > 0);
  });
});

test("POST /api/projects/:slug/rebuild returns 404 for a missing project", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const res = await POST(req("POST"), ctx("missing"));
    assert.equal(res.status, 404);
  });
});

test("POST /api/projects/:slug/rebuild returns 400 for an invalid slug", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const res = await POST(req("POST"), ctx("../etc"));
    assert.equal(res.status, 400);
  });
});

test("POST /api/projects/:slug/rebuild: 403 when the trust guard rejects the request", async () => {
  await withTempProjectsRoot(async ({ root, slug }) => {
    resetIngestJobsForTests();
    const sourcePath = join(root, "source.mp4");
    writeFileSync(sourcePath, "not-a-real-video");
    writeFixtureProject(slug, makeProject({ slug, source: sourcePath }));

    const res = await POST(
      req("POST", "/x", { origin: "http://evil.example" }),
      ctx(slug)
    );
    assert.equal(res.status, 403);
  });
});
