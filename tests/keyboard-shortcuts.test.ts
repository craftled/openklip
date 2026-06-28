import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isModKeyOnly,
  modShortcut,
  modShortcutNeutral,
  modShortcutParts,
  modShortcutPartsNeutral,
} from "../web/lib/keyboard-shortcuts.ts";

test("modShortcutNeutral uses a stable Mod+ prefix", () => {
  assert.equal(modShortcutNeutral("b"), "Mod+B");
});

test("modShortcutPartsNeutral uses stable Mod and key parts", () => {
  assert.deepEqual(modShortcutPartsNeutral("b"), { modifier: "Mod", key: "B" });
});

test("modShortcut uses Mod+ when navigator is unavailable", () => {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: undefined,
  });
  assert.equal(modShortcut("b"), "Mod+B");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: original,
  });
});

test("modShortcut uses Ctrl+ prefix off Apple platforms", () => {
  const original = navigator.userAgent;
  Object.defineProperty(globalThis.navigator, "userAgent", {
    configurable: true,
    value: "Windows NT 10.0",
  });
  assert.equal(modShortcut("b"), "Ctrl+B");
  assert.deepEqual(modShortcutParts("b"), { modifier: "Ctrl", key: "B" });
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
