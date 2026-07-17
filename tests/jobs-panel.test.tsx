import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JobsList, openTargetSlug } from "../web/components/jobs-panel.tsx";
import type { JobView } from "../web/lib/jobs-client.ts";

function job(overrides: Partial<JobView> = {}): JobView {
  return {
    id: "job-1",
    slug: "demo",
    kind: "ingest",
    label: "clip.mp4 → demo",
    status: "running",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function render(
  overrides: Partial<Parameters<typeof JobsList>[0]> = {}
): string {
  return renderToStaticMarkup(
    <JobsList
      cleanupArmedId={null}
      jobs={[]}
      onCancel={() => undefined}
      onCleanupArm={() => undefined}
      onCleanupCancel={() => undefined}
      onCleanupConfirm={() => undefined}
      onOpen={() => undefined}
      onRetry={() => undefined}
      {...overrides}
    />
  );
}

test("empty state renders the no-jobs copy and no rows", () => {
  const html = render();
  assert.match(html, /No background jobs yet/);
  assert.doesNotMatch(html, /data-job-row/);
});

test("a running job shows its badge, progress line, and a Cancel button only", () => {
  const html = render({
    jobs: [
      job({
        status: "running",
        progress: { message: "Transcoding", step: 2, total: 5 },
      }),
    ],
  });
  assert.match(html, /data-job-row/);
  assert.match(html, /data-job-status="running"/);
  assert.match(html, /Transcoding.*2\/5/s);
  assert.match(html, /data-job-cancel/);
  assert.doesNotMatch(html, /data-job-retry/);
  assert.doesNotMatch(html, /data-job-cleanup/);
  assert.doesNotMatch(html, /data-job-open/);
});

test("an error job shows Retry and Clean up but not Cancel or Open", () => {
  const html = render({
    jobs: [job({ status: "error", error: "boom: disk full" })],
  });
  assert.match(html, /data-job-status="error"/);
  assert.match(html, /data-job-error/);
  assert.match(html, /boom: disk full/);
  assert.match(html, /data-job-retry/);
  assert.match(html, /data-job-cleanup/);
  assert.doesNotMatch(html, /data-job-cancel/);
  assert.doesNotMatch(html, /data-job-open/);
});

test("an interrupted job shows Retry and Clean up", () => {
  const html = render({ jobs: [job({ status: "interrupted" })] });
  assert.match(html, /data-job-status="interrupted"/);
  assert.match(html, /data-job-retry/);
  assert.match(html, /data-job-cleanup/);
});

test("a cancelled job shows Retry and Clean up", () => {
  const html = render({ jobs: [job({ status: "cancelled" })] });
  assert.match(html, /data-job-retry/);
  assert.match(html, /data-job-cleanup/);
});

test("a partial ingest job shows Retry, Clean up, and Open", () => {
  const html = render({
    jobs: [job({ status: "partial", warning: "source persist failed" })],
  });
  assert.match(html, /data-job-status="partial"/);
  assert.match(html, /data-job-warning/);
  assert.match(html, /source persist failed/);
  assert.match(html, /data-job-retry/);
  assert.match(html, /data-job-cleanup/);
  assert.match(html, /data-job-open/);
});

test("a done ingest job shows Clean up and Open but not Retry or Cancel", () => {
  const html = render({ jobs: [job({ status: "done" })] });
  assert.match(html, /data-job-status="done"/);
  assert.match(html, /data-job-cleanup/);
  assert.match(html, /data-job-open/);
  assert.doesNotMatch(html, /data-job-retry/);
  assert.doesNotMatch(html, /data-job-cancel/);
});

test("a done silences job shows Clean up but not Open (silences jobs have no Open)", () => {
  const html = render({
    jobs: [
      job({
        kind: "silences",
        status: "done",
        label: "Silence analysis: demo",
      }),
    ],
  });
  assert.match(html, /data-job-cleanup/);
  assert.doesNotMatch(html, /data-job-open/);
});

test("cleanup arm state replaces the Clean up button with confirm/cancel", () => {
  const html = render({
    cleanupArmedId: "ingest:job-1",
    jobs: [job({ status: "done" })],
  });
  assert.match(html, /data-job-cleanup-confirm/);
  assert.match(html, /data-job-cleanup-cancel-confirm/);
  assert.doesNotMatch(html, /data-job-cleanup"/);
});

test("rows are keyed by kind+id so an ingest job and a silences job never collide", () => {
  const html = render({
    jobs: [
      job({ id: "shared-id", kind: "ingest" }),
      job({ id: "shared-id", kind: "silences", status: "done" }),
    ],
  });
  const rows = html.match(/data-job-row/g) ?? [];
  assert.equal(rows.length, 2);
});

test("openTargetSlug returns the parent slug for a composite take job", () => {
  assert.equal(openTargetSlug(job({ slug: "demo/takes/abc123" })), "demo");
});

test("openTargetSlug returns the parent slug for a composite cam job", () => {
  assert.equal(openTargetSlug(job({ slug: "demo/cams/abc123" })), "demo");
});

test("openTargetSlug returns a bare project slug unchanged", () => {
  assert.equal(openTargetSlug(job({ slug: "demo" })), "demo");
});

test("openTargetSlug handles nested parent slugs before the takes marker", () => {
  assert.equal(
    openTargetSlug(job({ slug: "parent/child/takes/xyz" })),
    "parent/child"
  );
});
