import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateKeyframes, KeyframeSchema } from "../src/keyframes.ts";

test("KeyframeSchema: enforces sampleOffset and property constraints", () => {
  assert.throws(() =>
    KeyframeSchema.parse({
      sampleOffset: -1,
      property: "opacity",
      value: 1,
    })
  );
  assert.throws(() =>
    KeyframeSchema.parse({
      sampleOffset: 0.5,
      property: "opacity",
      value: 1,
    })
  );
  assert.throws(() =>
    KeyframeSchema.parse({
      sampleOffset: 0,
      property: "rotation",
      value: 1,
    })
  );
  const parsed = KeyframeSchema.parse({
    sampleOffset: 10,
    property: "scale",
    value: 1.2,
  });
  assert.equal(parsed.easing, "linear");
});

test("evaluateKeyframes: empty keyframes returns an empty object", () => {
  assert.deepEqual(evaluateKeyframes([], 0), {});
  assert.deepEqual(evaluateKeyframes([], 1234), {});
});

test("evaluateKeyframes: single keyframe holds for all sample offsets", () => {
  const keyframes = [
    {
      sampleOffset: 100,
      property: "opacity" as const,
      value: 0.5,
      easing: "linear" as const,
    },
  ];
  assert.deepEqual(evaluateKeyframes(keyframes, 0), { opacity: 0.5 });
  assert.deepEqual(evaluateKeyframes(keyframes, 100), { opacity: 0.5 });
  assert.deepEqual(evaluateKeyframes(keyframes, 1000), { opacity: 0.5 });
});

test("evaluateKeyframes: before first and after last keyframe hold edge values", () => {
  const keyframes = [
    {
      sampleOffset: 100,
      property: "opacity" as const,
      value: 0.2,
      easing: "linear" as const,
    },
    {
      sampleOffset: 200,
      property: "opacity" as const,
      value: 0.8,
      easing: "linear" as const,
    },
  ];
  assert.deepEqual(evaluateKeyframes(keyframes, 50), { opacity: 0.2 });
  assert.deepEqual(evaluateKeyframes(keyframes, 250), { opacity: 0.8 });
});

test("evaluateKeyframes: linear interpolation uses later keyframe easing metadata", () => {
  const keyframes = [
    {
      sampleOffset: 0,
      property: "opacity" as const,
      value: 0,
      easing: "easeIn" as const,
    },
    {
      sampleOffset: 100,
      property: "opacity" as const,
      value: 1,
      easing: "linear" as const,
    },
  ];
  assert.deepEqual(evaluateKeyframes(keyframes, 50), { opacity: 0.5 });
});

test("evaluateKeyframes: easeIn interpolation", () => {
  const keyframes = [
    {
      sampleOffset: 0,
      property: "scale" as const,
      value: 1,
      easing: "linear" as const,
    },
    {
      sampleOffset: 100,
      property: "scale" as const,
      value: 2,
      easing: "easeIn" as const,
    },
  ];
  assert.deepEqual(evaluateKeyframes(keyframes, 50), { scale: 1.125 });
});

test("evaluateKeyframes: easeOut interpolation", () => {
  const keyframes = [
    {
      sampleOffset: 0,
      property: "scale" as const,
      value: 1,
      easing: "linear" as const,
    },
    {
      sampleOffset: 100,
      property: "scale" as const,
      value: 2,
      easing: "easeOut" as const,
    },
  ];
  assert.deepEqual(evaluateKeyframes(keyframes, 50), { scale: 1.875 });
});

test("evaluateKeyframes: easeInOut interpolation", () => {
  const keyframes = [
    {
      sampleOffset: 0,
      property: "x" as const,
      value: 0,
      easing: "linear" as const,
    },
    {
      sampleOffset: 100,
      property: "x" as const,
      value: 1,
      easing: "easeInOut" as const,
    },
  ];
  assert.deepEqual(evaluateKeyframes(keyframes, 25), { x: 0.0625 });
  assert.deepEqual(evaluateKeyframes(keyframes, 75), { x: 0.9375 });
});

test("evaluateKeyframes: supports multiple properties with independent tracks", () => {
  const keyframes = [
    {
      sampleOffset: 0,
      property: "opacity" as const,
      value: 0.1,
      easing: "linear" as const,
    },
    {
      sampleOffset: 100,
      property: "opacity" as const,
      value: 0.9,
      easing: "linear" as const,
    },
    {
      sampleOffset: 0,
      property: "scale" as const,
      value: 1,
      easing: "linear" as const,
    },
    {
      sampleOffset: 100,
      property: "scale" as const,
      value: 1.5,
      easing: "easeOut" as const,
    },
  ];
  const evaluated = evaluateKeyframes(keyframes, 50);
  assert.equal(evaluated.opacity, 0.5);
  assert.equal(evaluated.scale, 1.4375);
  assert.ok(!("x" in evaluated));
});

test("evaluateKeyframes: accepts unsorted input keyframes", () => {
  const keyframes = [
    {
      sampleOffset: 100,
      property: "y" as const,
      value: 1,
      easing: "linear" as const,
    },
    {
      sampleOffset: 0,
      property: "y" as const,
      value: 0,
      easing: "linear" as const,
    },
  ];
  assert.deepEqual(evaluateKeyframes(keyframes, 50), { y: 0.5 });
});

test("evaluateKeyframes: spring easing overshoots the target mid-segment then settles", () => {
  const keyframes = [
    {
      sampleOffset: 0,
      property: "scale" as const,
      value: 0,
      easing: "linear" as const,
    },
    {
      sampleOffset: 100,
      property: "scale" as const,
      value: 1,
      easing: "spring" as const,
    },
  ];
  // cubicBezier(0.34, 1.56, 0.64, 1) overshoots past the target before settling.
  const late = evaluateKeyframes(keyframes, 70).scale ?? 0;
  assert.ok(late > 1, `expected overshoot past 1, got ${late}`);
  // Endpoints stay exact.
  assert.equal(evaluateKeyframes(keyframes, 0).scale, 0);
  assert.equal(evaluateKeyframes(keyframes, 100).scale, 1);
});

test("KeyframeSchema: accepts spring easing", () => {
  const parsed = KeyframeSchema.parse({
    sampleOffset: 0,
    property: "opacity",
    value: 1,
    easing: "spring",
  });
  assert.equal(parsed.easing, "spring");
});
