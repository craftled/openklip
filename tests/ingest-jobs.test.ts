import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { FFMPEG, run } from "../src/ffmpeg.ts";
import { ingest, wordsFromRawChunks } from "../src/ingest.ts";
import {
  cancelIngestJob,
  deleteIngestJobRecord,
  getIngestJob,
  isSlugInFlight,
  resetIngestJobsForTests,
  retryIngestJob,
  startIngestJob,
} from "../src/ingest-jobs.ts";
import type { IngestProgress } from "../src/ingest-types.ts";
import { ingestJobsStorePath, projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const tick = () => new Promise((r) => setTimeout(r, 5));

const progress = (step: number): IngestProgress => ({
  phase: "proxy",
  message: "Building 720p preview",
  step,
  total: 6,
});

interface OnDiskJob {
  id: string;
  progress?: unknown;
  status: string;
}

function readStore(): OnDiskJob[] {
  return (
    JSON.parse(readFileSync(ingestJobsStorePath(), "utf8")) as {
      jobs: OnDiskJob[];
    }
  ).jobs;
}

async function pollUntilSettled(id: string, maxTicks = 400): Promise<void> {
  for (let i = 0; i < maxTicks; i += 1) {
    await tick();
    if (getIngestJob(id)?.status !== "running") {
      return;
    }
  }
  assert.fail(`job ${id} did not settle in time`);
}

test("a job starts running, reports progress, then completes with a slug", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    let report: ((p: IngestProgress) => void) | null = null;
    let finish: ((slug: string) => void) | null = null;
    const job = startIngestJob({
      filename: "talk.mp4",
      slug: "talk",
      sourcePath: "/tmp/does-not-matter.mp4",
      run: (onProgress) => {
        report = onProgress;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    });

    assert.equal(job.status, "running");
    assert.equal(job.sourcePath, "/tmp/does-not-matter.mp4");
    assert.equal(isSlugInFlight("talk"), true);

    report?.(progress(2));
    assert.equal(getIngestJob(job.id)?.progress?.step, 2);

    finish?.("talk");
    await tick();
    assert.equal(getIngestJob(job.id)?.status, "done");
    assert.equal(getIngestJob(job.id)?.slug, "talk");
    assert.equal(isSlugInFlight("talk"), false);
  });
});

test("a failing run lands the job in error and clears the in-flight lock", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "bad.mp4",
      slug: "bad",
      sourcePath: "/tmp/bad.mp4",
      run: () => Promise.reject(new Error("transcode failed")),
    });
    await tick();
    assert.equal(getIngestJob(job.id)?.status, "error");
    assert.equal(getIngestJob(job.id)?.error, "transcode failed");
    assert.equal(isSlugInFlight("bad"), false);
  });
});

test("job status transitions are persisted to the workspace-level ingest job store", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "clip.mp4",
      slug: "clip",
      sourcePath: "/tmp/clip.mp4",
      run: () => Promise.resolve("clip"),
    });
    await tick();
    assert.equal(getIngestJob(job.id)?.status, "done");

    const persisted = readStore().find((j) => j.id === job.id);
    assert.equal(persisted?.status, "done");
  });
});

test("progress ticks do not rewrite the persisted store; only status transitions do", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    let report: ((p: IngestProgress) => void) | null = null;
    let finish: ((slug: string) => void) | null = null;
    const job = startIngestJob({
      filename: "reel.mp4",
      slug: "reel",
      sourcePath: "/tmp/reel.mp4",
      run: (onProgress) => {
        report = onProgress;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    });
    await tick();
    const createdRecord = readStore().find((j) => j.id === job.id);
    assert.equal(createdRecord?.status, "running");
    assert.equal(createdRecord?.progress, undefined);

    for (let i = 1; i <= 5; i += 1) {
      report?.(progress(i));
      await tick();
    }
    // The on-disk record is byte-for-byte unchanged since creation: progress
    // ticks never triggered a write-through save, only CREATE and status
    // transitions do.
    const stillRecord = readStore().find((j) => j.id === job.id);
    assert.deepEqual(stillRecord, createdRecord);
    // Meanwhile the in-memory read (the poll hot path) IS live.
    assert.equal(getIngestJob(job.id)?.progress?.step, 5);

    finish?.("reel");
    await tick();
    const doneRecord = readStore().find((j) => j.id === job.id);
    assert.equal(doneRecord?.status, "done");
  });
});

