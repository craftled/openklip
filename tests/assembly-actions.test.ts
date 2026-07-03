import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  assembleFromSelectionAction,
  listTakesAction,
  loadTakeAction,
} from "../app/actions.ts";
import { readActionLog } from "../src/action-log.ts";
import { SAMPLE_RATE, type Take } from "../src/edl.ts";
import { FFMPEG, run } from "../src/ffmpeg.ts";
import { projectPaths, takeDir, takeFile } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

// assembleFromSelection's ffmpeg concat step gets one skip-gated smoke test,
// same convention as tests/assembly.test.ts. listTakesAction/loadTakeAction
// never touch ffmpeg (they only read take.json records off disk), and the
// force-guard path throws before any ffmpeg call, so those stay ungated.
const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);

const sec = (n: number) => n * SAMPLE_RATE;

function seedTake(slug: string, take: Take): void {
  mkdirSync(takeDir(slug, take.id), { recursive: true });
  Bun.write(takeFile(slug, take.id), JSON.stringify(take, null, 2));
}

function mkTake(id: string, source: string, wordCount = 4): Take {
  return {
    id,
    label: `Take ${id}`,
    source,
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 320,
    height: 240,
    durationSamples: sec(wordCount),
    words: Array.from({ length: wordCount }, (_, i) => ({
      id: `w${i}`,
      text: `word${i}`,
      startSample: sec(i),
      endSample: sec(i + 1),
      deleted: false,
    })),
    ingestedAt: "2026-06-29T00:00:00.000Z",
  };
}

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

test("listTakesAction lists ingested takes with label, duration, and word count", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    seedTake(slug, mkTake("takeA", "/tmp/takeA-src.mp4", 4));
    seedTake(slug, mkTake("takeB", "/tmp/takeB-src.mp4", 2));

    const result = await listTakesAction(slug);
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.data.takes.length, 2);
    const byId = new Map(result.data.takes.map((t) => [t.id, t]));
    assert.equal(byId.get("takeA")?.words.length, 4);
    assert.equal(byId.get("takeB")?.words.length, 2);
    assert.equal(byId.get("takeA")?.label, "Take takeA");
  });
});

test("listTakesAction returns an empty list when no takes have been ingested", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await listTakesAction(slug);
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepEqual(result.data.takes, []);
  });
});

test("loadTakeAction returns the take's full word list for range picking", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    seedTake(slug, mkTake("takeA", "/tmp/takeA-src.mp4", 4));

    const result = await loadTakeAction(slug, "takeA");
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.data.take.id, "takeA");
    assert.equal(result.data.take.words.length, 4);
    assert.equal(result.data.take.words[0].id, "w0");
    assert.equal(result.data.take.words[3].id, "w3");
  });
});

test("loadTakeAction returns ok:false for a take that was never ingested", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await loadTakeAction(slug, "missing-take");
    assert.equal(result.ok, false);
  });
});

test("assembleFromSelectionAction returns ok:false without force when a project already exists", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    seedTake(slug, mkTake("takeA", "/tmp/takeA-src.mp4", 4));

    const result = await assembleFromSelectionAction(slug, {
      segments: [{ takeId: "takeA", startWordId: "w0", endWordId: "w1" }],
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.match(result.error, /force/);
  });
});

test("assembleFromSelectionAction concats two seeded takes and returns the fresh project", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = projectPaths(slug);
    mkdirSync(join(p.dir, "takes"), { recursive: true });

    const srcA = join(p.dir, "takeA-src.mp4");
    const srcB = join(p.dir, "takeB-src.mp4");
    await makeClip(srcA, "red", 4);
    await makeClip(srcB, "blue", 4);

    const takeA = mkTake("takeA", srcA, 4);
    const takeB = mkTake("takeB", srcB, 4);
    seedTake(slug, takeA);
    seedTake(slug, takeB);
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

    writeFixtureProject(
      slug,
      makeProject({ slug, source: srcA, width: 320, height: 240, fps: 30 })
    );

    const result = await assembleFromSelectionAction(
      slug,
      {
        segments: [
          { takeId: "takeA", startWordId: "w0", endWordId: "w1" },
          { takeId: "takeB", startWordId: "w2", endWordId: "w3" },
        ],
        padMs: 0,
      },
      { force: true }
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.data.segments, 2);
    assert.equal(result.data.words, 4);
    assert.equal(result.data.project.assembly?.segments.length, 2);
    assert.ok(existsSync(join(p.dir, "source.mp4")));

    // GUI-triggered mutation is logged with the human actor, matching the
    // convention every other direct GUI mutation in app/actions.ts uses.
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "assemble");
    assert.equal(entries[0].actor, "human");
  });
});
