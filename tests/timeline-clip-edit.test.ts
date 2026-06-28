import assert from "node:assert/strict";
import { test } from "node:test";
import {
  minClipSpanSamples,
  moveClipSpan,
  pointerRatio,
  pointerXToSample,
  resizeClipSpan,
} from "../web/lib/timeline-clip-edit.ts";
import {
  buildWordSnapPoints,
  defaultSnapThresholdSamples,
  snapSample,
} from "../web/lib/timeline-snap.ts";

const SR = 48_000;
const DUR = SR * 60;

test("moveClipSpan preserves duration and clamps to project bounds", () => {
  const span = SR * 2;
  const moved = moveClipSpan(SR, SR * 3, SR * 5, DUR, minClipSpanSamples(SR));
  assert.equal(moved.endSample - moved.startSample, span);
  assert.equal(moved.startSample, SR * 6);
  assert.equal(moved.endSample, SR * 8);
});

test("moveClipSpan clamps when dragged past the end", () => {
  const span = SR * 2;
  const moved = moveClipSpan(
    SR * 50,
    SR * 52,
    SR * 20,
    DUR,
    minClipSpanSamples(SR)
  );
  assert.equal(moved.endSample, DUR);
  assert.equal(moved.startSample, DUR - span);
});

test("resizeClipSpan enforces minimum span on start edge", () => {
  const minSpan = minClipSpanSamples(SR);
  const resized = resizeClipSpan(SR, SR * 3, "start", SR * 2.99, DUR, minSpan);
  assert.equal(resized.endSample, SR * 3);
  assert.equal(resized.endSample - resized.startSample, minSpan);
});

test("resizeClipSpan clamps end edge to duration", () => {
  const resized = resizeClipSpan(
    SR,
    SR * 3,
    "end",
    DUR + SR,
    DUR,
    minClipSpanSamples(SR)
  );
  assert.equal(resized.endSample, DUR);
});

test("pointerRatio and pointerXToSample map x to samples", () => {
  const rect = { left: 100, width: 200 } as DOMRect;
  assert.equal(pointerRatio(150, rect), 0.25);
  assert.equal(pointerXToSample(150, rect, SR * 10), SR * 2.5);
});

test("snap then resize pulls trim handle to a word edge", () => {
  const threshold = defaultSnapThresholdSamples(SR);
  const snapPoints = buildWordSnapPoints([
    { startSample: SR * 2, endSample: SR * 3 },
  ]);
  const nearWordStart = snapSample({
    sample: SR * 2 + 300,
    enabled: true,
    snapPoints,
    thresholdSamples: threshold,
  });
  const resized = resizeClipSpan(
    SR,
    SR * 5,
    "start",
    nearWordStart.snappedSample,
    DUR,
    minClipSpanSamples(SR)
  );
  assert.equal(resized.startSample, SR * 2);
});
