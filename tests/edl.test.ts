import assert from "node:assert/strict";
import { test } from "node:test";
import { ProjectSchema, SAMPLE_RATE } from "../src/edl.ts";

test("ProjectSchema enforces the canonical 48 kHz sample rate", () => {
  assert.throws(
    () =>
      ProjectSchema.parse({
        version: 1,
        slug: "bad-rate",
        source: "/tmp/source.mp4",
        proxy: "proxy.mp4",
        sampleRate: 24_000,
        fps: 30,
        width: 1920,
        height: 1080,
        durationSamples: SAMPLE_RATE,
        words: [],
      }),
    /48000/
  );
});
