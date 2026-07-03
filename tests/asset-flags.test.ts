import assert from "node:assert/strict";
import { test } from "node:test";
import { setAssetFlags } from "../src/actions.ts";
import { AssetSchema, ProjectSchema } from "../src/edl.ts";
import { runAction } from "../src/registry.ts";
import { makeProject } from "./helpers/projectFixture.ts";

test("setAssetFlags sets mustUse and clears avoid", () => {
  const p = makeProject();
  p.assets[0].avoid = true;
  setAssetFlags(p, "broll-a", { mustUse: true });
  assert.equal(p.assets[0].mustUse, true);
  assert.equal(p.assets[0].avoid, undefined);
});

test("setAssetFlags sets avoid and clears mustUse", () => {
  const p = makeProject();
  p.assets[0].mustUse = true;
  setAssetFlags(p, "broll-a", { avoid: true });
  assert.equal(p.assets[0].avoid, true);
  assert.equal(p.assets[0].mustUse, undefined);
});

test("setAssetFlags: both true in one call, avoid wins", () => {
  const p = makeProject();
  setAssetFlags(p, "broll-a", { mustUse: true, avoid: true });
  assert.equal(p.assets[0].avoid, true);
  assert.equal(p.assets[0].mustUse, undefined);
});

test("setAssetFlags clears flags when set false", () => {
  const p = makeProject();
  p.assets[0].mustUse = true;
  p.assets[0].avoid = true;
  setAssetFlags(p, "broll-a", { mustUse: false, avoid: false });
  assert.equal(p.assets[0].mustUse, undefined);
  assert.equal(p.assets[0].avoid, undefined);
});

test("setAssetFlags rejects unknown asset id", () => {
  const p = makeProject();
  assert.throws(
    () => setAssetFlags(p, "missing", { mustUse: true }),
    /unknown asset id "missing"/
  );
});

test("AssetSchema round-trips mustUse and avoid", () => {
  const asset = AssetSchema.parse({
    id: "a1",
    name: "clip.mp4",
    src: "/clip.mp4",
    proxy: "assets/a1.mp4",
    durationSamples: 48_000,
    mustUse: true,
    avoid: false,
  });
  assert.equal(asset.mustUse, true);
  assert.equal(asset.avoid, false);

  const project = ProjectSchema.parse({
    version: 1,
    slug: "x",
    source: "/s.mp4",
    proxy: "proxy.mp4",
    sampleRate: 48_000,
    fps: 30,
    width: 1280,
    height: 720,
    durationSamples: 48_000,
    captions: { enabled: true },
    words: [],
    assets: [
      {
        id: "a1",
        name: "clip.mp4",
        src: "/clip.mp4",
        proxy: "assets/a1.mp4",
        durationSamples: 48_000,
        avoid: true,
      },
    ],
  });
  assert.equal(project.assets[0].avoid, true);
});

test("registry asset-flags action mutates project", () => {
  const p = makeProject();
  const result = runAction("asset-flags", p, {
    assetId: "broll-a",
    mustUse: true,
  }) as { assetId: string; mustUse?: boolean; avoid?: boolean };
  assert.equal(result.assetId, "broll-a");
  assert.equal(result.mustUse, true);
  assert.equal(p.assets[0].mustUse, true);
});

test("registry asset-flags rejects unknown asset", () => {
  const p = makeProject();
  assert.throws(
    () => runAction("asset-flags", p, { assetId: "nope", mustUse: true }),
    /unknown asset id/
  );
});
