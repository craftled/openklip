import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEditorProject } from "../app/lib/project-data.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("loadEditorProject returns project with mediaVersion from proxy mtime", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const loaded = await loadEditorProject(slug);
    assert.equal(loaded.slug, slug);
    assert.equal(typeof loaded.mediaVersion, "number");
    assert.ok(loaded.mediaVersion > 0);
  });
});
