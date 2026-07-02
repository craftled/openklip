import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../app/api/projects/[slug]/history/route.ts";
import { type ActionLogEntry, appendActionLog } from "../src/action-log.ts";
import { mutateProject } from "../src/projectStore.ts";
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
    new Request(`http://localhost/api/projects/${slug}/history`) as Parameters<
      typeof GET
    >[0],
    ctx(slug)
  );
}

test("GET /api/projects/:slug/history returns entries newest-first", async () => {
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
        p.captions.enabled = false;
      },
      { action: "captions", actor: "cli", input: { enabled: false } }
    );
    const res = await get(slug);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { entries: ActionLogEntry[] };
    assert.equal(data.entries.length, 2);
    assert.equal(data.entries[0].action, "captions");
    assert.equal(data.entries[0].actor, "cli");
    assert.equal(data.entries[0].revisionBefore, 1);
    assert.equal(data.entries[0].revisionAfter, 2);
    assert.equal(data.entries[1].action, "pad");
    assert.equal(data.entries[1].actor, "human");
  });
});

test("GET /api/projects/:slug/history returns empty entries with no log", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await get(slug);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { entries: unknown[] };
    assert.deepEqual(data.entries, []);
  });
});

test("GET /api/projects/:slug/history returns 400 for an invalid slug", async () => {
  await withTempProjectsRoot(async () => {
    const res = await GET(
      new Request("http://localhost/api/projects/x/history") as Parameters<
        typeof GET
      >[0],
      ctx("../etc")
    );
    assert.equal(res.status, 400);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /invalid project slug/);
  });
});

test("GET /api/projects/:slug/history returns 404 for a missing project", async () => {
  await withTempProjectsRoot(async () => {
    const res = await get("no-such-project");
    assert.equal(res.status, 404);
    const data = (await res.json()) as { error?: string };
    assert.equal(data.error, "project not found: no-such-project");
  });
});

test("GET /api/projects/:slug/history caps the response at 200 entries", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    for (let i = 0; i < 205; i += 1) {
      await appendActionLog(slug, {
        action: "pad",
        actor: "cli",
        at: i,
        revisionBefore: i,
        revisionAfter: i + 1,
      });
    }
    const res = await get(slug);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { entries: ActionLogEntry[] };
    assert.equal(data.entries.length, 200);
    // Newest first: the cap drops the oldest entries, not the newest.
    assert.equal(data.entries[0].at, 204);
  });
});
