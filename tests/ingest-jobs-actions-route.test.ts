import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as CANCEL_JOB } from "../app/api/projects/ingest/[jobId]/cancel/route.ts";
import { POST as RETRY_JOB } from "../app/api/projects/ingest/[jobId]/retry/route.ts";
import {
  DELETE as DELETE_JOB,
  GET as GET_JOB,
} from "../app/api/projects/ingest/[jobId]/route.ts";
import { GET as LIST_JOBS } from "../app/api/projects/jobs/route.ts";
import {
  getIngestJob,
  resetIngestJobsForTests,
  startIngestJob,
} from "../src/ingest-jobs.ts";
import { withTempProjectsRoot } from "./helpers/projectFixture.ts";

function ctx(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

function req(method: string, path = "/x", extraHeaders?: HeadersInit) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: extraHeaders,
  });
}

const tick = () => new Promise((r) => setTimeout(r, 5));

test("POST cancel: 404 for an unknown job id", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const res = await CANCEL_JOB(req("POST"), ctx("nope"));
    assert.equal(res.status, 404);
  });
});

test("POST cancel: cancels a running job and returns { ok: true }", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "x.mp4",
      slug: "x",
      sourcePath: "/tmp/x.mp4",
      run: (_onProgress, signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("killed")));
        }),
    });
    const res = await CANCEL_JOB(req("POST"), ctx(job.id));
    assert.equal(res.status, 200);
    const json = (await res.json()) as { ok: boolean };
    assert.equal(json.ok, true);

    for (let i = 0; i < 100; i += 1) {
      await tick();
      if (getIngestJob(job.id)?.status !== "running") {
        break;
      }
    }
    assert.equal(getIngestJob(job.id)?.status, "cancelled");
  });
});

test("POST cancel: 403 when the trust guard rejects the request", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "x.mp4",
      slug: "x",
      sourcePath: "/tmp/x.mp4",
      run: () => new Promise<string>(() => undefined),
    });
    const res = await CANCEL_JOB(
      req("POST", "/x", { origin: "http://evil.example" }),
      ctx(job.id)
    );
    assert.equal(res.status, 403);
    // A rejected request must not have cancelled the job.
    assert.equal(getIngestJob(job.id)?.status, "running");
  });
});

test("POST retry: 404 for an unknown job id", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const res = await RETRY_JOB(req("POST"), ctx("nope"));
    assert.equal(res.status, 404);
  });
});

test("POST retry: 409 with an actionable error for a still-running job", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "x.mp4",
      slug: "x",
      sourcePath: "/tmp/x.mp4",
      run: () => new Promise<string>(() => undefined),
    });
    const res = await RETRY_JOB(req("POST"), ctx(job.id));
    assert.equal(res.status, 409);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /running/);
  });
});

test("POST retry: 403 when the trust guard rejects the request", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "x.mp4",
      slug: "x",
      sourcePath: "/tmp/x.mp4",
      run: () => Promise.reject(new Error("boom")),
    });
    await tick();
    const res = await RETRY_JOB(
      req("POST", "/x", { origin: "http://evil.example" }),
      ctx(job.id)
    );
    assert.equal(res.status, 403);
  });
});

test("GET job then DELETE: cleans up a terminal job, then GET 404s", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "x.mp4",
      slug: "x",
      sourcePath: "/tmp/x.mp4",
      run: () => Promise.resolve("x"),
    });
    await tick();
    const getRes = await GET_JOB(req("GET"), ctx(job.id));
    assert.equal(getRes.status, 200);

    const delRes = await DELETE_JOB(req("DELETE"), ctx(job.id));
    assert.equal(delRes.status, 200);
    const json = (await delRes.json()) as { ok: boolean };
    assert.equal(json.ok, true);

    const afterRes = await GET_JOB(req("GET"), ctx(job.id));
    assert.equal(afterRes.status, 404);
  });
});

test("DELETE: 404 for an unknown job id", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const res = await DELETE_JOB(req("DELETE"), ctx("nope"));
    assert.equal(res.status, 404);
  });
});

test("DELETE: 409 with an actionable error for a running job", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "x.mp4",
      slug: "x",
      sourcePath: "/tmp/x.mp4",
      run: () => new Promise<string>(() => undefined),
    });
    const res = await DELETE_JOB(req("DELETE"), ctx(job.id));
    assert.equal(res.status, 409);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /running/);
  });
});

test("DELETE: 403 when the trust guard rejects the request", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "x.mp4",
      slug: "x",
      sourcePath: "/tmp/x.mp4",
      run: () => Promise.resolve("x"),
    });
    await tick();
    const res = await DELETE_JOB(
      req("DELETE", "/x", { origin: "http://evil.example" }),
      ctx(job.id)
    );
    assert.equal(res.status, 403);
    // A rejected request must not have deleted the record.
    assert.equal(getIngestJob(job.id)?.status, "done");
  });
});

test("GET /api/projects/jobs lists every ingest job across the workspace", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    startIngestJob({
      filename: "a.mp4",
      slug: "a",
      sourcePath: "/tmp/a.mp4",
      run: () => Promise.resolve("a"),
    });
    startIngestJob({
      filename: "b.mp4",
      slug: "b",
      sourcePath: "/tmp/b.mp4",
      run: () => Promise.resolve("b"),
    });
    await tick();
    const res = LIST_JOBS();
    assert.equal(res.status, 200);
    const json = (await res.json()) as { jobs: Array<{ slug: string }> };
    assert.equal(json.jobs.length, 2);
  });
});
