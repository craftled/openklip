import assert from "node:assert/strict";
import { test } from "node:test";
import { isModKeyOnly, modShortcut } from "../web/lib/keyboard-shortcuts.ts";

test("modShortcut uses Ctrl+ prefix off Apple platforms", () => {
  const original = navigator.userAgent;
  Object.defineProperty(globalThis.navigator, "userAgent", {
    configurable: true,
    value: "Windows NT 10.0",
  });
  assert.equal(modShortcut("b"), "Ctrl+B");
  Object.defineProperty(globalThis.navigator, "userAgent", {
    configurable: true,
    value: original,
  });
});

test("isModKeyOnly requires meta or ctrl without alt/shift", () => {
  assert.equal(
    isModKeyOnly({
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    } as KeyboardEvent),
    true
  );
  assert.equal(
    isModKeyOnly({
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
    } as KeyboardEvent),
    false
  );
});