test("a running job orphaned by a restart is reconciled to interrupted, not lost", async () => {
  await withTempProjectsRoot(() => {
    resetIngestJobsForTests();
    // Simulate a job left "running" when the process died: write the store
    // file directly, bypassing the write-through path entirely.
    const now = Date.now();
    const orphanedId = "orphan-job-1";
    const storePath = ingestJobsStorePath();
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(
      storePath,
      JSON.stringify({
        jobs: [
          {
            id: orphanedId,
            filename: "old.mp4",
            slug: "old",
            sourcePath: "/tmp/old.mp4",
            status: "running",
            createdAt: now,
            updatedAt: now,
          },
        ],
      })
    );

    // getIngestJob is exactly what the poll route calls: it must return the
    // record as "interrupted", never undefined (which the route would turn
    // into a 404 the client reads as "Ingest job lost").
    const job = getIngestJob(orphanedId);
    assert.equal(job?.status, "interrupted");
    assert.notEqual(job?.status, undefined);
  });
});

test("hydration keeps pre-upgrade records that lack sourcePath, and retry refuses them honestly", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    // A record exactly as a pre-CRAFT-6253 release persisted it: no
    // sourcePath (the field didn't exist). Dropping it at hydration would
    // erase the user's ingest history on upgrade — it must load intact.
    const now = Date.now();
    const legacyId = "legacy-job-1";
    const storePath = ingestJobsStorePath();
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(
      storePath,
      JSON.stringify({
        jobs: [
          {
            id: legacyId,
            filename: "legacy.mp4",
            slug: "legacy",
            status: "error",
            error: "transcode failed",
            createdAt: now,
            updatedAt: now,
          },
        ],
      })
    );

    assert.equal(getIngestJob(legacyId)?.status, "error");

    const result = await retryIngestJob(legacyId);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /predates retry support/);
  });
});

// ── cancelIngestJob (registry mechanics, no real subprocess) ──────────────

test("cancelIngestJob returns false for an unknown job id", async () => {
  await withTempProjectsRoot(() => {
    resetIngestJobsForTests();
    assert.equal(cancelIngestJob("nope"), false);
  });
});

test("cancelIngestJob returns false for a job that already finished", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "done.mp4",
      slug: "done",
      sourcePath: "/tmp/done.mp4",
      run: () => Promise.resolve("done"),
    });
    await tick();
    assert.equal(getIngestJob(job.id)?.status, "done");
    assert.equal(cancelIngestJob(job.id), false);
  });
});

test("cancelIngestJob aborts the run's signal and lands the job in cancelled, not error", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    let sawAbort = false;
    const job = startIngestJob({
      filename: "cancel-me.mp4",
      slug: "cancel-me",
      sourcePath: "/tmp/cancel-me.mp4",
      run: (_onProgress, signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            sawAbort = true;
            reject(new Error("aborted"));
          });
        }),
    });

    assert.equal(cancelIngestJob(job.id), true);
    await pollUntilSettled(job.id);
    assert.equal(sawAbort, true);
    assert.equal(getIngestJob(job.id)?.status, "cancelled");
    assert.equal(getIngestJob(job.id)?.error, "Cancelled by user");
    assert.equal(isSlugInFlight("cancel-me"), false);

    const persisted = readStore().find((j) => j.id === job.id);
    assert.equal(persisted?.status, "cancelled");
  });
});

