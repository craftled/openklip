import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  readProvenanceDisplayEnabled,
  resetProvenancePreferencesForTests,
  subscribeProvenanceDisplay,
  writeProvenanceDisplayEnabled,
} from "../web/lib/provenance-preferences.ts";
import {
  installLocalStorageMock,
  uninstallLocalStorageMock,
} from "./helpers/localStorageMock.ts";

beforeEach(() => {
  installLocalStorageMock();
  resetProvenancePreferencesForTests();
});

afterEach(() => {
  resetProvenancePreferencesForTests();
  uninstallLocalStorageMock();
});

test("readProvenanceDisplayEnabled defaults to false", () => {
  assert.equal(readProvenanceDisplayEnabled(), false);
});

test("writeProvenanceDisplayEnabled persists and read returns true", () => {
  writeProvenanceDisplayEnabled(true);
  assert.equal(localStorage.getItem("openklip-provenance-display"), "1");
  assert.equal(readProvenanceDisplayEnabled(), true);
  writeProvenanceDisplayEnabled(false);
  assert.equal(readProvenanceDisplayEnabled(), false);
});

test("subscribeProvenanceDisplay notifies on write", () => {
  let seen = readProvenanceDisplayEnabled();
  const unsub = subscribeProvenanceDisplay((enabled) => {
    seen = enabled;
  });
  writeProvenanceDisplayEnabled(true);
  assert.equal(seen, true);
  unsub();
});
