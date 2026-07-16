import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  DELETE as INTEGRATIONS_DELETE,
  POST as INTEGRATIONS_POST,
  PUT as INTEGRATIONS_PUT,
} from "../app/api/integrations/route.ts";
import { POST as ASSETS_POST } from "../app/api/projects/[slug]/assets/route.ts";
import { POST as EXPORT_POST } from "../app/api/projects/[slug]/export/route.ts";
import { DELETE as DELETE_PROJECT } from "../app/api/projects/[slug]/route.ts";
import { POST as TASKS_POST } from "../app/api/projects/[slug]/tasks/route.ts";
import { POST as WORKSPACE_POST } from "../app/api/workspace/route.ts";
import { createAgentTask, getAgentTask } from "../src/agent-tasks.ts";
import {
  isLoopbackHost,
  isTrustedRequest,
  trustGuard,
} from "../src/local-trust.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

async function withTempRepo<T>(fn: () => T | Promise<T>): Promise<T> {
  const prevCwd = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), "openklip-local-trust-repo-"));
  process.chdir(temp);
  try {
    return await fn();
  } finally {
    process.chdir(prevCwd);
    rmSync(temp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Unit tests: isLoopbackHost / isTrustedRequest / trustGuard
// ---------------------------------------------------------------------------

test("isLoopbackHost accepts localhost, 127.0.0.1, ::1 (bracketed and bare), and null", () => {
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("localhost:4399"), true);
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("127.0.0.1:4399"), true);
  assert.equal(isLoopbackHost("127.5.6.7"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("[::1]"), true);
  assert.equal(isLoopbackHost("[::1]:4399"), true);
  assert.equal(isLoopbackHost(null), true);
});

test("isLoopbackHost rejects a public hostname", () => {
  assert.equal(isLoopbackHost("evil.example"), false);
  assert.equal(isLoopbackHost("evil.example:4399"), false);
});

test("isTrustedRequest allows Host localhost/127.0.0.1 with no Origin", () => {
  assert.equal(isTrustedRequest(new Request("http://localhost/api/x")), true);
  assert.equal(
    isTrustedRequest(
      new Request("http://localhost/api/x", {
        headers: { host: "127.0.0.1:4399" },
      })
    ),
    true
  );
});

test("isTrustedRequest allows Origin http://127.0.0.1:4399", () => {
  const req = new Request("http://localhost/api/x", {
    headers: { origin: "http://127.0.0.1:4399" },
  });
  assert.equal(isTrustedRequest(req), true);
});

test("isTrustedRequest allows Sec-Fetch-Site same-origin or none", () => {
  const sameOrigin = new Request("http://localhost/api/x", {
    headers: { "sec-fetch-site": "same-origin" },
  });
  const none = new Request("http://localhost/api/x", {
    headers: { "sec-fetch-site": "none" },
  });
  assert.equal(isTrustedRequest(sameOrigin), true);
  assert.equal(isTrustedRequest(none), true);
});

test("isTrustedRequest allows a request with no relevant headers", () => {
  const req = new Request("http://localhost/api/x");
  assert.equal(isTrustedRequest(req), true);
});

test("isTrustedRequest rejects Host evil.example", () => {
  const req = new Request("http://localhost/api/x", {
    headers: { host: "evil.example" },
  });
  assert.equal(isTrustedRequest(req), false);
});

test("isTrustedRequest rejects Origin http://evil.example", () => {
  const req = new Request("http://localhost/api/x", {
    headers: { origin: "http://evil.example" },
  });
  assert.equal(isTrustedRequest(req), false);
});

test("isTrustedRequest rejects Sec-Fetch-Site cross-site", () => {
  const req = new Request("http://localhost/api/x", {
    headers: { "sec-fetch-site": "cross-site" },
  });
  assert.equal(isTrustedRequest(req), false);
});

test("trustGuard returns a 403 Response for a rejected request and null for a trusted one", async () => {
  const untrusted = new Request("http://localhost/api/x", {
    headers: { origin: "http://evil.example" },
  });
  const denied = trustGuard(untrusted);
  assert.ok(denied);
  assert.equal(denied?.status, 403);
  const body = (await denied?.json()) as { error?: string };
  assert.ok(body.error);

  const trusted = new Request("http://localhost/api/x");
  assert.equal(trustGuard(trusted), null);
});

// ---------------------------------------------------------------------------
// Route-level tests: six starred mutating routes reject untrusted, allow
// trusted.
// ---------------------------------------------------------------------------

test("DELETE /api/projects/:slug rejects an untrusted request and does not delete", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await DELETE_PROJECT(
      new Request(`http://localhost/api/projects/${slug}`, {
        method: "DELETE",
        headers: { origin: "http://evil.example" },
      }) as Parameters<typeof DELETE_PROJECT>[0],
      ctx(slug)
    );
    assert.equal(res.status, 403);
    assert.ok(existsSync(projectPaths(slug).project));
  });
});

test("DELETE /api/projects/:slug allows a trusted request and deletes", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await DELETE_PROJECT(
      new Request(`http://localhost/api/projects/${slug}`, {
        method: "DELETE",
      }) as Parameters<typeof DELETE_PROJECT>[0],
      ctx(slug)
    );
    assert.equal(res.status, 200);
    assert.ok(!existsSync(projectPaths(slug).project));
  });
});

