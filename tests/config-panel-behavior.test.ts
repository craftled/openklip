import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldAutoOpenConfig } from "../web/lib/config-panel-behavior.ts";

test("shouldAutoOpenConfig is false with no edit selection", () => {
  assert.equal(
    shouldAutoOpenConfig({
      hasOverlayInspector: false,
      selRange: null,
    }),
    false
  );
});

test("shouldAutoOpenConfig is true for an overlay inspector", () => {
  assert.equal(
    shouldAutoOpenConfig({
      hasOverlayInspector: true,
      selRange: null,
    }),
    true
  );
});

test("shouldAutoOpenConfig is true for a transcript word range", () => {
  assert.equal(
    shouldAutoOpenConfig({
      hasOverlayInspector: false,
      selRange: [2, 8],
    }),
    true
  );
});
