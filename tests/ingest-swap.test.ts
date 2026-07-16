import assert from "node:assert/strict";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createAgentTask } from "../src/agent-tasks.ts";
import { ProjectSchema } from "../src/edl.ts";
import { FFMPEG, run } from "../src/ffmpeg.ts";
import { ingest, wordsFromRawChunks } from "../src/ingest.ts";
import { ActiveAgentTaskError } from "../src/ingest-swap.ts";
import { projectPaths, projectsRoot } from "../src/paths.ts";
import { loadProject, mutateProject } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

// The swap logic is the safety-critical part of CRAFT-6181 and is exercised
// fully with injected media deps (no real ffmpeg needed for the pure logic
// cases). The "successful swap" and "failed staging" cases still drive the
// REAL `ingest()` entry point with a tiny real lavfi clip for buildProxy and
// extractAudio, so this file gates on ffmpeg availability like
// tests/assembly.test.ts and tests/ingest.test.ts. transcribeToWords and
// buildMomentIndex are always stubbed: nothing in the existing suite
// exercises real Whisper/CLIP (too slow, needs a model download), so this
// file doesn't either.
const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);

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

// No staging (`<slug>-stg-*`) or backup (`<slug>-bak-*`) directories may
// remain in projectsRoot() after a force ingest settles, success or failure.
function assertNoStagingDebris(slug: string): void {
  const entries = existsSync(projectsRoot()) ? readdirSync(projectsRoot()) : [];
  const debris = entries.filter(
    (name) => name.startsWith(`${slug}-stg-`) || name.startsWith(`${slug}-bak-`)
  );
  assert.deepEqual(debris, [], `unexpected staging/backup debris: ${debris}`);
}

const fastWords = () =>
  Promise.resolve(wordsFromRawChunks([{ text: "new", start: 0, end: 0.2 }]));

test("a failed force ingest leaves the original project byte-for-byte intact", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const p = projectPaths(slug);
    const originalProjectJson = await Bun.file(p.project).text();
    const originalProxyBytes = await Bun.file(p.proxy).arrayBuffer();

    const videoPath = join(root, "fixture.mp4");
    await makeClip(videoPath, "red", 1);

    await assert.rejects(
      () =>
        ingest(videoPath, {
          force: true,
          mediaDeps: {
            buildProxy: () =>
              Promise.reject(new Error("simulated ffmpeg crash")),
            extractSampleFrames: () => Promise.resolve(),
            buildMomentIndex: () => Promise.resolve(),
            transcribeToWords: fastWords,
          },
        }),
      /simulated ffmpeg crash/
    );

    // Original project.json and proxy are byte-for-byte unchanged.
    assert.equal(await Bun.file(p.project).text(), originalProjectJson);
    assert.deepEqual(
      Buffer.from(await Bun.file(p.proxy).arrayBuffer()),
      Buffer.from(originalProxyBytes)
    );
    // Still fully loadable.
    const project = await loadProject(slug);
    assert.equal(project.slug, slug);

    assertNoStagingDebris(slug);
  });
});

test("a successful force ingest swaps the replacement in with no debris left behind", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const p = projectPaths(slug);

    const videoPath = join(root, "fixture.mp4");
    await makeClip(videoPath, "blue", 1);

    const resultSlug = await ingest(videoPath, {
      force: true,
      mediaDeps: {
        extractSampleFrames: () => Promise.resolve(),
        buildMomentIndex: () => Promise.resolve(),
        transcribeToWords: fastWords,
      },
    });
    assert.equal(resultSlug, slug);

    const project = await loadProject(slug);
    assert.equal(project.slug, slug);
    assert.equal(project.words[0]?.text, "new");
    // The real 320x240 lavfi source proves this is the NEW ingest, not the
    // 1280x720 placeholder from makeProject().
    assert.equal(project.width, 320);
    assert.equal(project.height, 240);

    const proxyBytes = await Bun.file(p.proxy).arrayBuffer();
    assert.ok(
      proxyBytes.byteLength > 1000,
      "expected a real encoded proxy, not the placeholder bytes"
    );

    assertNoStagingDebris(slug);
  });
});

test("a concurrent project edit racing the swap is serialized, not corrupted", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, revision: 5 }));
    const videoPath = join(root, "fixture.mp4");
    await makeClip(videoPath, "green", 1);

    let observedRevision: number | undefined;
    let observedSlug: string | undefined;
    // Invoked (and its withProjectLock slot registered) BEFORE the force
    // ingest below, and held open for 300ms: comfortably longer than
    // staging (real buildProxy/extractAudio on a 1s clip + stubbed
    // transcribe/frames/index) takes, so the swap's own withProjectLock
    // call is guaranteed to queue behind this one instead of racing it.
    const editPromise = mutateProject(
      slug,
      async (project) => {
        observedRevision = project.revision;
        observedSlug = project.slug;
        project.padMs = 999;
        await new Promise((resolve) => setTimeout(resolve, 300));
      },
      { action: "racing-edit", actor: "cli" }
    );

    const forcePromise = ingest(videoPath, {
      force: true,
      mediaDeps: {
        extractSampleFrames: () => Promise.resolve(),
        buildMomentIndex: () => Promise.resolve(),
        transcribeToWords: fastWords,
      },
    });

    await Promise.all([editPromise, forcePromise]);

    // The racing edit read a coherent PRE-swap project (revision 5, the
    // live slug) : it was never exposed to a torn/half-swapped state.
    assert.equal(observedRevision, 5);
    assert.equal(observedSlug, slug);

    // The final state is the fresh ingest, parses cleanly, and the
    // racing edit's write was entirely replaced by the swap (never
    // merged into a torn mix).
    const finalRaw = JSON.parse(
      await Bun.file(projectPaths(slug).project).text()
    );
    const finalProject = ProjectSchema.parse(finalRaw);
    assert.equal(finalProject.slug, slug);
    assert.equal(finalProject.words[0]?.text, "new");
    assert.notEqual(finalProject.padMs, 999);

    assertNoStagingDebris(slug);
  });
});

test("force ingest refuses when an agent task is actively running on the slug", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const p = projectPaths(slug);
    const before = await Bun.file(p.project).text();

    const task = await createAgentTask(slug, { request: "do something" });
    assert.equal(task.status, "running");

    // No real video needed: assertNoActiveAgentTask throws before ingest
    // ever touches ffmpeg, so existence is all `ingest()`'s early guard needs.
    const videoPath = join(root, "fixture.mp4");
    writeFileSync(videoPath, "not a real video, refusal happens first");

    await assert.rejects(
      () => ingest(videoPath, { force: true }),
      (err: unknown) => {
        assert.ok(err instanceof ActiveAgentTaskError);
        assert.match(err.message, /agent task .* is still running/i);
        assert.match(err.message, new RegExp(task.id));
        return true;
      }
    );

    assert.equal(await Bun.file(p.project).text(), before);
    assertNoStagingDebris(slug);
  });
});
