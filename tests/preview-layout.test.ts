import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampLoopRegion,
  ORIENTATION_RATIO,
  orientationDims,
} from "../web/lib/preview-layout.ts";

test("orientationDims fits landscape to a wide box width-first", () => {
  const d = orientationDims("landscape", 1600, 900);
  assert.equal(d.width, 1600);
  assert.equal(d.height, 900);
});

test("orientationDims fits portrait height-first inside the box", () => {
  const d = orientationDims("portrait", 1600, 900);
  assert.equal(d.height, 900);
  assert.equal(d.width, Math.round(900 * ORIENTATION_RATIO.portrait));
  assert.ok(d.width <= 1600);
});

test("orientationDims keeps square 1:1 within the box", () => {
  const d = orientationDims("square", 1600, 900);
  assert.equal(d.width, d.height);
  assert.ok(d.height <= 900);
});

test("clampLoopRegion orders and clamps in/out points", () => {
  assert.deepEqual(clampLoopRegion(3, 1, 10), { inSec: 1, outSec: 3 });
  assert.deepEqual(clampLoopRegion(-2, 20, 10), { inSec: 0, outSec: 10 });
});

test("clampLoopRegion returns null for a degenerate region", () => {
  assert.equal(clampLoopRegion(5, 5, 10), null);
  assert.equal(clampLoopRegion(5, 5.0001, 10), null); // below min span
});
