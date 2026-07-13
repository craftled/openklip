import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  activeSegmentIndices,
  generateMulticamFixture,
  segmentDurationSec,
} from "../scripts/generate-multicam-fixture.ts";
import { FFMPEG, probe } from "../src/ffmpeg.ts";

describe("generate-multicam-fixture", () => {
  test("activeSegmentIndices alternates A/B across segments", () => {
    expect(activeSegmentIndices("a", 4)).toEqual([true, false, true, false]);
    expect(activeSegmentIndices("b", 4)).toEqual([false, true, false, true]);
  });

  test("segmentDurationSec divides evenly", () => {
    expect(segmentDurationSec(16, 4)).toBe(4);
    expect(segmentDurationSec(12, 3)).toBe(4);
  });

  test("generateMulticamFixture writes two mp4s with expected duration", async () => {
    if (typeof FFMPEG !== "string" || !existsSync(FFMPEG)) {
      return;
    }

    const dir = `${import.meta.dir}/../.tmp-multicam-fixture`;
    const files = await generateMulticamFixture({
      outDir: dir,
      durationSec: 8,
      segments: 4,
    });

    expect(existsSync(files.speakerA)).toBe(true);
    expect(existsSync(files.speakerB)).toBe(true);

    const metaA = await probe(files.speakerA);
    const metaB = await probe(files.speakerB);
    expect(Math.abs(metaA.durationSec - 8)).toBeLessThan(0.2);
    expect(Math.abs(metaB.durationSec - 8)).toBeLessThan(0.2);
    expect(metaA.width).toBe(1280);
    expect(metaA.height).toBe(720);
  }, 120_000);
});
