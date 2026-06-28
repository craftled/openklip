import assert from "node:assert/strict";
import { test } from "node:test";
import { NEUTRAL_COLOR } from "../src/grade-color.ts";
import { previewFilterChain } from "../src/preview-frame.ts";

test("a bare frame (no grade, no color) has an empty filter chain", () => {
  assert.equal(previewFilterChain({ grade: "none" }), "");
  assert.equal(previewFilterChain({}), "");
});

test("preview chain applies the base grade", () => {
  const chain = previewFilterChain({ grade: "cool_desat" });
  assert.match(chain, /eq=/);
  assert.match(chain, /saturation=0\.85/);
});

test("preview chain layers grade then color, in that order", () => {
  const chain = previewFilterChain({
    grade: "cool_desat",
    color: { ...NEUTRAL_COLOR, contrast: 0.96 },
  });
  // Grade's own eq comes first, then the color adjust's eq.
  const gradeEq = chain.indexOf("saturation=0.85");
  const colorEq = chain.indexOf("contrast=0.96");
  assert.ok(gradeEq >= 0 && colorEq >= 0);
  assert.ok(gradeEq < colorEq, "base grade precedes the color adjust");
});

test("preview chain ignores an unknown LUT name (no such file)", () => {
  // No luts/ file named __nope__, so the LUT segment is skipped, not errored.
  const chain = previewFilterChain({ grade: "none", lut: "__nope__" });
  assert.equal(chain, "");
});
