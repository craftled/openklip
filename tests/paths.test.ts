import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertValidSlug,
  assetStoragePath,
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

test("projectPaths uses the layered input/working/output layout", () => {
  const p = projectPaths("demo");
  // The edit itself stays at the project root.
  assert.ok(p.project.endsWith("projects/demo/project.json"));
  // Derived media + scratch live under working/.
  assert.ok(p.proxy.endsWith("projects/demo/working/proxy.mp4"));
  assert.ok(p.transcript.endsWith("projects/demo/working/transcript.json"));
  assert.ok(p.audioRaw.endsWith("projects/demo/working/audio16k.f32"));
  assert.ok(p.frames.endsWith("projects/demo/working/frames"));
  assert.ok(p.assets.endsWith("projects/demo/assets"));
  assert.ok(p.assetProxies.endsWith("projects/demo/working/assets"));
  assert.ok(p.chats.endsWith("projects/demo/working/chats.json"));
  assert.ok(p.working.endsWith("projects/demo/working"));
  // Rendered output lives under output/.
  assert.ok(p.out.endsWith("projects/demo/output/out.mp4"));
  assert.ok(p.output.endsWith("projects/demo/output"));
  assert.equal(projectDir("demo"), p.dir);
});

test("assetStoragePath joins a stored relative proxy onto the project dir", () => {
  assert.ok(
    assetStoragePath("demo", "working/assets/b1.mp4").endsWith(
      "projects/demo/working/assets/b1.mp4"
    )
  );
});

test("assertValidSlug accepts normal slugs and returns them", () => {
  assert.equal(assertValidSlug("ok-sample"), "ok-sample");
  assert.equal(assertValidSlug("My_Video.2"), "My_Video.2");
  assert.equal(assertValidSlug("a"), "a");
});

test("assertValidSlug rejects path-traversal and separators", () => {
  for (const bad of [
    "..",
    "../etc",
    "../../etc/passwd",
    "a/b",
    "a\\b",
    "/abs",
    ".hidden",
    "",
    "   ",
    "with space",
  ]) {
    assert.throws(() => assertValidSlug(bad), /invalid project slug/i, bad);
  }
});

test("projectDir refuses to build a path for a traversal slug", () => {
  assert.throws(() => projectDir("../../secret"), /invalid project slug/i);
});

test("projectPaths refuses to build paths for a traversal slug", () => {
  assert.throws(
    () => projectPaths("../../etc/passwd"),
    /invalid project slug/i
  );
});

test("projectDir still resolves a clean slug", () => {
  assert.ok(projectDir("my-video_2").endsWith("projects/my-video_2"));
});
