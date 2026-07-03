import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { intersectRangesWithSpan, SAMPLE_RATE } from "../src/edl.ts";
import { exportCut } from "../src/exporter.ts";
import { FFMPEG, run } from "../src/ffmpeg.ts";
import { exportHighlight, highlightOutPath } from "../src/highlight-export.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("intersectRangesWithSpan clips ranges to span", () => {
  const ranges = [
    { startSec: 0, endSec: 2 },
    { startSec: 3, endSec: 5 },
    { startSec: 8, endSec: 12 },
  ];

  assert.deepEqual(intersectRangesWithSpan(ranges, 1, 4), [
    { startSec: 1, endSec: 2 },
    { startSec: 3, endSec: 4 },
  ]);

  assert.deepEqual(intersectRangesWithSpan(ranges, 10, 20), [
    { startSec: 10, endSec: 12 },
  ]);

  assert.deepEqual(intersectRangesWithSpan(ranges, 20, 30), []);

  assert.deepEqual(intersectRangesWithSpan([], 0, 10), []);
});

test("highlightOutPath resolves output/highlights/{id}.mp4", async () => {
  await withTempProjectsRoot(({ slug }) => {
    const out = highlightOutPath(slug, "h1");
    assert.equal(out, join(projectPaths(slug).highlightsDir, "h1.mp4"));
  });
});

test("exportHighlight resolves clip by id, throws on missing", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        highlights: {
          clips: [
            {
              id: "h1",
              fromSec: 0,
              toSec: 2,
              title: "Hook",
            },
          ],
          analyzedAt: "2026-07-03T00:00:00Z",
        },
      })
    );

    await assert.rejects(
      () => exportHighlight(slug, "h2"),
      /highlight clip not found: h2/
    );

    await assert.rejects(async () => {
      writeFixtureProject(slug, makeProject({ slug }));
      await exportHighlight(slug, "h1");
    }, /no highlights/);
  });
});

const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);

test("exportCut with sourceSpan + outPath writes to custom path", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    const src = join(p.dir, "source.mp4");
    await run(
      FFMPEG,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=6:size=320x240:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=6",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        src,
      ],
      "ffmpeg(export-highlight-smoke)"
    );

    writeFixtureProject(
      slug,
      makeProject({
        slug,
        source: src,
        fps: 30,
        width: 320,
        height: 240,
        durationSamples: 6 * SAMPLE_RATE,
        captions: { enabled: false, maxWords: 6, style: "boxed" },
        words: [
          {
            id: "w0",
            text: "One",
            startSample: 0,
            endSample: 2 * SAMPLE_RATE,
            deleted: false,
          },
          {
            id: "w1",
            text: "Two",
            startSample: 2 * SAMPLE_RATE,
            endSample: 4 * SAMPLE_RATE,
            deleted: false,
          },
          {
            id: "w2",
            text: "Three",
            startSample: 4 * SAMPLE_RATE,
            endSample: 6 * SAMPLE_RATE,
            deleted: false,
          },
        ],
      })
    );

    const customOut = join(p.output, "highlights", "h1.mp4");
    const result = await exportCut(slug, {
      sourceSpan: { fromSec: 2, toSec: 4 },
      outPath: customOut,
      compression: "web-low",
    });

    assert.equal(result.out, customOut);
    assert.ok(existsSync(customOut));
    assert.ok(statSync(customOut).size > 0);
    assert.ok(result.durationSec > 0 && result.durationSec <= 2.2);
    assert.ok(!existsSync(p.out), "default out.mp4 should not be written");
  });
});
