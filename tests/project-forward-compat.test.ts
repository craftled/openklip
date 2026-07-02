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
