// Real-ffmpeg cam ingest test. Lives apart from tests/cams.test.ts because that
// file mocks ../src/ffmpeg.ts and ../src/ingest.ts module-wide, which would
// poison this path. Gated behind OPENKLIP_INTEGRATION=1.
import { test } from "bun:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ingestCam } from "../src/cams.ts";
import { FFMPEG, run } from "../src/ffmpeg.ts";
import { camDir, camFile, projectPaths } from "../src/paths.ts";
import { withTempProjectsRoot } from "./helpers/projectFixture.ts";

test("ingestCam writes proxy and audio paths on a lavfi clip", async () => {
  if (process.env.OPENKLIP_INTEGRATION !== "1") {
    return;
  }
  if (typeof FFMPEG !== "string" || !existsSync(FFMPEG)) {
    return;
  }

  await withTempProjectsRoot(async ({ slug }) => {
    const video = join(projectPaths(slug).dir, "clip.mp4");
    await run(
      FFMPEG,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=green:s=320x240:r=30:d=1",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        video,
      ],
      "ffmpeg(cam-ingest-test)"
    );

    const cam = await ingestCam(slug, video, { force: true });
    assert.equal(cam.id, "cam1");
    assert.ok(existsSync(join(camDir(slug, cam.id), "proxy.mp4")));
    assert.ok(existsSync(join(camDir(slug, cam.id), "audio16k.f32")));
    assert.ok(existsSync(camFile(slug, cam.id)));
  });
});
