import assert from "node:assert/strict";
import { test } from "node:test";
import { assertProjectCanBeIngested } from "../src/ingest-guard.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("assertProjectCanBeIngested refuses when the project already exists", async () => {
  await withTempProjectsRoot(({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    assert.throws(() => assertProjectCanBeIngested(slug), /already exists/i);
  });
});

test("assertProjectCanBeIngested allows an existing project when force=true", async () => {
  await withTempProjectsRoot(({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    assertProjectCanBeIngested(slug, true);
  });
});

test("assertProjectCanBeIngested allows when no project exists", async () => {
  await withTempProjectsRoot(({ slug }) => {
    assertProjectCanBeIngested(slug);
  });
});
