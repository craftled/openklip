import assert from "node:assert/strict";
import { test } from "node:test";
import { pollSilencesJob } from "../web/hooks/use-cleanup-tab-data.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withFetch(
  handler: () => Response,
  fn: () => Promise<void>
): Promise<void> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(handler())) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = realFetch;
  });
}

test("pollSilencesJob resolves to the silences array once the job is done", async () => {
  await withFetch(
    () => jsonResponse({ status: "done", silences: [[1, 2]] }),
    async () => {
      const result = await pollSilencesJob("demo", "job-1");
      assert.deepEqual(result, [[1, 2]]);
    }
  );
});

test("pollSilencesJob resolves to null (not an infinite loop) for an interrupted job", async () => {
  await withFetch(
    () => jsonResponse({ status: "interrupted", error: "server restarted" }),
    async () => {
      const result = await pollSilencesJob("demo", "job-1");
      assert.equal(result, null);
    }
  );
});

test("pollSilencesJob resolves to null (not an infinite loop) for a cancelled job", async () => {
  await withFetch(
    () => jsonResponse({ status: "cancelled" }),
    async () => {
      const result = await pollSilencesJob("demo", "job-1");
      assert.equal(result, null);
    }
  );
});

test("pollSilencesJob resolves to null for an error job", async () => {
  await withFetch(
    () => jsonResponse({ status: "error", error: "boom" }),
    async () => {
      const result = await pollSilencesJob("demo", "job-1");
      assert.equal(result, null);
    }
  );
});
