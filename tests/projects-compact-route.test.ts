import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { GET, POST } from "../app/api/projects/[slug]/compact/route.ts";
import { projectPaths } from "../src/paths.ts";
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

test("POST /api/projects/:slug/compact removes regenerable media and returns bytesFreed", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const p = projectPaths(slug);
    assert.equal(existsSync(p.proxy), true);

    const res = await POST(req("POST"), ctx(slug));
    const data = (await res.json()) as { bytesFreed?: number; ok?: boolean };

    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.ok((data.bytesFreed ?? 0) > 0);
    assert.equal(existsSync(p.proxy), false);
  });
});

test("POST /api/projects/:slug/compact returns 404 for a missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await POST(req("POST"), ctx("missing"));
    assert.equal(res.status, 404);
  });
});

test("POST /api/projects/:slug/compact returns 400 for an invalid slug", async () => {
  await withTempProjectsRoot(async () => {
    const res = await POST(req("POST"), ctx("../etc"));
    assert.equal(res.status, 400);
  });
});

test("POST /api/projects/:slug/compact: 403 when the trust guard rejects the request", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(
      req("POST", "/x", { origin: "http://evil.example" }),
      ctx(slug)
    );
    assert.equal(res.status, 403);
    assert.equal(existsSync(projectPaths(slug).proxy), true);
  });
});

test("GET /api/projects/:slug/compact reports compacted status", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const before = await GET(req("GET"), ctx(slug));
    const beforeData = (await before.json()) as { compacted?: boolean };
    assert.equal(beforeData.compacted, false);

    await POST(req("POST"), ctx(slug));

    const after = await GET(req("GET"), ctx(slug));
    const afterData = (await after.json()) as { compacted?: boolean };
    assert.equal(afterData.compacted, true);
  });
});

test("GET /api/projects/:slug/compact returns 404 for a missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await GET(req("GET"), ctx("missing"));
    assert.equal(res.status, 404);
  });
});
