import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePlatformOptions } from "../src/export-platforms.ts";
import { runAction } from "../src/registry.ts";
import { makeProject } from "./helpers/projectFixture.ts";

// Documents the make-short agent/CLI loop without a full ffmpeg export:
// set 9:16 on project.export, then resolve the shorts preset for export.
test("make-short loop: export-set 9:16 then shorts preset resolves vertical output", () => {
  const project = makeProject();
  runAction("export-set", project, { aspect: "9:16" });
  assert.equal(project.export?.aspect, "9:16");

  const resolved = resolvePlatformOptions("shorts", {
    aspect: project.export?.aspect,
  });
  assert.equal(resolved.aspect, "9:16");
  assert.equal(resolved.maxHeight, 1920);
  assert.equal(resolved.fps, 30);
  assert.equal(resolved.compression, "social");
  assert.equal(resolved.loudnessTargetLufs, -14);
});
