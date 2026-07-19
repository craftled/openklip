import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertReleaseAssetNames,
  assertReleaseVersionSources,
  createUpdaterManifest,
  requiredReleaseAssetNames,
} from "../scripts/release-desktop.ts";

test("release versions must agree across every desktop version source", () => {
  assert.equal(
    assertReleaseVersionSources({
      versionFile: "1.2.3",
      packageJson: "1.2.3",
      tauriConfig: "1.2.3",
      cargo: "1.2.3",
    }),
    "1.2.3"
  );
  assert.throws(
    () =>
      assertReleaseVersionSources({
        versionFile: "1.2.3",
        packageJson: "1.2.3",
        tauriConfig: "1.2.2",
        cargo: "1.2.3",
      }),
    /version mismatch/
  );
});

test("updater manifest targets Apple Silicon and embeds the signature", () => {
  const manifest = JSON.parse(
    createUpdaterManifest({
      version: "1.2.3",
      notes: "Release notes",
      pubDate: "2026-07-18T12:00:00.000Z",
      signature: "untrusted comment: signature\nabc123\n",
      url: "https://github.com/craftled/openklip/releases/download/v1.2.3/OpenKlip.app.tar.gz",
    })
  );
  assert.equal(manifest.version, "1.2.3");
  assert.equal(
    manifest.platforms["darwin-aarch64"].signature,
    "untrusted comment: signature\nabc123"
  );
  assert.equal(
    manifest.platforms["darwin-aarch64"].url,
    "https://github.com/craftled/openklip/releases/download/v1.2.3/OpenKlip.app.tar.gz"
  );
});

test("draft validation requires the stable marketing alias", () => {
  const names = requiredReleaseAssetNames("1.2.3");
  assert.doesNotThrow(() => assertReleaseAssetNames(names, "1.2.3"));
  assert.throws(
    () =>
      assertReleaseAssetNames(
        names.filter((name) => name !== "OpenKlip-macos-arm64.dmg"),
        "1.2.3"
      ),
    /OpenKlip-macos-arm64\.dmg/
  );
});

test("updater manifest rejects unsigned or insecure artifacts", () => {
  assert.throws(
    () =>
      createUpdaterManifest({
        version: "1.2.3",
        notes: "notes",
        pubDate: "2026-07-18T12:00:00.000Z",
        signature: "",
        url: "https://example.test/update.tar.gz",
      }),
    /signature is empty/
  );
  assert.throws(
    () =>
      createUpdaterManifest({
        version: "1.2.3",
        notes: "notes",
        pubDate: "2026-07-18T12:00:00.000Z",
        signature: "sig",
        url: "http://example.test/update.tar.gz",
      }),
    /must be HTTPS/
  );
});
