// Forward-compat guarantee: ProjectSchema must not silently drop unknown
// top-level keys when an older build re-saves a project.json written by a
// newer one. See src/edl.ts ProjectSchema (.passthrough()).
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ProjectSchema } from "../src/edl.ts";
import { projectPaths } from "../src/paths.ts";
import { loadProject, mutateProject } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("ProjectSchema.parse preserves an unknown top-level key", () => {
  const parsed = ProjectSchema.parse({
    ...makeProject(),
    futureField: { x: 1 },
  });
  assert.deepEqual(
    (parsed as unknown as { futureField: unknown }).futureField,
    {
      x: 1,
    }
  );
});

test("loadProject then a logged mutateProject edit round-trips an unknown top-level key on disk", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // Inject a key no current schema field knows about, as if a newer build
    // wrote this project.json and an older build is about to re-save it.
    const fp = join(root, "projects", slug, "project.json");
    const raw = JSON.parse(readFileSync(fp, "utf8"));
    raw.futureField = { x: 1, nested: ["a", "b"] };
    writeFileSync(fp, JSON.stringify(raw, null, 2));

    const loaded = await loadProject(slug);
    assert.deepEqual(
      (loaded as unknown as { futureField: unknown }).futureField,
      { x: 1, nested: ["a", "b"] }
    );

    // A trivial logged edit through the normal mutate path must not drop it.
    await mutateProject(
      slug,
      (project) => {
        project.padMs = 75;
      },
      { action: "pad", actor: "human", input: { padMs: 75 } }
    );

    const onDisk = JSON.parse(readFileSync(projectPaths(slug).project, "utf8"));
    assert.deepEqual(onDisk.futureField, { x: 1, nested: ["a", "b"] });
    assert.equal(onDisk.padMs, 75);
  });
});

// Finding 3: an unknown/invalid captions.style value must not brick the
// whole project on load (e.g. a project.json written by a newer build with
// a preset id this checkout doesn't know, or a hand-edited value). The
// READ-side schema must fall back to the default instead of throwing; the
// WRITER side (the captions-style registry action) stays strict, see
// tests/registry.test.ts "captions-style: rejects an unknown style id".

test("loadProject resolves captions.style to the default when the key is missing entirely", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const fp = join(root, "projects", slug, "project.json");
    const raw = JSON.parse(readFileSync(fp, "utf8"));
    raw.captions.style = undefined;
    writeFileSync(fp, JSON.stringify(raw, null, 2));

    const loaded = await loadProject(slug);
    assert.equal(loaded.captions.style, "boxed");
  });
});

test("loadProject resolves an unknown captions.style value to the default instead of throwing", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const fp = join(root, "projects", slug, "project.json");
    const raw = JSON.parse(readFileSync(fp, "utf8"));
    raw.captions.style = "not-a-real-id";
    writeFileSync(fp, JSON.stringify(raw, null, 2));

    const loaded = await loadProject(slug);
    assert.equal(loaded.captions.style, "boxed");
  });
});

test("loadProject preserves a valid non-default captions.style value", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const fp = join(root, "projects", slug, "project.json");
    const raw = JSON.parse(readFileSync(fp, "utf8"));
    raw.captions.style = "karaoke";
    writeFileSync(fp, JSON.stringify(raw, null, 2));

    const loaded = await loadProject(slug);
    assert.equal(loaded.captions.style, "karaoke");
  });
});
