import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  applyColorScheme,
  getColorScheme,
  resetThemePreferencesForTests,
  setColorScheme,
  subscribeColorScheme,
  THEME_NO_FLASH_SCRIPT,
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
  // @ts-expect-error test cleanup
  globalThis.document = undefined;
  uninstallLocalStorageMock();
});

function installDocumentClassListMock() {
  const classes = new Set<string>();
  const classList = {
    contains(name: string) {
      return classes.has(name);
    },
    toggle(name: string, force?: boolean) {
      const shouldAdd = force ?? !classes.has(name);
      if (shouldAdd) {
        classes.add(name);
        return true;
      }
      classes.delete(name);
      return false;
    },
  };
  globalThis.document = {
    documentElement: { classList },
  } as unknown as Document;
  return classList;
}

test("getColorScheme returns light when storage is empty", () => {
  assert.equal(getColorScheme(), "light");
});

test("setColorScheme persists the chosen scheme", () => {
  setColorScheme("dark");
  assert.equal(localStorage.getItem("openklip-color-scheme"), "dark");
  assert.equal(getColorScheme(), "dark");
});

test("applyColorScheme toggles the document dark class", () => {
  const classList = installDocumentClassListMock();

  applyColorScheme("dark");
  assert.equal(classList.contains("dark"), true);

  applyColorScheme("light");
  assert.equal(classList.contains("dark"), false);
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

test("THEME_NO_FLASH_SCRIPT applies the stored dark scheme", () => {
  const classList = installDocumentClassListMock();
  localStorage.setItem("openklip-color-scheme", "dark");

  new Function("localStorage", "document", THEME_NO_FLASH_SCRIPT)(
    localStorage,
    document
  );

  assert.equal(classList.contains("dark"), true);
});
