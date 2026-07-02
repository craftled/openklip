// Findings 5 and 6: `openklip tasks` and `openklip history` CLI commands.
// cli.ts runs its command switch at module scope (cannot be imported in
// tests, see tests/history.test.ts), so these spawn the CLI as a real
// subprocess, same pattern as tests/cli-query.test.ts.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { completeAgentTask, createAgentTask } from "../src/agent-tasks.ts";
import { mutateProject } from "../src/projectStore.ts";
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

// ── Finding 5: `--status <bad>` must error, not silently return 0 results ──

test("CLI tasks rejects an unknown --status value with a non-zero exit and a clear error", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await createAgentTask(slug, { request: "do something" });

    const r = await runCli(["tasks", slug, "--status", "bogus"]);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /--status/);
    assert.match(r.out, /pending/);
    assert.match(r.out, /completed/);
  });
});

test("CLI tasks accepts a valid --status value and filters normally", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "do something" });
    await completeAgentTask(slug, task.id, { kind: "completed" });

    const r = await runCli(["tasks", slug, "--status", "completed"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(task.id));
  });
});

// ── Finding 6: distinguish "genuinely empty" from "filter matched nothing" ──

test("CLI tasks: genuinely no tasks prints the plain empty message", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli(["tasks", slug]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`no tasks for ${slug}`));
  });
});

test("CLI tasks: a --status filter matching nothing prints a distinct filtered-empty message", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // Task exists but stays "running"; filter for "completed" matches none.
    await createAgentTask(slug, { request: "still running" });

    const r = await runCli(["tasks", slug, "--status", "completed"]);
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, new RegExp(`no tasks for ${slug}\\.`));
    assert.match(r.out, /no tasks match the filter/);
    assert.match(r.out, /--status=completed/);
  });
});

test("CLI history: genuinely no history prints the plain empty message", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli(["history", slug]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`no history for ${slug}`));
  });
});

test("CLI history: a --task filter matching nothing prints a distinct filtered-empty message", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "human", input: { padMs: 10 } }
    );

    const r = await runCli(["history", slug, "--task", "no-such-task"]);
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, new RegExp(`no history for ${slug}\\.`));
    assert.match(r.out, /no history entries match the filter/);
    assert.match(r.out, /--task=no-such-task/);
  });
});
