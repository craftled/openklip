import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cancelIngestJob,
  cancelSilencesJob,
  deleteIngestJob,
  deleteSilencesJob,
  listIngestJobs,
  listSilencesJobs,
  retryIngestJob,
  retrySilencesJob,
} from "../web/lib/jobs-client.ts";

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

function withFetch(
  handler: (url: string, init?: RequestInit) => Response,
  fn: () => Promise<void>
): Promise<void> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(urlOf(input), init))) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = realFetch;
  });
}

test("listIngestJobs normalizes ingest jobs into JobView rows", async () => {
  await withFetch(
    () =>
      jsonResponse(
        {
          jobs: [
            {
              id: "job-1",
              slug: "demo",
              filename: "clip.mp4",
              status: "running",
              createdAt: 1,
              updatedAt: 2,
              progress: { message: "transcoding", step: 2, total: 5 },
            },
          ],
        },
        200
      ),
    async () => {
      const result = await listIngestJobs();
      assert.equal(result.ok, true);
      if (!result.ok) {
        return;
      }
      assert.equal(result.jobs.length, 1);
      const job = result.jobs[0];
      assert.equal(job?.kind, "ingest");
      assert.equal(job?.id, "job-1");
      assert.equal(job?.slug, "demo");
      assert.equal(job?.status, "running");
      assert.match(job?.label ?? "", /clip\.mp4/);
      assert.equal(job?.progress?.step, 2);
      assert.equal(job?.progress?.total, 5);
    }
  );
});

test("listIngestJobs returns ok:false on a non-OK response", async () => {
  await withFetch(
    () => jsonResponse({ error: "boom" }, 500),
    async () => {
      const result = await listIngestJobs();
      assert.equal(result.ok, false);
    }
  );
});

test("listIngestJobs drops malformed rows instead of throwing", async () => {
  await withFetch(
    () => jsonResponse({ jobs: [{ nope: true }, null, "x"] }, 200),
    async () => {
      const result = await listIngestJobs();
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.jobs, []);
      }
    }
  );
});

test("listSilencesJobs normalizes silences jobs into JobView rows with a slug-derived label", async () => {
  await withFetch(
    () =>
      jsonResponse(
        {
          jobs: [
            {
              id: "demo~abc",
              slug: "demo",
              status: "done",
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        },
        200
      ),
    async () => {
      const result = await listSilencesJobs("demo");
      assert.equal(result.ok, true);
      if (!result.ok) {
        return;
      }
      const job = result.jobs[0];
      assert.equal(job?.kind, "silences");
      assert.equal(job?.status, "done");
      assert.match(job?.label ?? "", /demo/);
    }
  );
});

test("cancelIngestJob posts to the cancel route and returns the server's ok/error", async () => {
  const calls: string[] = [];
  await withFetch(
    (url) => {
      calls.push(url);
      return jsonResponse({ ok: false }, 200);
    },
    async () => {
      const result = await cancelIngestJob("job-1");
      assert.equal(result.ok, false);
      assert.match(calls[0] ?? "", /\/api\/projects\/ingest\/job-1\/cancel$/);
    }
  );
});

test("retryIngestJob surfaces the server's honest refusal message", async () => {
  await withFetch(
    () => jsonResponse({ error: "original source no longer available" }, 409),
    async () => {
      const result = await retryIngestJob("job-1");
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /original source no longer available/);
    }
  );
});

test("deleteIngestJob returns ok:true on success", async () => {
  await withFetch(
    () => jsonResponse({ ok: true }, 200),
    async () => {
      const result = await deleteIngestJob("job-1");
      assert.equal(result.ok, true);
    }
  );
});

test("cancelSilencesJob posts to the per-slug cancel route", async () => {
  const calls: string[] = [];
  await withFetch(
    (url) => {
      calls.push(url);
      return jsonResponse({ ok: true }, 200);
    },
    async () => {
      const result = await cancelSilencesJob("demo", "demo~abc");
      assert.equal(result.ok, true);
      assert.match(
        calls[0] ?? "",
        /\/api\/projects\/demo\/silences\/demo~abc\/cancel$/
      );
    }
  );
});

test("retrySilencesJob returns ok:false with a message on network failure", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.reject(new Error("network down"))) as typeof fetch;
  try {
    const result = await retrySilencesJob("demo", "demo~abc");
    assert.equal(result.ok, false);
    assert.ok(result.error);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("deleteSilencesJob surfaces a 409 refusal", async () => {
  await withFetch(
    () => jsonResponse({ error: "job is still running; cancel it first" }, 409),
    async () => {
      const result = await deleteSilencesJob("demo", "demo~abc");
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /cancel it first/);
    }
  );
});
