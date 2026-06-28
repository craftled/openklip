import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../app/api/projects/[slug]/reveal/route.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

test("reveal route returns 404 for a missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await POST(new Request("http://localhost/reveal"), ctx("missing"));
    assert.equal(res.status, 404);
  });
});

test("reveal route returns 400 for an invalid slug", async () => {
  await withTempProjectsRoot(async () => {
    const res = await POST(new Request("http://localhost/reveal"), ctx("../../etc"));
    assert.equal(res.status, 400);
  });
});

test("reveal route returns 200 for an existing project", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(new Request("http://localhost/reveal"), ctx(slug));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok?: boolean; path?: string };
    assert.equal(body.ok, true);
    assert.match(body.path ?? "", new RegExp(`${slug}$`));
  });
});

test("reveal route opens the assets folder", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(
      new Request("http://localhost/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: "assets" }),
      }),
      ctx(slug)
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok?: boolean;
      path?: string;
      target?: string;
    };
    assert.equal(body.ok, true);
    assert.equal(body.target, "assets");
    assert.match(body.path ?? "", /assets$/);
  });
});
