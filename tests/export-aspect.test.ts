import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aspectToRatio,
  buildReframeFilter,
  EXPORT_ASPECT_IDS,
  normalizeExportCrop,
  reframeCropBox,
  resolveExportDimensions,
  shouldApplyReframe,
} from "../src/export-aspect.ts";

test("EXPORT_ASPECT_IDS lists source and the three fixed ratios", () => {
  assert.deepEqual(EXPORT_ASPECT_IDS, ["source", "16:9", "9:16", "1:1"]);
});

test("aspectToRatio returns null for source", () => {
  assert.equal(aspectToRatio("source"), null);
  assert.equal(aspectToRatio("9:16"), 9 / 16);
});

test("resolveExportDimensions preserves legacy landscape math for source aspect", () => {
  assert.deepEqual(
    resolveExportDimensions({
      aspect: "source",
      maxHeight: 1080,
      sourceHeight: 1080,
      sourceWidth: 1920,
    }),
    { outW: 1920, outH: 1080 }
  );
});

test("resolveExportDimensions builds 9:16 output from a capped height", () => {
  assert.deepEqual(
    resolveExportDimensions({
      aspect: "9:16",
      maxHeight: 1920,
      sourceHeight: 2160,
      sourceWidth: 3840,
    }),
    { outW: 1080, outH: 1920 }
  );
});

test("resolveExportDimensions never upscales past the source height", () => {
  assert.deepEqual(
    resolveExportDimensions({
      aspect: "9:16",
      maxHeight: 1920,
      sourceHeight: 1080,
      sourceWidth: 1920,
    }),
    { outW: 608, outH: 1080 }
  );
});

test("reframeCropBox centers a portrait crop on a landscape source", () => {
  const box = reframeCropBox({
    focusX: 0.5,
    focusY: 0.5,
    scale: 1,
    sourceHeight: 1080,
    sourceWidth: 1920,
    targetHeight: 1080,
    targetWidth: 608,
  });
  assert.equal(box.h, 1080);
  assert.equal(box.w, 608);
  assert.equal(box.x, 656);
  assert.equal(box.y, 0);
});

test("reframeCropBox shifts horizontally with focusX", () => {
  const left = reframeCropBox({
    focusX: 0,
    focusY: 0.5,
    scale: 1,
    sourceHeight: 1080,
    sourceWidth: 1920,
    targetHeight: 1080,
    targetWidth: 608,
  });
  const right = reframeCropBox({
    focusX: 1,
    focusY: 0.5,
    scale: 1,
    sourceHeight: 1080,
    sourceWidth: 1920,
    targetHeight: 1080,
    targetWidth: 608,
  });
  assert.equal(left.x, 0);
  assert.equal(right.x, 1312);
});

test("shouldApplyReframe is false for source aspect at defaults", () => {
  assert.equal(
    shouldApplyReframe({
      aspect: "source",
      crop: normalizeExportCrop(undefined),
    }),
    false
  );
});

test("shouldApplyReframe is true for 9:16 even at default crop", () => {
  assert.equal(
    shouldApplyReframe({
      aspect: "9:16",
      crop: normalizeExportCrop(undefined),
    }),
    true
  );
});

test("buildReframeFilter emits crop and scale for vertical export", () => {
  const filter = buildReframeFilter({
    aspect: "9:16",
    crop: { focusX: 0.5, focusY: 0.5, scale: 1 },
    inputLabel: "vsel",
    outputLabel: "v0",
    outH: 1080,
    outW: 608,
    sourceH: 1080,
    sourceW: 1920,
  });
  assert.match(filter, /\[vsel\]crop=608:1080:656:0,scale=608:1080\[v0\]/);
});

test("buildReframeFilter is a no-op pass-through for source aspect at defaults", () => {
  assert.equal(
    buildReframeFilter({
      aspect: "source",
      crop: normalizeExportCrop(undefined),
      inputLabel: "vsel",
      outputLabel: "v0",
      outH: 1080,
      outW: 1920,
      sourceH: 1080,
      sourceW: 1920,
    }),
    "[vsel]null[v0]"
  );
});
