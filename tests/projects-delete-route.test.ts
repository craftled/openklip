import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DELETE } from "../app/api/projects/[slug]/route.ts";
import { projectDir } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

test("DELETE /api/projects/:slug removes the project and returns the remaining list", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    const other = "other-demo";
    writeFixtureProject(slug, makeProject({ slug }));
    writeFixtureProject(other, makeProject({ slug: other }));

    const res = await DELETE(
      new Request(`http://localhost/api/projects/${slug}`, {
        method: "DELETE",
      }) as Parameters<typeof DELETE>[0],
      ctx(slug)
    );
    const data = (await res.json()) as {
      projects?: Array<{ slug: string }>;
      error?: string;
    };

    assert.equal(res.status, 200);
    assert.equal(existsSync(join(root, "projects", slug)), false);
    assert.equal(existsSync(projectDir(other)), true);
    assert.equal(data.projects?.length, 1);
    assert.equal(data.projects?.[0]?.slug, other);
  });
});

test("DELETE /api/projects/:slug returns 404 for a missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await DELETE(
      new Request("http://localhost/api/projects/missing", {
        method: "DELETE",
      }) as Parameters<typeof DELETE>[0],
      ctx("missing")
    );
    assert.equal(res.status, 404);
  });
});

test("DELETE /api/projects/:slug returns 400 for an invalid slug", async () => {
  await withTempProjectsRoot(async () => {
    const res = await DELETE(
      new Request("http://localhost/api/projects/../etc", {
        method: "DELETE",
      }) as Parameters<typeof DELETE>[0],
      ctx("../etc")
    );
    assert.equal(res.status, 400);
  });
});
