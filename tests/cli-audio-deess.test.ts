// De-essing CLI flags: `--deess on|off` and `--deess-intensity <0-1>`,
// matching the `--noise-reduction`/`--noise-strength` naming convention.
// cli.ts runs its command switch at module scope (cannot be imported in
// tests), so this spawns the CLI as a real subprocess, same pattern as
// tests/cli-tasks-history.test.ts and tests/cli-query.test.ts.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { loadProject } from "../src/projectStore.ts";
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

test("CLI audio --deess on --deess-intensity round-trips through project.json", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli([
      "audio",
      slug,
      "--deess",
      "on",
      "--deess-intensity",
      "0.7",
    ]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /deess on/);
    assert.match(r.out, /intensity 0\.7/);

    const project = await loadProject(slug);
    assert.equal(project.audio.deEsser.enabled, true);
    assert.equal(project.audio.deEsser.intensity, 0.7);
  });
});

test("CLI audio --deess off leaves intensity untouched", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    await runCli(["audio", slug, "--deess", "on", "--deess-intensity", "0.4"]);
    const r = await runCli(["audio", slug, "--deess", "off"]);
    assert.equal(r.code, 0, r.out);

    const project = await loadProject(slug);
    assert.equal(project.audio.deEsser.enabled, false);
    assert.equal(project.audio.deEsser.intensity, 0.4);
  });
});

test("CLI audio --deess rejects a value other than on|off", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli(["audio", slug, "--deess", "maybe"]);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /--deess/);
  });
});
