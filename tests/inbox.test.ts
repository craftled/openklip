import assert from "node:assert/strict";
import { test } from "node:test";
import { listInboxVideos } from "../src/inbox.ts";

test("listInboxVideos returns videos whose project does not exist yet", () => {
  const pending = listInboxVideos(
    ["edgaras-raw.MP4", "demo.mov", "notes.txt", "song.mp3"],
    ["demo"]
  );
  assert.deepEqual(pending, [{ file: "edgaras-raw.MP4", slug: "edgaras-raw" }]);
});

test("listInboxVideos ignores non-video files and dotfiles", () => {
  const pending = listInboxVideos(
    [".DS_Store", "poster.png", "track.wav", "clip.webm"],
    []
  );
  assert.deepEqual(pending, [{ file: "clip.webm", slug: "clip" }]);
});

test("listInboxVideos de-dupes two files that map to the same slug", () => {
  const pending = listInboxVideos(["Talk.mp4", "talk.mov"], []);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].slug, "talk");
});

test("listInboxVideos skips everything once the project exists", () => {
  assert.deepEqual(listInboxVideos(["talk.mp4"], ["talk"]), []);
});

test("listInboxVideos accepts all known video extensions", () => {
  const files = ["a.mp4", "b.mov", "c.m4v", "d.webm", "e.mkv", "f.avi"];
  assert.equal(listInboxVideos(files, []).length, files.length);
});
