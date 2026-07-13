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

test("openklip cleanup-config prints current settings", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const { code, out } = await runCli(["cleanup-config", slug]);
    assert.equal(code, 0);
    assert.match(out, /cleanup-config:/);
    assert.match(out, /minSec/);
  });
});

test("openklip cleanup-config --json returns resolved cleanup config", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const { code, out } = await runCli(["cleanup-config", slug, "--json"]);
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as {
      minSec: number;
      keepPadSec: number;
      categories: { hedging: boolean; hesitation: boolean; repeat: boolean };
    };
    assert.equal(typeof parsed.minSec, "number");
    assert.equal(typeof parsed.keepPadSec, "number");
    assert.equal(typeof parsed.categories.hesitation, "boolean");
  });
});

test("openklip cleanup-config patches thresholds and category toggles", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const { code, out } = await runCli([
      "cleanup-config",
      slug,
      "--min-sec",
      "1.5",
      "--keep-pad-sec",
      "0.2",
      "--hedging",
      "off",
      "--repeat",
      "on",
    ]);
    assert.equal(code, 0);
    assert.match(out, /minSec 1\.5s/);
    assert.match(out, /hedging off/);
    assert.match(out, /repeat on/);

    const { code: jsonCode, out: jsonOut } = await runCli([
      "cleanup-config",
      slug,
      "--json",
    ]);
    assert.equal(jsonCode, 0);
    const parsed = JSON.parse(jsonOut) as {
      minSec: number;
      keepPadSec: number;
      categories: { hedging: boolean; repeat: boolean };
    };
    assert.equal(parsed.minSec, 1.5);
    assert.equal(parsed.keepPadSec, 0.2);
    assert.equal(parsed.categories.hedging, false);
    assert.equal(parsed.categories.repeat, true);
  });
});

test("openklip cleanup-config inherit clears a stored override", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const set = await runCli(["cleanup-config", slug, "--min-sec", "2"]);
    assert.equal(set.code, 0);
    const cleared = await runCli([
      "cleanup-config",
      slug,
      "--min-sec",
      "inherit",
      "--json",
    ]);
    assert.equal(cleared.code, 0);
    const parsed = JSON.parse(cleared.out) as { minSec: number };
    assert.equal(parsed.minSec, 0.7);
  });
});
