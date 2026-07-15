import assert from "node:assert/strict";
import { test } from "node:test";
import { GET as GET_REVISION } from "../app/api/projects/[slug]/revision/route.ts";
import { GET as GET_PROJECT } from "../app/api/projects/[slug]/route.ts";
import { mutateProject } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function getRevision(slug: string) {
  return GET_REVISION(
    new Request(`http://localhost/api/projects/${slug}/revision`) as Parameters<
      typeof GET_REVISION
    >[0],
    ctx(slug)
  );
}

function getProject(slug: string) {
  return GET_PROJECT(
    new Request(`http://localhost/api/projects/${slug}`) as Parameters<
      typeof GET_PROJECT
    >[0],
    ctx(slug)
  );
}

test("GET /api/projects/:slug/revision returns 0 for a fresh project", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await getRevision(slug);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { revision?: number; error?: string };
    assert.equal(data.revision, 0);
  });
});

test("GET /api/projects/:slug/revision advances after a mutation", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "cli", input: { padMs: 10 } }
    );
    const res = await getRevision(slug);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { revision?: number };
    assert.equal(data.revision, 1);
  });
});

test("GET /api/projects/:slug/revision returns 404 for missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await getRevision("no-such-project");
    assert.equal(res.status, 404);
  });
});

test("GET /api/projects/:slug returns project JSON with revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.words[0].deleted = true;
      },
      { action: "cut", actor: "cli", input: { wordIds: ["w0"] } }
    );
    const res = await getProject(slug);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      project?: {
        slug: string;
        revision?: number;
        words: { deleted: boolean }[];
      };
      revision?: number;
      error?: string;
    };
    assert.equal(data.revision, 1);
    assert.equal(data.project?.slug, slug);
    assert.equal(data.project?.revision, 1);
    assert.equal(data.project?.words[0].deleted, true);
  });
});

test("GET /api/projects/:slug returns 404 for missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await getProject("no-such-project");
    assert.equal(res.status, 404);
  });
});
