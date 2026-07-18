import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compactProject } from "../src/compact-project.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

// Populate the derived artifacts a real ingest would have left behind, plus
// the keep-list files, so a test can assert compact only removes the former.
function writeDerivedFixtures(slug: string): void {
  const p = projectPaths(slug);
  mkdirSync(p.frames, { recursive: true });
  writeFileSync(join(p.frames, "0001.jpg"), "fake-frame-bytes");
  writeFileSync(p.audioRaw, "fake-pcm-bytes");
  writeFileSync(p.momentIndex, JSON.stringify({ frames: [] }));
  writeFileSync(p.transcript, JSON.stringify({ words: [] }));
  writeFileSync(join(p.working, "audio-analysis.json"), JSON.stringify({}));
  mkdirSync(p.output, { recursive: true });
  writeFileSync(p.out, "fake-render-bytes");

  // Keep-list files that must survive compact.
  mkdirSync(p.historyDir, { recursive: true });
  writeFileSync(join(p.historyDir, "rev-1.json"), "{}");
  writeFileSync(p.chats, JSON.stringify({ threads: [] }));
  writeFileSync(p.tasks, JSON.stringify({ tasks: [] }));
  writeFileSync(p.actionsLog, "");
  writeFileSync(p.silencesJobs, JSON.stringify({ jobs: [] }));
}

describe("compactProject", () => {
  test("removes regenerable media and returns bytes freed", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      writeDerivedFixtures(slug);
      const p = projectPaths(slug);

      const result = await compactProject(slug);

      expect(existsSync(p.proxy)).toBe(false);
      expect(existsSync(p.audioRaw)).toBe(false);
      expect(existsSync(p.frames)).toBe(false);
      expect(existsSync(p.momentIndex)).toBe(false);
      expect(existsSync(p.transcript)).toBe(false);
      expect(existsSync(join(p.working, "audio-analysis.json"))).toBe(false);
      expect(existsSync(p.output)).toBe(false);

      expect(result.bytesFreed).toBeGreaterThan(0);
      expect(result.removed.length).toBeGreaterThan(0);
    });
  });

  test("never deletes the keep list: project.json, source, history, chats, tasks, actions log, silences jobs", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      writeDerivedFixtures(slug);
      const p = projectPaths(slug);

      await compactProject(slug);

      expect(existsSync(p.project)).toBe(true);
      expect(existsSync(join(p.historyDir, "rev-1.json"))).toBe(true);
      expect(existsSync(p.chats)).toBe(true);
      expect(existsSync(p.tasks)).toBe(true);
      expect(existsSync(p.actionsLog)).toBe(true);
      expect(existsSync(p.silencesJobs)).toBe(true);
      expect(existsSync(p.assets)).toBe(true);
    });
  });

  test("is a no-op (zero bytes freed, no error) on an already-compacted project", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      writeDerivedFixtures(slug);
      await compactProject(slug);

      const result = await compactProject(slug);
      expect(result.bytesFreed).toBe(0);
    });
  });

  test("rejects invalid slugs before touching disk", async () => {
    await withTempProjectsRoot(async () => {
      await expect(compactProject("../escape")).rejects.toThrow(
        /invalid project slug/
      );
    });
  });

  test("throws when the project does not exist", async () => {
    await withTempProjectsRoot(async () => {
      await expect(compactProject("missing")).rejects.toThrow(
        /project not found/
      );
    });
  });

  test("waits for an in-flight project lock before compacting", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      writeDerivedFixtures(slug);
      const { mutateProject } = await import("../src/projectStore.ts");

      const slowMutate = mutateProject(slug, async (proj) => {
        await new Promise((r) => setTimeout(r, 50));
        proj.padMs += 1;
      });

      const [result] = await Promise.all([compactProject(slug), slowMutate]);
      expect(existsSync(projectPaths(slug).proxy)).toBe(false);
      expect(result.bytesFreed).toBeGreaterThan(0);
    });
  });
});
