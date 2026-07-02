import assert from "node:assert/strict";
import { test } from "node:test";
import { overwriteDecision } from "../web/hooks/use-project-create.ts";
import {
  createProjectFromVideo,
  ProjectExistsError,
} from "../web/lib/project-create.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("createProjectFromVideo throws ProjectExistsError on a 409 code exists", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      jsonResponse(
        { code: "exists", error: "project already exists: demo" },
        409
      )
    )) as typeof fetch;
  try {
    await assert.rejects(
      createProjectFromVideo(new File(["fake-bytes"], "demo.mp4")),
      (e: unknown) =>
        e instanceof ProjectExistsError &&
        /already exists/i.test((e as Error).message)
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("createProjectFromVideo fails plainly on a 409 code in-flight", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      jsonResponse(
        { code: "in-flight", error: "ingest already in progress for demo" },
        409
      )
    )) as typeof fetch;
  try {
    // NOT ProjectExistsError: offering the replace dialog here would let the
    // user wipe the project the running ingest is about to create.
    await assert.rejects(
      createProjectFromVideo(new File(["fake-bytes"], "demo.mp4")),
      (e: unknown) =>
        !(e instanceof ProjectExistsError) &&
        e instanceof Error &&
        /already in progress/.test(e.message)
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("createProjectFromVideo treats a code-less 409 as exists only by message", async () => {
  const realFetch = globalThis.fetch;
  // Older-server fallback: no code field. "already exists" copy still offers
  // the overwrite; anything else fails plainly.
  globalThis.fetch = (() =>
    Promise.resolve(
      jsonResponse({ error: "project already exists: demo" }, 409)
    )) as typeof fetch;
  try {
    await assert.rejects(
      createProjectFromVideo(new File(["fake-bytes"], "demo.mp4")),
      (e: unknown) => e instanceof ProjectExistsError
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  globalThis.fetch = (() =>
    Promise.resolve(
      jsonResponse({ error: "workspace is locked" }, 409)
    )) as typeof fetch;
  try {
    await assert.rejects(
      createProjectFromVideo(new File(["fake-bytes"], "demo.mp4")),
      (e: unknown) =>
        !(e instanceof ProjectExistsError) &&
        e instanceof Error &&
        /workspace is locked/.test(e.message)
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("createProjectFromVideo with force posts to ?force=1 and resolves the slug", async () => {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
    urls.push(url);
    if (url.includes("/api/projects/ingest/")) {
      return Promise.resolve(
        jsonResponse({ slug: "demo", status: "done" }, 200)
      );
    }
    return Promise.resolve(jsonResponse({ jobId: "job-1", slug: "demo" }, 200));
  }) as typeof fetch;
  try {
    const slug = await createProjectFromVideo(
      new File(["fake-bytes"], "demo.mp4"),
      undefined,
      { force: true }
    );
    assert.equal(slug, "demo");
    assert.match(urls[0] ?? "", /\/api\/projects\?force=1$/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("overwriteDecision offers the overwrite flow only for a non-forced 409", () => {
  const exists = new ProjectExistsError("project already exists: demo");
  assert.equal(overwriteDecision(exists, false), "offer-overwrite");
  // A forced create that still 409s must not silently retry with force again.
  assert.equal(overwriteDecision(exists, true), "fail");
  assert.equal(overwriteDecision(new Error("network down"), false), "fail");
  assert.equal(overwriteDecision(new Error("network down"), true), "fail");
});

test("createProjectFromVideo without force posts without a force flag", async () => {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
    urls.push(url);
    if (url.includes("/api/projects/ingest/")) {
      return Promise.resolve(
        jsonResponse({ slug: "demo", status: "done" }, 200)
      );
    }
    return Promise.resolve(jsonResponse({ jobId: "job-1", slug: "demo" }, 200));
  }) as typeof fetch;
  try {
    await createProjectFromVideo(new File(["fake-bytes"], "demo.mp4"));
    assert.doesNotMatch(urls[0] ?? "", /force=1/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
