import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectPaths } from "../../src/paths.ts";
import { mutateProject } from "../../src/projectStore.ts";
import { makeProject, writeFixtureProject } from "./projectFixture.ts";

export interface IntegrationEditorFixture {
  cleanup: () => void;
  projectsRoot: string;
  slug: string;
}

export async function prepareIntegrationEditorFixture(): Promise<IntegrationEditorFixture> {
  const root = mkdtempSync(join(tmpdir(), "openklip-integration-"));
  const projectsRoot = join(root, "projects");
  const slug = "hist-diff";
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_PROJECTS_ROOT = projectsRoot;

  writeFixtureProject(
    slug,
    makeProject({
      slug,
      revision: 0,
      words: [
        {
          id: "w0",
          text: "Hello",
          startSample: 0,
          endSample: 48_000,
          deleted: false,
        },
        {
          id: "w1",
          text: "world",
          startSample: 48_000,
          endSample: 96_000,
          deleted: false,
        },
        {
          id: "w2",
          text: "again",
          startSample: 96_000,
          endSample: 144_000,
          deleted: false,
        },
      ],
      durationSamples: 144_000,
    })
  );

  const paths = projectPaths(slug);
  mkdirSync(paths.working, { recursive: true });
  writeFileSync(join(paths.working, "proxy.mp4"), "");
  writeFileSync(join(paths.dir, "source.mp4"), "");

  await mutateProject(
    slug,
    (project) => {
      project.words[1].deleted = true;
    },
    {
      action: "cut",
      actor: "human",
      input: { ids: ["w1"] },
    }
  );

  return {
    slug,
    projectsRoot,
    cleanup: () => {
      if (prevRoot === undefined) {
        delete process.env.OPENKLIP_PROJECTS_ROOT;
      } else {
        process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}
