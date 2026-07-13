import assert from "node:assert/strict";
import { test } from "node:test";
import { ingestCamFromVideo } from "../web/lib/cam-create.ts";

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

test("ingestCamFromVideo posts to the per-slug cams route and resolves the cam id via polling", async () => {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = urlOf(input);
    urls.push(url);
    if (url.includes("/api/projects/ingest/")) {
      return Promise.resolve(
        jsonResponse({ slug: "cam1", status: "done" }, 200)
      );
    }
    return Promise.resolve(
      jsonResponse({ jobId: "job-1", slug: "demo", camId: "cam1" }, 200)
    );
  }) as typeof fetch;
  try {
    const camId = await ingestCamFromVideo(
      "demo",
      new File(["fake-bytes"], "angle.mp4")
    );
    assert.equal(camId, "cam1");
    assert.match(urls[0] ?? "", /\/api\/projects\/demo\/cams$/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("ingestCamFromVideo fails plainly when the route rejects the upload", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      jsonResponse({ error: "project not found: demo" }, 404)
    )) as typeof fetch;
  try {
    await assert.rejects(
      ingestCamFromVideo("demo", new File(["fake-bytes"], "angle.mp4")),
      /project not found/
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("ingestCamFromVideo sends optional name, role, and offset fields", async () => {
  const realFetch = globalThis.fetch;
  const bodies: FormData[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (url.includes("/api/projects/ingest/")) {
      return Promise.resolve(
        jsonResponse({ slug: "cam2", status: "done" }, 200)
      );
    }
    bodies.push(init?.body as FormData);
    return Promise.resolve(jsonResponse({ jobId: "job-1", slug: "demo" }, 200));
  }) as typeof fetch;
  try {
    await ingestCamFromVideo("demo", new File(["fake-bytes"], "angle.mp4"), {
      name: "Wide angle",
      role: "wide",
      offsetMs: -250,
    });
    assert.equal(bodies[0]?.get("name"), "Wide angle");
    assert.equal(bodies[0]?.get("role"), "wide");
    assert.equal(bodies[0]?.get("offsetMs"), "-250");
  } finally {
    globalThis.fetch = realFetch;
  }
});
