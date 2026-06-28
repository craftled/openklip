import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  listProjects,
  loadProject,
  mutateProject,
  resolveSlug,
  saveProject,
} from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("listProjects returns slugs sorted by mtime descending", async () => {
  await withTempProjectsRoot(({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const listed = listProjects();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.slug, slug);
  });
});

test("loadProject and saveProject round-trip project.json", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);
    project.words[0].deleted = true;
    await saveProject(slug, project);
    const loaded = await loadProject(slug);
    assert.equal(loaded.words[0].deleted, true);
  });
});

test("resolveSlug prefers explicit slug param", async () => {
  await withTempProjectsRoot(({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    assert.equal(resolveSlug(slug), slug);
  });
});

test("resolveSlug throws when no projects exist", async () => {
  await withTempProjectsRoot(() => {
    assert.throws(() => resolveSlug(null), /no projects found/);
  });
});

test("resolveSlug throws for missing project slug", async () => {
  await withTempProjectsRoot(() => {
    assert.throws(() => resolveSlug("missing"), /project not found/);
  });
});

test("loadProject throws for missing slug", async () => {
  await withTempProjectsRoot(async () => {
    await assert.rejects(() => loadProject("missing"), /project not found/);
  });
});

test("saveProject writes pretty JSON to disk", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);
    await saveProject(slug, project);
    const raw = readFileSync(
      join(root, "projects", slug, "project.json"),
      "utf8"
    );
    assert.match(raw, /{\n {2}"version": 1/);
  });
});

test("saveProject rejects when the project directory is missing", async () => {
  await withTempProjectsRoot(async () => {
    await assert.rejects(
      () => saveProject("missing", makeProject({ slug: "missing" })),
      /project\.json/
    );
  });
});

test("mutateProject serializes concurrent edits (no lost update)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    project.padMs = 0;
    writeFixtureProject(slug, project);

    const delay = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    // Each call reads padMs, pauses (to widen the race window), then writes
    // padMs+1. Without per-slug serialization both read 0 and both save 1 —
    // a lost update. With the lock they chain: 0 -> 1 -> 2.
    await Promise.all([
      mutateProject(slug, async (p) => {
        const v = p.padMs;
        await delay(5);
        p.padMs = v + 1;
      }),
      mutateProject(slug, async (p) => {
        const v = p.padMs;
        await delay(5);
        p.padMs = v + 1;
      }),
    ]);

    const reloaded = await loadProject(slug);
    assert.equal(reloaded.padMs, 2);
  });
});
