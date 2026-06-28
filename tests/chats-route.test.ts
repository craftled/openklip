import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../app/api/projects/[slug]/chats/route.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

test("GET /api/projects/:slug/chats returns empty threads for new project", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await GET(
      new Request(`http://localhost/api/projects/${slug}/chats`) as Parameters<
        typeof GET
      >[0],
      ctx(slug)
    );
    const data = (await res.json()) as {
      threads: unknown[];
      archived: unknown[];
      activeThreadId: string | null;
    };
    assert.equal(res.status, 200);
    assert.deepEqual(data.threads, []);
    assert.deepEqual(data.archived, []);
    assert.equal(data.activeThreadId, null);
  });
});

test("POST /api/projects/:slug/chats creates a thread on disk", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(
      new Request(`http://localhost/api/projects/${slug}/chats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", title: "Plan cuts" }),
      }) as Parameters<typeof POST>[0],
      ctx(slug)
    );
    const data = (await res.json()) as {
      thread?: { title: string };
      threads?: { title: string }[];
    };
    assert.equal(res.status, 200);
    assert.equal(data.thread?.title, "Plan cuts");
    assert.equal(data.threads?.length, 1);
  });
});

test("POST /api/projects/:slug/chats append returns 404 for unknown thread", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(
      new Request(`http://localhost/api/projects/${slug}/chats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "append",
          threadId: "nope",
          role: "user",
          content: "hi",
        }),
      }) as Parameters<typeof POST>[0],
      ctx(slug)
    );
    assert.equal(res.status, 404);
  });
});

test("POST /api/projects/:slug/chats setActive returns 404 for unknown thread", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await POST(
      new Request(`http://localhost/api/projects/${slug}/chats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setActive", threadId: "nope" }),
      }) as Parameters<typeof POST>[0],
      ctx(slug)
    );
    assert.equal(res.status, 404);
  });
});
