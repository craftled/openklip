import assert from "node:assert/strict";
import { test } from "node:test";
import { ingestTakeFromVideo } from "../web/lib/take-create.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" || input instanceof URL
    ? String(input)
    : input.url;
}

test("ingestTakeFromVideo posts to the per-slug takes route and resolves the take id via polling", async () => {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = urlOf(input);
    urls.push(url);
    if (url.includes("/api/projects/ingest/")) {
      return Promise.resolve(
        jsonResponse({ slug: "clip", status: "done" }, 200)
      );
    }
    return Promise.resolve(
      jsonResponse({ jobId: "job-1", slug: "demo", takeId: "clip" }, 200)
    );
  }) as typeof fetch;
  try {
    const takeId = await ingestTakeFromVideo(
      "demo",
      new File(["fake-bytes"], "clip.mp4")
    );
    assert.equal(takeId, "clip");
    assert.match(urls[0] ?? "", /\/api\/projects\/demo\/takes$/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("ingestTakeFromVideo fails plainly when the route rejects the upload", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      jsonResponse({ error: "project not found: demo" }, 404)
    )) as typeof fetch;
  try {
    await assert.rejects(
      ingestTakeFromVideo("demo", new File(["fake-bytes"], "clip.mp4")),
      /project not found/
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("ingestTakeFromVideo surfaces a job error surfaced from the poll loop", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = urlOf(input);
    if (url.includes("/api/projects/ingest/")) {
      return Promise.resolve(
        jsonResponse(
          { slug: "demo", status: "error", error: "probe failed" },
          200
        )
      );
    }
    return Promise.resolve(jsonResponse({ jobId: "job-1", slug: "demo" }, 200));
  }) as typeof fetch;
  try {
    await assert.rejects(
      ingestTakeFromVideo("demo", new File(["fake-bytes"], "clip.mp4")),
      /probe failed/
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("ingestTakeFromVideo sends the optional id and label fields", async () => {
  const realFetch = globalThis.fetch;
  const bodies: FormData[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (url.includes("/api/projects/ingest/")) {
      return Promise.resolve(
        jsonResponse({ slug: "custom-id", status: "done" }, 200)
      );
    }
    bodies.push(init?.body as FormData);
    return Promise.resolve(jsonResponse({ jobId: "job-1", slug: "demo" }, 200));
  }) as typeof fetch;
  try {
    await ingestTakeFromVideo("demo", new File(["fake-bytes"], "clip.mp4"), {
      id: "custom-id",
      label: "Take two",
    });
    assert.equal(bodies[0]?.get("id"), "custom-id");
    assert.equal(bodies[0]?.get("label"), "Take two");
  } finally {
    globalThis.fetch = realFetch;
  }
});
