import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readActionLog } from "../src/action-log.ts";
import {
  listAssetDropFiles,
  pruneStaleAssets,
  syncAssetsFromFolder,
} from "../src/asset-scanner.ts";
import { loadProject } from "../src/projectStore.ts";
import {
  brollClipFor,
  keptMusicAsset,
  orphanBrollAsset,
  projectAssetsDir,
  TINY_PNG,
  writeAssetDrop,
} from "./helpers/assetFixture.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

describe("listAssetDropFiles", () => {
  test("lists only recognized files directly in assets/", async () => {
    await withTempProjectsRoot(({ slug, root }) => {
      writeFixtureProject(slug, makeProject({ slug, assets: [] }));
      const assetsDir = projectAssetsDir(root, slug);
      mkdirSync(assetsDir, { recursive: true });
      writeFileSync(join(assetsDir, "track.mp3"), "fake");
      writeFileSync(join(assetsDir, "notes.txt"), "skip");
      writeFileSync(join(assetsDir, ".hidden"), "skip");

      const files = listAssetDropFiles(slug);
      expect(files).toHaveLength(1);
      expect(files[0]).toEndWith("track.mp3");
    });
  });
});

describe("pruneStaleAssets", () => {
  test("removes registrations whose src is outside the project assets/ folder", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      const assetsDir = projectAssetsDir(root, slug);
      writeAssetDrop(root, slug, "keep.mp3");
      writeFixtureProject(
        slug,
        makeProject({
          slug,
          assets: [orphanBrollAsset(), keptMusicAsset(assetsDir)],
        })
      );

      const project = await loadProject(slug);
      expect(pruneStaleAssets(slug, project)).toBe(true);
      expect(project.assets.map((a) => a.id)).toEqual(["keep"]);
    });
  });

  test("removes registrations when the src file was deleted from assets/", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      const assetsDir = projectAssetsDir(root, slug);
      mkdirSync(assetsDir, { recursive: true });
      writeFixtureProject(
        slug,
        makeProject({
          slug,
          assets: [
            {
              id: "missing",
              kind: "music",
              name: "gone.mp3",
              src: join(assetsDir, "gone.mp3"),
              proxy: "working/assets/gone.aac",
              durationSamples: 1000,
            },
            keptMusicAsset(assetsDir),
          ],
        })
      );
      writeFileSync(join(assetsDir, "keep.mp3"), "fake");

      const project = await loadProject(slug);
      expect(pruneStaleAssets(slug, project)).toBe(true);
      expect(project.assets.map((a) => a.id)).toEqual(["keep"]);
    });
  });

  test("returns false when every registration matches a file in assets/", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      const assetsDir = projectAssetsDir(root, slug);
      writeAssetDrop(root, slug, "keep.mp3");
      writeFixtureProject(
        slug,
        makeProject({
          slug,
          assets: [keptMusicAsset(assetsDir)],
        })
      );

      const project = await loadProject(slug);
      expect(pruneStaleAssets(slug, project)).toBe(false);
      expect(project.assets.map((a) => a.id)).toEqual(["keep"]);
    });
  });

  test("prunes timeline overlays that reference removed assets", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      const assetsDir = projectAssetsDir(root, slug);
      writeAssetDrop(root, slug, "keep.mp3");
      writeFixtureProject(
        slug,
        makeProject({
          slug,
          assets: [orphanBrollAsset(), keptMusicAsset(assetsDir)],
          broll: [brollClipFor("orphan")],
        })
      );

      const project = await loadProject(slug);
      pruneStaleAssets(slug, project);
      expect(project.broll).toHaveLength(0);
    });
  });
});

describe("syncAssetsFromFolder", () => {
  test("prunes stale registrations before registering new drops", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      writeFixtureProject(
        slug,
        makeProject({ slug, assets: [orphanBrollAsset()] })
      );
      writeAssetDrop(root, slug, "incoming.png", TINY_PNG);

      const assets = await syncAssetsFromFolder(slug);
      expect(assets).toHaveLength(1);
      expect(assets[0]?.name).toBe("incoming.png");
    });
  });

  test("registers files dropped into assets/ that are not yet in project.json", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      writeFixtureProject(slug, makeProject({ slug, assets: [] }));
      writeAssetDrop(root, slug, "incoming.png", TINY_PNG);

      const assets = await syncAssetsFromFolder(slug);
      expect(assets).toHaveLength(1);
      expect(assets[0]?.kind).toBe("still");
      expect(assets[0]?.src).toContain("/assets/incoming.png");
      expect(assets[0]?.proxy).toBe("assets/incoming.png");
    });
  });

  test("prunes with a logged asset-prune entry (actor system) so a vanished registration isn't silent", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      const assetsDir = projectAssetsDir(root, slug);
      writeFixtureProject(
        slug,
        makeProject({ slug, assets: [orphanBrollAsset()] })
      );
      mkdirSync(assetsDir, { recursive: true });

      await syncAssetsFromFolder(slug);
      const entries = await readActionLog(slug);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("asset-prune");
      expect(entries[0].actor).toBe("system");
      expect(entries[0].input).toContain("orphan");
      expect(entries[0].revisionBefore).toBe(0);
      expect(entries[0].revisionAfter).toBe(1);

      const project = await loadProject(slug);
      expect(project.assets).toHaveLength(0);
      expect(project.revision ?? 0).toBe(1);
    });
  });

  test("registering a newly dropped file during sync logs asset-add and bumps revision", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      writeFixtureProject(slug, makeProject({ slug, assets: [] }));
      writeAssetDrop(root, slug, "incoming.png", TINY_PNG);

      await syncAssetsFromFolder(slug);
      const entries = await readActionLog(slug);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("asset-add");

      const project = await loadProject(slug);
      expect(project.revision).toBe(1);
    });
  });

  test("a sync with nothing stale skips the mutateProject call (project.json is untouched)", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      const assetsDir = projectAssetsDir(root, slug);
      writeAssetDrop(root, slug, "keep.mp3");
      writeFixtureProject(
        slug,
        makeProject({
          slug,
          assets: [keptMusicAsset(assetsDir)],
        })
      );
      const projectJsonPath = join(root, "projects", slug, "project.json");
      const before = readFileSync(projectJsonPath, "utf8");
      const mtimeBefore = statSync(projectJsonPath).mtimeMs;

      await syncAssetsFromFolder(slug);

      const after = readFileSync(projectJsonPath, "utf8");
      expect(after).toBe(before);
      expect(statSync(projectJsonPath).mtimeMs).toBe(mtimeBefore);
    });
  });

  test("serializes overlapping calls so project.json never loses updates", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      writeFixtureProject(slug, makeProject({ slug, assets: [] }));
      writeAssetDrop(root, slug, "a.png", TINY_PNG);
      writeAssetDrop(root, slug, "b.png", TINY_PNG);

      const [first, second] = await Promise.all([
        syncAssetsFromFolder(slug),
        syncAssetsFromFolder(slug),
      ]);

      expect(first).toHaveLength(2);
      expect(second).toHaveLength(2);
      expect(first.map((a) => a.src).sort()).toEqual(
        second.map((a) => a.src).sort()
      );
      expect(new Set(first.map((a) => a.id)).size).toBe(first.length);
    });
  });
});
