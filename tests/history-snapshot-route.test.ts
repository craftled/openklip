import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../app/api/projects/[slug]/history/snapshot/route.ts";
import { mutateProject } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function get(slug: string, revision: number) {
  const url = `http://localhost/api/projects/${slug}/history/snapshot?revision=${revision}`;
  return GET(
    new Request(url) as Parameters<typeof GET>[0],
    ctx(slug)
  );
}

test("GET history snapshot returns words at the requested revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        words: [
          {
            deleted: false,
            endSample: 10,
            id: "w0",
            startSample: 0,
            text: "Hello",
          },
          {
            deleted: false,
            endSample: 20,
            id: "w1",
            startSample: 10,
            text: "world.",
          },
        ],
      })
    );
    await mutateProject(
      slug,
      (project) => {
        project.words[0] = { ...project.words[0], deleted: true };
      },
      { action: "cut", actor: "human", input: { ids: ["w0"] } }
    );

    const res = await get(slug, 0);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      revision: number;
      words: Array<{ deleted: boolean; id: string; text: string }>;
    };
    assert.equal(data.revision, 0);
    assert.equal(data.words.length, 2);
    assert.equal(data.words[0]?.deleted, false);
  });
});

test("GET history snapshot returns 404 when revision snapshot is missing", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await get(slug, 99);
    assert.equal(res.status, 404);
  });
});

test("GET history snapshot returns 400 without revision query", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await GET(
      new Request(
        `http://localhost/api/projects/${slug}/history/snapshot`
      ) as Parameters<typeof GET>[0],
      ctx(slug)
    );
    assert.equal(res.status, 400);
  });
});
