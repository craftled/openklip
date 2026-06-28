import assert from "node:assert/strict";
import { test } from "node:test";
import { getThemeById, THEME_CATALOG } from "../web/lib/theme-catalog.ts";
import {
  preferredColorScheme,
  themePresetToCSS,
  themeSupportsScheme,
} from "../web/lib/theme-engine.ts";

test("THEME_CATALOG includes OpenKlip and Catppuccin", () => {
  const ids = THEME_CATALOG.map((theme) => theme.id);
  assert.ok(ids.includes("openklip"));
  assert.ok(ids.includes("catppuccin"));
  assert.ok(ids.includes("github"));
});

test("themePresetToCSS emits :root and .dark semantic variables", () => {
  const openklip = getThemeById("openklip");
  assert.ok(openklip);
  const css = themePresetToCSS(openklip);
  assert.match(css, /:root \{[\s\S]*--background:/);
  assert.match(css, /\.dark \{[\s\S]*--accent:/);
  assert.match(css, /--live: var\(--success\);/);
});

test("preferredColorScheme switches to dark for dark-only themes", () => {
  const dracula = getThemeById("dracula");
  assert.ok(dracula);
  assert.equal(preferredColorScheme(dracula, "light"), "dark");
  assert.equal(themeSupportsScheme(dracula, "light"), false);
});

test("catppuccin supports both light and dark modes", () => {
  const catppuccin = getThemeById("catppuccin");
  assert.ok(catppuccin);
  assert.equal(themeSupportsScheme(catppuccin, "light"), true);
  assert.equal(themeSupportsScheme(catppuccin, "dark"), true);
  assert.equal(preferredColorScheme(catppuccin, "light"), "light");
});

test("all theme presets use oklch semantic colors", () => {
  const oklchPattern = /^oklch\(/;
  for (const theme of THEME_CATALOG) {
    for (const key of [
      "background",
      "foreground",
      "accent",
      "info",
      "success",
      "destructive",
    ] as const) {
      assert.match(
        theme[key],
        oklchPattern,
        `${theme.id} light ${key} should be oklch`
      );
      const dark = theme.dark ?? theme;
      assert.match(
        dark[key],
        oklchPattern,
        `${theme.id} dark ${key} should be oklch`
      );
    }
  }
});
