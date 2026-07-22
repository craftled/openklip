import assert from "node:assert/strict";
import { test } from "node:test";
import { sweepOptionsForPlan } from "../web/lib/cut-transition-sweep.ts";

test("sweepOptionsForPlan maps a crossfade plan to a bright, moderate flash", () => {
  const options = sweepOptionsForPlan({
    type: "crossfade",
    sweepMs: 800,
    outroMs: 320,
  });
  assert.equal(options.midpoint, 0.5);
  assert.equal(options.sweepMs, 800);
  assert.equal(options.outroMs, 320);
  assert.ok(options.peakAlpha !== undefined);
  assert.ok(options.peakAlpha >= 0.6 && options.peakAlpha <= 0.85);
  assert.ok(options.palette);
});

test("sweepOptionsForPlan maps a dip plan to a near-black band", () => {
  const options = sweepOptionsForPlan({
    type: "dip",
    sweepMs: 500,
    outroMs: 225,
  });
  assert.equal(options.midpoint, 0.5);
  assert.equal(options.sweepMs, 500);
  assert.equal(options.outroMs, 225);
  assert.ok(options.palette);
  const palette = options.palette as {
    a: [number, number, number];
    b: [number, number, number];
  };
  // The dip palette's base color (a) and amplitude (b) must both sit near
  // zero across every channel so the swept band reads as "goes dark" at
  // every point along the sweep, not just at one sampled instant.
  for (const channel of [...palette.a, ...palette.b]) {
    assert.ok(
      Math.abs(channel) < 0.05,
      `expected near-black channel, got ${channel}`
    );
  }
});
