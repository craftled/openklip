import assert from "node:assert/strict";
import { test } from "node:test";
import { NEUTRAL_COLOR } from "../src/color-adjust.ts";
import { previewFilterChain } from "../src/preview-frame.ts";

test("a bare frame (no filter, no color) has an empty filter chain", () => {
  assert.equal(previewFilterChain({ filter: "none" }), "");
  assert.equal(previewFilterChain({}), "");
});

test("preview chain applies the base filter", () => {
  const chain = previewFilterChain({ filter: "muted" });
  assert.match(chain, /eq=/);
  assert.match(chain, /saturation=0\.85/);
});

test("preview chain layers filter then color, in that order", () => {
  const chain = previewFilterChain({
    filter: "muted",
    color: { ...NEUTRAL_COLOR, contrast: 0.96 },
  });
  const filterEq = chain.indexOf("saturation=0.85");
  const colorEq = chain.indexOf("contrast=0.96");
  assert.ok(filterEq >= 0 && colorEq >= 0);
  assert.ok(filterEq < colorEq, "filter precedes the color adjust");
});

test("preview chain ignores an unknown LUT name (no such file)", () => {
  // No luts/ file named __nope__, so the LUT segment is skipped, not errored.
  const chain = previewFilterChain({ filter: "none", lut: "__nope__" });
  assert.equal(chain, "");
});
