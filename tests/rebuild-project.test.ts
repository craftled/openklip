import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compactProject } from "../src/compact-project.ts";
import { wordsFromRawChunks } from "../src/ingest.ts";
import { projectPaths } from "../src/paths.ts";
import { rebuildProjectMedia } from "../src/rebuild-project.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function stubbedMediaDeps() {
  return {
    buildProxy: (_source: string, out: string) => {
      writeFileSync(out, "rebuilt-proxy-bytes");
      return Promise.resolve();
    },
    extractAudio: (_source: string, out: string) => {
      writeFileSync(out, "rebuilt-pcm-bytes");
      return Promise.resolve();
    },
    extractSampleFrames: (_proxy: string, framesDir: string) => {
      mkdirSync(framesDir, { recursive: true });
      writeFileSync(join(framesDir, "0001.jpg"), "rebuilt-frame-bytes");
      return Promise.resolve();
    },
    buildMomentIndex: () => Promise.resolve({ built: false }),
    transcribeToWords: () =>
      Promise.resolve(wordsFromRawChunks([{ text: "hi", start: 0, end: 0.2 }])),
  };
}

describe("rebuildProjectMedia", () => {
  test("restores proxy/audio/frames/transcript after a compact, using project.json's source", async () => {
    await withTempProjectsRoot(async ({ root, slug }) => {
      const sourcePath = join(root, "source.mp4");
      writeFileSync(sourcePath, "not-a-real-video");
      writeFixtureProject(slug, makeProject({ slug, source: sourcePath }));

      const p = projectPaths(slug);
      mkdirSync(p.frames, { recursive: true });
      writeFileSync(join(p.frames, "0001.jpg"), "old-frame");
      writeFileSync(p.audioRaw, "old-pcm");
      await compactProject(slug);

      expect(existsSync(p.proxy)).toBe(false);
      expect(existsSync(p.audioRaw)).toBe(false);
      expect(existsSync(p.frames)).toBe(false);

      await rebuildProjectMedia(slug, { mediaDeps: stubbedMediaDeps() });

      expect(existsSync(p.proxy)).toBe(true);
      expect(existsSync(p.audioRaw)).toBe(true);
      expect(existsSync(join(p.frames, "0001.jpg"))).toBe(true);
      expect(existsSync(p.transcript)).toBe(true);
      const transcript = JSON.parse(await Bun.file(p.transcript).text());
      expect(transcript.words[0].text).toBe("hi");
    });
  });

  test("does not touch project.json's edit (words, revision) during rebuild", async () => {
    await withTempProjectsRoot(async ({ root, slug }) => {
      const sourcePath = join(root, "source.mp4");
      writeFileSync(sourcePath, "not-a-real-video");
      const project = makeProject({ slug, source: sourcePath });
      writeFixtureProject(slug, project);
      const p = projectPaths(slug);
      await compactProject(slug);

      await rebuildProjectMedia(slug, { mediaDeps: stubbedMediaDeps() });

      const saved = JSON.parse(await Bun.file(p.project).text());
      expect(saved.words).toEqual(project.words);
    });
  });

  test("throws a clear error when the source video is missing", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(
        slug,
        makeProject({ slug, source: "/tmp/does-not-exist-openklip.mp4" })
      );
      await expect(
        rebuildProjectMedia(slug, { mediaDeps: stubbedMediaDeps() })
      ).rejects.toThrow(/source video not found/);
    });
  });

  test("rejects invalid slugs before touching disk", async () => {
    await withTempProjectsRoot(async () => {
      await expect(
        rebuildProjectMedia("../escape", { mediaDeps: stubbedMediaDeps() })
      ).rejects.toThrow(/invalid project slug/);
    });
  });

  test("throws when the project does not exist", async () => {
    await withTempProjectsRoot(async () => {
      await expect(
        rebuildProjectMedia("missing", { mediaDeps: stubbedMediaDeps() })
      ).rejects.toThrow(/project not found/);
    });
  });

  test("is safe to run on a project that was never compacted (idempotent rebuild)", async () => {
    await withTempProjectsRoot(async ({ root, slug }) => {
      const sourcePath = join(root, "source.mp4");
      writeFileSync(sourcePath, "not-a-real-video");
      writeFixtureProject(slug, makeProject({ slug, source: sourcePath }));
      const p = projectPaths(slug);
      expect(existsSync(p.proxy)).toBe(true);

      await rebuildProjectMedia(slug, { mediaDeps: stubbedMediaDeps() });

      expect(existsSync(p.proxy)).toBe(true);
      const proxyContents = await Bun.file(p.proxy).text();
      expect(proxyContents).toBe("rebuilt-proxy-bytes");
    });
  });
});
