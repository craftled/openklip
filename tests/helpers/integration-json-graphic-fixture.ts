import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectPaths } from "../../src/paths.ts";
import { sampleProductAnnouncementSpec } from "../../src/product-announcement.ts";
import { mutateProject } from "../../src/projectStore.ts";
import { runAction } from "../../src/registry.ts";
import { makeProject, writeFixtureProject } from "./projectFixture.ts";

export interface IntegrationJsonGraphicFixture {
  cleanup: () => void;
  graphicLabel: string;
  projectsRoot: string;
  slug: string;
}

export async function prepareIntegrationJsonGraphicFixture(): Promise<IntegrationJsonGraphicFixture> {
  const root = mkdtempSync(join(tmpdir(), "openklip-json-graphic-"));
  const projectsRoot = join(root, "projects");
  const slug = "json-graphic";
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
      ],
      durationSamples: 96_000,
    })
  );

  const paths = projectPaths(slug);
  mkdirSync(paths.working, { recursive: true });
  writeFileSync(join(paths.working, "proxy.mp4"), "");
  writeFileSync(join(paths.dir, "source.mp4"), "");

  await mutateProject(
    slug,
    (project) => {
      runAction("json-graphic-add", project, {
        catalog: "product-announcement",
        fromSec: 0,
        toSec: 3,
        spec: sampleProductAnnouncementSpec,
      });
    },
    {
      action: "json-graphic-add",
      actor: "human",
      input: { catalog: "product-announcement" },
    }
  );

  return {
    slug,
    projectsRoot,
    graphicLabel: "Announcement graphic",
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
