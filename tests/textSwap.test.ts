import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TEXT_SWAP_MS,
  textSwapClasses,
  textSwapInitialPhase,
  textSwapNeedsChange,
  textSwapPhaseAfterEnterStart,
  textSwapPhaseAfterExit,
} from "../src/textSwap.ts";

test("TEXT_SWAP_MS matches transitions.dev default", () => {
  assert.equal(TEXT_SWAP_MS, 150);
});

test("textSwapClasses maps phases to CSS hooks", () => {
  assert.deepEqual(textSwapClasses("idle"), ["t-text-swap"]);
  assert.deepEqual(textSwapClasses("exit"), ["t-text-swap", "is-exit"]);
  assert.deepEqual(textSwapClasses("enter-start"), [
    "t-text-swap",
    "is-enter-start",
  ]);
});

test("textSwap phase helpers follow the three-step sequence", () => {
  assert.equal(textSwapInitialPhase(), "enter-start");
  assert.equal(textSwapPhaseAfterExit(), "enter-start");
  assert.equal(textSwapPhaseAfterEnterStart(), "idle");
});

test("textSwapNeedsChange detects content updates", () => {
  assert.equal(textSwapNeedsChange("A", "A"), false);
  assert.equal(textSwapNeedsChange("A", "B"), true);
});
