import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runDoctor } from "../src/doctor.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function findCheck(
  report: Awaited<ReturnType<typeof runDoctor>>,
  name: string
) {
  return report.checks.find((c) => c.name === name);
}

test("runDoctor reports installed binaries and whisper as ok", async () => {
  const report = await runDoctor();
  for (const name of ["ffmpeg", "ffprobe", "whisper"]) {
    const check = findCheck(report, name);
    assert.ok(check, `expected a "${name}" check`);
    assert.equal(check?.status, "ok", `${name} should be ok: ${check?.detail}`);
  }
});

test("runDoctor with no slug stays ok when deps are present", async () => {
  await withTempProjectsRoot(async () => {
    const report = await runDoctor();
    assert.equal(report.ok, true);
  });
});

test("runDoctor passes a healthy project (proxy present, no assets)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [], broll: [] }));
    const report = await runDoctor(slug);
    assert.equal(report.ok, true);
    const media = findCheck(report, `media:${slug}`);
    assert.ok(media);
    assert.notEqual(media?.status, "fail");
  });
});

test("runDoctor fails a project with no source and no proxy", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    // Write project.json only — no proxy.mp4 on disk, source path missing too.
    const dir = join(root, "projects", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "project.json"),
      JSON.stringify(makeProject({ slug, assets: [], broll: [] }), null, 2)
    );
    const report = await runDoctor(slug);
    assert.equal(report.ok, false);
    assert.equal(findCheck(report, `media:${slug}`)?.status, "fail");
  });
});

test("runDoctor warns when exporting from proxy fallback (source missing)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    // Fixture writes proxy.mp4 but source is /tmp/source.mp4 (absent).
    writeFixtureProject(slug, makeProject({ slug, assets: [], broll: [] }));
    const report = await runDoctor(slug);
    assert.equal(findCheck(report, `media:${slug}`)?.status, "warn");
  });
});

test("runDoctor reports an invalid slug as a failed check, not a throw", async () => {
  const report = await runDoctor("../../etc");
  assert.equal(report.ok, false);
});