test("a cancel that lands during unabortable post-ingest work still settles cancelled, not done", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    // Models the route closures' post-ingest phase (source persist,
    // folder-asset copy): work that never consults the signal and resolves
    // successfully even after abort. The caller of cancelIngestJob was told
    // true, so the record must not land on "done".
    let finish: ((slug: string) => void) | null = null;
    const job = startIngestJob({
      filename: "late-cancel.mp4",
      slug: "late-cancel",
      sourcePath: "/tmp/late-cancel.mp4",
      run: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });

    assert.equal(cancelIngestJob(job.id), true);
    finish?.("late-cancel");
    await pollUntilSettled(job.id);
    assert.equal(getIngestJob(job.id)?.status, "cancelled");
    assert.equal(getIngestJob(job.id)?.error, "Cancelled by user");
    assert.equal(isSlugInFlight("late-cancel"), false);
  });
});

test("cancelIngestJob refuses a take/cam job (composite slug) instead of reporting a false success", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    let aborted = false;
    // Mirrors how app/api/projects/[slug]/takes/route.ts and .../cams/route.ts
    // key their jobs: a composite `${slug}/takes/${id}` string, never a bare
    // SLUG_PATTERN match — ingestTake/ingestCam don't consume a signal yet
    // (out of CRAFT-6253's file-ownership scope), so aborting their
    // controller would do nothing; cancelIngestJob must say so honestly.
    const job = startIngestJob({
      filename: "take.mp4",
      slug: "project/takes/abc123",
      sourcePath: "/tmp/take.mp4",
      run: (_onProgress, signal) =>
        new Promise<string>((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          setTimeout(() => resolve("project/takes/abc123"), 20);
        }),
    });

    assert.equal(cancelIngestJob(job.id), false);
    await pollUntilSettled(job.id);
    // The job ran to its natural completion — cancellation genuinely never
    // reached it, proving the false return wasn't just a guessed message.
    assert.equal(aborted, false);
    assert.equal(getIngestJob(job.id)?.status, "done");
  });
});

// ── deleteIngestJobRecord (clean-up) ───────────────────────────────────────

test("deleteIngestJobRecord removes a terminal job from memory and the store file", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "gone.mp4",
      slug: "gone",
      sourcePath: "/tmp/gone.mp4",
      run: () => Promise.resolve("gone"),
    });
    await tick();
    assert.equal(getIngestJob(job.id)?.status, "done");

    assert.equal(deleteIngestJobRecord(job.id), true);
    assert.equal(getIngestJob(job.id), undefined);
    assert.equal(
      readStore().some((j) => j.id === job.id),
      false
    );
  });
});

test("deleteIngestJobRecord refuses a running job with an actionable error", async () => {
  await withTempProjectsRoot(() => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "busy.mp4",
      slug: "busy",
      sourcePath: "/tmp/busy.mp4",
      run: () => new Promise<string>(() => undefined),
    });
    assert.throws(() => deleteIngestJobRecord(job.id), /still running/i);
    // Refused deletes must not have removed the record either.
    assert.equal(getIngestJob(job.id)?.status, "running");
  });
});

test("deleteIngestJobRecord returns false for an unknown job id", async () => {
  await withTempProjectsRoot(() => {
    resetIngestJobsForTests();
    assert.equal(deleteIngestJobRecord("nope"), false);
  });
});

// ── retryIngestJob guard rails (no real subprocess needed) ────────────────

test("retryIngestJob returns an actionable error for an unknown job id", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const result = await retryIngestJob("nope");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /not found/);
  });
});

test("retryIngestJob refuses a still-running job", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "busy.mp4",
      slug: "busy",
      sourcePath: "/tmp/busy.mp4",
      run: () => new Promise<string>(() => undefined),
    });
    const result = await retryIngestJob(job.id);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /running/);
  });
});

test("retryIngestJob refuses a job that already completed successfully", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "done.mp4",
      slug: "done",
      sourcePath: "/tmp/done.mp4",
      run: () => Promise.resolve("done"),
    });
    await tick();
    const result = await retryIngestJob(job.id);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /already completed/);
  });
});

