import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ingest } from "../src/ingest.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("ingest refuses to wipe an existing project without --force", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // A video file whose name slugifies to the existing project's slug.
    const video = join(process.cwd(), `${slug}.mp4`);
    writeFileSync(video, "fake");

    await assert.rejects(ingest(video), /already exists/i);
    // The existing project.json must be untouched (no rm ran).
    assert.ok(
      existsSync(join(process.cwd(), "projects", slug, "project.json"))
    );
  });
});