test("POST /api/workspace rejects an untrusted request", async () => {
  await withTempRepo(async () => {
    const res = await WORKSPACE_POST(
      new Request("http://localhost/api/workspace", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "evil.example",
        },
        body: JSON.stringify({ action: "pick" }),
      })
    );
    assert.equal(res.status, 403);
  });
});

test("POST /api/workspace allows a trusted request", async () => {
  await withTempRepo(async () => {
    const chosen = mkdtempSync(join(tmpdir(), "openklip-workspace-target-"));
    try {
      const res = await WORKSPACE_POST(
        new Request("http://localhost/api/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "set", path: chosen }),
        })
      );
      assert.notEqual(res.status, 403);
      assert.equal(res.status, 200);
    } finally {
      rmSync(chosen, { recursive: true, force: true });
    }
  });
});

test("PUT/POST/DELETE /api/integrations reject untrusted requests", async () => {
  await withTempRepo(async () => {
    const putRes = await INTEGRATIONS_PUT(
      new Request("http://localhost/api/integrations", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "http://evil.example",
        },
        body: JSON.stringify({ elevenLabsApiKey: "secret-key" }),
      })
    );
    assert.equal(putRes.status, 403);

    const postRes = await INTEGRATIONS_POST(
      new Request("http://localhost/api/integrations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://evil.example",
        },
        body: JSON.stringify({}),
      })
    );
    assert.equal(postRes.status, 403);

    const deleteRes = await INTEGRATIONS_DELETE(
      new Request("http://localhost/api/integrations", {
        method: "DELETE",
        headers: { origin: "http://evil.example" },
      })
    );
    assert.equal(deleteRes.status, 403);
  });
});

test("PUT/POST/DELETE /api/integrations allow trusted requests", async () => {
  await withTempRepo(async () => {
    const putRes = await INTEGRATIONS_PUT(
      new Request("http://localhost/api/integrations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ elevenLabsApiKey: "secret-key" }),
      })
    );
    assert.equal(putRes.status, 200);

    const postRes = await INTEGRATIONS_POST(
      new Request("http://localhost/api/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    assert.notEqual(postRes.status, 403);

    const deleteRes = await INTEGRATIONS_DELETE(
      new Request("http://localhost/api/integrations", { method: "DELETE" })
    );
    assert.equal(deleteRes.status, 200);
  });
});

test("POST /api/projects/:slug/assets rejects an untrusted request and does not register", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "still.png")
    );
    const res = await ASSETS_POST(
      new Request(`http://localhost/api/projects/${slug}/assets`, {
        method: "POST",
        headers: { origin: "http://evil.example" },
        body: form,
      }) as Parameters<typeof ASSETS_POST>[0],
      ctx(slug)
    );
    assert.equal(res.status, 403);
  });
});

test("POST /api/projects/:slug/assets allows a trusted request and registers", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "still.png")
    );
    form.append("kind", "still");
    const res = await ASSETS_POST(
      new Request(`http://localhost/api/projects/${slug}/assets`, {
        method: "POST",
        body: form,
      }) as Parameters<typeof ASSETS_POST>[0],
      ctx(slug)
    );
    assert.equal(res.status, 200);
  });
});

test("POST /api/projects/:slug/export rejects an untrusted request", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await EXPORT_POST(
      new Request(`http://localhost/api/projects/${slug}/export`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://evil.example",
        },
        body: JSON.stringify({}),
      }) as Parameters<typeof EXPORT_POST>[0],
      ctx(slug)
    );
    assert.equal(res.status, 403);
  });
});

test("POST /api/projects/:slug/export allows a trusted request past the guard", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // An invalid height fails zod validation (400) well before ffmpeg is
    // invoked, which is enough to prove the request passed the trust guard
    // without requiring a real render.
    const res = await EXPORT_POST(
      new Request(`http://localhost/api/projects/${slug}/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ height: -10 }),
      }) as Parameters<typeof EXPORT_POST>[0],
      ctx(slug)
    );
    assert.notEqual(res.status, 403);
    assert.equal(res.status, 400);
  });
});

test("POST /api/projects/:slug/tasks rejects an untrusted cancel request", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Do the thing" });
    const res = await TASKS_POST(
      new Request(`http://localhost/api/projects/${slug}/tasks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({ action: "cancel", taskId: task.id }),
      }) as Parameters<typeof TASKS_POST>[0],
      ctx(slug)
    );
    assert.equal(res.status, 403);
    const stillPending = await getAgentTask(slug, task.id);
    assert.notEqual(stillPending?.status, "cancelled");
  });
});

test("POST /api/projects/:slug/tasks allows a trusted cancel request", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const task = await createAgentTask(slug, { request: "Do the thing" });
    const res = await TASKS_POST(
      new Request(`http://localhost/api/projects/${slug}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", taskId: task.id }),
      }) as Parameters<typeof TASKS_POST>[0],
      ctx(slug)
    );
    assert.equal(res.status, 200);
    const cancelled = await getAgentTask(slug, task.id);
    assert.equal(cancelled?.status, "cancelled");
  });
});
