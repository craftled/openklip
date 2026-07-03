import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTwoPassLoudnormFilter,
  parseLoudnormJson,
} from "../src/loudnorm-two-pass.ts";

test("parseLoudnormJson extracts measured fields from ffmpeg stderr", () => {
  const stderr = `ffmpeg version\n{\n"input_i" : "-23.45",\n"input_tp" : "-4.50",\n"input_lra" : "7.80",\n"input_thresh" : "-34.00",\n"target_offset" : "-0.12"\n}\n`;
  const measured = parseLoudnormJson(stderr);
  assert.equal(measured.input_i, "-23.45");
  assert.equal(measured.input_tp, "-4.50");
  assert.equal(measured.target_offset, "-0.12");
});

test("buildTwoPassLoudnormFilter pins measured values and sample rate", () => {
  const filter = buildTwoPassLoudnormFilter({
    inputLabel: "apreln",
    outputLabel: "aout",
    targetLufs: -16,
    sampleRate: 48_000,
    measured: {
      input_i: "-20.00",
      input_tp: "-3.00",
      input_lra: "8.00",
      input_thresh: "-30.00",
      target_offset: "-0.10",
    },
  });
  assert.match(filter, /measured_I=-20.00/);
  assert.match(filter, /offset=-0.10/);
  assert.match(filter, /aformat=sample_rates=48000\[aout\]/);
});
