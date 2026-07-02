import assert from "node:assert/strict";
import { test } from "node:test";
import { selectDroppedVideo } from "../web/lib/project-intake.ts";

test("selectDroppedVideo picks the first supported video in the drop", () => {
  const result = selectDroppedVideo([
    { name: "notes.txt" },
    { name: "clip.mp4" },
    { name: "second.mov" },
  ]);
  assert.ok("file" in result, "expected a file result");
  assert.equal(result.file.name, "clip.mp4");
});

test("selectDroppedVideo returns format guidance for unsupported drops", () => {
  const result = selectDroppedVideo([{ name: "notes.txt" }]);
  assert.ok("error" in result, "expected an error result");
  assert.match(result.error, /unsupported/i);
  assert.match(result.error, /MP4, MOV, M4V, WebM, MKV, AVI/);
});

test("selectDroppedVideo rejects an empty drop with format guidance", () => {
  const result = selectDroppedVideo([]);
  assert.ok("error" in result, "expected an error result");
  assert.match(result.error, /video/i);
  assert.match(result.error, /MP4, MOV, M4V, WebM, MKV, AVI/);
});
