import assert from "node:assert/strict";
import { test } from "node:test";
import { detectBpm } from "../src/bpm-core.ts";
import { graphicRenderCacheKey } from "../src/graphic-cache.ts";
import {
  extendGraphicSpanForEntrance,
  minGraphicSpanSec,
  spanForBeats,
  validateBpm,
} from "../src/graphic-span.ts";

test("detectBpm finds a steady pulse near 120 BPM", () => {
  const sampleRate = 22_050;
  const bpm = 120;
  const beatSec = 60 / bpm;
  const seconds = 20;
  const pcm = new Float32Array(sampleRate * seconds);
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate;
    const beatPhase = (t % beatSec) / beatSec;
    pcm[i] = beatPhase < 0.02 ? 1 : 0.01;
  }
  const result = detectBpm(pcm, sampleRate);
  assert.ok(
    result.bpm >= 115 && result.bpm <= 125,
    `expected ~120, got ${result.bpm}`
  );
  assert.ok(result.confidence >= 0);
});

test("minGraphicSpanSec accounts for word count and stagger", () => {
  const sec = minGraphicSpanSec("motion-word-cascade", {
    text: "one two three four",
    inDurFrames: 8,
    staggerFrames: 3,
  });
  assert.ok(sec > 0.4);
});

test("extendGraphicSpanForEntrance respects MIN_PHRASE_OVERLAY_SEC", () => {
  const toSec = extendGraphicSpanForEntrance({
    template: "motion-typewriter",
    params: { text: "Hi" },
    fromSec: 1,
    toSec: 1.2,
    projectDurationSec: 60,
  });
  assert.ok(toSec >= 3);
});

test("spanForBeats snaps duration to tempo", () => {
  const toSec = spanForBeats(0, 4, 120, 60);
  assert.equal(toSec, 2);
});

test("validateBpm rejects out-of-range values", () => {
  assert.throws(() => validateBpm(30));
  assert.equal(validateBpm(128.44), 128.4);
});

test("graphicRenderCacheKey is stable for param order", () => {
  const a = graphicRenderCacheKey({
    template: "motion-typewriter",
    params: { text: "A", inDurFrames: 8 },
    durFrames: 90,
    width: 1920,
    height: 1080,
    fps: 30,
  });
  const b = graphicRenderCacheKey({
    template: "motion-typewriter",
    params: { inDurFrames: 8, text: "A" },
    durFrames: 90,
    width: 1920,
    height: 1080,
    fps: 30,
  });
  assert.equal(a, b);
});
