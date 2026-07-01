import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getIngestJob,
  isSlugInFlight,
  startIngestJob,
} from "../src/ingest-jobs.ts";
import type { IngestProgress } from "../src/ingest-types.ts";

const tick = () => new Promise((r) => setTimeout(r, 5));

const progress = (step: number): IngestProgress => ({
  phase: "proxy",
  message: "Building 720p preview",
  step,
  total: 6,
});

test("a job starts running, reports progress, then completes with a slug", async () => {
  let report: ((p: IngestProgress) => void) | null = null;
  let finish: ((slug: string) => void) | null = null;
  const job = startIngestJob({
    filename: "talk.mp4",
    slug: "talk",
    run: (onProgress) => {
      report = onProgress;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    },
  });

  assert.equal(job.status, "running");
  assert.equal(isSlugInFlight("talk"), true);

  report?.(progress(2));
  assert.equal(getIngestJob(job.id)?.progress?.step, 2);

  finish?.("talk");
  await tick();
  assert.equal(getIngestJob(job.id)?.status, "done");
  assert.equal(getIngestJob(job.id)?.slug, "talk");
  assert.equal(isSlugInFlight("talk"), false);
});

test("a failing run lands the job in error and clears the in-flight lock", async () => {
  const job = startIngestJob({
    filename: "bad.mp4",
    slug: "bad",
    run: () => Promise.reject(new Error("transcode failed")),
  });
  await tick();
  assert.equal(getIngestJob(job.id)?.status, "error");
  assert.equal(getIngestJob(job.id)?.error, "transcode failed");
  assert.equal(isSlugInFlight("bad"), false);
});
