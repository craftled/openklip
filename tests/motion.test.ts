import assert from "node:assert/strict";
import { test } from "node:test";
import { MotionSchema } from "../src/edl.ts";
import {
  buildTitlesAss,
  resolveTitleMotion,
  titleMotionTags,
} from "../src/titles.ts";

const defaults = MotionSchema.parse(undefined);

test("MotionSchema fills the default feel", () => {
  assert.deepEqual(defaults, {
    fadeMs: 180,
    heroFadeMs: 320,
    slideFrac: 0.04,
    speed: 1,
  });
});

test("resolveTitleMotion scales durations by speed (snappier = shorter)", () => {
  assert.deepEqual(resolveTitleMotion(defaults), {
    fadeMs: 180,
    heroFadeMs: 320,
  });
  assert.deepEqual(resolveTitleMotion({ ...defaults, speed: 2 }), {
    fadeMs: 90,
    heroFadeMs: 160,
  });
  // 180 / 1.4 = 128.57 → 129
  assert.equal(resolveTitleMotion({ ...defaults, speed: 1.4 }).fadeMs, 129);
});

test("titleMotionTags emits speed-scaled fade for each kind", () => {
  const geom = { baseY: 1000, cx: 960, slidePx: 40 };
  const snappy = { ...defaults, speed: 2 };
  assert.ok(titleMotionTags("hero", snappy, geom).includes("\\fad(160,160)"));
  assert.ok(titleMotionTags("center", snappy, geom).includes("\\fad(90,90)"));
  const lower = titleMotionTags("lower", snappy, geom);
  assert.ok(lower.includes("\\fad(90,90)"));
  // Lower third slides up into place over the fade-in window.
  assert.ok(lower.includes("\\move(960,1040,960,1000,0,90)"));
});

test("a custom fadeMs flows through to the tags", () => {
  const tags = titleMotionTags(
    "center",
    { ...defaults, fadeMs: 500 },
    { baseY: 0, cx: 0, slidePx: 0 }
  );
  assert.ok(tags.includes("\\fad(500,500)"));
});

test("buildTitlesAss reflects the motion config in the emitted ASS", () => {
  const items = [
    { text: "Lower third", startSec: 1, endSec: 4, position: "lower" as const },
  ];
  const slow = buildTitlesAss(items, {
    width: 1920,
    height: 1080,
    motion: { ...defaults, fadeMs: 180 },
  });
  assert.ok(slow.includes("\\fad(180,180)"));

  const snappy = buildTitlesAss(items, {
    width: 1920,
    height: 1080,
    motion: { ...defaults, speed: 2 },
  });
  assert.ok(snappy.includes("\\fad(90,90)"));
});
