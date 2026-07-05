import assert from "node:assert/strict";
import { test } from "node:test";
import type { Range } from "../src/edl.ts";
import {
  buildSegmentAudioConcatFilter,
  buildSegmentInputArgs,
  buildSegmentVideoConcatFilter,
  SEGMENT_EXPORT_KEPT_RATIO,
  shouldUseSegmentExport,
} from "../src/export-segments.ts";

const ranges: Range[] = [
  { startSec: 10, endSec: 20 },
  { startSec: 50, endSec: 60 },
];

test("shouldUseSegmentExport when kept duration is a small fraction of source", () => {
  assert.equal(
    shouldUseSegmentExport({
      ranges,
      sourceDurationSec: 600,
      hasBroll: false,
      hasStills: false,
      hasRichGraphics: false,
      hasMusic: false,
    }),
    true
  );
});

test("shouldUseSegmentExport rejects b-roll and rich graphics", () => {
  assert.equal(
    shouldUseSegmentExport({
      ranges,
      sourceDurationSec: 600,
      hasBroll: true,
      hasStills: false,
      hasRichGraphics: false,
      hasMusic: false,
    }),
    false
  );
});

test("shouldUseSegmentExport allows music and stills on overlay-light timelines", () => {
  assert.equal(
    shouldUseSegmentExport({
      ranges,
      sourceDurationSec: 600,
      hasBroll: false,
      hasStills: true,
      hasRichGraphics: false,
      hasMusic: true,
    }),
    true
  );
});

test("shouldUseSegmentExport rejects when kept ratio is high", () => {
  assert.equal(
    shouldUseSegmentExport({
      ranges: [{ startSec: 0, endSec: 400 }],
      sourceDurationSec: 500,
      hasBroll: false,
      hasStills: false,
      hasRichGraphics: false,
      hasMusic: false,
    }),
    false
  );
});

test("buildSegmentInputArgs emits per-range seek before each -i", () => {
  const args = buildSegmentInputArgs(ranges, "/src.mp4");
  assert.deepEqual(args, [
    "-ss",
    "10.000000",
    "-to",
    "20.000000",
    "-i",
    "/src.mp4",
    "-ss",
    "50.000000",
    "-to",
    "60.000000",
    "-i",
    "/src.mp4",
  ]);
});

test("buildSegmentVideoConcatFilter concats multiple segment inputs", () => {
  const filter = buildSegmentVideoConcatFilter({
    rangeCount: 2,
    fpsFilter: ",fps=30",
  });
  assert.match(filter, /concat=n=2:v=1:a=0\[vsel\]/);
});

test("buildSegmentAudioConcatFilter applies highpass and afftdn suffixes", () => {
  const filter = buildSegmentAudioConcatFilter({
    rangeCount: 1,
    highpassSuffix: ",highpass=f=80",
    noiseSuffix: ",afftdn=nr=12",
  });
  assert.match(filter, /highpass=f=80/);
  assert.match(filter, /afftdn=nr=12/);
});

test("SEGMENT_EXPORT_KEPT_RATIO is documented at 0.5", () => {
  assert.equal(SEGMENT_EXPORT_KEPT_RATIO, 0.5);
});
