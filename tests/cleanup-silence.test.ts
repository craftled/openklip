import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBulkSilenceUndoSnapshot,
  buildCleanupThresholdPatch,
  chunkDeadAirSpans,
  mapBucketsToBars,
  peaksCacheKey,
  peakWindowForCandidate,
  secToNorm,
  silenceOverlayRegions,
} from "../web/lib/cleanup-silence.ts";

test("peakWindowForCandidate pads one second on each side", () => {
  const window = peakWindowForCandidate({ startSec: 2.5, endSec: 4.0 });
  assert.equal(window.fromSec, 1.5);
  assert.equal(window.toSec, 5);
});

test("peakWindowForCandidate clamps fromSec at zero", () => {
  const window = peakWindowForCandidate({ startSec: 0.4, endSec: 1.2 });
  assert.equal(window.fromSec, 0);
  assert.equal(window.toSec, 2.2);
});

test("mapBucketsToBars maps min/max pairs into drawable bar rects", () => {
  const bars = mapBucketsToBars(
    [
      [-0.5, 0.5],
      [-1, 1],
    ],
    100,
    40
  );
  assert.equal(bars.length, 2);
  assert.ok(bars[0].h > 0);
  assert.ok(bars[1].h >= bars[0].h);
});

test("silenceOverlayRegions normalizes pad and cut spans inside the window", () => {
  const candidate = { startSec: 2, endSec: 3 };
  const window = { fromSec: 1, toSec: 5 };
  const regions = silenceOverlayRegions(candidate, 0.15, window);
  assert.equal(regions.cutStartNorm, secToNorm(2, window));
  assert.equal(regions.cutEndNorm, secToNorm(3, window));
  assert.ok(regions.leftPadStartNorm < regions.leftPadEndNorm);
  assert.ok(regions.rightPadStartNorm < regions.rightPadEndNorm);
});

test("buildCleanupThresholdPatch returns a single-field cleanup-config payload", () => {
  assert.deepEqual(buildCleanupThresholdPatch("minSec", 1.2), { minSec: 1.2 });
  assert.deepEqual(buildCleanupThresholdPatch("keepPadSec", 0.25), {
    keepPadSec: 0.25,
  });
});

test("chunkDeadAirSpans splits into batches of at most 50", () => {
  const spans = Array.from({ length: 120 }, (_, index) => ({
    fromSec: index,
    toSec: index + 0.5,
  }));
  const batches = chunkDeadAirSpans(spans, 50);
  assert.equal(batches.length, 3);
  assert.equal(batches[0]?.length, 50);
  assert.equal(batches[1]?.length, 50);
  assert.equal(batches[2]?.length, 20);
});

test("buildBulkSilenceUndoSnapshot records only dead-air ids for bulk silence apply", () => {
  assert.deepEqual(buildBulkSilenceUndoSnapshot(["da-1", "da-2"]), {
    wordIds: [],
    deadAirSpanIds: ["da-1", "da-2"],
  });
});

test("peaksCacheKey is stable for the same slug and window", () => {
  const a = peaksCacheKey("demo", 1.5, 4, 160);
  const b = peaksCacheKey("demo", 1.5, 4, 160);
  assert.equal(a, b);
  assert.notEqual(a, peaksCacheKey("demo", 1.5, 4, 200));
});
