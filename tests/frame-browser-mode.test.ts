import assert from "node:assert/strict";
import { test } from "node:test";
import {
  frameBrowserMarkStorageNote,
  frameBrowserMode,
} from "../web/lib/frame-browser-mode.ts";

const VideoDecoder = true;
const VideoFrame = true;

test("frameBrowserMode uses WebCodecs only when the browser exposes the needed APIs", () => {
  assert.equal(
    frameBrowserMode({
      VideoDecoder,
      VideoFrame,
    }),
    "webcodecs"
  );
});

test("frameBrowserMode falls back to media seek without WebCodecs", () => {
  assert.equal(frameBrowserMode({}), "media-seek");
  assert.equal(frameBrowserMode({ VideoFrame }), "media-seek");
});

test("frame browser POC documents mark storage before persistence", () => {
  assert.match(frameBrowserMarkStorageNote, /working\/scene-marks\.json/);
  assert.match(frameBrowserMarkStorageNote, /action history/i);
});
