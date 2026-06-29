import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { assembleFromSelection, listTakes } from "../src/assembly.ts";
import { ProjectSchema, SAMPLE_RATE, type Take } from "../src/edl.ts";
import { FFMPEG, run } from "../src/ffmpeg.ts";
import { projectPaths, takeDir, takeFile } from "../src/paths.ts";
import { withTempProjectsRoot } from "./helpers/projectFixture.ts";

// The ffmpeg shell (probe/proxy/concat) gets one skip-gated smoke test only; the
// correctness budget lives in tests/assembly-plan.test.ts (the pure planner).
// This skips when the bundled ffmpeg binary is unavailable so CI without media
// tooling stays green. Whisper is NOT exercised here — we seed take.json records
// with hand-written words and let assembleFromSelection drive the real concat.
const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);

const sec = (n: number) => n * SAMPLE_RATE;

// Render a tiny solid-color clip with a sine tone so concat has real V+A streams.
async function makeClip(path: string, color: string, seconds: number) {
  await run(
    FFMPEG,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=320x240:r=30:d=${seconds}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${seconds}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      path,
    ],
    "ffmpeg(test-clip)"
  );
}

function seedTake(slug: string, take: Take): void {
  mkdirSync(takeDir(slug, take.id), { recursive: true });
  Bun.write(takeFile(slug, take.id), JSON.stringify(take, null, 2));
}

test("assembleFromSelection concats two seeded takes into a real source (smoke)", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    // The temp project dir already exists; assemble wipes/creates as needed.
    mkdirSync(join(p.dir, "takes"), { recursive: true });

    const srcA = join(p.dir, "takeA-src.mp4");
    const srcB = join(p.dir, "takeB-src.mp4");
    await makeClip(srcA, "red", 4);
    await makeClip(srcB, "blue", 4);

    const mkTake = (id: string, source: string): Take => ({
      id,
      label: "",
      source,
      proxy: "proxy.mp4",
      sampleRate: SAMPLE_RATE,
      fps: 30,
      width: 320,
      height: 240,
      durationSamples: sec(4),
      words: Array.from({ length: 4 }, (_, i) => ({
        id: `w${i}`,
        text: `word${i}`,
        startSample: sec(i),
        endSample: sec(i + 1),
        deleted: false,
      })),
      ingestedAt: "2026-06-29T00:00:00.000Z",
    });

    seedTake(slug, mkTake("takeA", srcA));
    seedTake(slug, mkTake("takeB", srcB));
    // Build each take's proxy from its source so the proxy concat has inputs.
    await run(
      FFMPEG,
      ["-y", "-i", srcA, join(takeDir(slug, "takeA"), "proxy.mp4")],
      "ffmpeg(proxyA)"
    );
    await run(
      FFMPEG,
      ["-y", "-i", srcB, join(takeDir(slug, "takeB"), "proxy.mp4")],
      "ffmpeg(proxyB)"
    );

    // Remove the placeholder project.json so the ingest guard allows assembly.
    await Bun.write(p.project, "");
    const result = await assembleFromSelection(
      slug,
      {
        segments: [
          { takeId: "takeA", startWordId: "w0", endWordId: "w1" }, // 0-2s
          { takeId: "takeB", startWordId: "w2", endWordId: "w3" }, // 2-4s
        ],
        padMs: 0,
      },
      { force: true }
    );

    assert.equal(result.segments, 2);
    assert.equal(result.words, 4);
    // Two 2s runs spliced end-to-end.
    assert.ok(Math.abs(result.durationSec - 4) < 0.001);

    // The new single-source project parses and carries assembly provenance.
    const project = ProjectSchema.parse(
      JSON.parse(await Bun.file(p.project).text())
    );
    assert.equal(project.assembly?.segments.length, 2);
    assert.equal(project.assembly?.segments[1].outStartSample, sec(2));
    assert.ok(existsSync(join(p.dir, "source.mp4")));
    assert.ok(existsSync(p.proxy));

    // The takes survive the assembly (parked alongside the new source).
    const takes = await listTakes(slug);
    assert.equal(takes.length, 2);
  });
});
