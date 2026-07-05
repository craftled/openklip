import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const CLI = join(import.meta.dir, "../src/cli.ts");

async function runCli(args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: stdout + stderr };
}

test("openklip cuts-snap prints current settings", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const { code, out } = await runCli(["cuts-snap", slug]);
    assert.equal(code, 0);
    assert.match(out, /cuts-snap:/);
  });
});

test("openklip cuts-snap patches VAD snap settings", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const { code, out } = await runCli([
      "cuts-snap",
      slug,
      "--on",
      "--mode",
      "vad",
      "--max-shift",
      "120",
      "--crossfade",
      "40",
    ]);
    assert.equal(code, 0);
    assert.match(out, /cuts-snap: on/);
    assert.match(out, /mode vad/);
  });
});
