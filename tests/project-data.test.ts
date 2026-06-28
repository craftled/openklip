import { describe, expect, test } from "bun:test";
import { loadEditorProject } from "../app/lib/project-data.ts";
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
});
