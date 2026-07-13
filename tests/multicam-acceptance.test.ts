import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  generateMulticamFixture,
  runMulticamAcceptanceProgram,
} from "../scripts/generate-multicam-fixture.ts";
import { MulticamProvenanceSchema } from "../src/cam-mix.ts";
import { FFMPEG } from "../src/ffmpeg.ts";
import { loadProject } from "../src/projectStore.ts";
import { withTempProjectsRoot } from "./helpers/projectFixture.ts";

const ACCEPTANCE_DURATION_SEC = 8;
const ACCEPTANCE_SEGMENTS = 4;

describe("multicam programmatic acceptance", () => {
  test("lavfi twin-cam cam-add → cam-mix gate", async () => {
    if (typeof FFMPEG !== "string" || !existsSync(FFMPEG)) {
      return;
    }

    await withTempProjectsRoot(async ({ slug, root }) => {
      const outDir = join(root, "..", "multicam-acceptance-fixture");
      const files = await generateMulticamFixture({
        outDir,
        durationSec: ACCEPTANCE_DURATION_SEC,
        segments: ACCEPTANCE_SEGMENTS,
      });

      const result = await runMulticamAcceptanceProgram({
        slug,
        files,
        force: true,
      });

      expect(existsSync(result.sourcePath)).toBe(true);
      expect(
        Math.abs(result.durationSec - ACCEPTANCE_DURATION_SEC)
      ).toBeLessThan(0.5);
      expect(result.planSpanCount).toBeGreaterThanOrEqual(2);
      expect(result.shots).toContain("a");
      expect(result.shots).toContain("b");

      const project = await loadProject(slug);
      expect(project.multicam).toBeDefined();
      MulticamProvenanceSchema.parse(project.multicam);
    });
  }, 180_000);
});
