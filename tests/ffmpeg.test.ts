import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  FFMPEG,
  FFPROBE,
  isFfprobeArchMismatchError,
  probe,
  run,
} from "../src/ffmpeg.ts";

test("isFfprobeArchMismatchError recognizes EBADARCH spawn failures", () => {
  assert.equal(
    isFfprobeArchMismatchError({ code: "EBADARCH", errno: -86 }),
    true
  );
  assert.equal(isFfprobeArchMismatchError({ errno: -86 }), true);
  assert.equal(isFfprobeArchMismatchError({ code: "ENOENT" }), false);
  assert.equal(isFfprobeArchMismatchError(null), false);
});

test("probe falls back to a system ffprobe when the bundled binary is the wrong arch", {
  skip:
    process.platform === "darwin" &&
    process.arch === "arm64" &&
    existsSync(FFPROBE) &&
    existsSync(FFMPEG) &&
    !process.env.FFPROBE
      ? false
      : "arm64 bundled-ffprobe arch mismatch scenario only",
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), "openklip-ffprobe-fallback-"));
  const clip = join(dir, "clip.mp4");
  try {
    await run(
      FFMPEG,
      ["-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.1", "-y", clip],
      "ffmpeg(ffprobe-fallback-fixture)"
    );
    const result = await probe(clip);
    assert.equal(result.width, 64);
    assert.equal(result.height, 64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
