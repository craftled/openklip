import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../app/api/projects/[slug]/tasks/route.ts";
import { registerAgentRun } from "../src/agent-run-registry.ts";
import {
  createAgentTask,
  getAgentTask,
  resetAgentTaskIdSequenceForTests,
} from "../src/agent-tasks.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function get(slug: string) {
  return GET(
    new Request(`http://localhost/api/projects/${slug}/tasks`) as Parameters<
      typeof GET
    >[0],
    ctx(slug)
  );
}

function post(slug: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/projects/${slug}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as Parameters<typeof POST>[0],
    ctx(slug)
  );
}

test("GET /api/projects/:slug/tasks returns empty tasks for a new project", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await get(slug);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { tasks: unknown[] };
    assert.deepEqual(data.tasks, []);
  });
});

test("GET /api/projects/:slug/tasks returns a created task", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Do the thing" });
    const res = await get(slug);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { tasks: Array<{ id: string }> };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0]?.id, task.id);
  });
});

test("POST cancel kills the registered process and marks the task cancelled", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Long task" });

    let killed = false;
    registerAgentRun(task.id, {
      kill: () => {
        killed = true;
      },
    });

    const res = await post(slug, { action: "cancel", taskId: task.id });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { task: { status: string } };
    assert.equal(data.task.status, "cancelled");
    assert.equal(killed, true);
  });
});

test("POST cancel on an unknown task returns 404", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await post(slug, { action: "cancel", taskId: "nope" });
    assert.equal(res.status, 404);
  });
});

test("POST cancel with a taskId belonging to a different slug returns 404 and does not kill the process", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    const otherSlug = `${slug}-other`;
    writeFixtureProject(slug, makeProject({ slug }));
    writeFixtureProject(otherSlug, makeProject({ slug: otherSlug }));

    const otherTask = await createAgentTask(otherSlug, {
      request: "Belongs to a different project",
    });

    let killed = false;
    registerAgentRun(otherTask.id, {
      kill: () => {
        killed = true;
      },
    });

    // The cancel request targets `slug`'s route but passes the OTHER
    // project's task id. The process registry is keyed only by taskId, so a
    // naive kill-then-check would still kill this live process even though
    // the task does not belong to this slug.
    const res = await post(slug, { action: "cancel", taskId: otherTask.id });
    assert.equal(res.status, 404);
    assert.equal(killed, false);

    // The other project's task must remain untouched (still running).
    const stillRunning = await getAgentTask(otherSlug, otherTask.id);
    assert.equal(stillRunning?.status, "running");
  });
});

test("POST with an invalid JSON body returns 400", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(
      new Request(`http://localhost/api/projects/${slug}/tasks`, {
        body: "{not valid json",
        headers: { "content-type": "application/json" },
        method: "POST",
      }) as Parameters<typeof POST>[0],
      ctx(slug)
    );
    assert.equal(res.status, 400);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /invalid JSON body/);
  });
});

test("POST with an unknown action returns 400", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await post(slug, { action: "bogus" });
    assert.equal(res.status, 400);
  });
});

test("GET /api/projects/:slug/tasks returns 400 for an invalid slug", async () => {
  await withTempProjectsRoot(async () => {
    const res = await GET(
      new Request("http://localhost/api/projects/x/tasks") as Parameters<
        typeof GET
      >[0],
      ctx("../etc")
    );
    assert.equal(res.status, 400);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /invalid project slug/);
  });
});

test("GET /api/projects/:slug/tasks returns 404 for a missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await get("no-such-project");
    assert.equal(res.status, 404);
    const data = (await res.json()) as { error?: string };
    assert.equal(data.error, "project not found: no-such-project");
  });
});
