import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVerticalSplitFilter,
  ExportLayoutSchema,
  normalizeSplitVertical,
  SplitVerticalSchema,
} from "../src/export-layout.ts";

test("ExportLayoutSchema accepts fill and split-vertical", () => {
  assert.equal(ExportLayoutSchema.parse("fill"), "fill");
  assert.equal(ExportLayoutSchema.parse("split-vertical"), "split-vertical");
  assert.throws(() => ExportLayoutSchema.parse("horizontal"));
});

test("SplitVerticalSchema applies defaults and clamps ratio", () => {
  assert.deepEqual(SplitVerticalSchema.parse({}), {
    ratio: 0.45,
    speakerPosition: "top",
  });
  assert.deepEqual(
    SplitVerticalSchema.parse({ ratio: 0.1, speakerPosition: "bottom" }),
    { ratio: 0.25, speakerPosition: "bottom" }
  );
  assert.deepEqual(SplitVerticalSchema.parse({ ratio: 0.9 }), {
    ratio: 0.75,
    speakerPosition: "top",
  });
});

test("normalizeSplitVertical merges partial input over defaults", () => {
  assert.deepEqual(normalizeSplitVertical(undefined), {
    ratio: 0.45,
    speakerPosition: "top",
  });
  assert.deepEqual(normalizeSplitVertical({ ratio: 0.5 }), {
    ratio: 0.5,
    speakerPosition: "top",
  });
});

test("buildVerticalSplitFilter produces a vstack ffmpeg chain (speaker top)", () => {
  const filter = buildVerticalSplitFilter({
    inputLabel: "v0",
    outputLabel: "vsplit",
    outW: 1080,
    outH: 1920,
    ratio: 0.45,
    speakerPosition: "top",
  });
  assert.match(filter, /\[v0\]crop=1080:864:0:0/);
  assert.match(filter, /\[v0\]crop=1080:1056:0:864/);
  assert.match(filter, /vstack=inputs=2:shortest=0\[vsplit\]/);
});

test("buildVerticalSplitFilter stacks speaker on bottom when requested", () => {
  const filter = buildVerticalSplitFilter({
    inputLabel: "vin",
    outputLabel: "vout",
    outW: 608,
    outH: 1080,
    ratio: 0.4,
    speakerPosition: "bottom",
  });
  assert.match(filter, /\[vin\]crop=608:648:0:0/);
  assert.match(filter, /\[vin\]crop=608:432:0:648/);
  assert.match(filter, /vstack=inputs=2:shortest=0\[vout\]/);
});
