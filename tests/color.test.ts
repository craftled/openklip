import assert from "node:assert/strict";
import { test } from "node:test";
import {
  colorToHex,
  generateBrandScale,
  hexToOklch,
  measureContrast,
} from "../src/color.ts";

test("hexToOklch converts and clamps to sRGB gamut", () => {
  const oklch = hexToOklch("#0969da");
  assert.match(oklch, /^oklch\(/);
  assert.ok(hexToOklch("#ffffff").includes("1"));
});

test("colorToHex accepts oklch input for ASS pipeline", () => {
  assert.equal(colorToHex("oklch(0.825 0.093 246.663)"), "#94ccff");
  assert.equal(colorToHex("oklch(0.809 0.1 284.59)"), "#b9b8ff");
});

test("generateBrandScale produces 11 perceptually spaced steps", () => {
  const scale = generateBrandScale({ l: 0.575, c: 0.218, h: 257.4 });
  assert.equal(Object.keys(scale).length, 11);
  assert.match(scale[50], /^oklch\(/);
  assert.match(scale[950], /^oklch\(/);
  const l50 = Number.parseFloat(scale[50].split(" ")[0].replace("oklch(", ""));
  const l950 = Number.parseFloat(
    scale[950].split(" ")[0].replace("oklch(", "")
  );
  assert.ok(l50 > l950);
});

test("openklip primary buttons pass WCAG AA normal text after L adjustment", () => {
  const light = measureContrast("oklch(1 0 0)", "oklch(0.575 0.218 257.4)");
  const dark = measureContrast("oklch(1 0 0)", "oklch(0.57 0.206 255.5)");
  assert.ok(light);
  assert.ok(dark);
  assert.ok(light.passesWcagAaNormal);
  assert.ok(dark.passesWcagAaNormal);
});

test("editor track colors pass WCAG UI component threshold on light shell", () => {
  const bg = "oklch(1 0 0)";
  for (const fg of [
    "oklch(0.623 0.178 210)",
    "oklch(0.676 0.184 75)",
    "oklch(0.657 0.183 25)",
    "oklch(0.579 0.179 145)",
  ]) {
    const result = measureContrast(fg, bg);
    assert.ok(result);
    assert.ok(
      result.passesWcagAaLarge,
      `${fg} should pass 3:1 on white for UI graphics`
    );
  }
});
