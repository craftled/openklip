import assert from "node:assert/strict";
import { test } from "node:test";
import { musicPreviewTime } from "../web/lib/music-preview.ts";

test("trim mode inside the window offsets srcIn by the output distance", () => {
  const want = musicPreviewTime({
    assetDurationSec: 8,
    curSec: 5,
    placement: { mode: "trim", srcInSec: 0.5, startSec: 2 },
    ranges: [{ startSec: 0, endSec: 10 }],
  });
  assert.equal(want, 3.5);
});

test("the bed position is continuous across a cut (output-space mapping)", () => {
  // Source 0.5s -> output 0.5s; source 4.5s -> output 1 + (4.5 - 3) = 2.5s.
  // 2s of output elapsed since the placement start, plus the 0.25s srcIn.
  const want = musicPreviewTime({
    assetDurationSec: 8,
    curSec: 4.5,
    placement: { mode: "trim", srcInSec: 0.25, startSec: 0.5 },
    ranges: [
      { startSec: 0, endSec: 1 },
      { startSec: 3, endSec: 5 },
    ],
  });
  assert.equal(want, 2.25);
});

test("loop mode wraps past the asset duration", () => {
  // 5s into the placement + 0.5s srcIn = 5.5s, modulo the 2s asset = 1.5s.
  const want = musicPreviewTime({
    assetDurationSec: 2,
    curSec: 5,
    placement: { mode: "loop", srcInSec: 0.5, startSec: 0 },
    ranges: [{ startSec: 0, endSec: 10 }],
  });
  assert.equal(want, 1.5);
});

test("a position before the window start clamps to the srcIn offset", () => {
  const want = musicPreviewTime({
    assetDurationSec: 8,
    curSec: 1,
    placement: { mode: "trim", srcInSec: 0.75, startSec: 5 },
    ranges: [{ startSec: 0, endSec: 10 }],
  });
  assert.equal(want, 0.75);
});
