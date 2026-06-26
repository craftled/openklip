import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadProject, resolveSlug, saveProject } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

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
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);
    await saveProject(slug, project);
    const raw = readFileSync(`projects/${slug}/project.json`, "utf8");
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
