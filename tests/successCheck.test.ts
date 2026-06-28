import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUCCESS_CHECK_HOLD_MS,
  SUCCESS_CHECK_MS,
  successCheckActiveState,
  successCheckInitialState,
} from "../src/successCheck.ts";

test("successCheck state helpers", () => {
  assert.equal(successCheckInitialState(), "out");
  assert.equal(successCheckActiveState(), "in");
});

test("successCheck timing constants", () => {
  assert.equal(SUCCESS_CHECK_MS, 580);
  assert.ok(SUCCESS_CHECK_HOLD_MS >= SUCCESS_CHECK_MS);
});
