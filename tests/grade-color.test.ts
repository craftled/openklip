import assert from "node:assert/strict";
import { test } from "node:test";
import { ColorAdjustSchema } from "../src/edl.ts";
import {
  colorAdjustFilter,
  colorAdjustSummary,
  isNeutralColor,
  NEUTRAL_COLOR,
} from "../src/grade-color.ts";

test("NEUTRAL_COLOR is the identity adjust", () => {
  assert.deepEqual(NEUTRAL_COLOR, {
    temperature: 0,
    tint: 0,
    brightness: 0,
    contrast: 1,
    saturation: 1,
  });
});

test("isNeutralColor: absent, null, and all-default are neutral", () => {
  assert.equal(isNeutralColor(undefined), true);
  assert.equal(isNeutralColor(null), true);
  assert.equal(isNeutralColor(NEUTRAL_COLOR), true);
  assert.equal(isNeutralColor(ColorAdjustSchema.parse({})), true);
});

test("isNeutralColor: any moved knob is non-neutral", () => {
  assert.equal(isNeutralColor({ ...NEUTRAL_COLOR, temperature: 0.15 }), false);
  assert.equal(isNeutralColor({ ...NEUTRAL_COLOR, contrast: 0.96 }), false);
  assert.equal(isNeutralColor({ ...NEUTRAL_COLOR, saturation: 0.84 }), false);
});

test("colorAdjustFilter is empty for a neutral adjust", () => {
  assert.equal(colorAdjustFilter(undefined), "");
  assert.equal(colorAdjustFilter(NEUTRAL_COLOR), "");
});

test("temperature warms via red-up / blue-down colorbalance", () => {
  const chain = colorAdjustFilter({ ...NEUTRAL_COLOR, temperature: 0.15 });
  assert.match(chain, /colorbalance=/);
  assert.match(chain, /rm=0\.15/);
  assert.match(chain, /bm=-0\.15/);
});

test("tint pushes the green channel (the deck's +0.065 tint)", () => {
  const chain = colorAdjustFilter({ ...NEUTRAL_COLOR, tint: 0.065 });
  assert.match(chain, /gs=0\.065/);
  assert.match(chain, /gm=0\.065/);
});

test("contrast / brightness / saturation expand to eq (deck values)", () => {
  const chain = colorAdjustFilter({
    ...NEUTRAL_COLOR,
    contrast: 0.96,
    brightness: -0.005,
    saturation: 0.84,
  });
  assert.match(chain, /eq=/);
  assert.match(chain, /contrast=0\.96/);
  assert.match(chain, /brightness=-0\.005/);
  assert.match(chain, /saturation=0\.84/);
  // No colorbalance when temperature/tint are untouched.
  assert.doesNotMatch(chain, /colorbalance=/);
});

test("colorbalance is applied before eq (temp/tint gains, then tone)", () => {
  const chain = colorAdjustFilter({
    ...NEUTRAL_COLOR,
    temperature: 0.15,
    contrast: 0.96,
  });
  const cb = chain.indexOf("colorbalance");
  const eq = chain.indexOf("eq=");
  assert.ok(cb >= 0 && eq >= 0);
  assert.ok(cb < eq, "colorbalance precedes eq");
});

test("filter chain carries no shell-breaking quotes", () => {
  const chain = colorAdjustFilter({
    temperature: 0.15,
    tint: -0.2,
    brightness: 0.1,
    contrast: 1.2,
    saturation: 0.8,
  });
  assert.doesNotMatch(chain, /['"]/);
});

test("colorAdjustSummary reads back the moved knobs", () => {
  assert.equal(colorAdjustSummary(NEUTRAL_COLOR), "neutral");
  const summary = colorAdjustSummary({
    ...NEUTRAL_COLOR,
    temperature: 0.15,
    contrast: 0.96,
  });
  assert.match(summary, /temp \+0\.15/);
  assert.match(summary, /contrast x0\.96/);
});
