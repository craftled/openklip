import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetProxyRelative,
  assetSourceRelative,
  projectPaths,
} from "../src/paths.ts";

test("projectPaths separates user assets/ from working/ generated files", () => {
  const p = projectPaths("demo");
  assert.ok(p.assets.endsWith("projects/demo/assets"));
  assert.ok(p.assetProxies.endsWith("projects/demo/working/assets"));
  assert.ok(p.chats.endsWith("projects/demo/working/chats.json"));
  assert.ok(p.proxy.endsWith("projects/demo/working/proxy.mp4"));
  assert.ok(p.out.endsWith("projects/demo/output/out.mp4"));
});

test("assetSourceRelative and assetProxyRelative use consistent prefixes", () => {
  assert.equal(assetSourceRelative("track.mp3"), "assets/track.mp3");
  assert.equal(assetProxyRelative("track.aac"), "working/assets/track.aac");
});
