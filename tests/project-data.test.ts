import { describe, expect, mock, test } from "bun:test";
import { statSync } from "node:fs";
import * as assetScannerModule from "@engine/asset-scanner";
import { loadEditorProject } from "../app/lib/project-data.ts";
import { saveBrief } from "../src/brief.ts";
import { projectPaths } from "../src/paths.ts";
import { defaultFixtureOrphan } from "./helpers/assetFixture.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

// Capture the real exports at load time so we can reinstall them after the
// throwing-mock test below. Bun's mock.restore() does not undo mock.module(),
// so without this the stub leaks into other test files that use the real
// asset-scanner (e.g. asset-scanner.test.ts).
const realAssetScannerExports = { ...assetScannerModule };

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

  test("silences is null when snap is disabled (no analysis cost paid)", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      const loaded = await loadEditorProject(slug);
      expect(loaded.silences).toBeNull();
    });
  });

  test("silences is null when snap is enabled but no audio has been extracted", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(
        slug,
        makeProject({
          slug,
          cuts: {
            snap: {
              enabled: true,
              mode: "vad",
              maxShiftMs: 120,
              crossfadeMs: 24,
            },
            deadAir: [],
          },
        })
      );
      const loaded = await loadEditorProject(slug);
      expect(loaded.silences).toBeNull();
    });
  });

  test("silences is populated from a cached audio-analysis.json when snap is enabled", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(
        slug,
        makeProject({
          slug,
          cuts: {
            snap: {
              enabled: true,
              mode: "vad",
              maxShiftMs: 120,
              crossfadeMs: 24,
            },
            deadAir: [],
          },
        })
      );
      const paths = projectPaths(slug);
      await Bun.write(
        paths.audioRaw,
        new Float32Array(1600).buffer as ArrayBuffer
      );
      const sourceMtimeMs = statSync(paths.audioRaw).mtimeMs;
      const silences = [{ startSec: 1.2, endSec: 1.5 }];
      // F13: loadAudioAnalysis validates the cache shape (AudioAnalysisSchema)
      // before trusting it, so this fixture must be a complete AudioAnalysis
      // object, not just the sourceMtimeMs + silences this test exercises.
      await Bun.write(
        `${paths.working}/audio-analysis.json`,
        JSON.stringify({
          version: 1,
          sampleRate: 16_000,
          windowMs: 20,
          thresholdDb: -38,
          minSilenceMs: 300,
          sourceMtimeMs,
          silences,
        })
      );

      const loaded = await loadEditorProject(slug);
      expect(loaded.silences).toEqual(silences);
    });
  });

  test("still loads the project when folder sync throws", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug, assets: [] }));
      mock.module("@engine/asset-scanner", () => ({
        ...realAssetScannerExports,
        syncAssetsFromFolder: () => {
          throw new Error("ffmpeg proxy build failed");
        },
      }));

      try {
        const loaded = await loadEditorProject(slug);
        expect(loaded.slug).toBe(slug);
      } finally {
        // mock.restore() does not revert mock.module(), so reinstall the real
        // module to prevent the throwing stub from leaking across test files.
        mock.module("@engine/asset-scanner", () => realAssetScannerExports);
      }
    });
  });
});
