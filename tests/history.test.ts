import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readActionLog } from "../src/action-log.ts";
import { projectPaths } from "../src/paths.ts";
import { loadProject, mutateProject } from "../src/projectStore.ts";
import { runAction } from "../src/registry.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

async function withoutActorEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.OPENKLIP_ACTOR;
  delete process.env.OPENKLIP_ACTOR;
  try {
    return await fn();
  } finally {
    if (prev === undefined) {
      delete process.env.OPENKLIP_ACTOR;
    } else {
      process.env.OPENKLIP_ACTOR = prev;
    }
  }
}

test("mutateProject with meta bumps revision 0 to 1 and appends one entry", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    await withoutActorEnv(async () => {
      writeFixtureProject(slug, makeProject({ slug }));
      await mutateProject(
        slug,
        (p) => {
          p.padMs = 10;
        },
        { action: "pad", input: { padMs: 10 } }
      );
      const project = await loadProject(slug);
      assert.equal(project.revision, 1);
      const entries = await readActionLog(slug);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].action, "pad");
      assert.equal(entries[0].actor, "human");
      assert.equal(entries[0].revisionBefore, 0);
      assert.equal(entries[0].revisionAfter, 1);
      assert.equal(typeof entries[0].at, "number");
    });
  });
});

test("a second meta mutation records revision 1 to 2, newest first", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "human" }
    );
    await mutateProject(
      slug,
      (p) => {
        p.captions.enabled = false;
      },
      { action: "captions", actor: "human" }
    );
    const project = await loadProject(slug);
    assert.equal(project.revision, 2);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].action, "captions");
    assert.equal(entries[0].revisionBefore, 1);
    assert.equal(entries[0].revisionAfter, 2);
    assert.equal(entries[1].action, "pad");
  });
});

test("mutateProject without meta neither bumps revision nor logs", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await mutateProject(slug, (p) => {
      p.padMs = 25;
    });
    const project = await loadProject(slug);
    assert.equal(project.padMs, 25);
    assert.equal(project.revision, undefined);
    assert.deepEqual(await readActionLog(slug), []);
  });
});

test("a throwing mutation logs nothing and leaves project.json unchanged", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const before = readFileSync(
      join(root, "projects", slug, "project.json"),
      "utf8"
    );
    await assert.rejects(
      mutateProject(
        slug,
        () => {
          throw new Error("boom");
        },
        { action: "pad", actor: "cli" }
      ),
      /boom/
    );
    const after = readFileSync(
      join(root, "projects", slug, "project.json"),
      "utf8"
    );
    assert.equal(after, before);
    assert.deepEqual(await readActionLog(slug), []);
  });
});

test("a failing action-log append never fails the edit", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // Occupy the log PATH with a directory so appendFile throws EISDIR.
    mkdirSync(projectPaths(slug).actionsLog, { recursive: true });
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "human", input: { padMs: 10 } }
    );
    // The edit and its revision bump saved; history is best-effort.
    const project = await loadProject(slug);
    assert.equal(project.padMs, 10);
    assert.equal(project.revision, 1);
    // The unreadable log reads back as an empty history rather than throwing.
    assert.deepEqual(await readActionLog(slug), []);
  });
});

test("the CLI logged-action shape records actor cli with the action name", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // Same delegation runLoggedAction in src/cli.ts uses (cli.ts runs its
    // command switch at module scope, so it cannot be imported in tests).
    const input = { ids: ["w0"], deleted: true };
    await mutateProject(slug, (p) => runAction("cut", p, input), {
      action: "cut",
      actor: "cli",
      input,
    });
    const project = await loadProject(slug);
    assert.equal(project.words[0].deleted, true);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "cut");
    assert.equal(entries[0].actor, "cli");
    assert.match(entries[0].input ?? "", /w0/);
  });
});

test("meta actor falls back to OPENKLIP_ACTOR when unset on the meta", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const prev = process.env.OPENKLIP_ACTOR;
    process.env.OPENKLIP_ACTOR = "agent";
    try {
      await mutateProject(
        slug,
        (p) => {
          p.padMs = 15;
        },
        { action: "pad" }
      );
    } finally {
      if (prev === undefined) {
        delete process.env.OPENKLIP_ACTOR;
      } else {
        process.env.OPENKLIP_ACTOR = prev;
      }
    }
    const entries = await readActionLog(slug);
    assert.equal(entries[0].actor, "agent");
  });
});
