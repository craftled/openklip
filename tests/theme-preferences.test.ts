import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  DEFAULT_APP_THEME,
  getThemeLabel,
  THEME_CATALOG,
} from "../web/lib/theme-catalog.ts";
import {
  getAppTheme,
  getColorScheme,
  resetThemePreferencesForTests,
  setAppTheme,
  setColorScheme,
  subscribeAppTheme,
  subscribeColorScheme,
} from "../web/lib/theme-preferences.ts";
import {
  installLocalStorageMock,
  uninstallLocalStorageMock,
} from "./helpers/localStorageMock.ts";

beforeEach(() => {
  installLocalStorageMock();
  resetThemePreferencesForTests();
});

afterEach(() => {
  resetThemePreferencesForTests();
  uninstallLocalStorageMock();
});

test("getAppTheme returns OpenKlip when storage is empty", () => {
  assert.equal(getAppTheme(), DEFAULT_APP_THEME);
});

test("setAppTheme persists the chosen theme", () => {
  setAppTheme("openklip");
  assert.equal(localStorage.getItem("openklip-theme-id"), "openklip");
  assert.equal(getAppTheme(), "openklip");
});

test("getThemeLabel maps ids to human labels", () => {
  assert.equal(getThemeLabel("openklip"), "OpenKlip");
  assert.equal(getThemeLabel("unknown"), "unknown");
});

test("subscribeAppTheme fires when the theme changes", () => {
  const seen: string[] = [];
  const unsub = subscribeAppTheme((theme) => {
    seen.push(theme);
  });

  setAppTheme("openklip");

  assert.deepEqual(seen, ["openklip"]);
  unsub();
});

test("getColorScheme returns light when storage is empty", () => {
  assert.equal(getColorScheme(), "light");
});

test("setColorScheme persists the chosen scheme", () => {
  setColorScheme("dark");
  assert.equal(localStorage.getItem("openklip-color-scheme"), "dark");
  assert.equal(getColorScheme(), "dark");
});

test("subscribeColorScheme fires when the scheme changes", () => {
  const seen: string[] = [];
  const unsub = subscribeColorScheme((scheme) => {
    seen.push(scheme);
  });

  setColorScheme("dark");
  setColorScheme("light");

  assert.deepEqual(seen, ["dark", "light"]);
  unsub();
});

test("THEME_CATALOG lists OpenKlip as the default catalog entry", () => {
  assert.equal(THEME_CATALOG.length >= 1, true);
  assert.equal(THEME_CATALOG[0]?.id, "openklip");
  assert.equal(THEME_CATALOG[0]?.name, "OpenKlip");
});
