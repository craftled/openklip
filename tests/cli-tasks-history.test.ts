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

test("CLI tasks: --actor filters correctly", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_ACTOR;
    let agentTask: Awaited<ReturnType<typeof createAgentTask>>;
    try {
      process.env.OPENKLIP_ACTOR = "agent";
      agentTask = await createAgentTask(slug, { request: "agent request" });
      process.env.OPENKLIP_ACTOR = "human";
      await createAgentTask(slug, { request: "human request" });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_ACTOR;
      } else {
        process.env.OPENKLIP_ACTOR = prev;
      }
    }

    const r = await runCli(["tasks", slug, "--actor", "agent"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(agentTask.id));
    assert.match(r.out, /1 task/);
  });
});

test("CLI tasks: combining --actor with --status narrows correctly", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_ACTOR;
    let agentCompleted: Awaited<ReturnType<typeof createAgentTask>>;
    try {
      // Same shape as the history combining test: --status alone would match
      // two (both completed), --actor alone would match two (both agent).
      // Only combining both narrows to exactly one.
      process.env.OPENKLIP_ACTOR = "agent";
      agentCompleted = await createAgentTask(slug, {
        request: "agent completed",
      });
      await completeAgentTask(slug, agentCompleted.id, { kind: "completed" });
      await createAgentTask(slug, { request: "agent still running" });
      process.env.OPENKLIP_ACTOR = "human";
      const humanCompleted = await createAgentTask(slug, {
        request: "human completed",
      });
      await completeAgentTask(slug, humanCompleted.id, { kind: "completed" });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_ACTOR;
      } else {
        process.env.OPENKLIP_ACTOR = prev;
      }
    }

    const r = await runCli([
      "tasks",
      slug,
      "--actor",
      "agent",
      "--status",
      "completed",
    ]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1 task/);
    assert.match(r.out, new RegExp(agentCompleted.id));
  });
});

test("CLI tasks: an --actor filter matching nothing prints a distinct filtered-empty message", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_ACTOR;
    try {
      process.env.OPENKLIP_ACTOR = "agent";
      await createAgentTask(slug, { request: "agent request" });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_ACTOR;
      } else {
        process.env.OPENKLIP_ACTOR = prev;
      }
    }

    const r = await runCli(["tasks", slug, "--actor", "human"]);
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, new RegExp(`no tasks for ${slug}\\.`));
    assert.match(r.out, /no tasks match the filter/);
    assert.match(r.out, /--actor=human/);
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

test("CLI history: --actor filters correctly", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "human", input: { padMs: 10 } }
    );
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 20;
      },
      { action: "pad", actor: "agent", input: { padMs: 20 } }
    );

    const r = await runCli(["history", slug, "--actor", "agent"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1 entry/);
    assert.match(r.out, /agent/);
    assert.doesNotMatch(r.out, /\bhuman\b/);
  });
});

test("CLI history: an --actor filter matching nothing prints a distinct filtered-empty message", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "human", input: { padMs: 10 } }
    );

    const r = await runCli(["history", slug, "--actor", "agent"]);
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, new RegExp(`no history for ${slug}\\.`));
    assert.match(r.out, /no history entries match the filter/);
    assert.match(r.out, /--actor=agent/);
  });
});

// ── --actor must be validated against the same enum MCP already uses ──

test("CLI history rejects an unknown --actor value with a non-zero exit and a clear error", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli(["history", slug, "--actor", "bogus"]);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /--actor/);
    assert.match(r.out, /human/);
    assert.match(r.out, /agent/);
    assert.match(r.out, /cli/);
    assert.match(r.out, /mcp/);
    assert.match(r.out, /system/);
  });
});

test("CLI tasks rejects an unknown --actor value with a non-zero exit and a clear error", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await createAgentTask(slug, { request: "do something" });

    const r = await runCli(["tasks", slug, "--actor", "bogus"]);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /--actor/);
    assert.match(r.out, /human/);
    assert.match(r.out, /agent/);
    assert.match(r.out, /cli/);
    assert.match(r.out, /mcp/);
    assert.match(r.out, /system/);
  });
});

test("CLI history accepts a valid --actor value (human) and filters normally", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "human", input: { padMs: 10 } }
    );
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 20;
      },
      { action: "pad", actor: "agent", input: { padMs: 20 } }
    );

    const r = await runCli(["history", slug, "--actor", "human"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1 entry/);
    assert.match(r.out, /human/);
  });
});

test("CLI tasks accepts a valid --actor value (cli) and filters normally", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_ACTOR;
    let cliTask: Awaited<ReturnType<typeof createAgentTask>>;
    try {
      process.env.OPENKLIP_ACTOR = "cli";
      cliTask = await createAgentTask(slug, { request: "cli request" });
      process.env.OPENKLIP_ACTOR = "human";
      await createAgentTask(slug, { request: "human request" });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_ACTOR;
      } else {
        process.env.OPENKLIP_ACTOR = prev;
      }
    }

    const r = await runCli(["tasks", slug, "--actor", "cli"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(cliTask.id));
    assert.match(r.out, /1 task/);
  });
});

test("CLI history: combining --actor with --task and --action narrows correctly", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      {
        action: "pad",
        actor: "agent",
        taskId: "task-cli-actor",
        input: { padMs: 10 },
      }
    );
    // Same task id and action, different actor: --task + --action alone
    // would still match two entries, so this proves --actor actually narrows
    // further rather than being a no-op.
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 20;
      },
      {
        action: "pad",
        actor: "human",
        taskId: "task-cli-actor",
        input: { padMs: 20 },
      }
    );
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 30;
      },
      { action: "cut", actor: "agent", input: {} }
    );

    const r = await runCli([
      "history",
      slug,
      "--actor",
      "agent",
      "--action",
      "pad",
      "--task",
      "task-cli-actor",
    ]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1 entry/);
    assert.match(r.out, /task task-cli-actor/);
  });
});
