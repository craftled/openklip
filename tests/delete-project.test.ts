import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { deleteProject } from "../src/delete-project.ts";
import { projectDir } from "../src/paths.ts";
import { listProjects } from "../src/projectStore.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

describe("deleteProject", () => {
  test("removes the project directory from disk", async () => {
    await withTempProjectsRoot(async ({ slug, root }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      expect(existsSync(projectDir(slug))).toBe(true);

      await deleteProject(slug);

      expect(existsSync(projectDir(slug))).toBe(false);
      expect(existsSync(join(root, "projects", slug))).toBe(false);
      expect(listProjects().some((p) => p.slug === slug)).toBe(false);
    });
  });

  test("throws when the project does not exist", async () => {
    await withTempProjectsRoot(async () => {
      await expect(deleteProject("missing")).rejects.toThrow(
        /project not found/
      );
    });
  });

  test("rejects invalid slugs before touching disk", async () => {
    await withTempProjectsRoot(async () => {
      await expect(deleteProject("../escape")).rejects.toThrow(
        /invalid project slug/
      );
    });
  });

  test("waits for an in-flight project lock before deleting", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      const { mutateProject } = await import("../src/projectStore.ts");

      const slowMutate = mutateProject(slug, async (p) => {
        await new Promise((r) => setTimeout(r, 50));
        p.padMs += 1;
      });

      await Promise.all([slowMutate, deleteProject(slug)]);
      expect(existsSync(projectDir(slug))).toBe(false);
    });
  });
});
