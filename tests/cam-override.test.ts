import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCamOverrideSpan } from "../web/lib/cam-override.ts";

test("validateCamOverrideSpan accepts a positive span", () => {
  assert.equal(validateCamOverrideSpan("1.5", "3"), null);
});

test("validateCamOverrideSpan rejects non-numeric input", () => {
  assert.match(
    validateCamOverrideSpan("abc", "2") ?? "",
    /valid start and end/i
  );
});

test("validateCamOverrideSpan rejects inverted spans", () => {
  assert.match(validateCamOverrideSpan("3", "1") ?? "", /after start time/i);
});

test("validateCamOverrideSpan rejects negative start", () => {
  assert.match(validateCamOverrideSpan("-1", "2") ?? "", /cannot be negative/i);
});
