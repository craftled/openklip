import assert from "node:assert/strict";
import { test } from "node:test";
import type { Keyframe } from "../src/keyframes.ts";
import {
  addKeyframe,
  clampKeyframeSampleOffset,
  defaultKeyframeValue,
  keyframePositionFraction,
  playheadOffsetInClip,
  removeKeyframeAt,
  updateKeyframeAt,
} from "../web/lib/keyframe-ui.ts";

const SR = 48_000;

test("keyframePositionFraction maps offset to 0-1 within clip length", () => {
  assert.equal(keyframePositionFraction(0, SR * 2), 0);
  assert.equal(keyframePositionFraction(SR, SR * 2), 0.5);
  assert.equal(keyframePositionFraction(SR * 2, SR * 2), 1);
  assert.equal(keyframePositionFraction(SR * 3, SR * 2), 1);
  assert.equal(keyframePositionFraction(-100, SR * 2), 0);
});

test("playheadOffsetInClip returns null outside the clip span", () => {
  assert.equal(playheadOffsetInClip(SR, SR * 2, SR * 4), null);
  assert.equal(playheadOffsetInClip(SR * 5, SR * 2, SR * 4), null);
  assert.equal(playheadOffsetInClip(SR * 2, SR * 2, SR * 4), 0);
  assert.equal(playheadOffsetInClip(SR * 3, SR * 2, SR * 4), SR);
});

test("clampKeyframeSampleOffset clamps to clip bounds", () => {
  assert.equal(clampKeyframeSampleOffset(-500, SR), 0);
  assert.equal(clampKeyframeSampleOffset(SR * 1.4, SR), SR);
  assert.equal(clampKeyframeSampleOffset(SR * 0.6, SR), Math.round(SR * 0.6));
});

test("defaultKeyframeValue returns sensible starting values", () => {
  assert.equal(defaultKeyframeValue("opacity"), 1);
  assert.equal(defaultKeyframeValue("scale"), 1);
  assert.equal(defaultKeyframeValue("x"), 0);
  assert.equal(defaultKeyframeValue("y"), 0);
});

test("addKeyframe keeps keyframes sorted by sampleOffset", () => {
  const existing: Keyframe[] = [
    {
      sampleOffset: SR,
      property: "opacity",
      value: 1,
      easing: "linear",
    },
  ];
  const next = addKeyframe(existing, {
    sampleOffset: 0,
    property: "scale",
    value: 1.2,
    easing: "easeOut",
  });
  assert.deepEqual(
    next.map((kf) => kf.sampleOffset),
    [0, SR]
  );
});

test("updateKeyframeAt and removeKeyframeAt preserve other entries", () => {
  const keyframes: Keyframe[] = [
    {
      sampleOffset: 0,
      property: "opacity",
      value: 1,
      easing: "linear",
    },
    {
      sampleOffset: SR,
      property: "scale",
      value: 1.5,
      easing: "easeIn",
    },
  ];
  const updated = updateKeyframeAt(keyframes, 1, { value: 2 });
  assert.equal(updated[1]?.value, 2);
  assert.equal(updated[0]?.value, 1);
  const removed = removeKeyframeAt(keyframes, 0);
  assert.equal(removed.length, 1);
  assert.equal(removed[0]?.property, "scale");
});
