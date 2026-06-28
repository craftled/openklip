import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOverlaySnapPoints,
  buildTimelineSnapPoints,
  buildWordSnapPoints,
  defaultSnapThresholdSamples,
  resolveSnap,
  snapSample,
} from "../web/lib/timeline-snap.ts";

const SR = 48_000;

test("buildWordSnapPoints emits start and end for each word", () => {
  const points = buildWordSnapPoints([
    { startSample: SR, endSample: SR * 2 },
    { startSample: SR * 3, endSample: SR * 4 },
  ]);
  assert.deepEqual(
    points.map((p) => p.sample).sort((a, b) => a - b),
    [SR, SR * 2, SR * 3, SR * 4]
  );
});

test("buildOverlaySnapPoints skips the active clip", () => {
  const points = buildOverlaySnapPoints(
    [
      { id: "a", startSample: SR * 5, endSample: SR * 7 },
      { id: "b", startSample: SR * 10, endSample: SR * 12 },
    ],
    "a"
  );
  assert.deepEqual(
    points.map((p) => p.sample).sort((a, b) => a - b),
    [SR * 10, SR * 12]
  );
});

test("resolveSnap picks the nearest point within threshold", () => {
  const threshold = defaultSnapThresholdSamples(SR);
  const result = resolveSnap(SR * 2 + 200, [{ sample: SR * 2 }], threshold);
  assert.equal(result.snappedSample, SR * 2);
  assert.equal(result.snapPoint?.sample, SR * 2);
});

test("resolveSnap returns raw sample when nothing is close enough", () => {
  const threshold = defaultSnapThresholdSamples(SR);
  const raw = SR * 9;
  const result = resolveSnap(raw, [{ sample: SR }], threshold);
  assert.equal(result.snappedSample, raw);
  assert.equal(result.snapPoint, null);
});

test("buildTimelineSnapPoints merges words, overlays, and playhead", () => {
  const points = buildTimelineSnapPoints({
    words: [{ startSample: SR, endSample: SR * 2 }],
    overlays: [{ id: "a", startSample: SR * 5, endSample: SR * 6 }],
    excludeClipId: "a",
    playheadSample: SR * 3,
  });
  assert.deepEqual(
    points.map((p) => p.sample).sort((a, b) => a - b),
    [SR, SR * 2, SR * 3]
  );
});

test("snapSample is a no-op when snapping is disabled", () => {
  const snapped = snapSample({
    sample: SR * 2 + 100,
    enabled: false,
    snapPoints: [{ sample: SR * 2 }],
    thresholdSamples: defaultSnapThresholdSamples(SR),
  });
  assert.equal(snapped.snappedSample, SR * 2 + 100);
  assert.equal(snapped.snapPoint, null);
});
