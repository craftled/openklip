import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStillZoompan, kenBurnsScaleAt } from "../src/ken-burns.ts";

test("kenBurnsScaleAt ramps linearly from 1 to scale and clamps", () => {
  assert.equal(kenBurnsScaleAt(0, 1.5), 1);
  assert.equal(kenBurnsScaleAt(1, 1.5), 1.5);
  assert.ok(Math.abs(kenBurnsScaleAt(0.5, 1.5) - 1.25) < 1e-9);
  assert.equal(kenBurnsScaleAt(-1, 1.5), 1); // clamp low
  assert.equal(kenBurnsScaleAt(2, 1.5), 1.5); // clamp high
});

test("buildStillZoompan emits a zoompan filter with size, fps, and focus", () => {
  const filter = buildStillZoompan(
    { durationSec: 4, scale: 1.2, focusX: 0.5, focusY: 0.5 },
    { width: 1920, height: 1080, fps: 30 }
  );
  assert.match(filter, /^zoompan=/);
  assert.match(filter, /s=1920x1080/);
  assert.match(filter, /fps=30/);
  assert.match(filter, /d=120/); // 4s * 30fps
  assert.match(filter, /zoom/); // x/y expressed relative to zoom
});