test("retryIngestJob refuses a take/cam composite-slug job (not a whole-project ingest)", async () => {
  await withTempProjectsRoot(async () => {
    resetIngestJobsForTests();
    const job = startIngestJob({
      filename: "take.mp4",
      slug: "myproj/takes/take1",
      sourcePath: "/tmp/take.mp4",
      run: () => Promise.reject(new Error("boom")),
    });
    await tick();
    assert.equal(getIngestJob(job.id)?.status, "error");
    const result = await retryIngestJob(job.id);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /whole-project ingest/);
  });
});

test("retryIngestJob refuses synchronously when a non-force job's project already exists", async () => {
  await withTempProjectsRoot(async ({ root }) => {
    resetIngestJobsForTests();
    // The dir can hold either this job's own half-written output (interrupted
    // after project.json landed) or a project the original run was refused
    // over. Retry must not silently escalate to force — and must say so NOW,
    // not return ok:true and fail asynchronously inside ingest()'s
    // assertProjectCanBeIngested.
    const slug = "occupied";
    writeFixtureProject(slug, makeProject({ slug }));
    const sourcePath = join(root, "occupied-source.mp4");
    writeFileSync(sourcePath, "not-a-real-video");

    const job = startIngestJob({
      filename: "occupied-source.mp4",
      slug,
      sourcePath,
      run: () => Promise.reject(new Error("boom")),
    });
    await tick();
    assert.equal(getIngestJob(job.id)?.status, "error");
    assert.equal(existsSync(projectPaths(slug).project), true);

    const result = await retryIngestJob(job.id);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /already exists/);
    // Still terminal — the refusal never flipped it back to running.
    assert.equal(getIngestJob(job.id)?.status, "error");
  });
});

// ── Real subprocess proof: cancellation actually kills ffmpeg ─────────────
// Mirrors tests/ingest-swap.test.ts's lavfi fixture pattern: real buildProxy
// (real ffmpeg) with the expensive/model-download steps
// (frames/index/transcribe) stubbed, so this stays fast and deterministic
// without needing Whisper/CLIP.

const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);

async function makeSlowClip(path: string, seconds: number): Promise<void> {
  await run(
    FFMPEG,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=1280x720:rate=30:duration=${seconds}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${seconds}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      path,
    ],
    "ffmpeg(cancel-fixture)"
  );
}

test("cancelling a real ingest job kills the ffmpeg subprocess and settles to cancelled promptly", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
  timeout: 30_000,
}, async () => {
  await withTempProjectsRoot(async ({ root }) => {
    resetIngestJobsForTests();
    const videoPath = join(root, "cancel-fixture.mp4");
    // Long/heavy enough that -preset veryfast still takes multiple
    // seconds to encode, so a prompt cancel is clearly distinguishable
    // from "it just finished on its own".
    await makeSlowClip(videoPath, 25);

    const job = startIngestJob({
      filename: "cancel-fixture.mp4",
      slug: "cancel-fixture",
      sourcePath: videoPath,
      run: (onProgress, signal) =>
        ingest(videoPath, {
          onProgress,
          signal,
          mediaDeps: {
            extractSampleFrames: () => Promise.resolve(),
            buildMomentIndex: () => Promise.resolve(),
            transcribeToWords: () =>
              Promise.resolve(
                wordsFromRawChunks([{ text: "hi", start: 0, end: 0.2 }])
              ),
          },
        }),
    });

    // Give ffmpeg a moment to actually spawn and start encoding before
    // cancelling, so this proves a live subprocess was killed rather than
    // racing the initial spawn.
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(getIngestJob(job.id)?.status, "running");
    assert.equal(cancelIngestJob(job.id), true);

    const start = Date.now();
    await pollUntilSettled(job.id, 2000);
    const elapsedMs = Date.now() - start;

    assert.equal(getIngestJob(job.id)?.status, "cancelled");
    // The 25s-duration clip would take multiple seconds to encode even at
    // "veryfast"; settling within this bound proves the kill propagated
    // promptly rather than the encode running to its natural completion.
    assert.ok(
      elapsedMs < 8000,
      `cancellation took too long to settle: ${elapsedMs}ms`
    );
  });
});
