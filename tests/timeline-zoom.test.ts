import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BASE_TIMELINE_PX_PER_SEC,
  clampTimelineZoom,
  clipLeftPx,
  clipWidthPx,
  pointerXToSec,
  sampleToPx,
  secToPx,
  timelineContentWidthPx,
} from "../web/lib/timeline-zoom.ts";

const SR = 48_000;

test("secToPx scales by zoom level", () => {
  assert.equal(secToPx(2, 1), BASE_TIMELINE_PX_PER_SEC * 2);
  assert.equal(secToPx(2, 2), BASE_TIMELINE_PX_PER_SEC * 4);
});

test("timelineContentWidthPx covers full duration at zoom", () => {
  assert.equal(timelineContentWidthPx(30, 1), BASE_TIMELINE_PX_PER_SEC * 30);
  assert.equal(timelineContentWidthPx(30, 0.5), BASE_TIMELINE_PX_PER_SEC * 15);
});

test("pointerXToSec accounts for scroll offset and zoom", () => {
  const rect = { left: 100, width: 400 } as DOMRect;
  const sec = pointerXToSec({
    clientX: 300,
    rect,
    scrollLeft: 200,
    zoom: 1,
  });
  assert.equal(sec, (300 - 100 + 200) / BASE_TIMELINE_PX_PER_SEC);
});

test("clipLeftPx and clipWidthPx position clips in pixel space", () => {
  assert.equal(clipLeftPx(5, 1), secToPx(5, 1));
  assert.equal(clipWidthPx(5, 8, 1), secToPx(3, 1));
});

test("sampleToPx maps samples through duration", () => {
  const durationSamples = SR * 10;
  assert.equal(
    sampleToPx({
      sample: SR * 2,
      durationSamples,
      zoom: 1,
      sampleRate: SR,
    }),
    secToPx(2, 1)
  );
});

test("clampTimelineZoom keeps zoom in supported range", () => {
  assert.equal(clampTimelineZoom(0.1), 0.25);
  assert.equal(clampTimelineZoom(10), 4);
  assert.equal(clampTimelineZoom(1.5), 1.5);
});
