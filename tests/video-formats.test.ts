import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSupportedVideoFilename,
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_VIDEO_LABEL,
  unsupportedVideoMessage,
} from "../src/video-formats.ts";

test("isSupportedVideoFilename accepts every supported extension case-insensitively", () => {
  const names = [
    "talk.mp4",
    "talk.MP4",
    "clip.mov",
    "clip.MoV",
    "take.m4v",
    "screen.webm",
    "screen.WebM",
    "raw.mkv",
    "old.avi",
    "old.AVI",
  ];
  for (const name of names) {
    assert.equal(isSupportedVideoFilename(name), true, name);
  }
});

test("isSupportedVideoFilename rejects non-video and extensionless names", () => {
  const names = ["notes.txt", "poster.png", "voice.mp3", "README", "mp4"];
  for (const name of names) {
    assert.equal(isSupportedVideoFilename(name), false, name);
  }
});

test("isSupportedVideoFilename treats a bare dotfile as extensionless", () => {
  // ".mp4" is a whole filename, not an extension; a hidden file with a real
  // extension still counts.
  assert.equal(isSupportedVideoFilename(".mp4"), false);
  assert.equal(isSupportedVideoFilename(".hidden.mp4"), true);
});

test("supported extension set matches what the inbox watch ingests today", () => {
  assert.deepEqual([...SUPPORTED_VIDEO_EXTENSIONS].sort(), [
    ".avi",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".webm",
  ]);
});

test("unsupportedVideoMessage names the bad extension and the supported list", () => {
  const message = unsupportedVideoMessage("notes.txt");
  assert.match(message, /unsupported format: \.txt/i);
  assert.ok(message.includes(SUPPORTED_VIDEO_LABEL));
});

test("unsupportedVideoMessage stays actionable for extensionless names", () => {
  const message = unsupportedVideoMessage("README");
  assert.ok(message.includes(SUPPORTED_VIDEO_LABEL));
});
