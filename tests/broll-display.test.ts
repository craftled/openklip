import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BROLL_DISPLAY_IDS,
  brollOverlayPosition,
  brollPipBox,
  brollScaleFilter,
  normalizeBrollDisplay,
} from "../src/broll-display.ts";

test("BROLL_DISPLAY_IDS lists cover and pip", () => {
  assert.deepEqual(BROLL_DISPLAY_IDS, ["cover", "pip"]);
});

test("normalizeBrollDisplay defaults missing to cover", () => {
  assert.equal(normalizeBrollDisplay(undefined), "cover");
  assert.equal(normalizeBrollDisplay("pip"), "pip");
});

test("brollPipBox returns even dimensions and a minimum margin on 1920x1080", () => {
  const box = brollPipBox(1920, 1080);
  assert.equal(box.pipW % 2, 0);
  assert.equal(box.pipH % 2, 0);
  assert.ok(box.pipW >= 64);
  assert.ok(box.margin >= 8);
  assert.equal(box.pipW, 538);
});

test("brollScaleFilter uses full-frame cover scaling by default", () => {
  const filter = brollScaleFilter({
    display: "cover",
    inputIndex: 2,
    outW: 1280,
    outH: 720,
    durationSec: 3,
    srcInSec: 0.5,
    outStart: 1,
    label: "bv2",
  });
  assert.match(
    filter,
    /scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720/
  );
  assert.doesNotMatch(filter, /pad=/);
});

test("brollScaleFilter uses inset pad scaling for pip", () => {
  const { pipW, pipH } = brollPipBox(1280, 720);
  const filter = brollScaleFilter({
    display: "pip",
    inputIndex: 2,
    outW: 1280,
    outH: 720,
    durationSec: 3,
    srcInSec: 0.5,
    outStart: 1,
    label: "bv2",
  });
  assert.match(
    filter,
    new RegExp(
      `scale=${pipW}:${pipH}:force_original_aspect_ratio=decrease,pad=${pipW}:${pipH}`
    )
  );
});

test("brollOverlayPosition omits x:y for cover (full-frame overlay)", () => {
  assert.equal(brollOverlayPosition("cover", 1920, 1080), "");
});

test("brollOverlayPosition anchors pip bottom-right with margin", () => {
  const { margin } = brollPipBox(1920, 1080);
  assert.equal(
    brollOverlayPosition("pip", 1920, 1080),
    `W-w-${margin}:H-h-${margin}`
  );
});
