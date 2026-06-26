import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetProxyPath,
  projectDir,
  projectPaths,
  slugFromVideo,
  slugify,
} from "../src/paths.ts";

test("slugify normalizes names for project directories", () => {
  assert.equal(slugify("My Cool Video!!!"), "my-cool-video");
  assert.equal(slugify("---"), "project");
});

test("slugFromVideo strips extension before slugifying", () => {
  assert.equal(slugFromVideo("/tmp/Talking Head.MP4"), "talking-head");
});

test("projectPaths resolves canonical project files", () => {
  const p = projectPaths("demo");
  assert.ok(p.project.endsWith("projects/demo/project.json"));
  assert.ok(p.proxy.endsWith("projects/demo/proxy.mp4"));
  assert.equal(projectDir("demo"), p.dir);
});

test("assetProxyPath resolves proxied asset media", () => {
  assert.ok(
    assetProxyPath("demo", "b-roll").endsWith("projects/demo/assets/b-roll.mp4")
  );
});
