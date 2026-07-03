import assert from "node:assert/strict";
import { test } from "node:test";
import {
  averageFocusSamples,
  parseVisionFocusOutput,
  visionFocusAvailable,
} from "../src/vision-focus.ts";

test("parseVisionFocusOutput reads focus JSON", () => {
  assert.deepEqual(
    parseVisionFocusOutput('{"focusX":0.42,"focusY":0.31,"confidence":0.9}'),
    { focusX: 0.42, focusY: 0.31, confidence: 0.9 }
  );
});

test("parseVisionFocusOutput returns null on no face", () => {
  assert.equal(parseVisionFocusOutput('{"error":"no face"}'), null);
});

test("parseVisionFocusOutput returns null on garbage", () => {
  assert.equal(parseVisionFocusOutput("not json"), null);
});

test("averageFocusSamples returns null for empty input", () => {
  assert.equal(averageFocusSamples([]), null);
});

test("averageFocusSamples averages multiple detections", () => {
  const avg = averageFocusSamples([
    { focusX: 0.2, focusY: 0.4, confidence: 1 },
    { focusX: 0.8, focusY: 0.6, confidence: 1 },
  ]);
  assert.deepEqual(avg, { focusX: 0.5, focusY: 0.5 });
});

test("visionFocusAvailable is true only on darwin", () => {
  assert.equal(visionFocusAvailable(), process.platform === "darwin");
});
