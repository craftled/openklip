import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertMinimumVersion,
  resolveChromePath,
  resolveModelCache,
} from "../scripts/local-ci.ts";

test("resolveModelCache uses the explicit environment override", () => {
  assert.equal(
    resolveModelCache({
      env: { OPENKLIP_MODEL_CACHE: "/var/tmp/openklip-models" },
      homeDir: "/Users/example",
      platform: "darwin",
    }),
    "/var/tmp/openklip-models"
  );
});

test("resolveModelCache uses platform-native persistent cache directories", () => {
  assert.equal(
    resolveModelCache({
      env: {},
      homeDir: "/Users/example",
      platform: "darwin",
    }),
    "/Users/example/Library/Caches/OpenKlip/models"
  );
  assert.equal(
    resolveModelCache({
      env: { XDG_CACHE_HOME: "/cache" },
      homeDir: "/home/example",
      platform: "linux",
    }),
    "/cache/openklip/models"
  );
  assert.equal(
    resolveModelCache({
      env: {},
      homeDir: "/home/example",
      platform: "linux",
    }),
    "/home/example/.cache/openklip/models"
  );
});

test("resolveChromePath honors an existing override", () => {
  assert.equal(
    resolveChromePath({
      env: { OPENKLIP_CHROME_PATH: "/custom/chrome" },
      exists: (path) => path === "/custom/chrome",
      platform: "linux",
      which: () => null,
    }),
    "/custom/chrome"
  );
});

test("resolveChromePath discovers Chrome on macOS and Linux", () => {
  assert.equal(
    resolveChromePath({
      env: {},
      exists: (path) => path.includes("Google Chrome.app"),
      platform: "darwin",
      which: () => null,
    }),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  );
  assert.equal(
    resolveChromePath({
      env: {},
      exists: (path) => path === "/usr/bin/chromium",
      platform: "linux",
      which: (command) => (command === "chromium" ? "/usr/bin/chromium" : null),
    }),
    "/usr/bin/chromium"
  );
});

test("resolveChromePath fails instead of allowing browser tests to skip", () => {
  assert.throws(
    () =>
      resolveChromePath({
        env: {},
        exists: () => false,
        platform: "linux",
        which: () => null,
      }),
    /Chrome or Chromium is required/
  );
  assert.throws(
    () =>
      resolveChromePath({
        env: { OPENKLIP_CHROME_PATH: "/missing/chrome" },
        exists: () => false,
        platform: "darwin",
        which: () => null,
      }),
    /OPENKLIP_CHROME_PATH.*does not exist/
  );
});

test("assertMinimumVersion accepts supported runtimes and rejects older ones", () => {
  assert.doesNotThrow(() => assertMinimumVersion("Bun", "1.3.14", "1.3.14"));
  assert.doesNotThrow(() => assertMinimumVersion("Node.js", "24.1.0", "24"));
  assert.throws(
    () => assertMinimumVersion("Bun", "1.3.13", "1.3.14"),
    /Bun 1\.3\.14 or newer is required/
  );
});
