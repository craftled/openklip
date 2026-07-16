import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createProjectsPost, type IngestFn } from "../app/api/projects/post.ts";
import { FFMPEG, run } from "../src/ffmpeg.ts";
import { ingest, wordsFromRawChunks } from "../src/ingest.ts";
import { getIngestJob, type IngestJob } from "../src/ingest-jobs.ts";
import { projectPaths, projectsRoot } from "../src/paths.ts";
import { withTempProjectsRoot } from "./helpers/projectFixture.ts";

// Route-level smoke for CRAFT-6181: a force upload through the REAL
// app/api/projects/post.ts route drives the REAL ingest()/forceIngestWithSwap
// transaction end to end (proxy + audio via real ffmpeg on a tiny lavfi
// clip). transcribeToWords/buildMomentIndex/extractSampleFrames are stubbed
// via ingest()'s test-only mediaDeps hook so this stays fast and doesn't
// touch real Whisper/CLIP, matching tests/ingest-swap.test.ts.
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

function fastIngest(text: string, failProxy = false): IngestFn {
  return (videoArg, opts) =>
    ingest(videoArg, {
      ...opts,
      mediaDeps: {
        ...(failProxy
          ? {
              buildProxy: () =>
                Promise.reject(new Error("simulated route ffmpeg crash")),
            }
          : {}),
        extractSampleFrames: () => Promise.resolve(),
        buildMomentIndex: () => Promise.resolve(),
        transcribeToWords: () =>
          Promise.resolve(wordsFromRawChunks([{ text, start: 0, end: 0.2 }])),
      },
    });
}

async function pollJob(id: string): Promise<IngestJob> {
  for (let i = 0; i < 400; i += 1) {
    const job = getIngestJob(id);
    if (job && job.status !== "running") {
      return job;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("ingest job did not finish");
}

function assertNoStagingDebris(slug: string): void {
  const entries = existsSync(projectsRoot()) ? readdirSync(projectsRoot()) : [];
  const debris = entries.filter(
    (name) => name.startsWith(`${slug}-stg-`) || name.startsWith(`${slug}-bak-`)
  );
  assert.deepEqual(debris, [], `unexpected staging/backup debris: ${debris}`);
}

test("POST /api/projects?force=1 drives the transactional swap: success replaces, failure preserves", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  await withTempProjectsRoot(async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "openklip-route-swap-"));
    try {
      const redClip = join(tempRoot, "red.mp4");
      const blueClip = join(tempRoot, "blue.mp4");
      await makeClip(redClip, "red", 1);
      await makeClip(blueClip, "blue", 1);
      const redBytes = await Bun.file(redClip).arrayBuffer();
      const blueBytes = await Bun.file(blueClip).arrayBuffer();

      // 1) Initial (non-force) upload creates the baseline project.
      const createPost = createProjectsPost({
        loadIngest: () => Promise.resolve(fastIngest("original")),
        tempRoot,
      });
      const createRes = await createPost(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: (() => {
            const form = new FormData();
            form.append(
              "file",
              new File([redBytes], "swap-clip.mp4", { type: "video/mp4" })
            );
            return form;
          })(),
        }) as unknown as Parameters<typeof createPost>[0]
      );
      assert.equal(createRes.status, 200);
      const createJson = (await createRes.json()) as { jobId: string };
      const created = await pollJob(createJson.jobId);
      assert.equal(created.status, "done");
      const slug = created.slug;

      const p = projectPaths(slug);
      const originalProjectJson = await Bun.file(p.project).text();
      const originalProxyBytes = Buffer.from(
        await Bun.file(p.proxy).arrayBuffer()
      );

      // 2) Force upload with an injected staging failure must preserve
      // the original untouched.
      const failPost = createProjectsPost({
        loadIngest: () => Promise.resolve(fastIngest("should-not-land", true)),
        tempRoot,
      });
      const failRes = await failPost(
        new Request("http://localhost/api/projects?force=1", {
          method: "POST",
          body: (() => {
            const form = new FormData();
            form.append(
              "file",
              new File([blueBytes], "swap-clip.mp4", { type: "video/mp4" })
            );
            return form;
          })(),
        }) as unknown as Parameters<typeof failPost>[0]
      );
      assert.equal(failRes.status, 200);
      const failJson = (await failRes.json()) as { jobId: string };
      const failed = await pollJob(failJson.jobId);
      assert.equal(failed.status, "error");
      assert.match(failed.error ?? "", /simulated route ffmpeg crash/);

      assert.equal(await Bun.file(p.project).text(), originalProjectJson);
      assert.deepEqual(
        Buffer.from(await Bun.file(p.proxy).arrayBuffer()),
        originalProxyBytes
      );
      assertNoStagingDebris(slug);

      // 3) A successful force upload replaces the project.
      const okPost = createProjectsPost({
        loadIngest: () => Promise.resolve(fastIngest("replaced")),
        tempRoot,
      });
      const okRes = await okPost(
        new Request("http://localhost/api/projects?force=1", {
          method: "POST",
          body: (() => {
            const form = new FormData();
            form.append(
              "file",
              new File([blueBytes], "swap-clip.mp4", { type: "video/mp4" })
            );
            return form;
          })(),
        }) as unknown as Parameters<typeof okPost>[0]
      );
      assert.equal(okRes.status, 200);
      const okJson = (await okRes.json()) as { jobId: string };
      const ok = await pollJob(okJson.jobId);
      assert.equal(ok.status, "done");
      assert.equal(ok.slug, slug);

      const replaced = JSON.parse(await Bun.file(p.project).text()) as {
        slug: string;
        words: Array<{ text: string }>;
      };
      assert.equal(replaced.slug, slug);
      assert.equal(replaced.words[0]?.text, "replaced");
      assertNoStagingDebris(slug);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
