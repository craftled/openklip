import assert from "node:assert/strict";
import { test } from "node:test";
import { captionStyle } from "@engine/caption-styles";
import { captionStyleCss } from "../web/lib/caption-style-css.ts";

test("boxed: back-compat pin against the historical hardcoded classes (bg-black/55, text-white, font-medium, unscaled clamp)", () => {
  const css = captionStyleCss(captionStyle("boxed"));
  assert.equal(css.background, "rgba(0, 0, 0, 0.55)"); // bg-black/55
  assert.equal(css.textShadow, "none"); // box replaces outline
  assert.equal(css.fontWeight, 500); // font-medium
  assert.equal(css.fontSize, "clamp(15px, 2.3vw, 30px)"); // unscaled base formula
  assert.equal(css.textTransform, "none");
  assert.equal(css.activeColor, "#ffffff"); // text-white
  assert.equal(css.inactiveColor, "rgba(255, 255, 255, 0.7)"); // text-white/70
});

test("clean: no box, outline via textShadow instead of a background", () => {
  const css = captionStyleCss(captionStyle("clean"));
  assert.equal(css.background, "transparent");
  assert.notEqual(css.textShadow, "none");
  assert.match(css.textShadow, /rgba\(0, 0, 0, 0\.9\)/);
  assert.equal(css.fontSize, "clamp(15px, 2.3vw, 30px)");
});

test("karaoke: active word pops in the accent color, inactive stays white at inactiveOpacity", () => {
  const css = captionStyleCss(captionStyle("karaoke"));
  assert.equal(css.activeColor, "#7dc4ff");
  assert.equal(css.inactiveColor, "rgba(255, 255, 255, 0.85)");
  assert.equal(css.fontSize, "clamp(15.75px, 2.415vw, 31.5px)");
});

test("bold-caps: uppercase transform and an up-scaled clamp", () => {
  const css = captionStyleCss(captionStyle("bold-caps"));
  assert.equal(css.textTransform, "uppercase");
  assert.equal(css.fontSize, "clamp(17.7px, 2.714vw, 35.4px)");
  assert.equal(css.fontWeight, 500);
});

test("minimal: lighter weight, down-scaled clamp, no box", () => {
  const css = captionStyleCss(captionStyle("minimal"));
  assert.equal(css.fontWeight, 400);
  assert.equal(css.fontSize, "clamp(12.75px, 1.955vw, 25.5px)");
  assert.equal(css.background, "transparent");
  assert.notEqual(css.textShadow, "none");
});

test("captionStyleCss always returns the def's own fontFamily", () => {
  for (const id of [
    "boxed",
    "clean",
    "karaoke",
    "bold-caps",
    "minimal",
  ] as const) {
    assert.equal(captionStyleCss(captionStyle(id)).fontFamily, "Arial");
  }
});
