import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attachmentMediaLabel,
  isImageAttachment,
} from "../web/lib/prompt-attachment.ts";

test("attachmentMediaLabel maps common media types", () => {
  assert.equal(attachmentMediaLabel("video/mp4"), "Video");
  assert.equal(attachmentMediaLabel("audio/mpeg"), "Audio");
  assert.equal(attachmentMediaLabel("image/png"), "Image");
  assert.equal(attachmentMediaLabel(""), "File");
});

test("isImageAttachment detects image media types", () => {
  assert.equal(isImageAttachment("image/jpeg"), true);
  assert.equal(isImageAttachment("video/mp4"), false);
});
