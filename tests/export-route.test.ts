import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../app/api/projects/[slug]/export/route.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

// Build a standard Request; Next's NextRequest is structurally compatible for
// the .json() call the handler makes.
function exportRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

test("export route returns 404 for a missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await POST(exportRequest({}), ctx("missing"));
    assert.equal(res.status, 404);
  });
});

test("export route returns 400 for an invalid slug", async () => {
  await withTempProjectsRoot(async () => {
    const res = await POST(exportRequest({}), ctx("../../etc"));
    assert.equal(res.status, 400);
  });
});

test("export route returns 400 for an invalid height", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(exportRequest({ height: -10 }), ctx(slug));
    assert.equal(res.status, 400);
  });
});

test("export route returns 400 for a non-numeric height", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(exportRequest({ height: "tall" }), ctx(slug));
    assert.equal(res.status, 400);
  });
});

test("export route returns 400 for an unknown compression preset", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(exportRequest({ compression: "ultra" }), ctx(slug));
    assert.equal(res.status, 400);
  });
});

test("export route returns 400 for a negative fps", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(exportRequest({ fps: -1 }), ctx(slug));
    assert.equal(res.status, 400);
  });
});

test("export route returns 400 for a fractional fps", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(exportRequest({ fps: 22.5 }), ctx(slug));
    assert.equal(res.status, 400);
  });
});

test("export route accepts compression and fps as body fields (404 for a missing project, not 400)", async () => {
  await withTempProjectsRoot(async () => {
    const res = await POST(
      exportRequest({ compression: "web", fps: 24 }),
      ctx("missing")
    );
    assert.equal(res.status, 404);
  });
});

test("export route returns 400 when every word is cut", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        words: makeProject().words.map((w) => ({ ...w, deleted: true })),
      })
    );
    const res = await POST(exportRequest({}), ctx(slug));
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /nothing to export/i);
  });
});
