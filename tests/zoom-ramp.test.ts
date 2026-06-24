import assert from "node:assert";
import { test } from "node:test";
import { buildZoompanZExpr, zoomFactorAtSec } from "../src/zoom-ramp.ts";
import type { ZoomWindow } from "../src/zoom-ramp.ts";

// smoothstep easing reference: ease(p) = p*p*(3-2*p), p in [0,1]
function ease(p: number): number {
  return p * p * (3 - 2 * p);
}

const W: ZoomWindow = { startSec: 2, endSec: 5, scale: 2, rampSec: 1 };

test("zoomFactorAtSec: outside any window => 1", () => {
  assert.strictEqual(zoomFactorAtSec(0, [W]), 1);
  assert.strictEqual(zoomFactorAtSec(1.99, [W]), 1);
  assert.strictEqual(zoomFactorAtSec(10, [W]), 1);
  assert.strictEqual(zoomFactorAtSec(3, []), 1);
});

test("zoomFactorAtSec: at exactly startSec => 1 (ramp start)", () => {
  assert.strictEqual(zoomFactorAtSec(2, [W]), 1);
});

test("zoomFactorAtSec: at startSec + rampSec and beyond (before endSec) => scale (hold)", () => {
  assert.ok(Math.abs(zoomFactorAtSec(3, [W]) - 2) < 1e-9); // start + ramp
  assert.ok(Math.abs(zoomFactorAtSec(4, [W]) - 2) < 1e-9); // hold
  assert.ok(Math.abs(zoomFactorAtSec(5, [W]) - 2) < 1e-9); // at endSec, still held
});

test("zoomFactorAtSec: mid-ramp => strictly between 1 and scale and equals smoothstep value", () => {
  const t = W.startSec + W.rampSec / 2; // 2.5, p = 0.5
  const f = zoomFactorAtSec(t, [W]);
  assert.ok(f > 1 && f < W.scale);
  const expected = 1 + (W.scale - 1) * ease(0.5); // 1 + 1*0.5 = 1.5
  assert.ok(Math.abs(f - expected) < 1e-9);
  assert.ok(Math.abs(f - 1.5) < 1e-9);
});

test("zoomFactorAtSec: after endSec => 1", () => {
  assert.strictEqual(zoomFactorAtSec(5.01, [W]), 1);
  assert.strictEqual(zoomFactorAtSec(6, [W]), 1);
});

test("zoomFactorAtSec: two non-overlapping windows => correct factor in each", () => {
  const a: ZoomWindow = { startSec: 1, endSec: 3, scale: 1.5, rampSec: 1 };
  const b: ZoomWindow = { startSec: 5, endSec: 8, scale: 2, rampSec: 2 };
  const windows = [a, b];

  // window a hold region
  assert.ok(Math.abs(zoomFactorAtSec(2.5, windows) - 1.5) < 1e-9);
  // between windows
  assert.strictEqual(zoomFactorAtSec(4, windows), 1);
  // window b mid-ramp: p = (6-5)/2 = 0.5
  const expectedB = 1 + (2 - 1) * ease(0.5);
  assert.ok(Math.abs(zoomFactorAtSec(6, windows) - expectedB) < 1e-9);
  // window b hold
  assert.ok(Math.abs(zoomFactorAtSec(7.5, windows) - 2) < 1e-9);
});

test("buildZoompanZExpr: contains each window time, between, clip, and balanced parens", () => {
  const a: ZoomWindow = { startSec: 1, endSec: 3, scale: 1.5, rampSec: 1 };
  const b: ZoomWindow = { startSec: 5, endSec: 8, scale: 2, rampSec: 2 };
  const expr = buildZoompanZExpr([a, b], 30);

  assert.ok(typeof expr === "string" && expr.length > 0);
  assert.ok(expr.includes("between"));
  assert.ok(expr.includes("clip"));
  // each window's start time (as the sec() formatter would render it)
  assert.ok(expr.includes("1.000000"));
  assert.ok(expr.includes("5.000000"));

  // balanced parentheses
  let depth = 0;
  for (const ch of expr) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    assert.ok(depth >= 0, "unbalanced: closing before opening");
  }
  assert.strictEqual(depth, 0, "unbalanced parentheses");
});
