import { describe, expect, mock, test } from "bun:test";
import { loadEditorProject } from "../app/lib/project-data.ts";
import { saveBrief } from "../src/brief.ts";
import { defaultFixtureOrphan } from "./helpers/assetFixture.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

describe("loadEditorProject", () => {
  test("returns project with mediaVersion from proxy mtime", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      const loaded = await loadEditorProject(slug);
      expect(loaded.slug).toBe(slug);
      expect(typeof loaded.mediaVersion).toBe("number");
      expect(loaded.mediaVersion).toBeGreaterThan(0);
    });
  });

  test("syncs assets/ on load and drops registrations outside the drop folder", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      const fixture = makeProject({ slug });
      expect(defaultFixtureOrphan(fixture)?.src).toContain("/tmp/");
      writeFixtureProject(slug, fixture);

      const loaded = await loadEditorProject(slug);
      expect(loaded.assets).toHaveLength(0);
    });
  });

  test("returns the brief text when brief.md exists", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      await saveBrief(slug, "Audience: founders. Goal: ship the demo.");
      const loaded = await loadEditorProject(slug);
      expect(loaded.brief).toBe("Audience: founders. Goal: ship the demo.");
    });
  });

  test("returns brief null when brief.md is absent", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      const loaded = await loadEditorProject(slug);
      expect(loaded.brief).toBeNull();
    });
  });

  test("still loads the project when folder sync throws", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug, assets: [] }));
      mock.module("@engine/asset-scanner", () => ({
        syncAssetsFromFolder: () => {
          throw new Error("ffmpeg proxy build failed");
        },
      }));

      const loaded = await loadEditorProject(slug);
      expect(loaded.slug).toBe(slug);

      mock.restore();
    });
  });
});
